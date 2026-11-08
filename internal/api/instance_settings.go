package api

import (
	"context"
	"errors"
	netmail "net/mail"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/config"
	"github.com/qwerin/tilecraft/internal/mail"
	"github.com/qwerin/tilecraft/internal/maildiag"
	"github.com/qwerin/tilecraft/internal/model"
)

// Sources of an application-wide setting.
const (
	SourceNone = "none" // not configured
	SourceEnv  = "env"  // the server environment (.env); read-only in the administration
	SourceApp  = "app"  // Správa aplikace
	SourceLab  = "lab"  // the firm's own e-mail server (Nastavení firmy → E-mail)
)

// Mail modes of the administration.
const (
	MailNone  = ""
	MailGmail = "gmail"
	MailSMTP  = "smtp"
)

// instanceSettings returns the application-wide settings row (zero value when none was saved yet).
func (s *server) instanceSettings(ctx context.Context) (*model.InstanceSettings, error) {
	var st model.InstanceSettings
	err := s.db.WithContext(ctx).First(&st, 1).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return &model.InstanceSettings{ID: 1}, nil
	}
	if err != nil {
		return nil, dbErr(err, "settings")
	}
	return &st, nil
}

// mailSetup is the effective e-mail configuration.
type mailSetup struct {
	SMTP       mail.SMTPConfig
	Source     string // SourceLab / SourceEnv / SourceApp / SourceNone
	Live       bool   // e-mails really go out (never on a test instance)
	LiveSource string // SourceEnv when TILECRAFT_EMAIL_LIVE=true
	Mailer     mail.Mailer
}

// mailSetup resolves the mail server (the firm's own, then the
// environment, then the administration) and whether sending is live
// (application-wide, or by the firm for its own server).
func (s *server) mailSetup(ctx context.Context) (mailSetup, error) {
	st, err := s.instanceSettings(ctx)
	if err != nil {
		return mailSetup{}, err
	}
	m := mailSetup{Source: SourceNone, LiveSource: SourceApp}
	acc := auth.AccountFrom(ctx)
	switch {
	case acc != nil && acc.MailMode != MailNone:
		m.Source = SourceLab
		if m.SMTP, err = s.smtpConfig(&acc.MailServer, "the firm settings"); err != nil {
			return mailSetup{}, err
		}
	case s.cfg.SMTP.Host != "":
		m.SMTP, m.Source = s.cfg.SMTP.Mail(), SourceEnv
	case st.MailMode != MailNone:
		m.Source = SourceApp
		if m.SMTP, err = s.smtpConfig(&st.MailServer, "Správa aplikace"); err != nil {
			return mailSetup{}, err
		}
	}
	if s.cfg.EmailLive {
		m.LiveSource = SourceEnv
	}
	labLive := m.Source == SourceLab && acc.EmailLive // the firm's own switch, for its own server only
	m.Live = (s.cfg.EmailLive || st.EmailLive || labLive) && !s.cfg.Test
	switch {
	case s.deps.Mailer != nil: // tests
		m.Mailer = s.deps.Mailer
	case m.Source != SourceNone:
		m.Mailer = mail.NewSMTP(m.SMTP)
	}
	return m, nil
}

// smtpConfig decrypts a stored mail server; where tells where to enter it again.
func (s *server) smtpConfig(ms *model.MailServer, where string) (mail.SMTPConfig, error) {
	pw, err := s.deps.Secrets.Decrypt(ms.SMTPPassword)
	if err != nil {
		return mail.SMTPConfig{}, huma.Error500InternalServerError("the stored SMTP password cannot be decrypted; enter it again in " + where)
	}
	c := mail.SMTPConfig{Host: ms.SMTPHost, Port: ms.SMTPPort, TLS: ms.SMTPTLS, Username: ms.SMTPUser, Password: pw, From: ms.MailFrom}
	if ms.DKIMKey != "" {
		pem, err := s.deps.Secrets.Decrypt(ms.DKIMKey)
		if err == nil {
			if key, err := mail.ParseDKIMKey(pem); err == nil {
				c.DKIM = &mail.DKIMConfig{Domain: ms.DKIMDomain, Selector: ms.DKIMSelector, Key: key}
			}
		}
	}
	return c, nil
}

// ---- administration ----

// AdminMailSettings is the e-mail part of Správa aplikace (secrets only as "set").
type AdminMailSettings struct {
	Source       string `json:"source" enum:"none,env,app" doc:"env = set in the server environment, read-only here"`
	Mode         string `json:"mode" enum:",gmail,smtp"`
	Host         string `json:"host"`
	Port         int    `json:"port"`
	TLS          string `json:"tls"`
	User         string `json:"user"`
	PasswordSet  bool   `json:"password_set"`
	From         string `json:"from"`
	Live         bool   `json:"live" doc:"Live sending as configured (the test instance never sends anyway)"`
	LiveSource   string `json:"live_source" enum:"env,app" doc:"env = TILECRAFT_EMAIL_LIVE=true on the server"`
	DKIMDomain   string `json:"dkim_domain"`
	DKIMSelector string `json:"dkim_selector"`
	DKIMKeySet   bool   `json:"dkim_key_set"`
	TestInstance bool   `json:"test_instance"`
}

