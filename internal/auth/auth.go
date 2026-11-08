// Package auth implements password hashing, cookie sessions, API tokens and the huma
// middlewares that authenticate requests and resolve the current firm.
package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/model"
)

const (
	// SessionCookie is the name of the session cookie.
	SessionCookie = "tc_session"
	// SessionTTL is the sliding session lifetime.
	SessionTTL     = 30 * 24 * time.Hour
	sessionRefresh = 24 * time.Hour
	// MinPasswordLength is the minimum accepted password length.
	MinPasswordLength = 8
	// MaxPasswordBytes is bcrypt's input limit.
	MaxPasswordBytes = 72
)

// ErrInvalidCredentials means an unknown or expired session/token.
var ErrInvalidCredentials = errors.New("invalid credentials")

var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("tilecraft-dummy"), bcrypt.DefaultCost)

// HashPassword returns a bcrypt hash of password.
func HashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(h), err
}

// CheckPassword reports whether password matches hash; an empty hash still
// costs one comparison so timing does not reveal unknown users.
func CheckPassword(hash, password string) bool {
	if hash == "" {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// Service manages sessions and API tokens.
type Service struct {
	db          *gorm.DB
	now         func() time.Time
	secure      func(context.Context) bool
	superadmins map[string]bool
}

// NewService: secure decides per request whether the cookie is Secure;
// superadmins are the e-mails of users who may open every firm.
func NewService(db *gorm.DB, now func() time.Time, secure func(context.Context) bool, superadmins []string) *Service {
	sa := map[string]bool{}
	for _, e := range superadmins {
		sa[strings.ToLower(strings.TrimSpace(e))] = true
	}
	return &Service{db: db, now: now, secure: secure, superadmins: sa}
}

// CreateSession stores a new session for userID and returns the cookie to set.
func (s *Service) CreateSession(ctx context.Context, userID uint) (*http.Cookie, error) {
	plain, hash := newToken("")
	sess := model.Session{UserID: userID, TokenHash: hash, ExpiresAt: s.now().Add(SessionTTL)}
	if err := s.db.WithContext(ctx).Create(&sess).Error; err != nil {
		return nil, err
	}
	return s.cookie(ctx, plain, sess.ExpiresAt), nil
}

// DeleteSession removes the session identified by the cookie value.
func (s *Service) DeleteSession(ctx context.Context, token string) error {
	return s.db.WithContext(ctx).Where("token_hash = ?", hashToken(token)).Delete(&model.Session{}).Error
}

// DeleteOtherSessions removes all sessions of userID except keepToken's.
func DeleteOtherSessions(db *gorm.DB, userID uint, keepToken string) error {
	q := db.Where("user_id = ?", userID)
	if keepToken != "" {
		q = q.Where("token_hash <> ?", hashToken(keepToken))
	}
	return q.Delete(&model.Session{}).Error
}

// ClearCookie returns a cookie that removes the session cookie.
func (s *Service) ClearCookie(ctx context.Context) *http.Cookie {
	c := s.cookie(ctx, "", time.Time{})
	c.MaxAge = -1
	return c
}

func (s *Service) cookie(ctx context.Context, value string, expires time.Time) *http.Cookie {
	return &http.Cookie{Name: SessionCookie, Value: value, Path: "/", Expires: expires,
		HttpOnly: true, Secure: s.secure(ctx), SameSite: http.SameSiteLaxMode}
}

func (s *Service) userBySession(ctx context.Context, token string) (*model.User, *http.Cookie, error) {
	db := s.db.WithContext(ctx)
	now := s.now()
	var sess model.Session
	if err := db.Where("token_hash = ? AND expires_at > ?", hashToken(token), now).First(&sess).Error; err != nil {
		return nil, nil, notFoundAs(err)
	}
	var u model.User
	if err := db.First(&u, sess.UserID).Error; err != nil {
		return nil, nil, notFoundAs(err)
	}
	var refreshed *http.Cookie
	if sess.ExpiresAt.Sub(now) < SessionTTL-sessionRefresh {
		sess.ExpiresAt = now.Add(SessionTTL)
		if err := db.Model(&sess).Update("expires_at", sess.ExpiresAt).Error; err != nil {
			return nil, nil, err
		}
		refreshed = s.cookie(ctx, token, sess.ExpiresAt)
	}
	return &u, refreshed, nil
}

func notFoundAs(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrInvalidCredentials
	}
	return err
}

func hashToken(plain string) string {
	sum := sha256.Sum256([]byte(plain))
	return hex.EncodeToString(sum[:])
}
