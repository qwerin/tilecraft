package api

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/httpsec"
	"github.com/qwerin/tilecraft/internal/invoicepdf"
	"github.com/qwerin/tilecraft/internal/mail"
	"github.com/qwerin/tilecraft/internal/model"
	"github.com/qwerin/tilecraft/internal/spayd"
)

// FileOutput is a downloaded file.
type FileOutput struct {
	ContentType        string `header:"Content-Type"`
	ContentDisposition string `header:"Content-Disposition"`
	Body               []byte
}

// InvoiceEmail sends the invoice (PDF) by e-mail.
type InvoiceEmail struct {
	Email   string `json:"email,omitempty" maxLength:"254" doc:"Recipient; default = the customer's e-mail"`
	Message string `json:"message,omitempty" maxLength:"5000"`
}

func pdfOp(id, path, summary string) huma.Operation {
	op := huma.Operation{
		OperationID: id, Method: http.MethodGet, Path: path, Summary: summary,
		Responses: map[string]*huma.Response{"200": {
			Description: "PDF document",
			Content:     map[string]*huma.MediaType{"application/pdf": {Schema: &huma.Schema{Type: "string", Format: "binary"}}},
		}},
	}
	auth.ForManagers(&op)
	return op
}

func (s *server) registerInvoicePDF(g huma.API) {
	huma.Register(g, pdfOp("get-invoice-pdf", "/invoices/{id}/pdf", "Invoice as PDF (with QR Platba)"), s.getInvoicePDF)
	huma.Register(g, pdfOp("get-quote-pdf", "/quotes/{id}/pdf", "Quote as PDF"), s.getQuotePDF)
	huma.Post(g, "/invoices/{id}/email", s.emailInvoice, auth.ForManagers)
}

func contactOf(phone, email string) string {
	var c []string
	for _, v := range []string{phone, email} {
		if v = strings.TrimSpace(v); v != "" {
			c = append(c, v)
		}
	}
	return strings.Join(c, " · ")
}

func firmParty(acc *model.Account) invoicepdf.Party {
	return invoicepdf.Party{Name: acc.Name, Street: acc.Street, Zip: acc.Zip, City: acc.City, RegistrationNo: acc.RegistrationNo,
		VatNo: acc.VatNo, Contact: contactOf(acc.Phone, acc.Email)}
}

// logoBytes reads the firm's logo for PDFs (nil = none or unreadable).
func (s *server) logoBytes(ctx context.Context, acc *model.Account) []byte {
	if acc.LogoKey == "" {
		return nil
	}
	f, err := s.deps.Storage.Get(ctx, acc.LogoKey)
	if err != nil {
		slog.Warn("logo for a PDF", "account", acc.ID, "err", err)
		return nil
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, maxLogo+1))
	if err != nil {
		return nil
	}
	return b
}

func invoiceTitle(inv *Invoice) string {
	switch {
	case inv.Kind == model.InvoiceAdvance:
		return "Zálohová faktura"
	case inv.VatPayer:
		return "Faktura – daňový doklad"
	}
	return "Faktura"
}

func (s *server) invoicePDF(ctx context.Context, acc *model.Account, inv *Invoice) ([]byte, error) {
	p := inv.Party
	doc := invoicepdf.Invoice{Title: invoiceTitle(inv), Supplier: firmParty(acc), Logo: s.logoBytes(ctx, acc),
		Client: invoicepdf.Party{Name: p.Name, Street: p.Street, Zip: p.Zip, City: p.City, RegistrationNo: p.RegistrationNo, VatNo: p.VatNo},
		Number: inv.Number, VS: inv.VS, IssuedOn: inv.IssuedOn, DueOn: inv.DueOn, BankAccount: acc.BankAccount, IBAN: acc.IBAN, SWIFT: acc.Swift,
		VatPayer: inv.VatPayer, Base: inv.Base, Vat: inv.Vat, Total: inv.Total, Note: inv.Note, QR: inv.QRPayment}
	if inv.VatPayer && inv.Kind == model.InvoiceRegular {
		doc.TaxableOn = inv.TaxableOn
	}
	switch {
	case !inv.VatPayer:
		doc.Footer = "Nejsem plátce DPH."
	case inv.Kind == model.InvoiceAdvance:
		doc.Footer = "Zálohová faktura není daňovým dokladem."
	}
	for _, r := range inv.VatRows {
		doc.VatRows = append(doc.VatRows, invoicepdf.VatRow{Rate: r.Rate, Base: r.Base, Vat: r.Vat})
	}
	for _, l := range inv.Lines {
		doc.Lines = append(doc.Lines, invoicepdf.Line{Text: l.Text, Unit: l.Unit, Quantity: l.Quantity, UnitPrice: l.UnitPrice,
			Discount: l.Discount, VatRate: l.VatRate, Amount: l.Amount})
	}
	pdf, err := invoicepdf.InvoicePDF(doc)
	if err != nil {
		slog.Error("invoice PDF", "invoice", inv.ID, "err", err)
		return nil, huma.Error500InternalServerError("rendering the invoice failed")
	}
	return pdf, nil
}

