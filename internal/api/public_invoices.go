package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/httpsec"
	"github.com/qwerin/tilecraft/internal/invoicepdf"
	"github.com/qwerin/tilecraft/internal/model"
)

// PublicInvoiceFirm is the supplier as printed on the invoice.
type PublicInvoiceFirm struct {
	PublicFirm
	Street      string `json:"street"`
	Zip         string `json:"zip"`
	City        string `json:"city"`
	BankAccount string `json:"bank_account"`
	IBAN        string `json:"iban"`
}

// PublicInvoice is the customer's view of an invoice (/f/{token}, no login).
type PublicInvoice struct {
	Number    string            `json:"number"`
	Kind      string            `json:"kind" enum:"invoice,advance" doc:"advance = zálohová faktura"`
	IssuedOn  string            `json:"issued_on"`
	TaxableOn string            `json:"taxable_on"`
	DueOn     string            `json:"due_on"`
	PaidOn    *string           `json:"paid_on"`
	Overdue   bool              `json:"overdue"`
	VatPayer  bool              `json:"vat_payer"`
	Party     InvoiceParty      `json:"party"`
	Lines     []InvoiceLine     `json:"lines" nullable:"false"`
	VatRows   []VatRow          `json:"vat_rows" nullable:"false"`
	Base      int64             `json:"base"`
	Vat       int64             `json:"vat"`
	Total     int64             `json:"total"`
	Note      string            `json:"note"`
	QRPayment string            `json:"qr_payment" doc:"SPAYD payload of the QR Platba (\"\" when paid or without a bank account)"`
	VS        string            `json:"vs"`
	Firm      PublicInvoiceFirm `json:"firm"`
}

func (s *server) registerPublicInvoices(public huma.API) {
	huma.Get(public, "/api/public/invoices/{token}", s.getPublicInvoice)
}

func (s *server) publicInvoiceURL(inv *model.Invoice) string {
	if inv.PublicToken == "" {
		return ""
	}
	return strings.TrimRight(s.cfg.PublicURL, "/") + "/f/" + inv.PublicToken
}

// loadPublicInvoice finds the invoice by its token and returns it as the firm
// sees it, with a context of its firm (for the scoped helpers).
func (s *server) loadPublicInvoice(ctx context.Context, token string) (context.Context, *model.Invoice, *Invoice, error) {
	if token == "" {
		return nil, nil, nil, notFound("invoice")
	}
	var inv model.Invoice
	if err := s.db.WithContext(ctx).Select("id", "account_id").Where("public_token = ?", token).First(&inv).Error; err != nil {
		return nil, nil, nil, notFound("invoice")
	}
	var acc model.Account
	if err := s.db.WithContext(ctx).First(&acc, inv.AccountID).Error; err != nil {
		return nil, nil, nil, dbErr(err, "firm")
	}
	ctx = auth.WithAccount(auth.WithUser(ctx, &model.User{}), &acc, &model.Membership{AccountID: acc.ID})
	full, err := s.loadInvoice(ctx, s.db.WithContext(ctx), inv.ID)
	if err != nil {
		return nil, nil, nil, err
	}
	out, err := s.toInvoice(ctx, full)
	if err != nil {
		return nil, nil, nil, err
	}
	return ctx, full, &out, nil
}

func toPublicInvoice(acc *model.Account, token string, inv *Invoice) PublicInvoice {
	logo := ""
	if acc.LogoKey != "" {
		logo = "/api/public/invoices/" + token + "/logo"
	}
	lines := make([]InvoiceLine, len(inv.Lines))
	for i, l := range inv.Lines {
		l.ID, l.AdvanceID = uint(i+1), nil // no internal ids
		lines[i] = l
	}
	return PublicInvoice{Number: inv.Number, Kind: inv.Kind, IssuedOn: inv.IssuedOn, TaxableOn: inv.TaxableOn, DueOn: inv.DueOn,
		PaidOn: inv.PaidOn, Overdue: inv.Overdue, VatPayer: inv.VatPayer, Party: inv.Party, Lines: lines, VatRows: inv.VatRows,
		Base: inv.Base, Vat: inv.Vat, Total: inv.Total, Note: inv.Note, QRPayment: inv.QRPayment, VS: inv.VS,
		Firm: PublicInvoiceFirm{PublicFirm: PublicFirm{Name: acc.Name, RegistrationNo: acc.RegistrationNo, VatNo: acc.VatNo,
			Address: joinAddress(acc.Street, acc.Zip, acc.City), Phone: acc.Phone, Email: acc.Email, Web: acc.Web, Logo: logo, VatPayer: acc.VatPayer},
			Street: acc.Street, Zip: acc.Zip, City: acc.City, BankAccount: acc.BankAccount, IBAN: acc.IBAN}}
}

func (s *server) getPublicInvoice(ctx context.Context, in *struct {
	Token   string `path:"token" maxLength:"64"`
	Session string `cookie:"tc_session"`
}) (*Out[PublicInvoice], error) {
	fctx, inv, out, err := s.loadPublicInvoice(ctx, in.Token)
	if err != nil {
		return nil, err
	}
	acc := auth.AccountFrom(fctx)
	if inv.ViewedAt == nil && !s.firmMember(ctx, in.Session, acc.Slug) {
		if err := s.db.WithContext(ctx).Model(&model.Invoice{}).Where("id = ? AND viewed_at IS NULL", inv.ID).
			Update("viewed_at", s.deps.Now()).Error; err != nil {
			slog.Warn("invoice viewed", "invoice", inv.ID, "err", err)
		}
	}
	return &Out[PublicInvoice]{Body: toPublicInvoice(acc, in.Token, out)}, nil
}

// firmMember: the signed-in user (session cookie) is a member of the firm — the firm checking its own link is not the customer's view.
func (s *server) firmMember(ctx context.Context, session, slug string) bool {
	if session == "" {
		return false
	}
	r, err := http.NewRequestWithContext(ctx, http.MethodGet, "/", nil)
	if err != nil {
		return false
	}
	r.AddCookie(&http.Cookie{Name: auth.SessionCookie, Value: session})
	_, status := s.auth.Resolve(r, slug)
	return status == 0
}

// publicInvoicePDF serves the invoice PDF to the customer (/f/{token}).
func (s *server) publicInvoicePDF(w http.ResponseWriter, r *http.Request) {
	ctx, _, out, err := s.loadPublicInvoice(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "invoice not found")
		return
	}
	pdf, err := s.invoicePDF(ctx, auth.AccountFrom(ctx), out)
	if err != nil {
		httpsec.WriteProblem(w, http.StatusInternalServerError, "internal", "rendering the invoice failed")
		return
	}
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", `inline; filename="`+invoicepdf.InvoiceFilename(out.Number)+`"`)
	_, _ = w.Write(pdf)
}

// publicInvoiceLogo serves the firm's logo on the customer's invoice page.
func (s *server) publicInvoiceLogo(w http.ResponseWriter, r *http.Request) {
	var inv model.Invoice
	token := chi.URLParam(r, "token")
	err := s.db.WithContext(r.Context()).Select("account_id").Where("public_token = ? AND public_token <> ''", token).First(&inv).Error
	if err != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "no logo")
		return
	}
	var acc model.Account
	if err := s.db.WithContext(r.Context()).First(&acc, inv.AccountID).Error; err != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "no logo")
		return
	}
	s.serveLogo(w, r, &acc)
}
