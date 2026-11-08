// Package config loads the server configuration from TILECRAFT_* environment variables.
package config

import (
	"fmt"
	"net/netip"
	"os"
	"strconv"
	"strings"

	"github.com/qwerin/tilecraft/internal/httpsec"
	"github.com/qwerin/tilecraft/internal/mail"
)

// Config is the whole server configuration.
type Config struct {
	ListenAddr     string   // TILECRAFT_LISTEN_ADDR (":8080")
	DBDriver       string   // TILECRAFT_DB_DRIVER (sqlite | postgres)
	DBDSN          string   // TILECRAFT_DB_DSN
	DataDir        string   // TILECRAFT_DATA_DIR (attachments)
	StaticDir      string   // TILECRAFT_STATIC_DIR (built SPA; "" = API only)
	PublicURL      string   // TILECRAFT_PUBLIC_URL
	AllowSignup    bool     // TILECRAFT_ALLOW_SIGNUP (default true): registration without a code, unless SignupCode is set
	SignupCode     string   // TILECRAFT_SIGNUP_CODE: registration code (then every registration needs a code)
	Superadmins    []string // TILECRAFT_SUPERADMINS: e-mails (comma-separated) of users who may open every firm
	SecureCookies  *bool    // TILECRAFT_SECURE_COOKIES (nil = auto)
	TrustedProxies []netip.Prefix
	DBLog          string // TILECRAFT_DB_LOG
	SeedDemo       bool   // TILECRAFT_SEED_DEMO: create a demo firm on an empty database
	Test           bool   // TILECRAFT_ENV=test (production | test): test instance, the SPA shows test colors
	SMTP           SMTP   // TILECRAFT_SMTP_* or TILECRAFT_GMAIL_*: outgoing e-mail server
	EmailLive      bool   // TILECRAFT_EMAIL_LIVE (default false): really send e-mails; otherwise (and always on a test instance) only store them
	SecretKey      string // TILECRAFT_SECRET_KEY: 32-byte key (base64/hex) encrypting stored secrets (SMTP passwords); "" = DataDir/secret.key
}

// SMTP is the outgoing mail server; Host "" = e-mails are only recorded.
type SMTP struct {
	Host     string // TILECRAFT_SMTP_HOST
	Port     int    // TILECRAFT_SMTP_PORT (587; 465 = implicit TLS)
	TLS      string // TILECRAFT_SMTP_TLS: starttls (required, default) | tls (implicit; default on port 465) | none (local relay)
	User     string // TILECRAFT_SMTP_USER
	Password string // TILECRAFT_SMTP_PASSWORD
	From     string // TILECRAFT_SMTP_FROM, e.g. "tilecraft <noreply@example.cz>"
	// DKIM signing (all three or none): TILECRAFT_DKIM_DOMAIN, TILECRAFT_DKIM_SELECTOR and
	// TILECRAFT_DKIM_PRIVATE_KEY (PEM) or TILECRAFT_DKIM_PRIVATE_KEY_FILE; the key is never logged.
	DKIM *mail.DKIMConfig
}

// Mail is the configuration of the SMTP mailer and of the e-mail diagnostics.
func (s SMTP) Mail() mail.SMTPConfig {
	return mail.SMTPConfig{Host: s.Host, Port: s.Port, Username: s.User, Password: s.Password, TLS: s.TLS, From: s.From, DKIM: s.DKIM}
}

// GmailHost is Gmail's SMTP server (STARTTLS on 587).
const GmailHost = "smtp.gmail.com"

// SendsEmails reports whether e-mails really go out: only with TILECRAFT_EMAIL_LIVE
// and never on a test instance (it may hold copies of production data).
func (c Config) SendsEmails() bool { return c.EmailLive && !c.Test }

