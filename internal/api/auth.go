package api

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/model"
)

// Me is the logged-in user with the firms they belong to.
type Me struct {
	ID       uint        `json:"id"`
	Email    string      `json:"email"`
	Name     string      `json:"name"`
	Accounts []MyAccount `json:"accounts" nullable:"false"`
	// Superadmin may open every firm and issue registration codes (TILECRAFT_SUPERADMINS).
	Superadmin bool `json:"superadmin"`
	// Invitations are firms that added the user; access starts with accepting.
	Invitations []MyAccount `json:"invitations" nullable:"false" doc:"Firms inviting the user (accept or decline)"`
}

// MyAccount is a firm of the current user.
type MyAccount struct {
	Slug string `json:"slug"`
	Name string `json:"name"`
	Role string `json:"role" enum:"owner,admin,worker"`
}

type sessionOut struct {
	SetCookie *http.Cookie `header:"Set-Cookie"`
	Body      Me
}

type logoutOut struct {
	SetCookie *http.Cookie `header:"Set-Cookie"`
}

// LoginInput is the login body.
type LoginInput struct {
	Email    string `json:"email" format:"email" maxLength:"254"`
	Password string `json:"password" maxLength:"200"`
}

// RegisterInput creates a firm with its owner.
type RegisterInput struct {
	Email    string `json:"email" format:"email" maxLength:"254"`
	Password string `json:"password" minLength:"8" maxLength:"72"`
	Name     string `json:"name" minLength:"1" maxLength:"200" doc:"Owner's full name"`
	Firm     string `json:"firm" minLength:"1" maxLength:"200" doc:"Firm name"`
	Code     string `json:"code,omitempty" maxLength:"100" doc:"Registration code (TILECRAFT_SIGNUP_CODE or a one-time code from a superadmin)"`
}

// SignupInfo tells the registration page whether a code is needed.
type SignupInfo struct {
	CodeRequired bool `json:"code_required"`
}

func (s *server) registerAuth(public, authed huma.API) {
	huma.Post(public, "/api/auth/login", s.login)
	huma.Post(public, "/api/auth/register", s.register, status(http.StatusCreated))
	huma.Get(public, "/api/auth/signup", s.signupInfo)
	huma.Post(public, "/api/auth/logout", s.logout)
	huma.Get(authed, "/api/auth/me", s.me)
	huma.Post(authed, "/api/auth/password", s.changePassword, status(http.StatusNoContent))
}

func (s *server) login(ctx context.Context, in *struct{ Body LoginInput }) (*sessionOut, error) {
	var u model.User
	err := s.db.WithContext(ctx).Where("email = ?", normEmail(in.Body.Email)).First(&u).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, dbErr(err, "user")
	}
	if !auth.CheckPassword(u.PasswordHash, in.Body.Password) {
		return nil, huma.Error401Unauthorized("invalid e-mail or password")
	}
	return s.startSession(ctx, &u)
}

func (s *server) signupInfo(context.Context, *struct{}) (*Out[SignupInfo], error) {
	return &Out[SignupInfo]{Body: SignupInfo{CodeRequired: !s.cfg.OpenSignup()}}, nil
}

