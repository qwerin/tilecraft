package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/maildiag"
	"github.com/qwerin/tilecraft/internal/ratelimit"
)

// AdminEmailTest runs the e-mail diagnostics with a real test message.
type AdminEmailTest struct {
	To           string `json:"to,omitempty" format:"email" maxLength:"254" doc:"Recipient; default = the superadmin's own e-mail"`
	DKIMSelector string `json:"dkim_selector,omitempty" maxLength:"63" doc:"DKIM selector to check when the application does not sign (e.g. the SMTP provider's)"`
}

// emailTestLimit: the diagnostics send a real e-mail; a few per user and minute.
var emailTestLimit = ratelimit.New(5, 1, time.Minute, time.Now)

func (s *server) registerAdminEmail(authed huma.API) {
	huma.Post(authed, "/api/admin/email-test", s.adminEmailTest)
}

// adminEmailTest walks through the SMTP conversation (DNS, TCP, TLS, AUTH,
// MAIL/RCPT/DATA) ending with a real test e-mail and checks the sender
// domain's MX, SPF, DMARC and DKIM. It sends even when TILECRAFT_EMAIL_LIVE is
// off (it tests the configuration from the environment or Správa aplikace), never on a test instance.
func (s *server) adminEmailTest(ctx context.Context, in *struct{ Body AdminEmailTest }) (*Out[maildiag.DiagReport], error) {
	if err := s.requireSuperadmin(ctx); err != nil {
		return nil, err
	}
	if s.cfg.Test {
		return nil, conflict(CodeEmailOff, "a test instance never sends e-mails")
	}
	user := auth.UserFrom(ctx)
	to := strings.TrimSpace(in.Body.To)
	if to == "" {
		to = user.Email
	}
	if checkEmailAddress(to) != nil {
		return nil, invalid("to", "invalid e-mail")
	}
	sel := strings.TrimSpace(in.Body.DKIMSelector)
	if sel != "" && !maildiag.ValidSelector(sel) {
		return nil, invalid("dkim_selector", "invalid DKIM selector (letters, digits, '.', '-', '_')")
	}
	if ok, _ := emailTestLimit.Allow(user.Email); !ok {
		return nil, apiError(http.StatusTooManyRequests, CodeRateLimited, "too many test e-mails, try again in a minute")
	}
	now := s.deps.Now()
	m, err := s.mailSetup(ctx)
	if err != nil {
		return nil, err
	}
	smtp := m.SMTP
	if s.deps.SMTPTLSConfig != nil {
		smtp.TLSConfig = s.deps.SMTPTLSConfig
	}
	r := maildiag.Run(ctx, maildiag.Options{SMTP: smtp, To: to, Message: maildiag.TestMessage(s.cfg.PublicURL, smtp, to, now),
		DKIMSelector: sel, Resolver: s.deps.Resolver, Now: func() time.Time { return now }})
	slog.InfoContext(ctx, "admin e-mail test", "user", user.Email, "to", to, "status", r.Status, "sent", r.Sent, "queue_id", r.QueueID)
	return &Out[maildiag.DiagReport]{Body: *r}, nil
}
