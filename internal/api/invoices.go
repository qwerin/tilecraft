package api

import (
	"context"
	"fmt"
	"math"
	"net/http"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/model"
	"github.com/qwerin/tilecraft/internal/spayd"
)

// InvoiceSummary is an invoice in lists.
type InvoiceSummary struct {
	ID        uint        `json:"id"`
	Number    string      `json:"number"`
	Kind      string      `json:"kind" enum:"invoice,advance" doc:"advance = zálohová faktura (request for payment, not a tax document)"`
	Customer  CustomerRef `json:"customer"`
	JobID     *uint       `json:"job_id"`
	IssuedOn  string      `json:"issued_on"`
	DueOn     string      `json:"due_on"`
	Total     int64       `json:"total" doc:"haléře with VAT"`
	PaidOn    *string     `json:"paid_on"`
	Overdue   bool        `json:"overdue"`
	EmailedAt *time.Time  `json:"emailed_at"`
	Deducted  bool        `json:"deducted" doc:"Advance already deducted on a final invoice"`
}

// InvoiceLineInput is a line of an invoice.
type InvoiceLineInput struct {
	Text      string  `json:"text" minLength:"1" maxLength:"500"`
	Unit      string  `json:"unit,omitempty" maxLength:"10"`
	Quantity  float64 `json:"quantity"`
	UnitPrice int64   `json:"unit_price" doc:"haléře without VAT (VAT payer); negative = deduction"`
	Discount  float64 `json:"discount,omitempty" minimum:"0" maximum:"100"`
	VatRate   int     `json:"vat_rate,omitempty" minimum:"0" maximum:"21"`
	AdvanceID *uint   `json:"advance_id,omitempty" doc:"Deduction of this advance invoice"`
}

// InvoiceLine is a line with its amount.
type InvoiceLine struct {
	ID uint `json:"id"`
	InvoiceLineInput
	Amount int64 `json:"amount"`
}

// VatRow is the VAT recap of one rate.
type VatRow struct {
	Rate int   `json:"rate"`
	Base int64 `json:"base"`
	Vat  int64 `json:"vat"`
}

// InvoiceParty is the customer's billing data printed on the invoice.
type InvoiceParty struct {
	Name           string `json:"name"`
	Street         string `json:"street"`
	City           string `json:"city"`
	Zip            string `json:"zip"`
	RegistrationNo string `json:"registration_no"`
	VatNo          string `json:"vat_no"`
	Email          string `json:"email"`
}

// Invoice is the full invoice.
type Invoice struct {
	InvoiceSummary
	Party     InvoiceParty  `json:"party"`
	JobNumber string        `json:"job_number"`
	VatPayer  bool          `json:"vat_payer"`
	TaxableOn string        `json:"taxable_on"`
	Note      string        `json:"note"`
	EmailedTo string        `json:"emailed_to"`
	Lines     []InvoiceLine `json:"lines" nullable:"false"`
	VatRows   []VatRow      `json:"vat_rows" nullable:"false"`
	Base      int64         `json:"base"`
	Vat       int64         `json:"vat"`
	QRPayment string        `json:"qr_payment" doc:"SPAYD payload of the QR Platba (\"\" when paid or without a bank account)"`
	VS        string        `json:"vs" doc:"Variable symbol"`
}

// InvoiceInput creates or replaces an invoice.
type InvoiceInput struct {
	Kind       string             `json:"kind,omitempty" enum:",invoice,advance" doc:"Default invoice"`
	CustomerID uint               `json:"customer_id"`
	JobID      *uint              `json:"job_id,omitempty"`
	IssuedOn   string             `json:"issued_on,omitempty" doc:"Default today"`
	TaxableOn  string             `json:"taxable_on,omitempty" doc:"DUZP; default = issued_on"`
	DueOn      string             `json:"due_on,omitempty" doc:"Default issued_on + the firm's due days"`
	Note       *string            `json:"note,omitempty" maxLength:"5000" doc:"Default = the firm's invoice text"`
	Lines      []InvoiceLineInput `json:"lines" minItems:"1" maxItems:"500"`
}