func (s *server) register(ctx context.Context, in *struct{ Body RegisterInput }) (*sessionOut, error) {
	code := strings.TrimSpace(in.Body.Code)
	if code == "" && !s.cfg.OpenSignup() {
		return nil, apiError(http.StatusForbidden, CodeSignupCodeRequired, "registration requires a code")
	}
	ip := clientIP(ctx)
	if code != "" {
		if blocked, wait := s.limits.signupCode.Blocked(ip); blocked {
			return nil, huma.Error429TooManyRequests("too many wrong codes, retry in " + wait.Round(time.Minute).String())
		}
	}
	hash, err := auth.HashPassword(in.Body.Password)
	if err != nil {
		return nil, huma.Error500InternalServerError("hash password", err)
	}
	u := model.User{Email: normEmail(in.Body.Email), PasswordHash: hash, Name: strings.TrimSpace(in.Body.Name)}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var sc *model.SignupCode
		if code != "" {
			var err error
			if sc, err = s.checkSignupCode(tx, code); err != nil {
				return err
			}
		}
		if err := tx.Create(&u).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				return conflict(CodeEmailTaken, "e-mail is already registered")
			}
			return err
		}
		first, last := splitName(u.Name)
		acc, err := createAccount(tx, u.ID, in.Body.Firm, first, last)
		if err != nil || sc == nil {
			return err
		}
		res := tx.Model(sc).Where("used_at IS NULL").Updates(map[string]any{"used_at": s.deps.Now(), "used_by_id": u.ID, "account_id": acc.ID})
		if res.Error == nil && res.RowsAffected == 0 {
			return apiError(http.StatusForbidden, CodeSignupCodeInvalid, "registration code is invalid, used or expired")
		}
		return res.Error
	})
	if err != nil {
		var se huma.StatusError
		if errors.As(err, &se) {
			if code != "" && se.GetStatus() == http.StatusForbidden {
				s.limits.signupCode.Allow(ip)
			}
			return nil, err
		}
		return nil, dbErr(err, "user")
	}
	out, err := s.startSession(ctx, &u)
	return out, err
}

// checkSignupCode accepts TILECRAFT_SIGNUP_CODE (returns nil) or an unused,
// unexpired one-time code.
func (s *server) checkSignupCode(tx *gorm.DB, code string) (*model.SignupCode, error) {
	if s.cfg.SignupCode != "" && subtle.ConstantTimeCompare([]byte(code), []byte(s.cfg.SignupCode)) == 1 {
		return nil, nil
	}
	var sc model.SignupCode
	err := tx.Where("code_hash = ? AND used_at IS NULL AND expires_at > ?", hashCode(code), s.deps.Now()).First(&sc).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apiError(http.StatusForbidden, CodeSignupCodeInvalid, "registration code is invalid, used or expired")
	}
	return &sc, err
}

// createAccount creates a firm owned by userID.
func createAccount(tx *gorm.DB, userID uint, name string, first, last string) (*model.Account, error) {
	sl, err := uniqueSlug(tx, name)
	if err != nil {
		return nil, err
	}
	acc := model.Account{Slug: sl, Name: strings.TrimSpace(name)}
	acc.AccountSettings = defaultSettings()
	if err := tx.Create(&acc).Error; err != nil {
		return nil, err
	}
	m := model.Membership{AccountID: acc.ID, UserID: userID, Role: model.RoleOwner, FirstName: first, LastName: last, Color: "#3b82f6"}
	if err := tx.Create(&m).Error; err != nil {
		return nil, err
	}
	return &acc, seedCatalog(tx, acc.ID)
}

func defaultSettings() model.AccountSettings {
	return model.AccountSettings{DefaultVatRate: 12, QuoteValidDays: 30, InvoiceDueDays: 14, InvoiceDigits: 3,
		QuoteTerms: defaultQuoteTerms}
}

func splitName(n string) (string, string) {
	first, last, _ := strings.Cut(strings.TrimSpace(n), " ")
	return first, strings.TrimSpace(last)
}

func (s *server) startSession(ctx context.Context, u *model.User) (*sessionOut, error) {
	c, err := s.auth.CreateSession(ctx, u.ID)
	if err != nil {
		return nil, huma.Error500InternalServerError("create session", err)
	}
	me, err := s.loadMe(ctx, u)
	if err != nil {
		return nil, err
	}
	return &sessionOut{SetCookie: c, Body: *me}, nil
}

func (s *server) logout(ctx context.Context, in *struct {
	Session string `cookie:"tc_session"`
}) (*logoutOut, error) {
	if in.Session != "" {
		if err := s.auth.DeleteSession(ctx, in.Session); err != nil {
			return nil, huma.Error500InternalServerError("logout", err)
		}
	}
	return &logoutOut{SetCookie: s.auth.ClearCookie(ctx)}, nil
}

func (s *server) me(ctx context.Context, _ *struct{}) (*Out[Me], error) {
	me, err := s.loadMe(ctx, auth.UserFrom(ctx))
	if err != nil {
		return nil, err
	}
	return &Out[Me]{Body: *me}, nil
}

