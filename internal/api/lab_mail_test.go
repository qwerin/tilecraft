package api_test

import (
	"net/http"
	"testing"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/config"
	"github.com/qwerin/tilecraft/internal/maildiag/smtptest"
)

// TestLabMail: a firm may send through its own server (owner/admin);
// the others keep the application's one. Live sending is application-wide, or
// switched on by the firm for its own server.
func TestLabMail(t *testing.T) {
	appSrv := smtptest.Start(t, smtptest.Options{})
	labSrv := smtptest.Start(t, smtptest.Options{})
	ts := newTestServerDeps(t, func(c *config.Config) { c.Superadmins = []string{"boss@example.cz"} },
		func(d *api.Deps) { d.LabSMTPAnyHost = true })
	boss := ts.signup("boss@example.cz", "Správa")
	a := ts.signup("a@example.cz", "Laboratoř A")
	b := ts.signup("b@example.cz", "Laboratoř B")
	doJSON[api.Member](a, http.StatusCreated, "POST", a.acct("/members"), api.MemberCreate{
		Email: "tech@example.cz", Password: "heslo1234", Role: "worker",
	})
	tech := ts.login("tech@example.cz", a.slug)
	expect(t, tech, http.StatusForbidden, "GET", tech.acct("/mail"), nil)
	expect(t, tech, http.StatusForbidden, "PUT", tech.acct("/mail"), api.MailServerInput{})

	if st := doJSON[api.LabMailSettings](a, http.StatusOK, "GET", a.acct("/mail"), nil); st.Mode != "" || st.AppSender != "" || st.Live {
		t.Fatalf("defaults: %+v", st)
	}
	appMail := api.AdminMailInput{Mode: "smtp", Host: "127.0.0.1", Port: appSrv.Addr.Port, TLS: "none", From: "Aplikace <app@example.cz>"}
	doJSON[api.AdminSettings](boss, http.StatusOK, "PUT", "/api/admin/settings/mail", appMail)
	if st := doJSON[api.LabMailSettings](a, http.StatusOK, "GET", a.acct("/mail"), nil); st.AppSender != "Aplikace <app@example.cz>" {
		t.Fatalf("app sender: %+v", st)
	}

	// Gmail needs the app password
	expect(t, a, http.StatusUnprocessableEntity, "PUT", a.acct("/mail"), api.MailServerInput{Mode: "gmail", User: "lab@gmail.com"})
	st := doJSON[api.LabMailSettings](a, http.StatusOK, "PUT", a.acct("/mail"), api.MailServerInput{Mode: "gmail", User: "lab@gmail.com", Password: ptr("abcd efgh ijkl mnop")})
	if st.Host != "smtp.gmail.com" || st.Port != 587 || !st.PasswordSet || st.From != "lab@gmail.com" {
		t.Fatalf("gmail: %+v", st)
	}

	// the test e-mail goes out through the firm's server even with live sending off
	doJSON[api.LabMailSettings](a, http.StatusOK, "PUT", a.acct("/mail"),
		api.MailServerInput{Mode: "smtp", Host: "127.0.0.1", Port: labSrv.Addr.Port, TLS: "none", From: "Laboratoř A <lab@a.cz>"})
	if e := doJSON[api.Email](a, http.StatusCreated, "POST", a.acct("/emails/test"), api.EmailTest{}); e.Status != "sent" || len(labSrv.Messages()) != 1 {
		t.Fatalf("lab test e-mail: %+v %d", e, len(labSrv.Messages()))
	}
	// the firm switches live sending on for its own server; the others stay off
	if st := doJSON[api.LabMailSettings](a, http.StatusOK, "PUT", a.acct("/mail"),
		api.MailServerInput{Mode: "smtp", Host: "127.0.0.1", Port: labSrv.Addr.Port, TLS: "none", From: "Laboratoř A <lab@a.cz>", Live: true}); !st.Live || !st.OwnLive || st.AppLive {
		t.Fatalf("lab live: %+v", st)
	}
	if d := doJSON[api.EmailDelivery](a, http.StatusOK, "GET", a.acct("/emails/delivery"), nil); !d.Live || d.Sender != "Laboratoř A <lab@a.cz>" {
		t.Fatalf("lab live delivery: %+v", d)
	}
	if d := doJSON[api.EmailDelivery](b, http.StatusOK, "GET", b.acct("/emails/delivery"), nil); d.Live {
		t.Fatalf("other lab stays off: %+v", d)
	}
	// … not through the application's server
	if st := doJSON[api.LabMailSettings](a, http.StatusOK, "PUT", a.acct("/mail"), api.MailServerInput{Live: true}); st.Live || !st.OwnLive {
		t.Fatalf("lab live without its own server: %+v", st)
	}
	doJSON[api.LabMailSettings](a, http.StatusOK, "PUT", a.acct("/mail"),
		api.MailServerInput{Mode: "smtp", Host: "127.0.0.1", Port: labSrv.Addr.Port, TLS: "none", From: "Laboratoř A <lab@a.cz>"})

	// … the application's server only with live sending
	if e := doJSON[api.Email](b, http.StatusCreated, "POST", b.acct("/emails/test"), api.EmailTest{}); e.Status != "stored" || len(appSrv.Messages()) != 0 {
		t.Fatalf("app test e-mail: %+v", e)
	}
	appMail.Live = true
	doJSON[api.AdminSettings](boss, http.StatusOK, "PUT", "/api/admin/settings/mail", appMail)
	if d := doJSON[api.EmailDelivery](a, http.StatusOK, "GET", a.acct("/emails/delivery"), nil); !d.Live || d.Sender != "Laboratoř A <lab@a.cz>" {
		t.Fatalf("lab delivery: %+v", d)
	}
	if d := doJSON[api.EmailDelivery](b, http.StatusOK, "GET", b.acct("/emails/delivery"), nil); !d.Live || d.Sender != "Aplikace <app@example.cz>" {
		t.Fatalf("app delivery: %+v", d)
	}
	if e := doJSON[api.Email](b, http.StatusCreated, "POST", b.acct("/emails/test"), api.EmailTest{}); e.Status != "sent" || len(appSrv.Messages()) != 1 {
		t.Fatalf("app live test e-mail: %+v", e)
	}

	// without its own server the firm sends through the application's one
	if st := doJSON[api.LabMailSettings](a, http.StatusOK, "PUT", a.acct("/mail"), api.MailServerInput{}); st.Mode != "" || st.PasswordSet || st.Host != "" {
		t.Fatalf("removed: %+v", st)
	}
	if d := doJSON[api.EmailDelivery](a, http.StatusOK, "GET", a.acct("/emails/delivery"), nil); d.Sender != "Aplikace <app@example.cz>" {
		t.Fatalf("back to the app server: %+v", d)
	}
}

// TestLabMailHosts: a firm's SMTP server must be public and on a mail port.
func TestLabMailHosts(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Laboratoř A")
	in := func(host string, port int) api.MailServerInput {
		return api.MailServerInput{Mode: "smtp", Host: host, Port: port, From: "lab@a.cz"}
	}
	for _, bad := range []api.MailServerInput{in("127.0.0.1", 587), in("10.0.0.5", 25), in("localhost", 587), in("postgres", 587),
		in("smtp.lab.cz", 5432), in("smtp.lab.cz", 8080)} {
		expect(t, a, http.StatusUnprocessableEntity, "PUT", a.acct("/mail"), bad)
	}
	if st := doJSON[api.LabMailSettings](a, http.StatusOK, "PUT", a.acct("/mail"), in("smtp.lab.cz", 465)); st.Host != "smtp.lab.cz" || st.Port != 465 {
		t.Fatalf("public server: %+v", st)
	}
}