// JobInvoiceInput bills a job.
type JobInvoiceInput struct {
	Kind     string  `json:"kind" enum:"invoice,advance"`
	Percent  float64 `json:"percent,omitempty" minimum:"0" maximum:"100" doc:"Advance: % of the job total (or amount)"`
	Amount   int64   `json:"amount,omitempty" minimum:"0" doc:"Advance: amount in haléře with VAT"`
	Summary  bool    `json:"summary,omitempty" doc:"Invoice: one line per section (Práce, Materiál, Ostatní) instead of every line"`
	IssuedOn string  `json:"issued_on,omitempty"`
	DueOn    string  `json:"due_on,omitempty"`
}

// PaidInput marks an invoice paid (nil = unpaid).
type PaidInput struct {
	PaidOn *string `json:"paid_on" doc:"YYYY-MM-DD, null = not paid"`
}

func (s *server) registerInvoices(g huma.API) {
	huma.Get(g, "/invoices", s.listInvoices, auth.ForManagers)
	huma.Get(g, "/invoices/{id}", s.getInvoice, auth.ForManagers)
	huma.Post(g, "/invoices", s.createInvoice, status(http.StatusCreated), auth.ForManagers)
	huma.Put(g, "/invoices/{id}", s.updateInvoice, auth.ForManagers)
	huma.Delete(g, "/invoices/{id}", s.deleteInvoice, status(http.StatusNoContent), auth.ForManagers)
	huma.Post(g, "/invoices/{id}/paid", s.markInvoicePaid, auth.ForManagers)
	huma.Post(g, "/jobs/{id}/invoice", s.invoiceJob, status(http.StatusCreated), auth.ForManagers)
}

func (s *server) toInvoiceSummary(inv *model.Invoice) InvoiceSummary {
	return InvoiceSummary{ID: inv.ID, Number: inv.Number, Kind: inv.Kind,
		Customer: CustomerRef{ID: inv.CustomerID, Name: inv.CustName, Email: inv.CustEmail, Phone: inv.Customer.Phone, Address: joinAddress(inv.CustStreet, inv.CustZip, inv.CustCity)},
		JobID:    inv.JobID, IssuedOn: inv.IssuedOn, DueOn: inv.DueOn, Total: inv.Total, PaidOn: inv.PaidOn,
		Overdue: inv.PaidOn == nil && inv.DueOn < s.today(), EmailedAt: inv.EmailedAt}
}

func (s *server) listInvoices(ctx context.Context, in *struct {
	Kind       string `query:"kind" enum:",invoice,advance"`
	State      string `query:"state" enum:",unpaid,overdue,paid"`
	CustomerID uint   `query:"customer_id"`
	JobID      uint   `query:"job_id"`
	Year       int    `query:"year"`
	Q          string `query:"q" doc:"Search number and customer"`
	PageParams
}) (*Out[ListResponse[InvoiceSummary]], error) {
	q := s.scoped(ctx).Model(&model.Invoice{}).Preload("Customer").Order("issued_on DESC, id DESC")
	if in.Kind != "" {
		q = q.Where("kind = ?", in.Kind)
	}
	switch in.State {
	case "unpaid":
		q = q.Where("paid_on IS NULL")
	case "overdue":
		q = q.Where("paid_on IS NULL AND due_on < ?", s.today())
	case "paid":
		q = q.Where("paid_on IS NOT NULL")
	}
	if in.CustomerID != 0 {
		q = q.Where("customer_id = ?", in.CustomerID)
	}
	if in.JobID != 0 {
		q = q.Where("job_id = ?", in.JobID)
	}
	if in.Year != 0 {
		q = q.Where("issued_on >= ? AND issued_on < ?", fmt.Sprintf("%d-01-01", in.Year), fmt.Sprintf("%d-01-01", in.Year+1))
	}
	if in.Q != "" {
		p := like(in.Q)
		q = q.Where("LOWER(number) LIKE ? OR LOWER(cust_name) LIKE ?", p, p)
	}
	out, err := paginate(q, in.PageParams, s.toInvoiceSummary)
	if err != nil {
		return nil, err
	}
	return out, s.markDeducted(ctx, out.Body.Items)
}

