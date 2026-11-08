package api_test

import (
	"net"
	"net/http"
	"strings"
	"testing"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/config"
	"github.com/qwerin/tilecraft/internal/mail"
	"github.com/qwerin/tilecraft/internal/maildiag"
	"github.com/qwerin/tilecraft/internal/maildiag/smtptest"
)

func TestAdminEmailTest(t *testing.T) {
	srv := smtptest.Start(t, smtptest.Options{})
	resolver := &smtptest.Resolver{
		TXT: map[string][]string{
			"example.cz":        {"v=spf1 ip4:203.0.113.0/24 -all"},
			"_dmarc.example.cz": {"v=DMARC1; p=none"},
		},
		MX: map[string][]*net.MX{"example.cz": {{Host: "mx.example.cz.", Pref: 10}}},
	}
	ts := newTestServerDeps(t, func(c *config.Config) {
		c.Superadmins = []string{"boss@example.cz"}
		c.PublicURL = "https://lab.example.cz"
		c.SMTP = config.SMTP{Host: "127.0.0.1", Port: srv.Addr.Port, TLS: mail.TLSNone, From: "Laboratoř <lab@example.cz>"}
	}, func(d *api.Deps) { d.Resolver = resolver })
	boss := ts.signup("boss@example.cz", "Správa")
	owner := ts.signup("owner@example.cz", "Laboratoř A")

	expect(t, owner, http.StatusForbidden, "POST", "/api/admin/email-test", api.AdminEmailTest{})
	expect(t, boss, http.StatusUnprocessableEntity, "POST", "/api/admin/email-test", api.AdminEmailTest{DKIMSelector: "bad selector!"})

	r := doJSON[maildiag.DiagReport](boss, http.StatusOK, "POST", "/api/admin/email-test", api.AdminEmailTest{})
	if !r.Sent || r.To != "boss@example.cz" || r.From != "lab@example.cz" || r.QueueID == "" || len(r.SMTP) == 0 || len(r.DNS) != 4 {
		t.Fatalf("report: %+v", r)
	}
	msgs := srv.Messages()
	if len(msgs) != 1 || msgs[0].To[0] != "boss@example.cz" || !strings.Contains(msgs[0].Data, "https://lab.example.cz") ||
		!strings.Contains(msgs[0].Data, "Message-ID: <") {
		t.Fatalf("message: %+v", msgs)
	}

	// a test instance never sends
	tt := newTestServerWith(t, func(c *config.Config) {
		c.Superadmins = []string{"boss@example.cz"}
		c.Test = true
	})
	expect(t, tt.signup("boss@example.cz", "Správa"), http.StatusConflict, "POST", "/api/admin/email-test", api.AdminEmailTest{})
}
