package api

import (
	"context"
	"net/http"
	"strconv"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/model"
)

func itoa(i int) string { return strconv.Itoa(i) }

// Account is the firm with its company data and settings.
type Account struct {
	Slug           string   `json:"slug"`
	Name           string   `json:"name"`
	RegistrationNo string   `json:"registration_no"`
	VatNo          string   `json:"vat_no"`
	Street         string   `json:"street"`
	City           string   `json:"city"`
	Zip            string   `json:"zip"`
	Phone          string   `json:"phone"`
	Email          string   `json:"email"`
	Web            string   `json:"web"`
	BankAccount    string   `json:"bank_account"`
	IBAN           string   `json:"iban"`
	Swift          string   `json:"swift"`
	Settings       Settings `json:"settings"`
	Logo           string   `json:"logo" doc:"URL of the logo for prints (changes with every upload); \"\" = none"`
	Role           string   `json:"role" enum:"owner,admin,worker" doc:"Current user's role"`
	Visiting       bool     `json:"visiting" doc:"Superadmin acting as owner without being a member"`
}

// Settings are the firm's settings (SPEC §2).
type Settings struct {
	VatPayer       bool   `json:"vat_payer" doc:"The firm is a VAT payer (prices are without VAT, documents show VAT)"`
	DefaultVatRate int    `json:"default_vat_rate" minimum:"0" maximum:"21" doc:"VAT rate of new quotes for a VAT payer (12 = repairs of housing, 21, 0 = reverse charge)"`
	QuoteValidDays int    `json:"quote_valid_days" minimum:"1" maximum:"365"`
	QuoteIntro     string `json:"quote_intro" maxLength:"5000" doc:"Introduction text of new quotes"`
	QuoteTerms     string `json:"quote_terms" maxLength:"20000" doc:"Terms printed on new quotes (warranty, payment, …)"`
	InvoiceDueDays int    `json:"invoice_due_days" minimum:"0" maximum:"365"`
	InvoiceDigits  int    `json:"invoice_digits" minimum:"0" maximum:"6" doc:"Digits of the sequence in the invoice number (year + sequence); 0 = 3"`
	InvoiceText    string `json:"invoice_text" maxLength:"2000" doc:"Note of every new invoice"`
}

// AccountPatch changes company data and/or settings (nil = unchanged).
type AccountPatch struct {
	Name           *string   `json:"name,omitempty" minLength:"1" maxLength:"200"`
	RegistrationNo *string   `json:"registration_no,omitempty" maxLength:"20"`
	VatNo          *string   `json:"vat_no,omitempty" maxLength:"20"`
	Street         *string   `json:"street,omitempty" maxLength:"200"`
	City           *string   `json:"city,omitempty" maxLength:"200"`
	Zip            *string   `json:"zip,omitempty" maxLength:"20"`
	Phone          *string   `json:"phone,omitempty" maxLength:"50"`
	Email          *string   `json:"email,omitempty" maxLength:"254"`
	Web            *string   `json:"web,omitempty" maxLength:"200"`
	BankAccount    *string   `json:"bank_account,omitempty" maxLength:"50"`
	IBAN           *string   `json:"iban,omitempty" maxLength:"50"`
	Swift          *string   `json:"swift,omitempty" maxLength:"20"`
	Settings       *Settings `json:"settings,omitempty"`
}

func toSettings(a *model.AccountSettings) Settings {
	return Settings{VatPayer: a.VatPayer, DefaultVatRate: a.DefaultVatRate, QuoteValidDays: a.QuoteValidDays,
		QuoteIntro: a.QuoteIntro, QuoteTerms: a.QuoteTerms, InvoiceDueDays: a.InvoiceDueDays, InvoiceDigits: a.InvoiceDigits,
		InvoiceText: a.InvoiceText}
}

func toAccount(ctx context.Context, a *model.Account) Account {
	m := auth.MemberFrom(ctx)
	return Account{Slug: a.Slug, Name: a.Name, RegistrationNo: a.RegistrationNo, VatNo: a.VatNo, Street: a.Street, City: a.City,
		Zip: a.Zip, Phone: a.Phone, Email: a.Email, Web: a.Web, BankAccount: a.BankAccount, IBAN: a.IBAN, Swift: a.Swift,
		Settings: toSettings(&a.AccountSettings), Logo: logoURL(a), Role: m.Role, Visiting: auth.Visiting(ctx)}
}

// AccountCreate creates another firm owned by the current user (with
// signup disabled only owners of a firm may).
type AccountCreate struct {
	Name string `json:"name" minLength:"1" maxLength:"200"`
}