// AdminSettings are the application-wide settings.
type AdminSettings struct {
	Mail AdminMailSettings `json:"mail"`
}

// AdminMailInput saves the e-mail settings; nil secrets keep the stored ones.
// Without a server live sending serves only firms with their own one.
type AdminMailInput struct {
	Mode         string  `json:"mode" enum:",gmail,smtp" doc:"empty = no e-mail server"`
	Host         string  `json:"host,omitempty" maxLength:"255"`
	Port         int     `json:"port,omitempty" minimum:"0" maximum:"65535"`
	TLS          string  `json:"tls,omitempty" enum:",starttls,tls,none"`
	User         string  `json:"user,omitempty" maxLength:"255"`
	Password     *string `json:"password,omitempty" maxLength:"500"`
	From         string  `json:"from,omitempty" maxLength:"255"`
	Live         bool    `json:"live"`
	DKIMDomain   string  `json:"dkim_domain,omitempty" maxLength:"255"`
	DKIMSelector string  `json:"dkim_selector,omitempty" maxLength:"63"`
	DKIMKey      *string `json:"dkim_key,omitempty" maxLength:"20000" doc:"PEM private key; empty string removes it"`
}

func (s *server) registerAdminSettings(authed huma.API) {
	huma.Get(authed, "/api/admin/settings", s.getAdminSettings)
	huma.Put(authed, "/api/admin/settings/mail", s.putAdminMail)
}

func (s *server) adminSettingsOut(ctx context.Context) (*Out[AdminSettings], error) {
	st, err := s.instanceSettings(ctx)
	if err != nil {
		return nil, err
	}
	out := AdminSettings{}
	m := &out.Mail
	m.TestInstance, m.LiveSource, m.Live = s.cfg.Test, SourceApp, st.EmailLive
	if s.cfg.EmailLive {
		m.LiveSource, m.Live = SourceEnv, true
	}
	if c := s.cfg.SMTP; c.Host != "" {
		m.Source, m.Host, m.Port, m.TLS, m.User, m.PasswordSet, m.From = SourceEnv, c.Host, c.Port, c.TLS, c.User, c.Password != "", c.From
		m.Mode = MailSMTP
		if c.Host == config.GmailHost {
			m.Mode = MailGmail
		}
		if c.DKIM != nil {
			m.DKIMDomain, m.DKIMSelector, m.DKIMKeySet = c.DKIM.Domain, c.DKIM.Selector, true
		}
	} else {
		m.Source = SourceNone
		if st.MailMode != MailNone {
			m.Source = SourceApp
		}
		m.Mode, m.Host, m.Port, m.TLS, m.User, m.PasswordSet, m.From = st.MailMode, st.SMTPHost, st.SMTPPort, st.SMTPTLS, st.SMTPUser, st.SMTPPassword != "", st.MailFrom
		m.DKIMDomain, m.DKIMSelector, m.DKIMKeySet = st.DKIMDomain, st.DKIMSelector, st.DKIMKey != ""
	}
	return &Out[AdminSettings]{Body: out}, nil
}

func (s *server) getAdminSettings(ctx context.Context, _ *struct{}) (*Out[AdminSettings], error) {
	if err := s.requireSuperadmin(ctx); err != nil {
		return nil, err
	}
	return s.adminSettingsOut(ctx)
}

// CodeSetOnServer: the setting comes from the server environment and cannot be changed here.
const CodeSetOnServer = "set_on_server"

func validAddress(s string) bool {
	a, err := netmail.ParseAddress(s)
	return err == nil && strings.Contains(a.Address, "@")
}

func (s *server) putAdminMail(ctx context.Context, in *struct{ Body AdminMailInput }) (*Out[AdminSettings], error) {
	if err := s.requireSuperadmin(ctx); err != nil {
		return nil, err
	}
	b := in.Body
	st, err := s.instanceSettings(ctx)
	if err != nil {
		return nil, err
	}
	// with the server set in the environment only the live switch is saved here
	st.EmailLive = b.Live
	if s.cfg.SMTP.Host == "" {
		if err := s.applyMail(&st.MailServer, b.server()); err != nil {
			return nil, err
		}
	}
	if err := s.db.WithContext(ctx).Save(st).Error; err != nil {
		return nil, dbErr(err, "settings")
	}
	return s.adminSettingsOut(ctx)
}

