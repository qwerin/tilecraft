package api

import (
	"context"
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/model"
)

// Member is a user of the firm.
type Member struct {
	ID            uint   `json:"id" doc:"Membership ID"`
	UserID        uint   `json:"user_id"`
	Email         string `json:"email"`
	Role          string `json:"role" enum:"owner,admin,worker"`
	FirstName     string `json:"first_name"`
	LastName      string `json:"last_name"`
	Name          string `json:"name" doc:"Display name"`
	Phone         string `json:"phone"`
	Color         string `json:"color"`
	Pending       bool   `json:"pending" doc:"Invitation of an existing user, not accepted yet (no access)"`
	PasswordReset bool   `json:"password_reset" doc:"Managers may set the password (the user belongs to no other firm)"`
}

// MemberCreate adds a user; an existing e-mail gets an invitation it must accept.
type MemberCreate struct {
	Email     string `json:"email" format:"email" maxLength:"254"`
	Password  string `json:"password,omitempty" maxLength:"72" doc:"Initial password for a new user (min. 8 chars); ignored for an existing user"`
	Role      string `json:"role" enum:"owner,admin,worker"`
	FirstName string `json:"first_name,omitempty" maxLength:"100"`
	LastName  string `json:"last_name,omitempty" maxLength:"100"`
	Phone     string `json:"phone,omitempty" maxLength:"50"`
	Color     string `json:"color,omitempty" maxLength:"7"`
}

// MemberPatch changes a member (nil = unchanged); Password resets it (only
// users who belong to no other firm).
type MemberPatch struct {
	Role      *string `json:"role,omitempty" enum:"owner,admin,worker"`
	FirstName *string `json:"first_name,omitempty" maxLength:"100"`
	LastName  *string `json:"last_name,omitempty" maxLength:"100"`
	Phone     *string `json:"phone,omitempty" maxLength:"50"`
	Color     *string `json:"color,omitempty" maxLength:"7"`
	Password  *string `json:"password,omitempty" minLength:"8" maxLength:"72"`
}

func memberName(m *model.Membership) string {
	n := strings.TrimSpace(strings.Join([]string{m.FirstName, m.LastName}, " "))
	if n == "" {
		n = m.User.Name
	}
	if n == "" {
		n = m.User.Email
	}
	return n
}

func toMember(m *model.Membership) Member {
	return Member{ID: m.ID, UserID: m.UserID, Email: m.User.Email, Role: m.Role,
		FirstName: m.FirstName, LastName: m.LastName, Name: memberName(m), Phone: m.Phone, Color: m.Color,
		Pending: m.Pending}
}

// passwordManaged reports which of userIDs belong to no firm other than
// accountID: only their password may be set by the firm's managers
// (a user is global, another firm must not take over the account), and
// only once they accepted the membership.
func passwordManaged(db *gorm.DB, accountID uint, userIDs []uint) (map[uint]bool, error) {
	var foreign []uint
	if err := db.Model(&model.Membership{}).Where("user_id IN ? AND account_id <> ?", userIDs, accountID).
		Distinct().Pluck("user_id", &foreign).Error; err != nil {
		return nil, err
	}
	out := map[uint]bool{}
	for _, id := range userIDs {
		out[id] = !slices.Contains(foreign, id)
	}
	return out, nil
}

func (s *server) toMembers(ctx context.Context, ms []model.Membership) ([]Member, error) {
	ids := make([]uint, len(ms))
	for i := range ms {
		ids[i] = ms[i].UserID
	}
	managed, err := passwordManaged(s.db.WithContext(ctx), accountID(ctx), ids)
	if err != nil {
		return nil, dbErr(err, "members")
	}
	out := make([]Member, len(ms))
	for i := range ms {
		out[i] = toMember(&ms[i])
		out[i].PasswordReset = managed[ms[i].UserID] && !ms[i].Pending
	}
	return out, nil
}

func (s *server) memberOut(ctx context.Context, m *model.Membership) (*Out[Member], error) {
	out, err := s.toMembers(ctx, []model.Membership{*m})
	if err != nil {
		return nil, err
	}
	return &Out[Member]{Body: out[0]}, nil
}

func (s *server) registerMembers(g huma.API) {
	huma.Get(g, "/members", s.listMembers, auth.ForAll)
	huma.Post(g, "/members", s.createMember, status(http.StatusCreated), auth.ForManagers)
	huma.Patch(g, "/members/{id}", s.patchMember, auth.ForManagers)
	huma.Delete(g, "/members/{id}", s.deleteMember, status(http.StatusNoContent), auth.ForManagers)
}

