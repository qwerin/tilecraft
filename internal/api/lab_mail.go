package api

import (
	"context"
	"net/netip"
	"slices"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/model"
)

// LabMailSettings is the firm's own e-mail server (SPEC §3c; secrets only as "set").
type LabMailSettings struct {
	Mode         string `json:"mode" enum:",gmail,smtp" doc:"empty = the application's server"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	TLS          string `json:"tls"`
	User         string `json:"user"`
	PasswordSet  bool   `json:"password_set"`
	From         string `json:"from"`
	DKIMDomain   string `json:"dkim_domain"`
	DKIMSelector string `json:"dkim_selector"`
	DKIMKeySet   bool   `json:"dkim_key_set"`
	Live         bool   `json:"live" doc:"e-mails really go out (application-wide, or own_live with the firm's own server)"`
	OwnLive      bool   `json:"own_live" doc:"the firm switched on live sending through its own server"`
	AppLive      bool   `json:"app_live" doc:"live sending is on application-wide (Správa aplikace or the server environment)"`
	Test         bool   `json:"test" doc:"test instance (never sends)"`
	AppSender    string `json:"app_sender" doc:"sender of the application's server used without an own one; empty = none"`
}

// labSMTPPorts are the ports a firm's own SMTP server may use (the
// server must not become a probe of other services).
var labSMTPPorts = []int{25, 465, 587, 2525}

func (s *server) registerLabMail(g huma.API) {
	huma.Get(g, "/mail", s.getLabMail, auth.ForManagers)
	huma.Put(g, "/mail", s.putLabMail, auth.ForManagers)
}

func (s *server) labMailOut(ctx context.Context, acc *model.Account) (*Out[LabMailSettings], error) {
	st, err := s.instanceSettings(ctx)
	if err != nil {
		return nil, err
	}
	ms := &acc.MailServer
	out := LabMailSettings{Mode: ms.MailMode, Host: ms.SMTPHost, Port: ms.SMTPPort, TLS: ms.SMTPTLS, User: ms.SMTPUser,
		PasswordSet: ms.SMTPPassword != "", From: ms.MailFrom, DKIMDomain: ms.DKIMDomain, DKIMSelector: ms.DKIMSelector,
		DKIMKeySet: ms.DKIMKey != "", OwnLive: acc.EmailLive, AppLive: s.cfg.EmailLive || st.EmailLive, Test: s.cfg.Test}
	out.Live = (out.AppLive || out.OwnLive && ms.MailMode != MailNone) && !s.cfg.Test
	switch {
	case s.cfg.SMTP.Host != "":
		out.AppSender = s.cfg.SMTP.From
	case st.MailMode != MailNone:
		out.AppSender = st.MailFrom
	}
	return &Out[LabMailSettings]{Body: out}, nil
}

func (s *server) getLabMail(ctx context.Context, _ *struct{}) (*Out[LabMailSettings], error) {
	acc, err := s.freshAccount(ctx)
	if err != nil {
		return nil, err
	}
	return s.labMailOut(ctx, acc)
}

func (s *server) putLabMail(ctx context.Context, in *struct{ Body MailServerInput }) (*Out[LabMailSettings], error) {
	acc, err := s.freshAccount(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.applyMail(&acc.MailServer, in.Body); err != nil {
		return nil, err
	}
	if ms := acc.MailServer; ms.MailMode == MailSMTP && !s.deps.LabSMTPAnyHost {
		if !slices.Contains(labSMTPPorts, ms.SMTPPort) {
			return nil, invalid("port", "use the port 25, 465, 587 or 2525")
		}
		if localHost(ms.SMTPHost) {
			return nil, invalid("host", "enter the public name of the SMTP server")
		}
	}
	ms := acc.MailServer
	acc.EmailLive = in.Body.Live
	if err := s.db.WithContext(ctx).Model(acc).Select("mail_mode", "smtp_host", "smtp_port", "smtp_tls", "smtp_user", "smtp_password",
		"mail_from", "dkim_domain", "dkim_selector", "dkim_key", "email_live").Updates(&model.Account{MailServer: ms, EmailLive: acc.EmailLive}).Error; err != nil {
		return nil, dbErr(err, "account")
	}
	return s.labMailOut(ctx, acc)
}

// localHost reports a host name or address of this machine or a private
// network (names without a dot are e.g. other containers).
func localHost(host string) bool {
	h := strings.ToLower(strings.TrimSuffix(host, "."))
	if !strings.Contains(h, ".") || strings.HasSuffix(h, ".localhost") || strings.HasSuffix(h, ".local") || strings.HasSuffix(h, ".internal") {
		return true
	}
	ip, err := netip.ParseAddr(strings.Trim(h, "[]"))
	return err == nil && (ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() || !ip.IsGlobalUnicast())
}
