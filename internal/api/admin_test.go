package api_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/config"
)

func register(c *client, email, lab, code string) (*http.Response, []byte) {
	return c.do("POST", "/api/auth/register", api.RegisterInput{Email: email, Password: "heslo1234", Name: "Jan Test", Firm: lab, Code: code})
}

// TestSignupCode: with TILECRAFT_SIGNUP_CODE every registration needs the code.
func TestSignupCode(t *testing.T) {
	ts := newTestServerWith(t, func(c *config.Config) { c.SignupCode = "tajny-kod" })
	info := doJSON[api.SignupInfo](ts.anon(), http.StatusOK, "GET", "/api/auth/signup", nil)
	if !info.CodeRequired {
		t.Error("code not required")
	}
	if res, b := register(ts.anon(), "a@example.cz", "A", ""); res.StatusCode != http.StatusForbidden || !strings.Contains(string(b), "signup_code_required") {
		t.Errorf("without code: %d %s", res.StatusCode, b)
	}
	if res, b := register(ts.anon(), "a@example.cz", "A", "spatny"); res.StatusCode != http.StatusForbidden || !strings.Contains(string(b), "signup_code_invalid") {
		t.Errorf("wrong code: %d %s", res.StatusCode, b)
	}
	if res, b := register(ts.anon(), "a@example.cz", "A", "tajny-kod"); res.StatusCode != http.StatusCreated {
		t.Errorf("right code: %d %s", res.StatusCode, b)
	}
	// the env code may be used again
	if res, b := register(ts.anon(), "b@example.cz", "B", "tajny-kod"); res.StatusCode != http.StatusCreated {
		t.Errorf("env code reused: %d %s", res.StatusCode, b)
	}
	// open signup without a code configured
	open := newTestServer(t)
	if doJSON[api.SignupInfo](open.anon(), http.StatusOK, "GET", "/api/auth/signup", nil).CodeRequired {
		t.Error("open signup requires a code")
	}
}

// TestSignupCodeRateLimit: wrong codes are throttled per IP.
func TestSignupCodeRateLimit(t *testing.T) {
	ts := newTestServerWith(t, func(c *config.Config) { c.SignupCode = "tajny-kod" })
	last := 0
	for i := range 12 {
		res, _ := register(ts.anon(), fmt.Sprintf("x%d@example.cz", i), "X", "spatny")
		last = res.StatusCode
	}
	if last != http.StatusTooManyRequests {
		t.Errorf("12th wrong code: %d", last)
	}
}