// markDeducted flags advances already deducted on another invoice.
func (s *server) markDeducted(ctx context.Context, items []InvoiceSummary) error {
	ids := []uint{}
	for _, it := range items {
		if it.Kind == model.InvoiceAdvance {
			ids = append(ids, it.ID)
		}
	}
	if len(ids) == 0 {
		return nil
	}
	var used []uint
	if err := s.db.WithContext(ctx).Model(&model.InvoiceLine{}).Where("advance_id IN ?", ids).Pluck("advance_id", &used).Error; err != nil {
		return dbErr(err, "invoices")
	}
	for i, it := range items {
		items[i].Deducted = slices.Contains(used, it.ID)
	}
	return nil
}

func (s *server) loadInvoice(ctx context.Context, tx *gorm.DB, id uint) (*model.Invoice, error) {
	var inv model.Invoice
	if err := tx.Scopes(inAccount(ctx)).Preload("Customer").Preload("Lines", func(db *gorm.DB) *gorm.DB { return db.Order("position") }).
		First(&inv, id).Error; err != nil {
		return nil, dbErr(err, "invoice")
	}
	return &inv, nil
}

// invoiceTotals sums the lines: per VAT rate for a VAT payer.
func invoiceTotals(lines []model.InvoiceLine, vatPayer bool) (rows []VatRow, base, vat int64) {
	byRate := map[int]int64{}
	for i := range lines {
		a := lines[i].Amount()
		base += a
		if vatPayer {
			byRate[lines[i].VatRate] += a
		}
	}
	rows = []VatRow{}
	for rate, b := range byRate {
		v := int64(math.Round(float64(b) * float64(rate) / 100))
		rows = append(rows, VatRow{Rate: rate, Base: b, Vat: v})
		vat += v
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].Rate > rows[j].Rate })
	return rows, base, vat
}

// invoiceQR builds the QR Platba payload; variable symbol = digits of the number.
func invoiceQR(acc *model.Account, inv *model.Invoice) string {
	iban, swift := acc.IBAN, acc.Swift
	if iban == "" {
		a, err := spayd.ParseAccount(acc.BankAccount)
		if err != nil {
			return ""
		}
		iban = a.IBAN()
		if swift == "" {
			swift = a.SWIFT()
		}
	}
	if inv.Total <= 0 {
		return ""
	}
	return spayd.Build(spayd.Payment{IBAN: iban, SWIFT: swift, Amount: inv.Total, VariableSymbol: inv.Number,
		Message: "Faktura " + inv.Number, RecipientName: acc.Name})
}

func (s *server) toInvoice(ctx context.Context, inv *model.Invoice) (Invoice, error) {
	rows, base, vat := invoiceTotals(inv.Lines, inv.VatPayer)
	out := Invoice{InvoiceSummary: s.toInvoiceSummary(inv),
		Party: InvoiceParty{Name: inv.CustName, Street: inv.CustStreet, City: inv.CustCity, Zip: inv.CustZip,
			RegistrationNo: inv.CustRegistrationNo, VatNo: inv.CustVatNo, Email: inv.CustEmail},
		VatPayer: inv.VatPayer, TaxableOn: inv.TaxableOn, Note: inv.Note, EmailedTo: inv.EmailedTo, Lines: make([]InvoiceLine, len(inv.Lines)),
		VatRows: rows, Base: base, Vat: vat, VS: spayd.Digits(inv.Number, 10)}
	if !inv.VatPayer {
		out.VatRows = []VatRow{}
	}
	for i, l := range inv.Lines {
		out.Lines[i] = InvoiceLine{ID: l.ID, InvoiceLineInput: InvoiceLineInput{Text: l.Text, Unit: l.Unit, Quantity: l.Quantity,
			UnitPrice: l.UnitPrice, Discount: l.Discount, VatRate: l.VatRate, AdvanceID: l.AdvanceID}, Amount: inv.Lines[i].Amount()}
	}
	if inv.JobID != nil {
		var j model.Job
		if err := s.scoped(ctx).Select("id", "number").First(&j, *inv.JobID).Error; err == nil {
			out.JobNumber = j.Number
		}
	}
	if inv.PaidOn == nil {
		out.QRPayment = invoiceQR(auth.AccountFrom(ctx), inv)
	}
	items := []InvoiceSummary{out.InvoiceSummary}
	if err := s.markDeducted(ctx, items); err != nil {
		return out, err
	}
	out.InvoiceSummary = items[0]
	return out, nil
}

