package auth

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/model"
)

// Middleware is a huma router middleware.
type Middleware = func(ctx huma.Context, next func(huma.Context))

type ctxKey int

const (
	userKey ctxKey = iota
	accountKey
	memberKey
	mcpKey
	sessionKey
)

// WithMCP marks ctx as a tool call of the MCP server: only such requests
// accept access tokens of OAuth applications.
func WithMCP(ctx context.Context) context.Context { return context.WithValue(ctx, mcpKey, true) }

func viaMCP(ctx context.Context) bool { v, _ := ctx.Value(mcpKey).(bool); return v }

// UserFrom returns the authenticated user (non-nil behind RequireUser).
func UserFrom(ctx context.Context) *model.User {
	u, _ := ctx.Value(userKey).(*model.User)
	return u
}

// AccountFrom returns the firm resolved from {slug} (non-nil behind RequireAccount).
func AccountFrom(ctx context.Context) *model.Account {
	a, _ := ctx.Value(accountKey).(*model.Account)
	return a
}

// MemberFrom returns the current user's membership in AccountFrom(ctx).
func MemberFrom(ctx context.Context) *model.Membership {
	m, _ := ctx.Value(memberKey).(*model.Membership)
	return m
}

// Visiting reports whether a superadmin acts in the firm without being
// its member (the membership is a virtual owner, not stored).
func Visiting(ctx context.Context) bool {
	m := MemberFrom(ctx)
	return m != nil && m.ID == 0
}

// IsSuperadmin reports whether the current user is a superadmin signed in
// with a browser session (API tokens never carry superadmin rights).
func (s *Service) IsSuperadmin(ctx context.Context) bool {
	u := UserFrom(ctx)
	viaSession, _ := ctx.Value(sessionKey).(bool)
	return u != nil && viaSession && s.superadmins[strings.ToLower(u.Email)]
}

// SuperadminEmail reports whether email belongs to a superadmin (login and
// registration, before a session exists).
func (s *Service) SuperadminEmail(email string) bool { return s.superadmins[strings.ToLower(email)] }

// RoleFrom returns the current user's role in AccountFrom(ctx).
func RoleFrom(ctx context.Context) string {
	if m := MemberFrom(ctx); m != nil {
		return m.Role
	}
	return ""
}

// WithAccount returns ctx acting in acc as m (tests, seeding).
func WithAccount(ctx context.Context, acc *model.Account, m *model.Membership) context.Context {
	return context.WithValue(context.WithValue(ctx, accountKey, acc), memberKey, m)
}

// RequireUser authenticates the request via `Authorization: Bearer tc_…` or
// the session cookie (bearer wins when both are present); 401 otherwise.
// Access tokens of OAuth applications are valid only for MCP tool calls.
func (s *Service) RequireUser(api huma.API) Middleware {
	return func(ctx huma.Context, next func(huma.Context)) {
		var session string
		if c, err := huma.ReadCookie(ctx, SessionCookie); err == nil {
			session = c.Value
		}
		u, refreshed, err := s.authenticate(ctx.Context(), ctx.Header("Authorization"), session)
		if err != nil {
			if errors.Is(err, ErrInvalidCredentials) {
				_ = huma.WriteErr(api, ctx, http.StatusUnauthorized, "authentication required")
			} else {
				_ = huma.WriteErr(api, ctx, http.StatusInternalServerError, "authentication failed", err)
			}
			return
		}
		if refreshed != nil {
			ctx.AppendHeader("Set-Cookie", refreshed.String())
		}
		ctx = huma.WithValue(ctx, sessionKey, ctx.Header("Authorization") == "")
		next(huma.WithValue(ctx, userKey, u))
	}
}

func (s *Service) authenticate(ctx context.Context, authorization, session string) (*model.User, *http.Cookie, error) {
	if authorization != "" {
		token, ok := strings.CutPrefix(authorization, "Bearer ")
		if !ok {
			return nil, nil, ErrInvalidCredentials
		}
		u, tok, err := s.apiToken(ctx, token)
		if err == nil && tok.OAuthGrantID != nil && !viaMCP(ctx) {
			return nil, nil, ErrInvalidCredentials
		}
		return u, nil, err
	}
	if session == "" {
		return nil, nil, ErrInvalidCredentials
	}
	return s.userBySession(ctx, session)
}