// TestSuperadmin: one-time codes, overview and access to every firm.
func TestSuperadmin(t *testing.T) {
	ts := newTestServerWith(t, func(c *config.Config) {
		c.AllowSignup = false
		c.SignupCode = "tajny-kod"
		c.Superadmins = []string{"Boss@Example.cz"}
	})
	boss := ts.anon()
	register(boss, "boss@example.cz", "Správa", "tajny-kod")
	if me := doJSON[api.Me](boss, http.StatusOK, "GET", "/api/auth/me", nil); !me.Superadmin {
		t.Fatal("superadmin flag missing")
	}
	lab := ts.anon()
	register(lab, "lab@example.cz", "Laboratoř Jih", "tajny-kod")
	lab.slug = "laborator-jih"
	if me := doJSON[api.Me](lab, http.StatusOK, "GET", "/api/auth/me", nil); me.Superadmin {
		t.Fatal("ordinary owner is superadmin")
	}

	// only the superadmin manages codes
	expect(t, lab, http.StatusForbidden, "GET", "/api/admin/accounts", nil)
	expect(t, lab, http.StatusForbidden, "POST", "/api/admin/signup-codes", api.SignupCodeCreate{})

	sc := doJSON[api.AdminSignupCode](boss, http.StatusCreated, "POST", "/api/admin/signup-codes", api.SignupCodeCreate{Note: "Nová lab", ValidDays: 7})
	if len(sc.Code) != 19 || !sc.ExpiresAt.Equal(now.AddDate(0, 0, 7)) {
		t.Fatalf("code %+v", sc)
	}
	// typed in lower case with spaces it still works, but only once
	if res, b := register(ts.anon(), "new@example.cz", "Nová laboratoř", " "+strings.ToLower(sc.Code)+" "); res.StatusCode != http.StatusCreated {
		t.Fatalf("one-time code: %d %s", res.StatusCode, b)
	}
	if res, _ := register(ts.anon(), "again@example.cz", "Znovu", sc.Code); res.StatusCode != http.StatusForbidden {
		t.Errorf("used code accepted again: %d", res.StatusCode)
	}
	codes := doJSON[api.ListResponse[api.AdminSignupCode]](boss, http.StatusOK, "GET", "/api/admin/signup-codes", nil)
	if len(codes.Items) != 1 || codes.Items[0].Code != "" || codes.Items[0].UsedByEmail != "new@example.cz" || codes.Items[0].AccountName != "Nová laboratoř" {
		t.Errorf("codes %+v", codes.Items)
	}
	expect(t, boss, http.StatusNotFound, "DELETE", fmt.Sprintf("/api/admin/signup-codes/%d", sc.ID), nil) // used codes stay
	expired := doJSON[api.AdminSignupCode](boss, http.StatusCreated, "POST", "/api/admin/signup-codes", api.SignupCodeCreate{ValidDays: 1})
	ts.now = now.AddDate(0, 0, 2)
	if res, _ := register(ts.anon(), "late@example.cz", "Pozdě", expired.Code); res.StatusCode != http.StatusForbidden {
		t.Errorf("expired code accepted: %d", res.StatusCode)
	}
	ts.now = now
	expect(t, boss, http.StatusNoContent, "DELETE", fmt.Sprintf("/api/admin/signup-codes/%d", expired.ID), nil)

	accs := doJSON[api.ListResponse[api.AdminAccount]](boss, http.StatusOK, "GET", "/api/admin/accounts", nil)
	if accs.Total != 3 {
		t.Fatalf("accounts %+v", accs.Items)
	}
	for _, a := range accs.Items {
		if a.Slug == "laborator-jih" && (len(a.Owners) != 1 || a.Owners[0] != "lab@example.cz" || a.Members != 1) {
			t.Errorf("overview %+v", a)
		}
	}

	// the superadmin opens a foreign firm as a visiting owner
	boss.slug = "laborator-jih"
	acc := doJSON[api.Account](boss, http.StatusOK, "GET", boss.acct(""), nil)
	if acc.Role != "owner" || !acc.Visiting {
		t.Errorf("visiting account %+v", acc)
	}
	doJSON[api.Account](boss, http.StatusOK, "PATCH", boss.acct(""), api.AccountPatch{Name: ptr("Laboratoř Jih s.r.o.")})
	if own := doJSON[api.Account](lab, http.StatusOK, "GET", lab.acct(""), nil); own.Visiting || own.Name != "Laboratoř Jih s.r.o." {
		t.Errorf("member view %+v", own)
	}
	// the visit leaves no membership behind
	if members := doJSON[[]api.Member](lab, http.StatusOK, "GET", lab.acct("/members"), nil); len(members) != 1 {
		t.Errorf("members after visit: %d", len(members))
	}
	// API tokens never carry superadmin rights
	tok := &client{ts: ts, token: apiToken(boss), slug: "laborator-jih"}
	expect(t, tok, http.StatusNotFound, "GET", tok.acct(""), nil)
	expect(t, tok, http.StatusForbidden, "GET", "/api/admin/accounts", nil)
	// the superadmin may create firms although signup needs a code
	expect(t, boss, http.StatusCreated, "POST", "/api/accounts", api.AccountCreate{Name: "Založená superadminem"})
}

// TestAdminAccountsQuotes: the overview counts orders and their last date.
func TestAdminAccountsQuotes(t *testing.T) {
	ts := newTestServerWith(t, func(c *config.Config) { c.SignupCode = "tajny-kod"; c.Superadmins = []string{"boss@example.cz"} })
	if _, err := api.SeedDemo(context.Background(), ts.db, config.Config{}); err != nil {
		t.Fatal(err)
	}
	boss := ts.anon()
	register(boss, "boss@example.cz", "Správa", "tajny-kod")
	accs := doJSON[api.ListResponse[api.AdminAccount]](boss, http.StatusOK, "GET", "/api/admin/accounts", nil)
	for _, a := range accs.Items {
		if a.Owners[0] == api.DemoEmail && (a.Quotes == 0 || a.LastQuoteAt == nil || a.Members < 2) {
			t.Errorf("demo firm %+v", a)
		}
	}
}