func (s *server) invoiceOut(ctx context.Context, id uint) (*Out[Invoice], error) {
	inv, err := s.loadInvoice(ctx, s.db.WithContext(ctx), id)
	if err != nil {
		return nil, err
	}
	out, err := s.toInvoice(ctx, inv)
	if err != nil {
		return nil, err
	}
	return &Out[Invoice]{Body: out}, nil
}

func (s *server) getInvoice(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*Out[Invoice], error) {
	return s.invoiceOut(ctx, in.ID)
}

// fillInvoice applies the input (header, customer snapshot, lines) inside tx.
func (s *server) fillInvoice(ctx context.Context, tx *gorm.DB, inv *model.Invoice, b *InvoiceInput) error {
	acc := auth.AccountFrom(ctx)
	c, err := s.loadCustomerTx(ctx, tx, b.CustomerID)
	if err != nil {
		return invalid("customer_id", "unknown customer")
	}
	if b.JobID != nil {
		var n int64
		if err := tx.Model(&model.Job{}).Scopes(inAccount(ctx)).Where("id = ?", *b.JobID).Count(&n).Error; err != nil || n == 0 {
			return invalid("job_id", "unknown job")
		}
	}
	inv.Kind = defaultStr(b.Kind, defaultStr(inv.Kind, model.InvoiceRegular))
	inv.CustomerID, inv.JobID = c.ID, b.JobID
	inv.CustName, inv.CustStreet, inv.CustCity, inv.CustZip = c.Name, c.Street, c.City, c.Zip
	inv.CustRegistrationNo, inv.CustVatNo, inv.CustEmail = c.RegistrationNo, c.VatNo, c.Email
	inv.VatPayer = acc.VatPayer
	inv.IssuedOn = defaultStr(b.IssuedOn, defaultStr(inv.IssuedOn, s.today()))
	inv.TaxableOn = defaultStr(b.TaxableOn, inv.IssuedOn)
	inv.DueOn = defaultStr(b.DueOn, addDays(inv.IssuedOn, acc.InvoiceDueDays))
	for f, v := range map[string]string{"issued_on": inv.IssuedOn, "taxable_on": inv.TaxableOn, "due_on": inv.DueOn} {
		if !validDate(v) {
			return invalid(f, "YYYY-MM-DD")
		}
	}
	if b.Note != nil {
		inv.Note = *b.Note
	} else if inv.ID == 0 {
		inv.Note = acc.InvoiceText
	}
	if inv.Kind == model.InvoiceAdvance {
		inv.TaxableOn = ""
	}
	for i, l := range b.Lines {
		if l.AdvanceID == nil {
			continue
		}
		var n int64
		if err := tx.Model(&model.Invoice{}).Scopes(inAccount(ctx)).Where("id = ? AND kind = ? AND id <> ?", *l.AdvanceID, model.InvoiceAdvance, inv.ID).
			Count(&n).Error; err != nil {
			return err
		}
		if n == 0 {
			return invalid(fmt.Sprintf("lines[%d].advance_id", i), "unknown advance invoice")
		}
	}
	lines := make([]model.InvoiceLine, len(b.Lines))
	for i, l := range b.Lines {
		vat := l.VatRate
		if !acc.VatPayer || inv.Kind == model.InvoiceAdvance {
			vat = 0
		}
		lines[i] = model.InvoiceLine{Text: strings.TrimSpace(l.Text), Unit: strings.TrimSpace(l.Unit), Quantity: l.Quantity,
			UnitPrice: l.UnitPrice, Discount: l.Discount, VatRate: vat, AdvanceID: l.AdvanceID, Position: i}
	}
	_, base, vat := invoiceTotals(lines, inv.VatPayer)
	inv.Total = base + vat
	if inv.ID == 0 {
		if err := tx.Create(inv).Error; err != nil {
			return err
		}
	} else {
		if err := tx.Omit("Customer", "Lines").Save(inv).Error; err != nil {
			return err
		}
		if err := tx.Where("invoice_id = ?", inv.ID).Delete(&model.InvoiceLine{}).Error; err != nil {
			return err
		}
	}
	for i := range lines {
		lines[i].InvoiceID = inv.ID
	}
	if len(lines) == 0 {
		return nil
	}
	return tx.Create(&lines).Error
}