func (s *server) loadMe(ctx context.Context, u *model.User) (*Me, error) {
	var rows []struct {
		Slug    string
		Name    string
		Role    string
		Pending bool
	}
	err := s.db.WithContext(ctx).Table("memberships").
		Select("accounts.slug, accounts.name, memberships.role, memberships.pending").
		Joins("JOIN accounts ON accounts.id = memberships.account_id").
		Where("memberships.user_id = ?", u.ID).Order("accounts.name").Scan(&rows).Error
	if err != nil {
		return nil, dbErr(err, "accounts")
	}
	me := &Me{ID: u.ID, Email: u.Email, Name: u.Name, Accounts: []MyAccount{}, Invitations: []MyAccount{},
		// login and registration have no user in ctx yet: the new session decides
		Superadmin: s.auth.IsSuperadmin(ctx) || (auth.UserFrom(ctx) == nil && s.auth.SuperadminEmail(u.Email))}
	for _, r := range rows {
		a := MyAccount{Slug: r.Slug, Name: r.Name, Role: r.Role}
		if r.Pending {
			me.Invitations = append(me.Invitations, a)
		} else {
			me.Accounts = append(me.Accounts, a)
		}
	}
	return me, nil
}

// ChangePasswordInput changes the current user's password.
type ChangePasswordInput struct {
	Current string `json:"current" maxLength:"200"`
	New     string `json:"new" minLength:"8" maxLength:"72"`
}

func (s *server) changePassword(ctx context.Context, in *struct {
	Session string `cookie:"tc_session"`
	Body    ChangePasswordInput
}) (*NoContent, error) {
	u := auth.UserFrom(ctx)
	if !auth.CheckPassword(u.PasswordHash, in.Body.Current) {
		return nil, apiError(http.StatusUnprocessableEntity, CodeWrongPassword, "current password is wrong")
	}
	hash, err := auth.HashPassword(in.Body.New)
	if err != nil {
		return nil, huma.Error500InternalServerError("hash password", err)
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(u).Update("password_hash", hash).Error; err != nil {
			return err
		}
		return revokeCredentials(tx, u.ID, in.Session)
	})
	if err != nil {
		return nil, dbErr(err, "user")
	}
	return &NoContent{}, nil
}

// revokeCredentials ends the sessions of userID (except keepSession) and
// revokes their API tokens and connected applications (password change).
func revokeCredentials(tx *gorm.DB, userID uint, keepSession string) error {
	if err := tx.Where("user_id = ?", userID).Delete(&model.APIToken{}).Error; err != nil {
		return err
	}
	if err := deleteUserGrants(tx, userID); err != nil {
		return err
	}
	return auth.DeleteOtherSessions(tx, userID, keepSession)
}

func normEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

// uniqueSlug derives a URL slug from name, adding -2, -3 … when taken.
func uniqueSlug(tx *gorm.DB, name string) (string, error) {
	base := slugify(name)
	if base == "" {
		base = "firma"
	}
	cand := base
	for i := 2; ; i++ {
		var n int64
		if err := tx.Model(&model.Account{}).Where("slug = ?", cand).Count(&n).Error; err != nil {
			return "", err
		}
		if n == 0 {
			return cand, nil
		}
		cand = base + "-" + itoa(i)
	}
}

var fold = strings.NewReplacer("á", "a", "č", "c", "ď", "d", "é", "e", "ě", "e", "í", "i", "ň", "n", "ó", "o", "ř", "r",
	"š", "s", "ť", "t", "ú", "u", "ů", "u", "ý", "y", "ž", "z", "ä", "a", "ö", "o", "ü", "u", "ľ", "l", "ĺ", "l", "ŕ", "r", "ô", "o")

func slugify(s string) string {
	s = fold.Replace(strings.ToLower(s))
	var b strings.Builder
	dash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
		} else if !dash && b.Len() > 0 {
			b.WriteByte('-')
			dash = true
		}
	}
	out := strings.TrimSuffix(b.String(), "-")
	if len(out) > 40 {
		out = strings.TrimSuffix(out[:40], "-")
	}
	return out
}
