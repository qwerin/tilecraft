package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/model"
)

// AdminAccount is a firm in the superadmin's overview.
type AdminAccount struct {
	Slug        string     `json:"slug"`
	Name        string     `json:"name"`
	Owners      []string   `json:"owners" nullable:"false" doc:"E-mails of the owners"`
	Members     int        `json:"members" doc:"Accepted members (incl. clients' users)"`
	Quotes      int        `json:"quotes"`
	LastQuoteAt *time.Time `json:"last_quote_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

// AdminSignupCode is a one-time registration code (the plaintext only in the create response).
type AdminSignupCode struct {
	ID          uint       `json:"id"`
	Code        string     `json:"code,omitempty" doc:"Plaintext, only when created"`
	Note        string     `json:"note"`
	CreatedAt   time.Time  `json:"created_at"`
	ExpiresAt   time.Time  `json:"expires_at"`
	UsedAt      *time.Time `json:"used_at,omitempty"`
	UsedByEmail string     `json:"used_by_email,omitempty"`
	AccountSlug string     `json:"account_slug,omitempty"`
	AccountName string     `json:"account_name,omitempty"`
}

// SignupCodeCreate issues a one-time registration code.
type SignupCodeCreate struct {
	Note      string `json:"note,omitempty" maxLength:"200" doc:"For whom the code is"`
	ValidDays int    `json:"valid_days,omitempty" minimum:"1" maximum:"365" doc:"Validity in days (default 14)"`
}

func (s *server) registerAdmin(authed huma.API) {
	huma.Get(authed, "/api/admin/accounts", s.adminAccounts)
	huma.Get(authed, "/api/admin/signup-codes", s.adminSignupCodes)
	huma.Post(authed, "/api/admin/signup-codes", s.createSignupCode, status(http.StatusCreated))
	huma.Delete(authed, "/api/admin/signup-codes/{id}", s.deleteSignupCode, status(http.StatusNoContent))
}

func (s *server) requireSuperadmin(ctx context.Context) error {
	if !s.auth.IsSuperadmin(ctx) {
		return apiError(http.StatusForbidden, CodeSuperadminOnly, "only a superadmin may do this")
	}
	return nil
}

func (s *server) adminAccounts(ctx context.Context, _ *struct{}) (*Out[ListResponse[AdminAccount]], error) {
	if err := s.requireSuperadmin(ctx); err != nil {
		return nil, err
	}
	db := s.db.WithContext(ctx)
	var accs []model.Account
	if err := db.Order("name").Find(&accs).Error; err != nil {
		return nil, dbErr(err, "accounts")
	}
	var members []struct {
		AccountID uint
		Role      string
		Email     string
	}
	if err := db.Table("memberships").Select("memberships.account_id, memberships.role, users.email").
		Joins("JOIN users ON users.id = memberships.user_id").Where("memberships.pending = ?", false).
		Order("users.email").Scan(&members).Error; err != nil {
		return nil, dbErr(err, "memberships")
	}
	var orders []struct {
		AccountID uint
		N         int
	}
	if err := db.Model(&model.Quote{}).Select("account_id, COUNT(*) AS n").Group("account_id").Scan(&orders).Error; err != nil {
		return nil, dbErr(err, "orders")
	}
	idx := map[uint]int{}
	items := make([]AdminAccount, len(accs))
	for i, a := range accs {
		idx[a.ID] = i
		items[i] = AdminAccount{Slug: a.Slug, Name: a.Name, Owners: []string{}, CreatedAt: a.CreatedAt}
	}
	for _, m := range members {
		if i, ok := idx[m.AccountID]; ok {
			items[i].Members++
			if m.Role == model.RoleOwner {
				items[i].Owners = append(items[i].Owners, m.Email)
			}
		}
	}
	for _, o := range orders {
		i, ok := idx[o.AccountID]
		if !ok {
			continue
		}
		items[i].Quotes = o.N
		// per firm: MAX() over a time column comes back as text in SQLite
		var last []time.Time
		if err := db.Model(&model.Quote{}).Where("account_id = ?", o.AccountID).Order("created_at DESC").Limit(1).
			Pluck("created_at", &last).Error; err != nil {
			return nil, dbErr(err, "orders")
		}
		if len(last) > 0 {
			items[i].LastQuoteAt = &last[0]
		}
	}
	return &Out[ListResponse[AdminAccount]]{Body: ListResponse[AdminAccount]{Items: items, Page: 1, PerPage: len(items), Total: int64(len(items))}}, nil
}

func (s *server) adminSignupCodes(ctx context.Context, _ *struct{}) (*Out[ListResponse[AdminSignupCode]], error) {
	if err := s.requireSuperadmin(ctx); err != nil {
		return nil, err
	}
	var rows []struct {
		model.SignupCode
		UsedByEmail string
		AccountSlug string
		AccountName string
	}
	err := s.db.WithContext(ctx).Table("signup_codes").
		Select("signup_codes.*, users.email AS used_by_email, accounts.slug AS account_slug, accounts.name AS account_name").
		Joins("LEFT JOIN users ON users.id = signup_codes.used_by_id").
		Joins("LEFT JOIN accounts ON accounts.id = signup_codes.account_id").
		Order("signup_codes.id DESC").Scan(&rows).Error
	if err != nil {
		return nil, dbErr(err, "signup codes")
	}
	items := make([]AdminSignupCode, len(rows))
	for i, r := range rows {
		items[i] = toSignupCode(&r.SignupCode)
		items[i].UsedByEmail, items[i].AccountSlug, items[i].AccountName = r.UsedByEmail, r.AccountSlug, r.AccountName
	}
	return &Out[ListResponse[AdminSignupCode]]{Body: ListResponse[AdminSignupCode]{Items: items, Page: 1, PerPage: len(items), Total: int64(len(items))}}, nil
}

func (s *server) createSignupCode(ctx context.Context, in *struct{ Body SignupCodeCreate }) (*Out[AdminSignupCode], error) {
	if err := s.requireSuperadmin(ctx); err != nil {
		return nil, err
	}
	days := in.Body.ValidDays
	if days == 0 {
		days = 14
	}
	code := newSignupCode()
	sc := model.SignupCode{CodeHash: hashCode(code), Note: strings.TrimSpace(in.Body.Note), CreatedByID: auth.UserFrom(ctx).ID,
		ExpiresAt: s.deps.Now().AddDate(0, 0, days)}
	if err := s.db.WithContext(ctx).Create(&sc).Error; err != nil {
		return nil, dbErr(err, "signup code")
	}
	out := toSignupCode(&sc)
	out.Code = code
	return &Out[AdminSignupCode]{Body: out}, nil
}

// deleteSignupCode revokes an unused code (used ones stay as a record).
func (s *server) deleteSignupCode(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*NoContent, error) {
	if err := s.requireSuperadmin(ctx); err != nil {
		return nil, err
	}
	res := s.db.WithContext(ctx).Where("id = ? AND used_at IS NULL", in.ID).Delete(&model.SignupCode{})
	if res.Error != nil {
		return nil, dbErr(res.Error, "signup code")
	}
	if res.RowsAffected == 0 {
		return nil, notFound("signup code")
	}
	return &NoContent{}, nil
}

func toSignupCode(sc *model.SignupCode) AdminSignupCode {
	return AdminSignupCode{ID: sc.ID, Note: sc.Note, CreatedAt: sc.CreatedAt, ExpiresAt: sc.ExpiresAt, UsedAt: sc.UsedAt}
}

// newSignupCode returns a code easy to retype: XXXX-XXXX-XXXX-XXXX without 0/O/1/I.
func newSignupCode() string {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	var sb strings.Builder
	for i, c := range b {
		if i > 0 && i%4 == 0 {
			sb.WriteByte('-')
		}
		sb.WriteByte(alphabet[int(c)%len(alphabet)])
	}
	return sb.String()
}

// hashCode normalizes a typed code (case, spaces) before hashing.
func hashCode(code string) string {
	code = strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(code), " ", ""))
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}
