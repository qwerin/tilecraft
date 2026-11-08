// Package model holds the GORM structs and enum constants (no API concerns).
// Every firm-owned table has AccountID; queries go through the API's account
// scope (SPEC §1).
package model

import "time"

// All lists the models migrated by db.Migrate.
func All() []any {
	return []any{
		&User{}, &Session{}, &APIToken{}, &OAuthClient{}, &OAuthCode{}, &OAuthGrant{}, &SignupCode{},
		&Account{}, &Membership{}, &Counter{}, &InstanceSettings{}, &Email{},
		&Customer{}, &CatalogItem{}, &Quote{}, &QuoteLine{}, &Job{}, &JobLine{}, &JobNote{}, &Attachment{},
		&Invoice{}, &InvoiceLine{},
	}
}

// Membership roles (SPEC §1).
const (
	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleWorker = "worker"
)

// User is a global login identity.
type User struct {
	ID           uint
	Email        string `gorm:"not null;uniqueIndex"`
	PasswordHash string `gorm:"not null"`
	Name         string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Session is a browser login (cookie holds the plaintext token, DB its hash).
type Session struct {
	ID        uint
	UserID    uint   `gorm:"not null;index"`
	TokenHash string `gorm:"not null;uniqueIndex"`
	ExpiresAt time.Time
	CreatedAt time.Time
}

// APIToken authenticates API/MCP requests (Authorization: Bearer tc_…): a
// personal token, or the access token of a connected OAuth application.
type APIToken struct {
	ID         uint
	UserID     uint   `gorm:"not null;index"`
	Name       string `gorm:"not null"`
	TokenHash  string `gorm:"not null;uniqueIndex"`
	Prefix     string `gorm:"not null"` // first 8 chars, for display
	LastUsedAt *time.Time
	ExpiresAt  *time.Time `gorm:"index"` // nil = never expires
	CreatedAt  time.Time

	OAuthGrantID *uint `gorm:"column:oauth_grant_id;index"` // access token of an OAuthGrant
}

// OAuthClient is an OAuth client registered dynamically (RFC 7591), e.g. an
// AI assistant connecting to the MCP endpoint.
type OAuthClient struct {
	ID           uint
	ClientID     string   `gorm:"not null;uniqueIndex"`
	SecretHash   string   // "" = public client (PKCE only)
	Name         string   `gorm:"not null"`
	RedirectURIs []string `gorm:"serializer:json"`
	CreatedAt    time.Time
}

// OAuthCode is a one-time authorization code waiting to be exchanged for tokens.
type OAuthCode struct {
	ID            uint
	CodeHash      string `gorm:"not null;uniqueIndex"`
	ClientID      string `gorm:"not null;index"`
	UserID        uint   `gorm:"not null;index"`
	RedirectURI   string `gorm:"not null"`
	CodeChallenge string `gorm:"not null"` // PKCE S256
	Resource      string
	ExpiresAt     time.Time `gorm:"not null;index"`
	CreatedAt     time.Time
}

// OAuthGrant is a user's consent to a client ("connected application") with
// the rotating refresh token; deleting it disconnects the application.
type OAuthGrant struct {
	ID          uint
	UserID      uint   `gorm:"not null;index"`
	ClientID    string `gorm:"not null;index"`
	ClientName  string `gorm:"not null"`
	RefreshHash string `gorm:"not null;uniqueIndex"`
	Resource    string
	ExpiresAt   time.Time `gorm:"not null;index"` // of the refresh token (sliding)
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (OAuthClient) TableName() string { return "oauth_clients" }
func (OAuthCode) TableName() string   { return "oauth_codes" }
func (OAuthGrant) TableName() string  { return "oauth_grants" }

// SignupCode is a one-time registration code of a new firm, issued by a
// superadmin; the plaintext is shown only when it is created.
type SignupCode struct {
	ID          uint
	CodeHash    string `gorm:"not null;uniqueIndex"`
	Note        string // for whom
	CreatedByID uint
	ExpiresAt   time.Time `gorm:"not null"`
	UsedAt      *time.Time
	UsedByID    *uint
	AccountID   *uint // the firm registered with the code
	CreatedAt   time.Time
}