// newInvoice numbers and saves an invoice. Invoices and advances share one
// sequence (unique variable symbols); advances are prefixed ZF.
func (s *server) newInvoice(ctx context.Context, tx *gorm.DB, b *InvoiceInput) (*model.Invoice, error) {
	inv := model.Invoice{AccountID: accountID(ctx), Kind: defaultStr(b.Kind, model.InvoiceRegular)}
	issued := defaultStr(b.IssuedOn, s.today())
	t, err := time.Parse(time.DateOnly, issued)
	if err != nil {
		return nil, invalid("issued_on", "YYYY-MM-DD")
	}
	prefix := ""
	if inv.Kind == model.InvoiceAdvance {
		prefix = "ZF"
	}
	if inv.Number, err = nextNumber(tx, inv.AccountID, "invoice", prefix, t.Year(), invoiceDigits(auth.AccountFrom(ctx).InvoiceDigits)); err != nil {
		return nil, err
	}
	return &inv, s.fillInvoice(ctx, tx, &inv, b)
}

func (s *server) createInvoice(ctx context.Context, in *struct{ Body InvoiceInput }) (*Out[Invoice], error) {
	var inv *model.Invoice
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		inv, err = s.newInvoice(ctx, tx, &in.Body)
		return err
	})
	if err != nil {
		return nil, wrapTx(err, "invoice")
	}
	return s.invoiceOut(ctx, inv.ID)
}

func (s *server) updateInvoice(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body InvoiceInput
}) (*Out[Invoice], error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		inv, err := s.loadInvoice(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		if inv.PaidOn != nil {
			return conflict(CodeInvoiced, "a paid invoice cannot be changed")
		}
		in.Body.Kind = inv.Kind // the number series depends on it
		return s.fillInvoice(ctx, tx, inv, &in.Body)
	})
	if err != nil {
		return nil, wrapTx(err, "invoice")
	}
	return s.invoiceOut(ctx, in.ID)
}

func (s *server) deleteInvoice(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*NoContent, error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		inv, err := s.loadInvoice(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		if inv.PaidOn != nil {
			return conflict(CodeInvoiced, "a paid invoice cannot be deleted")
		}
		var n int64
		if err := tx.Model(&model.InvoiceLine{}).Where("advance_id = ?", inv.ID).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return conflict(CodeReferenced, "the advance is deducted on another invoice")
		}
		if err := tx.Where("invoice_id = ?", inv.ID).Delete(&model.InvoiceLine{}).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.Email{}).Where("invoice_id = ?", inv.ID).Update("invoice_id", nil).Error; err != nil {
			return err
		}
		if err := tx.Delete(inv).Error; err != nil {
			return err
		}
		if inv.JobID != nil && inv.Kind == model.InvoiceRegular {
			return tx.Model(&model.Job{}).Where("id = ? AND state = ?", *inv.JobID, model.JobInvoiced).Update("state", model.JobDone).Error
		}
		return nil
	})
	if err != nil {
		return nil, wrapTx(err, "invoice")
	}
	return &NoContent{}, nil
}

func (s *server) markInvoicePaid(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body PaidInput
}) (*Out[Invoice], error) {
	inv, err := s.loadInvoice(ctx, s.db.WithContext(ctx), in.ID)
	if err != nil {
		return nil, err
	}
	if p := in.Body.PaidOn; p != nil && !validDate(*p) {
		return nil, invalid("paid_on", "YYYY-MM-DD")
	}
	if err := s.scoped(ctx).Model(inv).Update("paid_on", in.Body.PaidOn).Error; err != nil {
		return nil, dbErr(err, "invoice")
	}
	return s.invoiceOut(ctx, inv.ID)
}

var sectionNames = map[string]string{model.SectionWork: "Práce", model.SectionMaterial: "Materiál", model.SectionOther: "Ostatní"}