// Load reads the environment.
func Load() (Config, error) {
	c := Config{
		ListenAddr: env("TILECRAFT_LISTEN_ADDR", ":8080"),
		DBDriver:   env("TILECRAFT_DB_DRIVER", "sqlite"),
		DBDSN:      env("TILECRAFT_DB_DSN", "tilecraft.db"),
		DataDir:    env("TILECRAFT_DATA_DIR", "./data"),
		StaticDir:  os.Getenv("TILECRAFT_STATIC_DIR"),
		PublicURL:  env("TILECRAFT_PUBLIC_URL", "http://localhost:8080"),
		DBLog:      os.Getenv("TILECRAFT_DB_LOG"),
		SignupCode: strings.TrimSpace(os.Getenv("TILECRAFT_SIGNUP_CODE")),
		SecretKey:  os.Getenv("TILECRAFT_SECRET_KEY"),
	}
	for _, e := range strings.Split(os.Getenv("TILECRAFT_SUPERADMINS"), ",") {
		if e = strings.ToLower(strings.TrimSpace(e)); e != "" {
			c.Superadmins = append(c.Superadmins, e)
		}
	}
	var err error
	if c.AllowSignup, err = boolEnv("TILECRAFT_ALLOW_SIGNUP", true); err != nil {
		return c, err
	}
	if c.SeedDemo, err = boolEnv("TILECRAFT_SEED_DEMO", false); err != nil {
		return c, err
	}
	switch v := env("TILECRAFT_ENV", "production"); v {
	case "production":
	case "test":
		c.Test = true
	default:
		return c, fmt.Errorf("TILECRAFT_ENV: %q is not production or test", v)
	}
	c.SMTP = SMTP{Host: os.Getenv("TILECRAFT_SMTP_HOST"), User: os.Getenv("TILECRAFT_SMTP_USER"),
		Password: os.Getenv("TILECRAFT_SMTP_PASSWORD"), From: os.Getenv("TILECRAFT_SMTP_FROM")}
	if c.SMTP.Port, err = strconv.Atoi(env("TILECRAFT_SMTP_PORT", "587")); err != nil {
		return c, fmt.Errorf("TILECRAFT_SMTP_PORT: %w", err)
	}
	if u := strings.TrimSpace(os.Getenv("TILECRAFT_GMAIL_USER")); u != "" {
		if c.SMTP.Host != "" {
			return c, fmt.Errorf("set either TILECRAFT_GMAIL_* or TILECRAFT_SMTP_HOST, not both")
		}
		// Gmail: SMTP with an app password (Google account → Security → App passwords), shown with spaces.
		pw := strings.ReplaceAll(os.Getenv("TILECRAFT_GMAIL_APP_PASSWORD"), " ", "")
		if pw == "" {
			return c, fmt.Errorf("TILECRAFT_GMAIL_APP_PASSWORD is required with TILECRAFT_GMAIL_USER")
		}
		c.SMTP = SMTP{Host: GmailHost, Port: 587, TLS: mail.TLSStartTLS, User: u, Password: pw, From: env("TILECRAFT_SMTP_FROM", u)}
	}
	if c.SMTP.TLS == "" {
		c.SMTP.TLS = env("TILECRAFT_SMTP_TLS", mail.TLSStartTLS)
		if os.Getenv("TILECRAFT_SMTP_TLS") == "" && c.SMTP.Port == 465 {
			c.SMTP.TLS = mail.TLSImplicit
		}
	}
	switch c.SMTP.TLS {
	case mail.TLSStartTLS, mail.TLSImplicit, mail.TLSNone:
	default:
		return c, fmt.Errorf("TILECRAFT_SMTP_TLS: unsupported mode %q (starttls|tls|none)", c.SMTP.TLS)
	}
	if c.SMTP.DKIM, err = loadDKIM(); err != nil {
		return c, err
	}
	if c.SMTP.Host != "" && c.SMTP.From == "" {
		return c, fmt.Errorf("TILECRAFT_SMTP_FROM is required with TILECRAFT_SMTP_HOST")
	}
	if c.EmailLive, err = boolEnv("TILECRAFT_EMAIL_LIVE", false); err != nil {
		return c, err
	}
	if c.EmailLive && c.SMTP.Host == "" {
		return c, fmt.Errorf("TILECRAFT_EMAIL_LIVE needs TILECRAFT_GMAIL_* or TILECRAFT_SMTP_HOST")
	}
	if v := os.Getenv("TILECRAFT_SECURE_COOKIES"); v != "" {
		b, err := strconv.ParseBool(v)
		if err != nil {
			return c, fmt.Errorf("TILECRAFT_SECURE_COOKIES: %w", err)
		}
		c.SecureCookies = &b
	}
	if c.TrustedProxies, err = httpsec.ParseProxies(os.Getenv("TILECRAFT_TRUSTED_PROXIES")); err != nil {
		return c, fmt.Errorf("TILECRAFT_TRUSTED_PROXIES: %w", err)
	}
	return c, nil
}

// OpenSignup reports whether anyone may register without a code.
func (c Config) OpenSignup() bool { return c.AllowSignup && c.SignupCode == "" }

// PublicHTTPS reports whether the public URL is https.
func (c Config) PublicHTTPS() bool { return strings.HasPrefix(c.PublicURL, "https://") }

// loadDKIM reads the optional DKIM settings; errors never contain key material.
func loadDKIM() (*mail.DKIMConfig, error) {
	domain := strings.ToLower(strings.TrimSpace(os.Getenv("TILECRAFT_DKIM_DOMAIN")))
	selector := strings.TrimSpace(os.Getenv("TILECRAFT_DKIM_SELECTOR"))
	pemText := os.Getenv("TILECRAFT_DKIM_PRIVATE_KEY")
	if file := os.Getenv("TILECRAFT_DKIM_PRIVATE_KEY_FILE"); file != "" {
		if pemText != "" {
			return nil, fmt.Errorf("TILECRAFT_DKIM_PRIVATE_KEY and TILECRAFT_DKIM_PRIVATE_KEY_FILE: set only one")
		}
		b, err := os.ReadFile(file)
		if err != nil {
			return nil, fmt.Errorf("TILECRAFT_DKIM_PRIVATE_KEY_FILE: %w", err)
		}
		pemText = string(b)
	}
	if domain == "" && selector == "" && pemText == "" {
		return nil, nil
	}
	if domain == "" || selector == "" || pemText == "" {
		return nil, fmt.Errorf("DKIM: set TILECRAFT_DKIM_DOMAIN, TILECRAFT_DKIM_SELECTOR and TILECRAFT_DKIM_PRIVATE_KEY(_FILE) together")
	}
	key, err := mail.ParseDKIMKey(pemText)
	if err != nil {
		return nil, fmt.Errorf("TILECRAFT_DKIM_PRIVATE_KEY: %w", err)
	}
	return &mail.DKIMConfig{Domain: domain, Selector: selector, Key: key}, nil
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func boolEnv(k string, def bool) (bool, error) {
	v := os.Getenv(k)
	if v == "" {
		return def, nil
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return false, fmt.Errorf("%s: %w", k, err)
	}
	return b, nil
}