func (s *server) getInvoicePDF(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*FileOutput, error) {
	out, err := s.invoiceOut(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	pdf, err := s.invoicePDF(ctx, auth.AccountFrom(ctx), &out.Body)
	if err != nil {
		return nil, err
	}
	return &FileOutput{ContentType: "application/pdf", ContentDisposition: `inline; filename="` + invoicepdf.InvoiceFilename(out.Body.Number) + `"`, Body: pdf}, nil
}

// quotePDF renders a quote; showMeasure adds the measured totals per room.
func (s *server) quotePDF(ctx context.Context, acc *model.Account, q *model.Quote) ([]byte, error) {
	lines := quoteLineData(q)
	t := totalsOf(lines, q.Discount, q.VatRate)
	c := q.Customer
	doc := invoicepdf.Quote{Firm: firmParty(acc), Logo: s.logoBytes(ctx, acc),
		Customer: invoicepdf.Party{Name: c.Name, Street: c.Street, Zip: c.Zip, City: c.City, RegistrationNo: c.RegistrationNo, VatNo: c.VatNo,
			Contact: contactOf(c.Phone, c.Email)},
		Number: q.Number, Title: q.Title, SiteAddress: q.SiteAddress, IssuedOn: q.IssuedOn, ValidUntil: q.ValidUntil, Intro: q.Intro,
		VatPayer: acc.VatPayer, VatRate: q.VatRate, Subtotal: t.Subtotal, Discount: t.Discount, DiscountPct: q.Discount, Base: t.Base, Vat: t.Vat,
		Total: t.Total, Note: q.Note, Terms: q.Terms}
	if q.State != model.QuoteDraft {
		doc.URL = s.publicQuoteURL(q)
	}
	for _, sec := range []struct {
		key string
		sum int64
	}{{model.SectionWork, t.Work}, {model.SectionMaterial, t.Material}, {model.SectionOther, t.Other}} {
		ps := invoicepdf.Section{Title: sectionNames[sec.key], Subtotal: sec.sum}
		for i := range lines {
			l := &lines[i]
			if l.Section != sec.key {
				continue
			}
			pl := invoicepdf.Line{Text: l.Name, Unit: l.Unit, Quantity: l.Quantity, UnitPrice: l.UnitPrice, Discount: l.Discount, Amount: l.Amount(), Note: l.Note}
			if l.CustomerSupplied {
				pl.Note = strings.TrimSpace("dodá zákazník " + l.Note)
			}
			ps.Lines = append(ps.Lines, pl)
		}
		if len(ps.Lines) > 0 {
			doc.Sections = append(doc.Sections, ps)
		}
	}
	if q.ShowMeasure {
		for _, r := range measurements(q.Rooms).Rooms {
			doc.Measures = append(doc.Measures, invoicepdf.RoomMeasure{Name: r.Name, Floor: r.Floor, Wall: r.Wall, Perimeter: r.Perimeter,
				Length: r.Length, Pieces: r.Pieces})
		}
	}
	pdf, err := invoicepdf.QuotePDF(doc)
	if err != nil {
		slog.Error("quote PDF", "quote", q.ID, "err", err)
		return nil, huma.Error500InternalServerError("rendering the quote failed")
	}
	return pdf, nil
}

func (s *server) getQuotePDF(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*FileOutput, error) {
	q, err := s.loadQuote(ctx, s.db.WithContext(ctx), in.ID)
	if err != nil {
		return nil, err
	}
	pdf, err := s.quotePDF(ctx, auth.AccountFrom(ctx), q)
	if err != nil {
		return nil, err
	}
	return &FileOutput{ContentType: "application/pdf", ContentDisposition: `inline; filename="` + invoicepdf.QuoteFilename(q.Number) + `"`, Body: pdf}, nil
}

// publicQuotePDF serves the quote PDF to the customer (/n/{token}).
func (s *server) publicQuotePDF(w http.ResponseWriter, r *http.Request) {
	q, acc, err := s.loadPublicQuote(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "quote not found")
		return
	}
	pdf, err := s.quotePDF(r.Context(), acc, q)
	if err != nil {
		httpsec.WriteProblem(w, http.StatusInternalServerError, "internal", "rendering the quote failed")
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `inline; filename="`+invoicepdf.QuoteFilename(q.Number)+`"`)
	_, _ = w.Write(pdf)
}

