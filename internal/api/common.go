package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/httpsec"
	"github.com/qwerin/tilecraft/internal/model"
)

// plainAccount authenticates plain (non-huma) handlers under /api/accounts/{slug}.
func (s *server) plainAccount(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, code := s.auth.Resolve(r, chi.URLParam(r, "slug"))
		if code != 0 {
			httpsec.WriteProblem(w, code, statusCodes[code], strings.ToLower(http.StatusText(code)))
			return
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// today is the current day in Prague (YYYY-MM-DD).
func (s *server) today() string { return day(s.deps.Now()) }

var prague = func() *time.Location {
	if l, err := time.LoadLocation("Europe/Prague"); err == nil {
		return l
	}
	return time.FixedZone("CET", 3600)
}()

func day(t time.Time) string { return t.In(prague).Format(time.DateOnly) }

// addDays adds n days to a YYYY-MM-DD date.
func addDays(d string, n int) string {
	t, err := time.Parse(time.DateOnly, d)
	if err != nil {
		return d
	}
	return t.AddDate(0, 0, n).Format(time.DateOnly)
}

func validDate(d string) bool {
	_, err := time.Parse(time.DateOnly, d)
	return err == nil
}

// invoiceDigits normalizes the digits of the invoice sequence (0 = default 3, 3–6).
func invoiceDigits(n int) int {
	if n == 0 {
		return 3
	}
	return max(3, min(n, 6))
}

// nextSeq increments the counter of series in year and returns the new value.
func nextSeq(tx *gorm.DB, accountID uint, series string, year int) (int64, error) {
	key := fmt.Sprintf("%s-%d", series, year)
	res := tx.Model(&model.Counter{}).Where("account_id = ? AND series = ?", accountID, key).Update("last", gorm.Expr("last + 1"))
	if res.Error != nil {
		return 0, res.Error
	}
	if res.RowsAffected == 0 {
		if err := tx.Create(&model.Counter{AccountID: accountID, Series: key, Last: 1}).Error; err != nil {
			return 0, err
		}
	}
	var c model.Counter
	if err := tx.Where("account_id = ? AND series = ?", accountID, key).First(&c).Error; err != nil {
		return 0, err
	}
	return c.Last, nil
}

// nextNumber returns prefix + two-digit year + sequence padded to digits
// (NA26001 for quotes, ZA26001 for jobs, 26001 for invoices).
func nextNumber(tx *gorm.DB, accountID uint, series, prefix string, year, digits int) (string, error) {
	n, err := nextSeq(tx, accountID, series, year)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%s%02d%0*d", prefix, year%100, digits, n), nil
}

func uniq(ids []uint) []uint {
	out := slices.Clone(ids)
	slices.Sort(out)
	return slices.Compact(out)
}

func randomHex() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}

func trimPtr(p *string) {
	if p != nil {
		*p = strings.TrimSpace(*p)
	}
}

func dbErrOrNil(err error, what string) error {
	if err != nil {
		return dbErr(err, what)
	}
	return nil
}

// freshAccount reloads the current firm (after a change in this request).
func (s *server) freshAccount(ctx context.Context) (*model.Account, error) {
	var acc model.Account
	if err := s.db.WithContext(ctx).First(&acc, accountID(ctx)).Error; err != nil {
		return nil, dbErr(err, "account")
	}
	return &acc, nil
}
