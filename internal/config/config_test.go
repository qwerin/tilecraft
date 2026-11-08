package config

import "testing"

// TestEmailConfig: e-mails go out only with TILECRAFT_EMAIL_LIVE; Gmail fills the SMTP server.
func TestEmailConfig(t *testing.T) {
	c, err := Load()
	if err != nil || c.EmailLive || c.SendsEmails() || c.SMTP.Host != "" {
		t.Fatalf("default: %+v %v", c, err)
	}

	t.Setenv("TILECRAFT_EMAIL_LIVE", "true")
	if _, err := Load(); err == nil {
		t.Fatal("live sending without a mail server accepted")
	}

	t.Setenv("TILECRAFT_GMAIL_USER", "lab@gmail.com")
	if _, err := Load(); err == nil {
		t.Fatal("Gmail without an app password accepted")
	}
	t.Setenv("TILECRAFT_GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop")
	c, err = Load()
	if err != nil || !c.SendsEmails() || c.SMTP != (SMTP{Host: GmailHost, Port: 587, TLS: "starttls", User: "lab@gmail.com", Password: "abcdefghijklmnop", From: "lab@gmail.com"}) {
		t.Fatalf("gmail: %+v %v", c.SMTP, err)
	}
	t.Setenv("TILECRAFT_SMTP_FROM", "Laboratoř <lab@gmail.com>")
	if c, _ = Load(); c.SMTP.From != "Laboratoř <lab@gmail.com>" {
		t.Fatalf("gmail from: %q", c.SMTP.From)
	}

	t.Setenv("TILECRAFT_ENV", "test")
	if c, _ = Load(); c.SendsEmails() {
		t.Fatal("test instance sends e-mails")
	}

	t.Setenv("TILECRAFT_SMTP_HOST", "smtp.example.cz")
	if _, err := Load(); err == nil {
		t.Fatal("Gmail together with SMTP accepted")
	}
}
