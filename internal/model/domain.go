package model

import (
	"time"

	"github.com/qwerin/tilecraft/internal/calc"
)

// Customer is a person or company the firm works for (SPEC §3).
type Customer struct {
	ID             uint
	AccountID      uint   `gorm:"not null;index"`
	Name           string `gorm:"not null"`
	ContactPerson  string
	RegistrationNo string
	VatNo          string
	Email          string
	Phone          string
	Street         string
	City           string
	Zip            string
	Note           string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Line sections (SPEC §5.3).
const (
	SectionWork     = "work"
	SectionMaterial = "material"
	SectionOther    = "other"
)

// CatalogItem is a price-list item (SPEC §4).
type CatalogItem struct {
	ID            uint
	AccountID     uint   `gorm:"not null;index"`
	Kind          string `gorm:"not null"` // SectionWork | SectionMaterial | SectionOther
	Code          string
	Name          string `gorm:"not null"`
	Unit          string `gorm:"not null"`
	Price         int64  // haléře per unit (without VAT for a VAT payer)
	PurchasePrice int64
	Discount      float64 // default discount in %
	Measure       string  // calc.Measure*: quantity from the measurements
	Waste         float64 // % added to a measured quantity
	Note          string
	Active        bool `gorm:"not null;default:true"`
	Position      int
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// Quote states (SPEC §5).
const (
	QuoteDraft    = "draft"
	QuoteSent     = "sent"
	QuoteAccepted = "accepted"
	QuoteRejected = "rejected"
)

// Quote is a price offer (nabídka) with measurements and lines.
type Quote struct {
	ID          uint
	AccountID   uint   `gorm:"not null;uniqueIndex:idx_quote_number"`
	Number      string `gorm:"not null;uniqueIndex:idx_quote_number"`
	CustomerID  uint   `gorm:"not null;index"`
	Title       string `gorm:"not null"`
	SiteAddress string
	State       string `gorm:"not null;index"`
	IssuedOn    string `gorm:"not null"`
	ValidUntil  string `gorm:"not null"`
	Intro       string
	Note        string
	Terms       string
	VatRate     int     // % (0 for a non-payer)
	Discount    float64 // % off the whole quote
	ShowMeasure bool    `gorm:"not null;default:false"` // print the measurements for the customer
	Rooms       []calc.Room `gorm:"serializer:json"`
	PublicToken string      `gorm:"not null;uniqueIndex"`
	SentAt      *time.Time
	SentTo      string
	DecidedAt   *time.Time
	DecidedBy   string // name the customer gave (or the user's name)
	Reason      string // customer's note to the decision
	Total       int64  // with VAT; stored for lists
	CreatedByID uint
	CreatedAt   time.Time
	UpdatedAt   time.Time

	Customer Customer
	Lines    []QuoteLine
}

// LineData is a line of a quote or job (SPEC §5.3).
type LineData struct {
	Section          string `gorm:"not null"`
	CatalogItemID    *uint
	Name             string `gorm:"not null"`
	Unit             string
	Quantity         float64
	UnitPrice        int64
	Discount         float64
	CustomerSupplied bool     `gorm:"not null;default:false"`
	Measure          string   // "" = manual quantity
	Rooms            []string `gorm:"serializer:json"` // rooms of the measure ("" = all)
	Waste            float64
	Note             string
	Position         int
}

// Amount is the line's price without VAT (haléře).
func (l *LineData) Amount() int64 {
	return calc.LineAmount(l.Quantity, l.UnitPrice, l.Discount, l.CustomerSupplied)
}

// QuoteLine is a line of a quote.
type QuoteLine struct {
	ID      uint
	QuoteID uint `gorm:"not null;index"`
	LineData
}

// Job states (SPEC §6).
const (
	JobPlanned    = "planned"
	JobInProgress = "in_progress"
	JobDone       = "done"
	JobInvoiced   = "invoiced"
	JobCancelled  = "cancelled"
)

// JobStates in workflow order.
var JobStates = []string{JobPlanned, JobInProgress, JobDone, JobInvoiced, JobCancelled}

// Job is a contract being carried out (zakázka).
type Job struct {
	ID          uint
	AccountID   uint   `gorm:"not null;uniqueIndex:idx_job_number"`
	Number      string `gorm:"not null;uniqueIndex:idx_job_number"`
	CustomerID  uint   `gorm:"not null;index"`
	QuoteID     *uint  `gorm:"index"`
	Title       string `gorm:"not null"`
	SiteAddress string
	SiteContact string
	State       string `gorm:"not null;index"`
	StartOn     string // YYYY-MM-DD ("" = not scheduled)
	EndOn       string
	Note        string
	VatRate     int
	Discount    float64
	Rooms       []calc.Room `gorm:"serializer:json"`
	WorkerIDs   []uint      `gorm:"serializer:json"` // membership IDs
	Total       int64
	CreatedAt   time.Time
	UpdatedAt   time.Time

	Customer Customer
	Lines    []JobLine
}

// JobLine is a line of a job (the real quantities).
type JobLine struct {
	ID    uint
	JobID uint `gorm:"not null;index"`
	LineData
}

// JobNote is a diary entry of a job.
type JobNote struct {
	ID        uint
	AccountID uint `gorm:"not null;index"`
	JobID     uint `gorm:"not null;index"`
	UserID    uint
	On        string `gorm:"not null"` // YYYY-MM-DD
	Text      string `gorm:"not null"`
	CreatedAt time.Time

	User User
}

// Attachment is a photo or file of a job.
type Attachment struct {
	ID          uint
	AccountID   uint `gorm:"not null;index"`
	JobID       uint `gorm:"not null;index"`
	Filename    string
	ContentType string
	Size        int64
	StorageKey  string
	UploadedBy  uint
	CreatedAt   time.Time
}

// Invoice kinds (SPEC §7).
const (
	InvoiceRegular = "invoice"
	InvoiceAdvance = "advance"
)

// Invoice bills a customer, usually for a job.
type Invoice struct {
	ID         uint
	AccountID  uint   `gorm:"not null;uniqueIndex:idx_invoice_account_number"`
	Number     string `gorm:"not null;uniqueIndex:idx_invoice_account_number"`
	Kind       string `gorm:"not null"`
	CustomerID uint   `gorm:"not null;index"`
	JobID      *uint  `gorm:"index"`
	// customer's data when the invoice was issued
	CustName           string
	CustStreet         string
	CustCity           string
	CustZip            string
	CustRegistrationNo string
	CustVatNo          string
	CustEmail          string
	VatPayer           bool // the firm was a VAT payer when it issued the invoice
	IssuedOn           string `gorm:"not null"`
	TaxableOn          string
	DueOn              string `gorm:"not null"`
	Total              int64  // with VAT
	PaidOn             *string
	Note               string
	EmailedAt          *time.Time
	EmailedTo          string
	CreatedAt          time.Time
	UpdatedAt          time.Time

	Customer Customer
	Lines    []InvoiceLine
}

// InvoiceLine is one billed line; AdvanceID = deduction of a paid advance invoice.
type InvoiceLine struct {
	ID        uint
	InvoiceID uint `gorm:"not null;index"`
	Text      string
	Unit      string
	Quantity  float64
	UnitPrice int64 // without VAT for a VAT payer
	Discount  float64
	VatRate   int
	AdvanceID *uint // deduction of this advance invoice
	Position  int
}

// Amount is the line's price without VAT.
func (l *InvoiceLine) Amount() int64 { return calc.LineAmount(l.Quantity, l.UnitPrice, l.Discount, false) }
