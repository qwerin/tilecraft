package api

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/calc"
	"github.com/qwerin/tilecraft/internal/invoicepdf"
	"github.com/qwerin/tilecraft/internal/mail"
	"github.com/qwerin/tilecraft/internal/model"
)

// CustomerRef is the customer shown on a document.
type CustomerRef struct {
	ID      uint   `json:"id"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	Phone   string `json:"phone"`
	Address string `json:"address"`
}

func toCustomerRef(c *model.Customer) CustomerRef {
	return CustomerRef{ID: c.ID, Name: c.Name, Email: c.Email, Phone: c.Phone, Address: joinAddress(c.Street, c.Zip, c.City)}
}

func joinAddress(street, zip, city string) string {
	parts := []string{}
	if s := strings.TrimSpace(street); s != "" {
		parts = append(parts, s)
	}
	if zc := strings.TrimSpace(strings.TrimSpace(zip) + " " + strings.TrimSpace(city)); zc != "" {
		parts = append(parts, zc)
	}
	return strings.Join(parts, ", ")
}

// QuoteInput creates or replaces a quote (SPEC §5).
type QuoteInput struct {
	CustomerID  uint        `json:"customer_id" doc:"Customer (list_customers / create_customer)"`
	Title       string      `json:"title" minLength:"1" maxLength:"200" doc:"e.g. \"Koupelna — Novákovi\""`
	SiteAddress string      `json:"site_address,omitempty" maxLength:"300" doc:"Where the work is done"`
	IssuedOn    string      `json:"issued_on,omitempty" format:"date" doc:"Default today"`
	ValidUntil  string      `json:"valid_until,omitempty" format:"date" doc:"Default issued_on + the firm's quote validity"`
	Intro       *string     `json:"intro,omitempty" maxLength:"5000" doc:"Default = the firm's quote introduction"`
	Note        string      `json:"note,omitempty" maxLength:"5000"`
	Terms       *string     `json:"terms,omitempty" maxLength:"20000" doc:"Default = the firm's quote terms"`
	VatRate     *int        `json:"vat_rate,omitempty" minimum:"0" maximum:"21" doc:"VAT % (VAT payers only); default = the firm's default rate"`
	Discount    float64     `json:"discount,omitempty" minimum:"0" maximum:"100" doc:"% off the whole quote"`
	ShowMeasure bool        `json:"show_measure,omitempty" doc:"Show the measurements to the customer"`
	Rooms       []calc.Room `json:"rooms,omitempty" doc:"Measurements: rooms with surfaces in metres (SPEC §5.1)"`
	Lines       []LineInput `json:"lines,omitempty" maxItems:"500"`
}

// QuoteSummary is a quote in lists.
type QuoteSummary struct {
	ID         uint        `json:"id"`
	Number     string      `json:"number"`
	Title      string      `json:"title"`
	Customer   CustomerRef `json:"customer"`
	State      string      `json:"state" enum:"draft,sent,accepted,rejected"`
	Expired    bool        `json:"expired" doc:"Sent and past valid_until"`
	IssuedOn   string      `json:"issued_on"`
	ValidUntil string      `json:"valid_until"`
	Total      int64       `json:"total" doc:"haléře with VAT"`
	JobID      *uint       `json:"job_id"`
	UpdatedAt  time.Time   `json:"updated_at"`
}

// Quote is the full quote.
type Quote struct {
	QuoteSummary
	SiteAddress  string       `json:"site_address"`
	Intro        string       `json:"intro"`
	Note         string       `json:"note"`
	Terms        string       `json:"terms"`
	VatRate      int          `json:"vat_rate"`
	VatPayer     bool         `json:"vat_payer"`
	Discount     float64      `json:"discount"`
	ShowMeasure  bool         `json:"show_measure"`
	Rooms        []calc.Room  `json:"rooms" nullable:"false"`
	Measurements Measurements `json:"measurements"`
	Lines        []Line       `json:"lines" nullable:"false"`
	Totals       calc.Totals  `json:"totals"`
	PublicURL    string       `json:"public_url" doc:"Link for the customer (view, accept, reject)"`
	AppURL       string       `json:"app_url" doc:"The quote in the application"`
	SentAt       *time.Time   `json:"sent_at"`
	SentTo       string       `json:"sent_to"`
	DecidedAt    *time.Time   `json:"decided_at"`
	DecidedBy    string       `json:"decided_by"`
	Reason       string       `json:"reason"`
}

// QuoteSend sends the link to the customer by e-mail, or only marks the quote sent.
type QuoteSend struct {
	Email    string `json:"email,omitempty" maxLength:"254" doc:"Recipient; default = the customer's e-mail"`
	Message  string `json:"message,omitempty" maxLength:"5000" doc:"Text of the e-mail above the link"`
	MarkOnly bool   `json:"mark_only,omitempty" doc:"Do not e-mail: the link was shared another way (WhatsApp, SMS)"`
}

// QuoteDecision records the decision (by the firm, or reopens a decided quote as a draft).
type QuoteDecision struct {
	State  string `json:"state" enum:"accepted,rejected,draft"`
	Reason string `json:"reason,omitempty" maxLength:"2000"`
}

// MeasurePreview computes measurements and lines without saving.
type MeasurePreview struct {
	Rooms    []calc.Room `json:"rooms"`
	Lines    []LineInput `json:"lines,omitempty"`
	Discount float64     `json:"discount,omitempty" minimum:"0" maximum:"100"`
	VatRate  int         `json:"vat_rate,omitempty" minimum:"0" maximum:"21"`
}

// MeasurePreviewOut is the computed preview.
type MeasurePreviewOut struct {
	Measurements Measurements `json:"measurements"`
	Lines        []Line       `json:"lines" nullable:"false"`
	Totals       calc.Totals  `json:"totals"`
}

func (s *server) registerQuotes(g huma.API) {
	huma.Get(g, "/quotes", s.listQuotes, auth.ForManagers)
	huma.Get(g, "/quotes/{id}", s.getQuote, auth.ForManagers)
	huma.Post(g, "/quotes", s.createQuote, status(http.StatusCreated), auth.ForManagers)
	huma.Put(g, "/quotes/{id}", s.updateQuote, auth.ForManagers)
	huma.Delete(g, "/quotes/{id}", s.deleteQuote, status(http.StatusNoContent), auth.ForManagers)
	huma.Post(g, "/quotes/{id}/duplicate", s.duplicateQuote, status(http.StatusCreated), auth.ForManagers)
	huma.Post(g, "/quotes/{id}/send", s.sendQuote, auth.ForManagers)
	huma.Post(g, "/quotes/{id}/decision", s.decideQuote, auth.ForManagers)
	huma.Post(g, "/measurements/preview", s.previewMeasurements, auth.ForManagers)
}

func (s *server) expired(q *model.Quote) bool {
	return q.State == model.QuoteSent && q.ValidUntil < s.today()
}

func (s *server) toQuoteSummary(q *model.Quote, jobID *uint) QuoteSummary {
	return QuoteSummary{ID: q.ID, Number: q.Number, Title: q.Title, Customer: toCustomerRef(&q.Customer), State: q.State,
		Expired: s.expired(q), IssuedOn: q.IssuedOn, ValidUntil: q.ValidUntil, Total: q.Total, JobID: jobID, UpdatedAt: q.UpdatedAt}
}

func (s *server) jobsOfQuotes(ctx context.Context, ids []uint) (map[uint]uint, error) {
	out := map[uint]uint{}
	if len(ids) == 0 {
		return out, nil
	}
	var jobs []model.Job
	if err := s.scoped(ctx).Select("id", "quote_id").Where("quote_id IN ?", ids).Find(&jobs).Error; err != nil {
		return nil, dbErr(err, "jobs")
	}
	for _, j := range jobs {
		out[*j.QuoteID] = j.ID
	}
	return out, nil
}

func (s *server) listQuotes(ctx context.Context, in *struct {
	State      string `query:"state" doc:"draft, sent, accepted, rejected; comma separated; \"open\" = draft + sent"`
	CustomerID uint   `query:"customer_id"`
	Q          string `query:"q" doc:"Search number, title, customer"`
	PageParams
}) (*Out[ListResponse[QuoteSummary]], error) {
	q := s.scoped(ctx).Model(&model.Quote{}).Preload("Customer").Order("quotes.id DESC")
	if in.State != "" {
		states := strings.Split(in.State, ",")
		if in.State == "open" {
			states = []string{model.QuoteDraft, model.QuoteSent}
		}
		q = q.Where("quotes.state IN ?", states)
	}
	if in.CustomerID != 0 {
		q = q.Where("quotes.customer_id = ?", in.CustomerID)
	}
	if in.Q != "" {
		p := like(in.Q)
		q = q.Joins("JOIN customers ON customers.id = quotes.customer_id").
			Where("LOWER(quotes.number) LIKE ? OR LOWER(quotes.title) LIKE ? OR LOWER(customers.name) LIKE ?", p, p, p)
	}
	out, err := paginate(q, in.PageParams, func(m *model.Quote) QuoteSummary { return s.toQuoteSummary(m, nil) })
	if err != nil {
		return nil, err
	}
	ids := make([]uint, len(out.Body.Items))
	for i, it := range out.Body.Items {
		ids[i] = it.ID
	}
	jobs, err := s.jobsOfQuotes(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i, it := range out.Body.Items {
		if id, ok := jobs[it.ID]; ok {
			out.Body.Items[i].JobID = &id
		}
	}
	return out, nil
}

func (s *server) loadQuote(ctx context.Context, tx *gorm.DB, id uint) (*model.Quote, error) {
	var q model.Quote
	if err := tx.Scopes(inAccount(ctx)).Preload("Customer").Preload("Lines", func(db *gorm.DB) *gorm.DB { return db.Order("position") }).
		First(&q, id).Error; err != nil {
		return nil, dbErr(err, "quote")
	}
	return &q, nil
}

func quoteLineData(q *model.Quote) []model.LineData {
	out := make([]model.LineData, len(q.Lines))
	for i := range q.Lines {
		out[i] = q.Lines[i].LineData
	}
	return out
}

func (s *server) publicQuoteURL(q *model.Quote) string {
	return strings.TrimRight(s.cfg.PublicURL, "/") + "/n/" + q.PublicToken
}

func (s *server) toQuote(ctx context.Context, q *model.Quote) (Quote, error) {
	jobs, err := s.jobsOfQuotes(ctx, []uint{q.ID})
	if err != nil {
		return Quote{}, err
	}
	var jobID *uint
	if id, ok := jobs[q.ID]; ok {
		jobID = &id
	}
	lines := make([]Line, len(q.Lines))
	for i := range q.Lines {
		lines[i] = toLine(q.Lines[i].ID, &q.Lines[i].LineData)
	}
	rooms := q.Rooms
	if rooms == nil {
		rooms = []calc.Room{}
	}
	acc := auth.AccountFrom(ctx)
	return Quote{QuoteSummary: s.toQuoteSummary(q, jobID), SiteAddress: q.SiteAddress, Intro: q.Intro, Note: q.Note, Terms: q.Terms,
		VatRate: q.VatRate, VatPayer: acc.VatPayer, Discount: q.Discount, ShowMeasure: q.ShowMeasure, Rooms: rooms,
		Measurements: measurements(rooms), Lines: lines, Totals: totalsOf(quoteLineData(q), q.Discount, q.VatRate),
		PublicURL: s.publicQuoteURL(q), AppURL: strings.TrimRight(s.cfg.PublicURL, "/") + "/a/" + acc.Slug + "/quotes/" + fmt.Sprint(q.ID),
		SentAt: q.SentAt, SentTo: q.SentTo, DecidedAt: q.DecidedAt, DecidedBy: q.DecidedBy, Reason: q.Reason}, nil
}

func (s *server) quoteOut(ctx context.Context, id uint) (*Out[Quote], error) {
	q, err := s.loadQuote(ctx, s.db.WithContext(ctx), id)
	if err != nil {
		return nil, err
	}
	out, err := s.toQuote(ctx, q)
	if err != nil {
		return nil, err
	}
	return &Out[Quote]{Body: out}, nil
}

func (s *server) getQuote(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*Out[Quote], error) {
	return s.quoteOut(ctx, in.ID)
}

func publicToken() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

// fillQuote applies the input to q (inside tx) and replaces its lines.
func (s *server) fillQuote(ctx context.Context, tx *gorm.DB, q *model.Quote, b *QuoteInput) error {
	acc := auth.AccountFrom(ctx)
	if _, err := s.loadCustomerTx(ctx, tx, b.CustomerID); err != nil {
		return invalid("customer_id", "unknown customer")
	}
	q.CustomerID, q.Title, q.SiteAddress, q.Note = b.CustomerID, strings.TrimSpace(b.Title), strings.TrimSpace(b.SiteAddress), b.Note
	if q.Title == "" {
		return invalid("title", "required")
	}
	if b.IssuedOn != "" {
		q.IssuedOn = b.IssuedOn
	} else if q.IssuedOn == "" {
		q.IssuedOn = s.today()
	}
	if b.ValidUntil != "" {
		q.ValidUntil = b.ValidUntil
	} else if q.ValidUntil == "" {
		q.ValidUntil = addDays(q.IssuedOn, max(acc.QuoteValidDays, 1))
	}
	if q.ValidUntil < q.IssuedOn {
		return invalid("valid_until", "must not be before issued_on")
	}
	if b.Intro != nil {
		q.Intro = *b.Intro
	} else if q.ID == 0 {
		q.Intro = acc.QuoteIntro
	}
	if b.Terms != nil {
		q.Terms = *b.Terms
	} else if q.ID == 0 {
		q.Terms = acc.QuoteTerms
	}
	switch {
	case !acc.VatPayer:
		q.VatRate = 0
	case b.VatRate != nil:
		q.VatRate = *b.VatRate
	case q.ID == 0:
		q.VatRate = acc.DefaultVatRate
	}
	q.Discount, q.ShowMeasure = b.Discount, b.ShowMeasure
	rooms, err := cleanRooms(b.Rooms)
	if err != nil {
		return err
	}
	q.Rooms = rooms
	lines, err := buildLines(ctx, tx, rooms, b.Lines)
	if err != nil {
		return err
	}
	q.Total = totalsOf(lines, q.Discount, q.VatRate).Total
	if q.ID == 0 {
		if err := tx.Create(q).Error; err != nil {
			return err
		}
	} else {
		if err := tx.Omit("Customer", "Lines").Save(q).Error; err != nil {
			return err
		}
		if err := tx.Where("quote_id = ?", q.ID).Delete(&model.QuoteLine{}).Error; err != nil {
			return err
		}
	}
	if len(lines) == 0 {
		return nil
	}
	rows := make([]model.QuoteLine, len(lines))
	for i := range lines {
		rows[i] = model.QuoteLine{QuoteID: q.ID, LineData: lines[i]}
	}
	return tx.Create(&rows).Error
}

func (s *server) loadCustomerTx(ctx context.Context, tx *gorm.DB, id uint) (*model.Customer, error) {
	var c model.Customer
	if err := tx.Scopes(inAccount(ctx)).First(&c, id).Error; err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *server) createQuote(ctx context.Context, in *struct{ Body QuoteInput }) (*Out[Quote], error) {
	q := model.Quote{AccountID: accountID(ctx), State: model.QuoteDraft, PublicToken: publicToken(), CreatedByID: auth.UserFrom(ctx).ID}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		num, err := nextNumber(tx, q.AccountID, "quote", "NA", s.deps.Now().In(prague).Year(), 3)
		if err != nil {
			return err
		}
		q.Number = num
		return s.fillQuote(ctx, tx, &q, &in.Body)
	})
	if err != nil {
		return nil, wrapTx(err, "quote")
	}
	return s.quoteOut(ctx, q.ID)
}

func (s *server) updateQuote(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body QuoteInput
}) (*Out[Quote], error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q, err := s.loadQuote(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		if q.State == model.QuoteAccepted || q.State == model.QuoteRejected {
			return conflict(CodeQuoteLocked, "a decided quote cannot be changed (reopen it as a draft or duplicate it)")
		}
		return s.fillQuote(ctx, tx, q, &in.Body)
	})
	if err != nil {
		return nil, wrapTx(err, "quote")
	}
	return s.quoteOut(ctx, in.ID)
}

func (s *server) deleteQuote(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*NoContent, error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q, err := s.loadQuote(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		var n int64
		if err := tx.Model(&model.Job{}).Where("quote_id = ?", q.ID).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return conflict(CodeJobExists, "the quote has a job")
		}
		if err := tx.Where("quote_id = ?", q.ID).Delete(&model.QuoteLine{}).Error; err != nil {
			return err
		}
		return tx.Delete(q).Error
	})
	if err != nil {
		return nil, wrapTx(err, "quote")
	}
	return &NoContent{}, nil
}

func quoteInputOf(q *model.Quote) QuoteInput {
	intro, terms, vat := q.Intro, q.Terms, q.VatRate
	return QuoteInput{CustomerID: q.CustomerID, Title: q.Title, SiteAddress: q.SiteAddress, Intro: &intro, Note: q.Note, Terms: &terms,
		VatRate: &vat, Discount: q.Discount, ShowMeasure: q.ShowMeasure, Rooms: q.Rooms, Lines: toInputs(quoteLineData(q))}
}

func (s *server) duplicateQuote(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*Out[Quote], error) {
	src, err := s.loadQuote(ctx, s.db.WithContext(ctx), in.ID)
	if err != nil {
		return nil, err
	}
	b := quoteInputOf(src)
	b.Title = strings.TrimSpace(src.Title + " (kopie)")
	return s.createQuote(ctx, &struct{ Body QuoteInput }{Body: b})
}

func (s *server) sendQuote(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body QuoteSend
}) (*Out[Quote], error) {
	q, err := s.loadQuote(ctx, s.db.WithContext(ctx), in.ID)
	if err != nil {
		return nil, err
	}
	if q.State == model.QuoteAccepted || q.State == model.QuoteRejected {
		return nil, conflict(CodeQuoteLocked, "the quote is already decided")
	}
	now := s.deps.Now()
	to := ""
	if !in.Body.MarkOnly {
		to = strings.TrimSpace(defaultStr(in.Body.Email, q.Customer.Email))
		if to == "" {
			return nil, conflict(CodeNoEmail, "the customer has no e-mail")
		}
		if err := checkEmailAddress(to); err != nil {
			return nil, err
		}
		if err := s.canEmail(ctx); err != nil {
			return nil, err
		}
		acc := auth.AccountFrom(ctx)
		q.State = model.QuoteSent // the PDF carries the link
		pdf, err := s.quotePDF(ctx, acc, q)
		if err != nil {
			return nil, err
		}
		e := model.Email{QuoteID: &q.ID, Kind: "quote", To: to, ReplyTo: acc.Email,
			Subject: fmt.Sprintf("Cenová nabídka %s — %s", q.Number, acc.Name), Body: s.quoteEmailBody(acc, q, in.Body.Message)}
		if err := s.sendEmail(ctx, &e, mail.Attachment{Filename: invoicepdf.QuoteFilename(q.Number), ContentType: "application/pdf", Data: pdf}); err != nil {
			return nil, err
		}
		if e.Status == model.EmailFailed {
			return nil, apiError(http.StatusBadGateway, CodeEmailFailed, "sending failed: "+e.Error)
		}
	}
	if err := s.scoped(ctx).Model(q).Updates(map[string]any{"state": model.QuoteSent, "sent_at": now, "sent_to": to}).Error; err != nil {
		return nil, dbErr(err, "quote")
	}
	return s.quoteOut(ctx, q.ID)
}

func (s *server) quoteEmailBody(acc *model.Account, q *model.Quote, message string) string {
	var b strings.Builder
	if m := strings.TrimSpace(message); m != "" {
		b.WriteString(m + "\n\n")
	} else {
		b.WriteString("Dobrý den,\n\nposíláme cenovou nabídku „" + q.Title + "“.\n\n")
	}
	fmt.Fprintf(&b, "Nabídku si prohlédnete, vytisknete a jedním kliknutím přijmete zde:\n%s\n\n", s.publicQuoteURL(q))
	fmt.Fprintf(&b, "Celkem: %s, platnost do %s.\n\nS pozdravem\n%s", money(q.Total), czDate(q.ValidUntil), acc.Name)
	if acc.Phone != "" {
		b.WriteString("\n" + acc.Phone)
	}
	return b.String()
}

func (s *server) decideQuote(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body QuoteDecision
}) (*Out[Quote], error) {
	q, err := s.loadQuote(ctx, s.db.WithContext(ctx), in.ID)
	if err != nil {
		return nil, err
	}
	decided := q.State == model.QuoteAccepted || q.State == model.QuoteRejected
	if in.Body.State != model.QuoteDraft && decided {
		return nil, conflict(CodeQuoteLocked, "the quote is already decided (reopen it as a draft first)")
	}
	upd := map[string]any{"state": in.Body.State, "reason": in.Body.Reason}
	if in.Body.State == model.QuoteDraft {
		jobs, err := s.jobsOfQuotes(ctx, []uint{q.ID})
		if err != nil {
			return nil, err
		}
		if len(jobs) > 0 {
			return nil, conflict(CodeJobExists, "the quote has a job")
		}
		upd["decided_at"], upd["decided_by"], upd["reason"] = nil, "", ""
	} else {
		upd["decided_at"], upd["decided_by"] = s.deps.Now(), memberName(auth.MemberFrom(ctx))
	}
	if err := s.scoped(ctx).Model(q).Updates(upd).Error; err != nil {
		return nil, dbErr(err, "quote")
	}
	return s.quoteOut(ctx, q.ID)
}

func (s *server) previewMeasurements(ctx context.Context, in *struct{ Body MeasurePreview }) (*Out[MeasurePreviewOut], error) {
	rooms, err := cleanRooms(in.Body.Rooms)
	if err != nil {
		return nil, err
	}
	lines, err := buildLines(ctx, s.db.WithContext(ctx), rooms, in.Body.Lines)
	if err != nil {
		return nil, wrapTx(err, "lines")
	}
	out := MeasurePreviewOut{Measurements: measurements(rooms), Lines: make([]Line, len(lines)), Totals: totalsOf(lines, in.Body.Discount, in.Body.VatRate)}
	for i := range lines {
		out.Lines[i] = toLine(0, &lines[i])
	}
	return &Out[MeasurePreviewOut]{Body: out}, nil
}

// money formats haléře as "12 345 Kč" (whole crowns) or "12 345,50 Kč".
func money(h int64) string {
	neg := h < 0
	if neg {
		h = -h
	}
	kc, hal := h/100, h%100
	s := fmt.Sprint(kc)
	var b strings.Builder
	for i, r := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteRune(' ')
		}
		b.WriteRune(r)
	}
	out := b.String()
	if hal != 0 {
		out += fmt.Sprintf(",%02d", hal)
	}
	if neg {
		out = "−" + out
	}
	return out + " Kč"
}

// czDate formats YYYY-MM-DD as 8. 11. 2026.
func czDate(d string) string {
	t, err := time.Parse(time.DateOnly, d)
	if err != nil {
		return d
	}
	return fmt.Sprintf("%d. %d. %d", t.Day(), int(t.Month()), t.Year())
}