// jobInvoiceLines turns the job's lines into invoice lines.
func jobInvoiceLines(j *model.Job, summary bool) []InvoiceLineInput {
	lines := jobLineData(j)
	t := totalsOf(lines, j.Discount, j.VatRate)
	out := []InvoiceLineInput{}
	if summary {
		for _, sec := range []struct {
			key string
			sum int64
		}{{model.SectionWork, t.Work}, {model.SectionMaterial, t.Material}, {model.SectionOther, t.Other}} {
			if sec.sum != 0 {
				out = append(out, InvoiceLineInput{Text: fmt.Sprintf("%s — %s (zakázka %s)", sectionNames[sec.key], j.Title, j.Number),
					Unit: "kpl", Quantity: 1, UnitPrice: sec.sum, VatRate: j.VatRate})
			}
		}
	} else {
		for _, l := range lines {
			if l.CustomerSupplied || l.Amount() == 0 {
				continue
			}
			out = append(out, InvoiceLineInput{Text: l.Name, Unit: l.Unit, Quantity: l.Quantity, UnitPrice: l.UnitPrice,
				Discount: l.Discount, VatRate: j.VatRate})
		}
	}
	if t.Discount > 0 {
		out = append(out, InvoiceLineInput{Text: fmt.Sprintf("Sleva %s %%", trimFloat(j.Discount)), Quantity: 1, UnitPrice: -t.Discount, VatRate: j.VatRate})
	}
	return out
}

func trimFloat(f float64) string {
	return strings.ReplaceAll(strings.TrimRight(strings.TrimRight(fmt.Sprintf("%.2f", f), "0"), "."), ".", ",")
}

func (s *server) invoiceJob(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body JobInvoiceInput
}) (*Out[Invoice], error) {
	b := in.Body
	var inv *model.Invoice
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		j, err := s.loadJob(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		input := InvoiceInput{Kind: b.Kind, CustomerID: j.CustomerID, JobID: &j.ID, IssuedOn: b.IssuedOn, DueOn: b.DueOn}
		if b.Kind == model.InvoiceAdvance {
			amount := b.Amount
			if amount == 0 {
				amount = int64(math.Round(float64(j.Total)*b.Percent/100/100)) * 100
			}
			if amount <= 0 {
				return invalid("amount", "enter an amount or a percentage")
			}
			input.Lines = []InvoiceLineInput{{Text: fmt.Sprintf("Záloha na zakázku %s — %s", j.Number, j.Title), Quantity: 1, UnitPrice: amount}}
		} else {
			var n int64
			if err := tx.Model(&model.Invoice{}).Where("job_id = ? AND kind = ?", j.ID, model.InvoiceRegular).Count(&n).Error; err != nil {
				return err
			}
			if n > 0 {
				return conflict(CodeInvoiced, "the job is already invoiced")
			}
			input.Lines = jobInvoiceLines(j, b.Summary)
			if len(input.Lines) == 0 {
				return conflict(CodeNothingToBill, "the job has no priced lines")
			}
			// deduct the job's paid advances not deducted yet (an unpaid one is still owed by itself)
			var advs []model.Invoice
			if err := tx.Scopes(inAccount(ctx)).Where("job_id = ? AND kind = ?", j.ID, model.InvoiceAdvance).Order("id").Find(&advs).Error; err != nil {
				return err
			}
			for _, a := range advs {
				var used int64
				if err := tx.Model(&model.InvoiceLine{}).Where("advance_id = ?", a.ID).Count(&used).Error; err != nil {
					return err
				}
				if used > 0 || a.PaidOn == nil {
					continue
				}
				price := -a.Total
				if auth.AccountFrom(ctx).VatPayer && j.VatRate > 0 { // the advance is gross: deduct its base at the job's rate
					price = -int64(math.Round(float64(a.Total) * 100 / float64(100+j.VatRate)))
				}
				id := a.ID
				input.Lines = append(input.Lines, InvoiceLineInput{Text: fmt.Sprintf("Odpočet zálohy %s (zaplacené %s)", a.Number, czDate(*a.PaidOn)),
					Quantity: 1, UnitPrice: price, VatRate: j.VatRate, AdvanceID: &id})
			}
		}
		if inv, err = s.newInvoice(ctx, tx, &input); err != nil {
			return err
		}
		if b.Kind == model.InvoiceRegular {
			return tx.Model(j).Update("state", model.JobInvoiced).Error
		}
		return nil
	})
	if err != nil {
		return nil, wrapTx(err, "invoice")
	}
	return s.invoiceOut(ctx, inv.ID)
}
