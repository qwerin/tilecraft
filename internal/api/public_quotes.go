package api

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/calc"
	"github.com/qwerin/tilecraft/internal/model"
)

// PublicFirm is the firm as the customer sees it.
type PublicFirm struct {
	Name           string `json:"name"`
	RegistrationNo string `json:"registration_no"`
	VatNo          string `json:"vat_no"`
	Address        string `json:"address"`
	Phone          string `json:"phone"`
	Email          string `json:"email"`
	Web            string `json:"web"`
	Logo           string `json:"logo" doc:"URL of the logo; \"\" = none"`
	VatPayer       bool   `json:"vat_payer"`
}

// PublicQuote is the customer's view of a quote (/n/{token}, no login).
type PublicQuote struct {
	Number       string        `json:"number"`
	Title        string        `json:"title"`
	State        string        `json:"state" enum:"draft,sent,accepted,rejected"`
	Expired      bool          `json:"expired"`
	CanDecide    bool          `json:"can_decide" doc:"The customer may accept or reject now"`
	IssuedOn     string        `json:"issued_on"`
	ValidUntil   string        `json:"valid_until"`
	SiteAddress  string        `json:"site_address"`
	Intro        string        `json:"intro"`
	Note         string        `json:"note"`
	Terms        string        `json:"terms"`
	Firm         PublicFirm    `json:"firm"`
	Customer     CustomerRef   `json:"customer"`
	Rooms        []calc.Room   `json:"rooms" nullable:"false" doc:"Only when the firm shows the measurements"`
	Measurements *Measurements `json:"measurements,omitempty"`
	Lines        []Line        `json:"lines" nullable:"false"`
	Totals       calc.Totals   `json:"totals"`
	DecidedAt    *time.Time    `json:"decided_at"`
	DecidedBy    string        `json:"decided_by"`
}

// PublicDecision is the customer's answer.
type PublicDecision struct {
	State  string `json:"state" enum:"accepted,rejected"`
	Name   string `json:"name" minLength:"1" maxLength:"200" doc:"Who decides (customer's name)"`
	Reason string `json:"reason,omitempty" maxLength:"2000"`
}

type tokenPath struct {
	Token string `path:"token" maxLength:"64"`
}

func (s *server) registerPublicQuotes(public huma.API) {
	huma.Get(public, "/api/public/quotes/{token}", s.getPublicQuote)
	huma.Post(public, "/api/public/quotes/{token}/decision", s.decidePublicQuote)
}

func (s *server) loadPublicQuote(ctx context.Context, token string) (*model.Quote, *model.Account, error) {
	var q model.Quote
	err := s.db.WithContext(ctx).Preload("Customer").Preload("Lines", func(db *gorm.DB) *gorm.DB { return db.Order("position") }).
		Where("public_token = ? AND state <> ?", token, model.QuoteDraft).First(&q).Error
	if err != nil {
		return nil, nil, notFound("quote")
	}
	var acc model.Account
	if err := s.db.WithContext(ctx).First(&acc, q.AccountID).Error; err != nil {
		return nil, nil, dbErr(err, "firm")
	}
	return &q, &acc, nil
}