// emailInvoice sends the invoice PDF to the customer (or the given address).
func (s *server) emailInvoice(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body InvoiceEmail
}) (*Out[Invoice], error) {
	if err := s.canEmail(ctx); err != nil {
		return nil, err
	}
	out, err := s.invoiceOut(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	inv := &out.Body
	to := strings.TrimSpace(defaultStr(in.Body.Email, inv.Party.Email))
	if to == "" {
		return nil, conflict(CodeNoEmail, "the customer has no e-mail")
	}
	if err := checkEmailAddress(to); err != nil {
		return nil, err
	}
	acc := auth.AccountFrom(ctx)
	pdf, err := s.invoicePDF(ctx, acc, inv)
	if err != nil {
		return nil, err
	}
	id := inv.ID
	e := model.Email{InvoiceID: &id, Kind: "invoice", To: to, ReplyTo: acc.Email,
		Subject: fmt.Sprintf("%s %s – %s", invoiceTitle(inv), inv.Number, acc.Name), Body: invoiceEmailBody(acc, inv, in.Body.Message)}
	if err := s.sendEmail(ctx, &e, mail.Attachment{Filename: invoicepdf.InvoiceFilename(inv.Number), ContentType: "application/pdf", Data: pdf}); err != nil {
		return nil, err
	}
	if e.Status == model.EmailSent || e.Status == model.EmailStored {
		if err := s.scoped(ctx).Model(&model.Invoice{}).Where("id = ?", inv.ID).
			Updates(map[string]any{"emailed_at": s.deps.Now(), "emailed_to": to}).Error; err != nil {
			return nil, dbErr(err, "invoice")
		}
	}
	return s.invoiceOut(ctx, inv.ID)
}

func invoiceEmailBody(acc *model.Account, inv *Invoice, message string) string {
	var b strings.Builder
	b.WriteString("Dobrý den,\n\n")
	if inv.Kind == model.InvoiceAdvance {
		fmt.Fprintf(&b, "v příloze zasíláme zálohovou fakturu č. %s.\n", inv.Number)
	} else {
		fmt.Fprintf(&b, "v příloze zasíláme fakturu č. %s.\n", inv.Number)
	}
	if m := strings.TrimSpace(message); m != "" {
		b.WriteString("\n" + m + "\n")
	}
	if inv.PaidOn == nil && inv.Total > 0 {
		fmt.Fprintf(&b, "\nČástka k úhradě: %s\nSplatnost: %s\n", money(inv.Total), czDate(inv.DueOn))
		switch {
		case acc.BankAccount != "":
			fmt.Fprintf(&b, "Účet: %s\n", acc.BankAccount)
		case acc.IBAN != "":
			fmt.Fprintf(&b, "IBAN: %s\n", acc.IBAN)
		}
		fmt.Fprintf(&b, "Variabilní symbol: %s\n", spayd.Digits(inv.Number, 10))
	}
	fmt.Fprintf(&b, "\nS pozdravem\n%s\n", acc.Name)
	if acc.Phone != "" {
		b.WriteString(acc.Phone + "\n")
	}
	return b.String()
}
