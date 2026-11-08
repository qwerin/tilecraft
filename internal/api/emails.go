package api

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/mail"
	"github.com/qwerin/tilecraft/internal/model"
)

// Error codes of sending e-mails.
const (
	CodeEmailOff    = "email_not_configured"
	CodeEmailFailed = "email_failed"
)

// Email is a sent (or, on a test instance, only stored) e-mail of the firm.
type Email struct {
	ID            uint      `json:"id"`
	QuoteID       *uint     `json:"quote_id"`
	QuoteNumber   string    `json:"quote_number"`
	InvoiceID     *uint     `json:"invoice_id"`
	InvoiceNumber string    `json:"invoice_number"`
	Kind          string    `json:"kind" doc:"quote = quote link to the customer, quote_decision = customer decided, invoice = invoice, test = test e-mail"`
	Files         string    `json:"files" doc:"names of the attached files"`
	To            string    `json:"to"`
	ReplyTo       string    `json:"reply_to"`
	Subject       string    `json:"subject"`
	Body          string    `json:"body"`
	Status        string    `json:"status" enum:"stored,sent,failed" doc:"stored = sending is off (test instance or TILECRAFT_EMAIL_LIVE not set), never sent"`
	Error         string    `json:"error"`
	CreatedAt     time.Time `json:"created_at"`
}

// EmailDelivery tells the firm whether e-mails really go out.
type EmailDelivery struct {
	Live   bool   `json:"live" doc:"false = e-mails are only stored on the E-maily page"`
	Test   bool   `json:"test" doc:"test instance (never sends, whatever the configuration)"`
	Sender string `json:"sender" doc:"From address when live"`
}

// EmailTest is a test e-mail to check the sending.
type EmailTest struct {
	Email string `json:"email,omitempty" maxLength:"200" doc:"recipient; default = the signed-in user"`
}

func (s *server) registerEmails(g huma.API) {
	huma.Get(g, "/emails", s.listEmails, auth.ForManagers)
	huma.Get(g, "/emails/delivery", s.emailDelivery, auth.ForAll)
	huma.Post(g, "/emails/test", s.sendTestEmail, status(http.StatusCreated), auth.ForManagers)
}

func (s *server) emailDelivery(ctx context.Context, _ *struct{}) (*Out[EmailDelivery], error) {
	m, err := s.mailSetup(ctx)
	if err != nil {
		return nil, err
	}
	d := EmailDelivery{Live: m.Live, Test: s.cfg.Test}
	if d.Live {
		d.Sender = m.SMTP.From
	}
	return &Out[EmailDelivery]{Body: d}, nil
}

func (s *server) sendTestEmail(ctx context.Context, in *struct{ Body EmailTest }) (*Out[Email], error) {
	to := strings.TrimSpace(in.Body.Email)
	if to == "" {
		to = auth.UserFrom(ctx).Email
	}
	if err := checkEmailAddress(to); err != nil {
		return nil, err
	}
	acc := auth.AccountFrom(ctx)
	e := model.Email{Kind: "test", To: to, ReplyTo: acc.Email, Subject: "Zkušební e-mail – " + acc.Name,
		Body: fmt.Sprintf("Dobrý den,\n\ntoto je zkušební e-mail z TileCraft %s.\n"+
			"Pokud ho čtete, odesílání e-mailů funguje.\n", acc.Name)}
	if err := s.deliverEmail(ctx, &e, true); err != nil {
		return nil, err
	}
	return &Out[Email]{Body: Email{ID: e.ID, Kind: e.Kind, To: e.To, ReplyTo: e.ReplyTo, Subject: e.Subject, Body: e.Body,
		Status: e.Status, Error: e.Error, CreatedAt: e.CreatedAt}}, nil
}

// checkEmailAddress rejects anything but a single bare address.
func checkEmailAddress(to string) error {
	if !strings.Contains(to, "@") || strings.ContainsAny(to, " ,;<>\r\n") {
		return invalid("email", "invalid e-mail")
	}
	return nil
}

