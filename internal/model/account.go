package model

import "time"

// Account is one firm (tenant): a tiler or a crew, with its company data and settings.
type Account struct {
	ID             uint
	Slug           string `gorm:"not null;uniqueIndex"`
	Name           string `gorm:"not null"`
	RegistrationNo string
	VatNo          string
	Street         string
	City           string
	Zip            string
	Phone          string
	Email          string
	Web            string
	BankAccount    string
	IBAN           string
	Swift          string
	LogoKey        string // storage key of the logo printed on quotes and invoices ("" = none)
	LogoType       string
	// own e-mail server of the firm; none = the application's server
	MailServer `gorm:"embedded"`
	// live sending through the firm's own server, switched on by the firm itself
	EmailLive       bool `gorm:"not null;default:false"`
	AccountSettings `gorm:"embedded"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// AccountSettings are the firm's settings (SPEC §2).
type AccountSettings struct {
	VatPayer       bool   `gorm:"not null;default:false"`
	DefaultVatRate int    `gorm:"not null;default:12"` // % for a VAT payer: 12 = repairs of housing, 21, 0 = reverse charge
	QuoteValidDays int    `gorm:"not null;default:30"`
	QuoteIntro     string `gorm:"not null;default:''"`
	QuoteTerms     string `gorm:"not null;default:''"`
	InvoiceDueDays int    `gorm:"not null;default:14"`
	InvoiceDigits  int    `gorm:"not null;default:3"` // digits of the sequence in the invoice number (YY + sequence): 3 = 26001
	InvoiceText    string `gorm:"not null;default:''"`
}

// Membership puts a user into a firm with a role.
type Membership struct {
	ID        uint
	AccountID uint   `gorm:"not null;uniqueIndex:idx_membership_account_user"`
	UserID    uint   `gorm:"not null;uniqueIndex:idx_membership_account_user"`
	Role      string `gorm:"not null"`
	FirstName string
	LastName  string
	Phone     string
	Color     string // "#RRGGBB" in the jobs calendar
	Pending   bool   `gorm:"not null;default:false"` // invitation of an existing user, not accepted yet (no access)
	CreatedAt time.Time
	UpdatedAt time.Time

	User User
}

// Counter is the last issued number of a series ("quote-2026", "invoice-2026").
type Counter struct {
	ID        uint
	AccountID uint   `gorm:"not null;uniqueIndex:idx_counter"`
	Series    string `gorm:"not null;uniqueIndex:idx_counter"`
	Last      int64
}

// InstanceSettings are the application-wide settings the superadmin edits in
// Správa aplikace (one row, ID 1). Values set in the server environment take
// precedence (internal/api/instance_settings.go). Secrets are encrypted.
type InstanceSettings struct {
	ID         uint
	MailServer `gorm:"embedded"`
	EmailLive  bool `gorm:"not null;default:false"`
	UpdatedAt  time.Time
}

// MailServer is an outgoing e-mail server: the application's (Správa
// aplikace) or a firm's own. Secrets are encrypted.
type MailServer struct {
	// MailMode "" (none), "gmail" (smtp.gmail.com:587 with an app password) or "smtp"
	MailMode     string
	SMTPHost     string
	SMTPPort     int
	SMTPTLS      string
	SMTPUser     string
	SMTPPassword string // encrypted
	MailFrom     string
	DKIMDomain   string
	DKIMSelector string
	DKIMKey      string // encrypted PEM
}

// E-mail statuses.
const (
	EmailStored = "stored" // not sent (live sending off or a test instance)
	EmailSent   = "sent"
	EmailFailed = "failed"
)

// Email is a record of an outgoing e-mail (sent or only stored).
type Email struct {
	ID        uint
	AccountID uint  `gorm:"not null;index"`
	QuoteID   *uint `gorm:"index"`
	JobID     *uint `gorm:"index"`
	InvoiceID *uint `gorm:"index"`
	Kind      string
	To        string `gorm:"not null"`
	ReplyTo   string
	Subject   string `gorm:"not null"`
	Body      string
	Files     string // names of the attached files, ", " separated
	Status    string `gorm:"not null"`
	Error     string
	SentByID  uint
	CreatedAt time.Time
}