// MailServerInput is an e-mail server; nil secrets keep the stored ones.
type MailServerInput struct {
	Mode         string  `json:"mode" enum:",gmail,smtp" doc:"empty = no e-mail server"`
	Host         string  `json:"host,omitempty" maxLength:"255"`
	Port         int     `json:"port,omitempty" minimum:"0" maximum:"65535"`
	TLS          string  `json:"tls,omitempty" enum:",starttls,tls,none"`
	User         string  `json:"user,omitempty" maxLength:"255"`
	Password     *string `json:"password,omitempty" maxLength:"500"`
	From         string  `json:"from,omitempty" maxLength:"255"`
	DKIMDomain   string  `json:"dkim_domain,omitempty" maxLength:"255"`
	DKIMSelector string  `json:"dkim_selector,omitempty" maxLength:"63"`
	DKIMKey      *string `json:"dkim_key,omitempty" maxLength:"20000" doc:"PEM private key; empty string removes it"`
	Live         bool    `json:"live,omitempty" doc:"firm settings only: live sending through the firm's own server"`
}

func (b AdminMailInput) server() MailServerInput {
	return MailServerInput{Mode: b.Mode, Host: b.Host, Port: b.Port, TLS: b.TLS, User: b.User, Password: b.Password, From: b.From,
		DKIMDomain: b.DKIMDomain, DKIMSelector: b.DKIMSelector, DKIMKey: b.DKIMKey}
}

// applyMail validates the input and writes it into st (secrets encrypted).
func (s *server) applyMail(st *model.MailServer, b MailServerInput) error {
	secret := func(dst *string, v *string) error {
		if v == nil {
			return nil
		}
		enc, err := s.deps.Secrets.Encrypt(strings.TrimSpace(*v))
		if err != nil {
			return huma.Error500InternalServerError("cannot encrypt", err)
		}
		*dst = enc
		return nil
	}
	switch b.Mode {
	case MailNone:
		*st = model.MailServer{}
		return nil
	case MailGmail:
		user := strings.TrimSpace(b.User)
		if !validAddress(user) {
			return invalid("user", "enter the Gmail address")
		}
		if b.Password != nil {
			pw := strings.ReplaceAll(*b.Password, " ", "") // Google shows app passwords in groups of four
			b.Password = &pw
		}
		st.MailMode, st.SMTPHost, st.SMTPPort, st.SMTPTLS, st.SMTPUser = MailGmail, config.GmailHost, 587, mail.TLSStartTLS, user
		st.MailFrom = strings.TrimSpace(b.From)
		if st.MailFrom == "" {
			st.MailFrom = user
		}
	case MailSMTP:
		host := strings.TrimSpace(b.Host)
		if host == "" || strings.ContainsAny(host, " /:") {
			return invalid("host", "enter the SMTP server name")
		}
		tlsMode := b.TLS
		if tlsMode == "" {
			tlsMode = mail.TLSStartTLS
		}
		port := b.Port
		if port == 0 {
			port = 587
			if tlsMode == mail.TLSImplicit {
				port = 465
			}
		}
		st.MailMode, st.SMTPHost, st.SMTPPort, st.SMTPTLS, st.SMTPUser = MailSMTP, host, port, tlsMode, strings.TrimSpace(b.User)
		st.MailFrom = strings.TrimSpace(b.From)
	}
	if !validAddress(st.MailFrom) {
		return invalid("from", "enter the sender, e.g. Obklady Novák <obklady@example.cz>")
	}
	if err := secret(&st.SMTPPassword, b.Password); err != nil {
		return err
	}
	if st.SMTPUser != "" && st.SMTPPassword == "" {
		return invalid("password", "required")
	}
	if st.SMTPUser == "" {
		st.SMTPPassword = ""
	}
	// DKIM: all three or none
	st.DKIMDomain, st.DKIMSelector = strings.ToLower(strings.TrimSpace(b.DKIMDomain)), strings.TrimSpace(b.DKIMSelector)
	if b.DKIMKey != nil {
		if k := strings.TrimSpace(*b.DKIMKey); k != "" {
			if _, err := mail.ParseDKIMKey(k); err != nil {
				return invalid("dkim_key", "invalid private key (PEM, RSA ≥ 2048 bits or Ed25519)")
			}
		}
		if err := secret(&st.DKIMKey, b.DKIMKey); err != nil {
			return err
		}
	}
	if st.DKIMSelector != "" && !maildiag.ValidSelector(st.DKIMSelector) {
		return invalid("dkim_selector", "invalid DKIM selector (letters, digits, '.', '-', '_')")
	}
	if n := btoi(st.DKIMDomain != "") + btoi(st.DKIMSelector != "") + btoi(st.DKIMKey != ""); n != 0 && n != 3 {
		return invalid("dkim_domain", "fill in the DKIM domain, selector and key together, or none of them")
	}
	return nil
}

func btoi(b bool) int {
	if b {
		return 1
	}
	return 0
}