func (s *server) listEmails(ctx context.Context, in *struct{ PageParams }) (*Out[ListResponse[Email]], error) {
	out, err := paginate(s.scoped(ctx).Model(&model.Email{}).Order("id DESC"), in.PageParams, func(e *model.Email) Email {
		return Email{ID: e.ID, QuoteID: e.QuoteID, InvoiceID: e.InvoiceID, Kind: e.Kind, Files: e.Files, To: e.To, ReplyTo: e.ReplyTo, Subject: e.Subject, Body: e.Body,
			Status: e.Status, Error: e.Error, CreatedAt: e.CreatedAt}
	})
	if err != nil {
		return nil, err
	}
	ids := []uint{}
	for _, e := range out.Body.Items {
		if e.QuoteID != nil {
			ids = append(ids, *e.QuoteID)
		}
	}
	if len(ids) > 0 {
		var quotes []model.Quote
		if err := s.scoped(ctx).Select("id", "number").Where("id IN ?", uniq(ids)).Find(&quotes).Error; err != nil {
			return nil, dbErr(err, "quotes")
		}
		num := map[uint]string{}
		for _, q := range quotes {
			num[q.ID] = q.Number
		}
		for i, e := range out.Body.Items {
			if e.QuoteID != nil {
				out.Body.Items[i].QuoteNumber = num[*e.QuoteID]
			}
		}
	}
	ids = ids[:0]
	for _, e := range out.Body.Items {
		if e.InvoiceID != nil {
			ids = append(ids, *e.InvoiceID)
		}
	}
	if len(ids) > 0 {
		var invoices []model.Invoice
		if err := s.scoped(ctx).Select("id", "number").Where("id IN ?", uniq(ids)).Find(&invoices).Error; err != nil {
			return nil, dbErr(err, "invoices")
		}
		num := map[uint]string{}
		for _, inv := range invoices {
			num[inv.ID] = inv.Number
		}
		for i, e := range out.Body.Items {
			if e.InvoiceID != nil {
				out.Body.Items[i].InvoiceNumber = num[*e.InvoiceID]
			}
		}
	}
	return out, nil
}

// canEmail reports whether e-mails can be handled: with sending off they are
// only stored, live sending needs a mail server.
func (s *server) canEmail(ctx context.Context) error {
	m, err := s.mailSetup(ctx)
	if err != nil {
		return err
	}
	if m.Live && m.Mailer == nil {
		return conflict(CodeEmailOff, "sending e-mails is not configured")
	}
	return nil
}

// sendEmail records the e-mail in the firm's outbox and sends it — only
// with live sending on (TILECRAFT_EMAIL_LIVE, Správa aplikace, or the firm's own server); a test instance never sends
// anything out (it may hold copies of production data with real addresses).
// Call it outside transactions.
func (s *server) sendEmail(ctx context.Context, e *model.Email, files ...mail.Attachment) error {
	return s.deliverEmail(ctx, e, false, files...)
}

// deliverEmail is sendEmail; a test e-mail (to the signed-in user) goes out
// through the firm's own server even with live sending off, so the
// firm can check it (never on a test instance).
func (s *server) deliverEmail(ctx context.Context, e *model.Email, test bool, files ...mail.Attachment) error {
	m, err := s.mailSetup(ctx)
	if err != nil {
		return err
	}
	live := m.Live || test && m.Source == SourceLab && !s.cfg.Test
	if live && m.Mailer == nil {
		return conflict(CodeEmailOff, "sending e-mails is not configured")
	}
	e.AccountID, e.SentByID = accountID(ctx), auth.UserFrom(ctx).ID
	names := make([]string, len(files))
	for i, a := range files {
		names[i] = a.Filename
	}
	e.Files = strings.Join(names, ", ")
	e.Status = model.EmailStored
	if e.CreatedAt.IsZero() {
		e.CreatedAt = s.deps.Now()
	}
	if live {
		err := m.Mailer.Send(ctx, mail.Message{To: []string{e.To}, ReplyTo: e.ReplyTo, Subject: e.Subject, Text: e.Body, Attachments: files})
		if e.Status = model.EmailSent; err != nil {
			e.Status, e.Error = model.EmailFailed, err.Error()
		}
	}
	if err := s.db.WithContext(ctx).Create(e).Error; err != nil {
		return dbErr(err, "email")
	}
	if e.Status == model.EmailFailed {
		return apiError(http.StatusBadGateway, CodeEmailFailed, "the e-mail could not be sent: "+e.Error)
	}
	return nil
}