func (s *server) toPublicQuote(q *model.Quote, acc *model.Account) PublicQuote {
	lines := make([]Line, len(q.Lines))
	for i := range q.Lines {
		lines[i] = toLine(0, &q.Lines[i].LineData)
		lines[i].CatalogItemID = nil
	}
	logo := ""
	if acc.LogoKey != "" {
		logo = "/api/public/quotes/" + q.PublicToken + "/logo"
	}
	out := PublicQuote{Number: q.Number, Title: q.Title, State: q.State, Expired: s.expired(q),
		IssuedOn: q.IssuedOn, ValidUntil: q.ValidUntil, SiteAddress: q.SiteAddress, Intro: q.Intro, Note: q.Note, Terms: q.Terms,
		Firm: PublicFirm{Name: acc.Name, RegistrationNo: acc.RegistrationNo, VatNo: acc.VatNo, Address: joinAddress(acc.Street, acc.Zip, acc.City),
			Phone: acc.Phone, Email: acc.Email, Web: acc.Web, Logo: logo, VatPayer: acc.VatPayer},
		Customer: toCustomerRef(&q.Customer), Rooms: []calc.Room{}, Lines: lines, Totals: totalsOf(quoteLineData(q), q.Discount, q.VatRate),
		DecidedAt: q.DecidedAt, DecidedBy: q.DecidedBy}
	out.Customer.ID = 0
	out.CanDecide = q.State == model.QuoteSent && !out.Expired
	if q.ShowMeasure && q.Rooms != nil {
		m := measurements(q.Rooms)
		out.Rooms, out.Measurements = q.Rooms, &m
	}
	return out
}

func (s *server) getPublicQuote(ctx context.Context, in *tokenPath) (*Out[PublicQuote], error) {
	q, acc, err := s.loadPublicQuote(ctx, in.Token)
	if err != nil {
		return nil, err
	}
	return &Out[PublicQuote]{Body: s.toPublicQuote(q, acc)}, nil
}

func (s *server) decidePublicQuote(ctx context.Context, in *struct {
	Token string `path:"token" maxLength:"64"`
	Body  PublicDecision
}) (*Out[PublicQuote], error) {
	q, acc, err := s.loadPublicQuote(ctx, in.Token)
	if err != nil {
		return nil, err
	}
	if q.State != model.QuoteSent || s.expired(q) {
		return nil, conflict(CodeQuoteLocked, "the quote can no longer be decided")
	}
	now := s.deps.Now()
	name := strings.TrimSpace(in.Body.Name)
	res := s.db.WithContext(ctx).Model(q).Where("state = ?", model.QuoteSent).
		Updates(map[string]any{"state": in.Body.State, "decided_at": now, "decided_by": name, "reason": in.Body.Reason})
	if res.Error != nil {
		return nil, dbErr(res.Error, "quote")
	}
	if res.RowsAffected == 0 {
		return nil, conflict(CodeQuoteLocked, "the quote can no longer be decided")
	}
	q.State, q.DecidedAt, q.DecidedBy, q.Reason = in.Body.State, &now, name, in.Body.Reason
	s.notifyDecision(ctx, acc, q)
	return &Out[PublicQuote]{Body: s.toPublicQuote(q, acc)}, nil
}

// notifyDecision e-mails the firm that the customer decided (best effort).
func (s *server) notifyDecision(ctx context.Context, acc *model.Account, q *model.Quote) {
	if acc.Email == "" {
		return
	}
	ctx = auth.WithAccount(auth.WithUser(ctx, &model.User{}), acc, &model.Membership{AccountID: acc.ID})
	verb := "PŘIJAL"
	if q.State == model.QuoteRejected {
		verb = "ODMÍTL"
	}
	body := fmt.Sprintf("Zákazník %s %s nabídku %s „%s“ (%s).\n", q.DecidedBy, strings.ToLower(verb), q.Number, q.Title, money(q.Total))
	if q.Reason != "" {
		body += "\nVzkaz: " + q.Reason + "\n"
	}
	body += fmt.Sprintf("\n%s/a/%s/quotes/%d\n", strings.TrimRight(s.cfg.PublicURL, "/"), acc.Slug, q.ID)
	e := model.Email{QuoteID: &q.ID, Kind: "quote_decision", To: acc.Email,
		Subject: fmt.Sprintf("Nabídka %s: zákazník %s", q.Number, strings.ToLower(verb)), Body: body}
	if err := s.sendEmail(ctx, &e); err != nil {
		var se huma.StatusError
		if !errors.As(err, &se) {
			slog.Error("decision e-mail", "quote", q.ID, "err", err)
		}
	}
}