func (s *server) listMembers(ctx context.Context, _ *struct{}) (*Out[[]Member], error) {
	var ms []model.Membership
	if err := s.scoped(ctx).Preload("User").Order("role, first_name, last_name").Find(&ms).Error; err != nil {
		return nil, dbErr(err, "members")
	}
	out, err := s.toMembers(ctx, ms)
	if err != nil {
		return nil, err
	}
	return &Out[[]Member]{Body: out}, nil
}

func (s *server) createMember(ctx context.Context, in *struct{ Body MemberCreate }) (*Out[Member], error) {
	b := in.Body
	if b.Role == model.RoleOwner {
		if err := auth.RequireRole(ctx, model.RoleOwner); err != nil {
			return nil, err
		}
	}
	m := model.Membership{AccountID: accountID(ctx), Role: b.Role, FirstName: b.FirstName, LastName: b.LastName, Phone: b.Phone, Color: b.Color}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var u model.User
		err := tx.Where("email = ?", normEmail(b.Email)).First(&u).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			if len(b.Password) < auth.MinPasswordLength {
				return invalid("password", "a new user needs a password of at least 8 characters")
			}
			hash, err := auth.HashPassword(b.Password)
			if err != nil {
				return err
			}
			u = model.User{Email: normEmail(b.Email), PasswordHash: hash, Name: strings.TrimSpace(b.FirstName + " " + b.LastName)}
			if err := tx.Create(&u).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		} else {
			// existing account: the user accepts the invitation; the password stays theirs
			m.Pending = true
		}
		m.UserID = u.ID
		m.User = u
		if err := tx.Create(&m).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				return conflict(CodeAlreadyExists, "user is already a member")
			}
			return err
		}
		return nil
	})
	if err != nil {
		return nil, wrapTx(err, "member")
	}
	return s.memberOut(ctx, &m)
}

// wrapTx passes huma errors from a transaction through, maps the rest.
func wrapTx(err error, what string) error {
	var se huma.StatusError
	if errors.As(err, &se) {
		return err
	}
	return dbErr(err, what)
}

func (s *server) loadMember(ctx context.Context, id uint) (*model.Membership, error) {
	var m model.Membership
	if err := s.scoped(ctx).Preload("User").First(&m, id).Error; err != nil {
		return nil, dbErr(err, "member")
	}
	if m.Role == model.RoleOwner {
		if err := auth.RequireRole(ctx, model.RoleOwner); err != nil {
			return nil, err
		}
	}
	return &m, nil
}

func (s *server) patchMember(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body MemberPatch
}) (*Out[Member], error) {
	m, err := s.loadMember(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	b := in.Body
	if b.Password != nil {
		managed, err := passwordManaged(s.db.WithContext(ctx), m.AccountID, []uint{m.UserID})
		if err != nil {
			return nil, dbErr(err, "member")
		}
		if !managed[m.UserID] || m.Pending {
			return nil, conflict(CodePasswordNotManaged, "the user belongs to another firm too and changes the password alone")
		}
	}
	if b.Role != nil && *b.Role != m.Role {
		if *b.Role == model.RoleOwner {
			if err := auth.RequireRole(ctx, model.RoleOwner); err != nil {
				return nil, err
			}
		}
		if m.Role == model.RoleOwner {
			if err := s.ensureAnotherOwner(ctx, m); err != nil {
				return nil, err
			}
		}
		m.Role = *b.Role
	}
	apply(&m.FirstName, b.FirstName)
	apply(&m.LastName, b.LastName)
	apply(&m.Phone, b.Phone)
	apply(&m.Color, b.Color)
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(m).Select("role", "first_name", "last_name", "phone", "color").Updates(m).Error; err != nil {
			return err
		}
		if b.Password != nil {
			hash, err := auth.HashPassword(*b.Password)
			if err != nil {
				return err
			}
			if err := tx.Model(&m.User).Update("password_hash", hash).Error; err != nil {
				return err
			}
			return revokeCredentials(tx, m.UserID, "")
		}
		return nil
	})
	if err != nil {
		return nil, dbErr(err, "member")
	}
	return s.memberOut(ctx, m)
}

func (s *server) ensureAnotherOwner(ctx context.Context, m *model.Membership) error {
	var n int64
	if err := s.scoped(ctx).Model(&model.Membership{}).Where("role = ? AND pending = ? AND id <> ?", model.RoleOwner, false, m.ID).Count(&n).Error; err != nil {
		return dbErr(err, "member")
	}
	if n == 0 {
		return conflict(CodeLastOwner, "the firm needs at least one owner")
	}
	return nil
}

func (s *server) deleteMember(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*NoContent, error) {
	m, err := s.loadMember(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if m.Role == model.RoleOwner {
		if err := s.ensureAnotherOwner(ctx, m); err != nil {
			return nil, err
		}
	}
	if err := s.db.WithContext(ctx).Delete(m).Error; err != nil {
		return nil, dbErr(err, "member")
	}
	return &NoContent{}, nil
}
