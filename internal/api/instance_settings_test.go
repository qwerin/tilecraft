package api_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/config"
	"github.com/qwerin/tilecraft/internal/maildiag/smtptest"
	"github.com/qwerin/tilecraft/internal/model"
)

func adminServer(t *testing.T, configure func(*config.Config)) (*testServer, *client) {
	t.Helper()
	ts := newTestServerDeps(t, func(c *config.Config) {
		c.Superadmins = []string{"boss@example.cz"}
		configure(c)
	}, func(*api.Deps) {})
	return ts, ts.signup("boss@example.cz", "Správa")
}

func TestAdminSettingsMail(t *testing.T) {
	srv := smtptest.Start(t, smtptest.Options{})
	ts, boss := adminServer(t, func(*config.Config) {})
	owner := ts.signup("owner@example.cz", "Laboratoř A")
	path := "/api/admin/settings/mail"

	expect(t, owner, http.StatusForbidden, "GET", "/api/admin/settings", nil)
	expect(t, owner, http.StatusForbidden, "PUT", path, api.AdminMailInput{})
	st := doJSON[api.AdminSettings](boss, http.StatusOK, "GET", "/api/admin/settings", nil)
	if st.Mail.Source != api.SourceNone {
		t.Fatalf("defaults: %+v", st)
	}
	// live sending without a server serves firms with their own one
	if st := doJSON[api.AdminSettings](boss, http.StatusOK, "PUT", path, api.AdminMailInput{Live: true}); !st.Mail.Live || st.Mail.Source != api.SourceNone {
		t.Fatalf("live without a server: %+v", st.Mail)
	}
	expect(t, owner, http.StatusConflict, "POST", owner.acct("/emails/test"), api.EmailTest{})
	// Gmail without a password, half of DKIM: refused
	expect(t, boss, http.StatusUnprocessableEntity, "PUT", path, api.AdminMailInput{Mode: "gmail", User: "lab@gmail.com"})
	expect(t, boss, http.StatusUnprocessableEntity, "PUT", path, api.AdminMailInput{Mode: "gmail", User: "lab@gmail.com", Password: ptr("x"), DKIMDomain: "lab.cz"})

	st = doJSON[api.AdminSettings](boss, http.StatusOK, "PUT", path, api.AdminMailInput{Mode: "gmail", User: "lab@gmail.com", Password: ptr("abcd efgh ijkl mnop")})
	if m := st.Mail; m.Source != api.SourceApp || m.Host != "smtp.gmail.com" || m.Port != 587 || m.TLS != "starttls" || !m.PasswordSet || m.From != "lab@gmail.com" || m.Live {
		t.Fatalf("gmail: %+v", m)
	}
	var row model.InstanceSettings
	ts.db.First(&row, 1)
	if row.SMTPPassword == "" || strings.Contains(row.SMTPPassword, "abcd") {
		t.Fatalf("password not encrypted: %q", row.SMTPPassword)
	}
	// saving again without the password keeps it
	st = doJSON[api.AdminSettings](boss, http.StatusOK, "PUT", path, api.AdminMailInput{Mode: "gmail", User: "lab@gmail.com", From: "Laboratoř <lab@gmail.com>"})
	if !st.Mail.PasswordSet || st.Mail.From != "Laboratoř <lab@gmail.com>" {
		t.Fatalf("kept password: %+v", st.Mail)
	}

	// an own SMTP server with live sending: e-mails really go out, no restart
	doJSON[api.AdminSettings](boss, http.StatusOK, "PUT", path,
		api.AdminMailInput{Mode: "smtp", Host: "127.0.0.1", Port: srv.Addr.Port, TLS: "none", From: "Laboratoř <lab@example.cz>", Live: true})
	if d := doJSON[api.EmailDelivery](owner, http.StatusOK, "GET", owner.acct("/emails/delivery"), nil); !d.Live || d.Sender != "Laboratoř <lab@example.cz>" {
		t.Fatalf("delivery: %+v", d)
	}
	e := doJSON[api.Email](owner, http.StatusCreated, "POST", owner.acct("/emails/test"), api.EmailTest{})
	if e.Status != "sent" || len(srv.Messages()) != 1 || srv.Messages()[0].To[0] != "owner@example.cz" {
		t.Fatalf("sent: %+v %+v", e, srv.Messages())
	}
	// the diagnostics use the same settings
	r := doJSON[maildiagReport](boss, http.StatusOK, "POST", "/api/admin/email-test", api.AdminEmailTest{})
	if !r.Sent || r.SMTPPort != srv.Addr.Port {
		t.Fatalf("diagnostics: %+v", r)
	}

	// switching the server off stores e-mails only
	st = doJSON[api.AdminSettings](boss, http.StatusOK, "PUT", path, api.AdminMailInput{})
	if st.Mail.Source != api.SourceNone || st.Mail.Live {
		t.Fatalf("off: %+v", st.Mail)
	}
	if e := doJSON[api.Email](owner, http.StatusCreated, "POST", owner.acct("/emails/test"), api.EmailTest{}); e.Status != "stored" {
		t.Fatalf("stored: %+v", e)
	}
}

type maildiagReport struct {
	Sent     bool `json:"sent"`
	SMTPPort int  `json:"smtp_port"`
}

func TestAdminSettingsEnvAndTestInstance(t *testing.T) {
	// the environment wins and is shown read-only
	_, boss := adminServer(t, func(c *config.Config) {
		c.SMTP = config.SMTP{Host: "smtp.example.cz", Port: 587, TLS: "starttls", User: "u", Password: "p", From: "lab@example.cz"}
	})
	st := doJSON[api.AdminSettings](boss, http.StatusOK, "GET", "/api/admin/settings", nil)
	if st.Mail.Source != api.SourceEnv || st.Mail.Host != "smtp.example.cz" {
		t.Fatalf("env: %+v", st)
	}
	// only the live switch can be changed for an environment server
	st = doJSON[api.AdminSettings](boss, http.StatusOK, "PUT", "/api/admin/settings/mail", api.AdminMailInput{Live: true})
	if !st.Mail.Live || st.Mail.Host != "smtp.example.cz" {
		t.Fatalf("env live: %+v", st.Mail)
	}

	// a test instance never sends, whatever is saved
	ts2, boss2 := adminServer(t, func(c *config.Config) { c.Test = true })
	owner := ts2.signup("owner@example.cz", "Laboratoř A")
	doJSON[api.AdminSettings](boss2, http.StatusOK, "PUT", "/api/admin/settings/mail",
		api.AdminMailInput{Mode: "smtp", Host: "127.0.0.1", Port: 1, TLS: "none", From: "lab@example.cz", Live: true})
	if d := doJSON[api.EmailDelivery](owner, http.StatusOK, "GET", owner.acct("/emails/delivery"), nil); d.Live || !d.Test {
		t.Fatalf("test instance: %+v", d)
	}
}