// membership resolves slug to the firm and the user's accepted
// membership; a superadmin who isn't a member gets a virtual owner membership.
func (s *Service) membership(ctx context.Context, slug string) (*model.Account, *model.Membership, error) {
	u := UserFrom(ctx)
	db := s.db.WithContext(ctx)
	var acc model.Account
	var m model.Membership
	if err := db.Where("slug = ?", slug).First(&acc).Error; err != nil {
		return nil, nil, err
	}
	err := db.Where("user_id = ? AND account_id = ? AND pending = ?", u.ID, acc.ID, false).First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) && s.IsSuperadmin(ctx) {
		return &acc, &model.Membership{AccountID: acc.ID, UserID: u.ID, Role: model.RoleOwner, User: *u}, nil
	}
	if err != nil {
		return nil, nil, err
	}
	return &acc, &m, nil
}

// RequireAccount resolves {slug} to a firm the user is a member of
// (non-member or not accepted invitation → 404; superadmins see every
// firm) and enforces the roles declared with Allow (→ 403).
func (s *Service) RequireAccount(api huma.API) Middleware {
	return func(ctx huma.Context, next func(huma.Context)) {
		acc, m, err := s.membership(ctx.Context(), ctx.Param("slug"))
		if err != nil {
			if errors.Is(notFoundAs(err), ErrInvalidCredentials) {
				_ = huma.WriteErr(api, ctx, http.StatusNotFound, "account not found")
			} else {
				_ = huma.WriteErr(api, ctx, http.StatusInternalServerError, "account lookup failed", err)
			}
			return
		}
		if allowed := AllowedRoles(ctx.Operation()); allowed != nil && !slices.Contains(allowed, m.Role) {
			_ = huma.WriteErr(api, ctx, http.StatusForbidden, forbiddenMsg(m.Role, allowed))
			return
		}
		ctx = huma.WithValue(ctx, accountKey, acc)
		next(huma.WithValue(ctx, memberKey, m))
	}
}

const metaRoles = "tilecraft.roles"

// Role sets (SPEC §1).
var (
	RolesAll      = []string{model.RoleOwner, model.RoleAdmin, model.RoleWorker}
	RolesManagers = []string{model.RoleOwner, model.RoleAdmin}
)

// Operation options for the common role sets. Every operation of the account
// group declares its roles: ForAll (workers too — no prices there) or
// ForManagers (prices, quotes, invoices, settings).
var (
	ForAll      = Allow(RolesAll...)
	ForManagers = Allow(RolesManagers...)
)

// IsRole reports whether r is a known role.
func IsRole(r string) bool { return slices.Contains(RolesAll, r) }

// Allow restricts an operation to roles (and documents them in OpenAPI).
func Allow(roles ...string) func(*huma.Operation) {
	roles = slices.Clone(roles)
	return func(o *huma.Operation) {
		if o.Metadata == nil {
			o.Metadata = map[string]any{}
		}
		o.Metadata[metaRoles] = roles
		note := "Allowed roles: " + strings.Join(roles, ", ") + "."
		if o.Description == "" {
			o.Description = note
		} else {
			o.Description += "\n\n" + note
		}
	}
}

// AllowedRoles returns the roles declared on op, nil = any member.
func AllowedRoles(op *huma.Operation) []string {
	if op == nil || op.Metadata == nil {
		return nil
	}
	r, _ := op.Metadata[metaRoles].([]string)
	return r
}

// RequireRole returns 403 unless the current role is one of roles.
func RequireRole(ctx context.Context, roles ...string) error {
	if r := RoleFrom(ctx); !slices.Contains(roles, r) {
		return huma.Error403Forbidden(forbiddenMsg(r, roles))
	}
	return nil
}

func forbiddenMsg(role string, allowed []string) string {
	return "your role (" + role + ") cannot do this; allowed roles: " + strings.Join(allowed, ", ")
}

// WithUser returns ctx with the authenticated user (plain HTTP handlers).
func WithUser(ctx context.Context, u *model.User) context.Context {
	return context.WithValue(ctx, userKey, u)
}

// Resolve authenticates a plain HTTP request for the firm slug and
// returns a context like RequireUser + RequireAccount would (status 401/404 on failure).
func (s *Service) Resolve(r *http.Request, slug string) (context.Context, int) {
	var session string
	if c, err := r.Cookie(SessionCookie); err == nil {
		session = c.Value
	}
	ctx := r.Context()
	u, _, err := s.authenticate(ctx, r.Header.Get("Authorization"), session)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			return nil, http.StatusUnauthorized
		}
		return nil, http.StatusInternalServerError
	}
	ctx = context.WithValue(WithUser(ctx, u), sessionKey, r.Header.Get("Authorization") == "")
	acc, m, err := s.membership(ctx, slug)
	if err != nil {
		if errors.Is(notFoundAs(err), ErrInvalidCredentials) {
			return nil, http.StatusNotFound
		}
		return nil, http.StatusInternalServerError
	}
	return WithAccount(ctx, acc, m), 0
}
