package auth

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/model"
)

// APITokenPrefix starts every API token.
const APITokenPrefix = "tc_"

// newToken returns prefix + 32 random bytes (base64url) and its storage hash.
func newToken(prefix string) (plain, hash string) {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	plain = prefix + base64.RawURLEncoding.EncodeToString(b)
	return plain, hashToken(plain)
}

// NewSecret returns a random URL-safe secret and the hash to store; look it
// up later by HashSecret(plain).
func NewSecret() (plain, hash string) { return newToken("") }

// HashSecret returns the storage hash of a secret from NewSecret.
func HashSecret(plain string) string { return hashToken(plain) }

// CreateAPIToken stores a new API token (expiresAt nil = no expiry); the
// plaintext is returned only here.
func (s *Service) CreateAPIToken(ctx context.Context, userID uint, name string, expiresAt *time.Time) (string, *model.APIToken, error) {
	plain, tok := NewAPIToken(userID, name, expiresAt)
	if err := s.db.WithContext(ctx).Create(tok).Error; err != nil {
		return "", nil, err
	}
	return plain, tok, nil
}

// NewAPIToken builds an unsaved API token (callers inside a transaction save it with their tx).
func NewAPIToken(userID uint, name string, expiresAt *time.Time) (string, *model.APIToken) {
	plain, hash := newToken(APITokenPrefix)
	return plain, &model.APIToken{UserID: userID, Name: name, TokenHash: hash, Prefix: plain[:8], ExpiresAt: expiresAt}
}

// UserByAPIToken returns the owner of a valid, unexpired API token;
// ErrInvalidCredentials otherwise.
func (s *Service) UserByAPIToken(ctx context.Context, plain string) (*model.User, error) {
	u, _, err := s.apiToken(ctx, plain)
	return u, err
}

func (s *Service) apiToken(ctx context.Context, plain string) (*model.User, *model.APIToken, error) {
	if !strings.HasPrefix(plain, APITokenPrefix) {
		return nil, nil, ErrInvalidCredentials
	}
	db := s.db.WithContext(ctx)
	now := s.now()
	var tok model.APIToken
	if err := db.Where("token_hash = ? AND (expires_at IS NULL OR expires_at > ?)", hashToken(plain), now).First(&tok).Error; err != nil {
		return nil, nil, notFoundAs(err)
	}
	var u model.User
	if err := db.First(&u, tok.UserID).Error; err != nil {
		return nil, nil, notFoundAs(err)
	}
	// last use with minute precision (no write on every request)
	if tok.LastUsedAt == nil || now.Sub(*tok.LastUsedAt) >= time.Minute {
		if err := db.Model(&tok).Update("last_used_at", now).Error; err != nil {
			return nil, nil, err
		}
	}
	return &u, &tok, nil
}

// DeleteExpired removes expired sessions and API tokens (cleanup job).
func DeleteExpired(db *gorm.DB, now time.Time) error {
	if err := db.Where("expires_at <= ?", now).Delete(&model.Session{}).Error; err != nil {
		return err
	}
	return db.Where("expires_at IS NOT NULL AND expires_at <= ?", now).Delete(&model.APIToken{}).Error
}