func (s *server) registerAccounts(authed, account huma.API) {
	huma.Post(authed, "/api/accounts", s.createAccount, status(http.StatusCreated))
	huma.Post(authed, "/api/auth/invitations/{slug}", s.acceptInvitation)
	huma.Delete(authed, "/api/auth/invitations/{slug}", s.declineInvitation, status(http.StatusNoContent))
	huma.Get(account, "", s.getAccount)
	huma.Patch(account, "", s.patchAccount, auth.ForManagers)
}

func (s *server) createAccount(ctx context.Context, in *struct{ Body AccountCreate }) (*Out[MyAccount], error) {
	u := auth.UserFrom(ctx)
	if !s.cfg.OpenSignup() && !s.auth.IsSuperadmin(ctx) {
		var n int64
		if err := s.db.WithContext(ctx).Model(&model.Membership{}).Where("user_id = ? AND role = ? AND pending = ?", u.ID, model.RoleOwner, false).
			Count(&n).Error; err != nil {
			return nil, dbErr(err, "account")
		}
		if n == 0 {
			return nil, apiError(http.StatusForbidden, CodeSignupDisabled, "only owners of a firm may create another one")
		}
	}
	var acc *model.Account
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		first, last := splitName(u.Name)
		var err error
		acc, err = createAccount(tx, u.ID, in.Body.Name, first, last)
		return err
	})
	if err != nil {
		return nil, dbErr(err, "account")
	}
	return &Out[MyAccount]{Body: MyAccount{Slug: acc.Slug, Name: acc.Name, Role: model.RoleOwner}}, nil
}

// invitation returns the current user's pending membership in the firm slug.
func (s *server) invitation(ctx context.Context, slug string) (*model.Membership, error) {
	var m model.Membership
	err := s.db.WithContext(ctx).Joins("JOIN accounts ON accounts.id = memberships.account_id").
		Where("accounts.slug = ? AND memberships.user_id = ? AND memberships.pending = ?", slug, auth.UserFrom(ctx).ID, true).First(&m).Error
	if err != nil {
		return nil, dbErr(err, "invitation")
	}
	return &m, nil
}

func (s *server) acceptInvitation(ctx context.Context, in *struct {
	Slug string `path:"slug"`
}) (*Out[Me], error) {
	m, err := s.invitation(ctx, in.Slug)
	if err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Model(m).Update("pending", false).Error; err != nil {
		return nil, dbErr(err, "invitation")
	}
	me, err := s.loadMe(ctx, auth.UserFrom(ctx))
	if err != nil {
		return nil, err
	}
	return &Out[Me]{Body: *me}, nil
}

func (s *server) declineInvitation(ctx context.Context, in *struct {
	Slug string `path:"slug"`
}) (*NoContent, error) {
	m, err := s.invitation(ctx, in.Slug)
	if err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Delete(m).Error; err != nil {
		return nil, dbErr(err, "invitation")
	}
	return &NoContent{}, nil
}

func (s *server) getAccount(ctx context.Context, _ *struct{}) (*Out[Account], error) {
	return &Out[Account]{Body: toAccount(ctx, auth.AccountFrom(ctx))}, nil
}

func (s *server) patchAccount(ctx context.Context, in *struct{ Body AccountPatch }) (*Out[Account], error) {
	a := auth.AccountFrom(ctx)
	b := in.Body
	apply(&a.Name, b.Name)
	apply(&a.RegistrationNo, b.RegistrationNo)
	apply(&a.VatNo, b.VatNo)
	apply(&a.Street, b.Street)
	apply(&a.City, b.City)
	apply(&a.Zip, b.Zip)
	apply(&a.Phone, b.Phone)
	apply(&a.Email, b.Email)
	apply(&a.BankAccount, b.BankAccount)
	apply(&a.IBAN, b.IBAN)
	apply(&a.Swift, b.Swift)
	apply(&a.Web, b.Web)
	if st := b.Settings; st != nil {
		a.AccountSettings = model.AccountSettings{VatPayer: st.VatPayer, DefaultVatRate: st.DefaultVatRate,
			QuoteValidDays: max(st.QuoteValidDays, 1), QuoteIntro: st.QuoteIntro, QuoteTerms: st.QuoteTerms,
			InvoiceDueDays: st.InvoiceDueDays, InvoiceDigits: invoiceDigits(st.InvoiceDigits), InvoiceText: st.InvoiceText}
	}
	// Select("*") so false/zero settings are written too
	if err := s.db.WithContext(ctx).Model(a).Select("*").Omit("id", "slug", "created_at").Updates(a).Error; err != nil {
		return nil, dbErr(err, "account")
	}
	return &Out[Account]{Body: toAccount(ctx, a)}, nil
}
