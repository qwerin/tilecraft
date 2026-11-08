package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/qwerin/tilecraft/internal/auth"
)

// Out is the generic huma output: the body is the JSON response as-is.
type Out[T any] struct {
	Body T
}

// NoContent is the output of operations answering 204.
type NoContent struct{}

// ErrorModel is huma's RFC 9457 model plus a machine-readable code.
type ErrorModel struct {
	huma.ErrorModel
	Code string `json:"code,omitempty" doc:"Machine-readable reason (snake_case)"`
}

// Error codes of domain errors. Keep in sync with web/src/api/errors.ts.
const (
	CodeValidation         = "validation_failed"
	CodeAlreadyExists      = "already_exists"
	CodeEmailTaken         = "email_taken"
	CodeSignupDisabled     = "signup_disabled"
	CodeSignupCodeRequired = "signup_code_required"
	CodeSignupCodeInvalid  = "signup_code_invalid"
	CodeSuperadminOnly     = "superadmin_only"
	CodeWrongPassword      = "wrong_password"
	CodeReferenced         = "referenced"
	CodeLastOwner          = "last_owner"
	CodeInvoiced           = "invoiced"
	CodeNothingToBill      = "nothing_to_bill"
	CodeNumberTaken        = "number_taken"
	CodePasswordNotManaged = "password_not_managed"
	CodeRateLimited        = "rate_limited"
	CodeQuoteLocked        = "quote_locked"
	CodeJobExists          = "job_exists"
	CodeNotAccepted        = "not_accepted"
	CodeNoEmail            = "no_email"

	CodeOAuthInvalidClient   = "oauth_invalid_client"
	CodeOAuthInvalidRedirect = "oauth_invalid_redirect"
	CodeOAuthSessionRequired = "oauth_session_required"
)

var statusCodes = map[int]string{
	400: "bad_request", 401: "unauthorized", 403: "forbidden", 404: "not_found", 409: "conflict",
	413: "too_large", 415: "unsupported_media_type", 422: CodeValidation, 429: "rate_limited", 500: "internal",
}

func init() {
	huma.NewError = func(status int, msg string, errs ...error) huma.StatusError {
		return newErrorModel(status, statusCodes[status], msg, errs...)
	}
}

func newErrorModel(status int, code, msg string, errs ...error) *ErrorModel {
	e := &ErrorModel{ErrorModel: huma.ErrorModel{Status: status, Title: http.StatusText(status), Detail: msg}, Code: code}
	for _, err := range errs {
		if err == nil {
			continue
		}
		var d *huma.ErrorDetail
		if !errors.As(err, &d) && status >= 500 {
			slog.Error("request failed", "status", status, "msg", msg, "err", err)
			continue
		}
		if d != nil && strings.Contains(strings.ToLower(d.Location), "password") {
			d.Value = nil
		}
		e.Add(err)
	}
	return e
}

func apiError(status int, code, msg string, errs ...error) error {
	return newErrorModel(status, code, msg, errs...)
}

func status(code int) func(*huma.Operation) {
	return func(o *huma.Operation) { o.DefaultStatus = code }
}

// scoped returns a query limited to the current firm.
func (s *server) scoped(ctx context.Context) *gorm.DB {
	return s.db.WithContext(ctx).Scopes(inAccount(ctx))
}

// inAccount is a GORM scope filtering by the current firm.
func inAccount(ctx context.Context) func(*gorm.DB) *gorm.DB {
	id := auth.AccountFrom(ctx).ID
	return func(db *gorm.DB) *gorm.DB {
		return db.Where(clause.Eq{Column: clause.Column{Table: clause.CurrentTable, Name: "account_id"}, Value: id})
	}
}

// isManager reports whether the current member sees prices (owner, admin).
func isManager(ctx context.Context) bool {
	return slices.Contains(auth.RolesManagers, auth.MemberFrom(ctx).Role)
}

func accountID(ctx context.Context) uint { return auth.AccountFrom(ctx).ID }

func apply[T any](dst *T, src *T) {
	if src != nil {
		*dst = *src
	}
}

func dbErr(err error, what string) error {
	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		return notFound(what)
	case errors.Is(err, gorm.ErrDuplicatedKey):
		return apiError(http.StatusConflict, CodeAlreadyExists, what+" already exists")
	default:
		return huma.Error500InternalServerError("database error", err)
	}
}

func notFound(what string) error { return huma.Error404NotFound(what + " not found") }

func conflict(code, msg string) error { return apiError(http.StatusConflict, code, msg) }

func invalid(field, msg string) error {
	return huma.NewError(http.StatusUnprocessableEntity, "validation failed",
		&huma.ErrorDetail{Location: "body." + field, Message: msg})
}

// PageParams are the ?page=&per_page= query parameters.
type PageParams struct {
	Page    int `query:"page" minimum:"1" default:"1"`
	PerPage int `query:"per_page" minimum:"1" maximum:"500" default:"50"`
}

// ListResponse is the envelope of every paginated list.
type ListResponse[T any] struct {
	Items   []T   `json:"items" nullable:"false"`
	Page    int   `json:"page"`
	PerPage int   `json:"per_page"`
	Total   int64 `json:"total"`
}

func paginate[M, T any](q *gorm.DB, p PageParams, conv func(*M) T) (*Out[ListResponse[T]], error) {
	if q.Statement.Model == nil && q.Statement.Table == "" {
		q = q.Model(new(M))
	}
	q = q.Session(&gorm.Session{})
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, dbErr(err, "records")
	}
	var rows []M
	if err := q.Offset((p.Page - 1) * p.PerPage).Limit(p.PerPage).Find(&rows).Error; err != nil {
		return nil, dbErr(err, "records")
	}
	items := make([]T, len(rows))
	for i := range rows {
		items[i] = conv(&rows[i])
	}
	return &Out[ListResponse[T]]{Body: ListResponse[T]{Items: items, Page: p.Page, PerPage: p.PerPage, Total: total}}, nil
}

// all loads every row of q and converts it (small lookup tables).
func all[M, T any](q *gorm.DB, conv func(*M) T) (*Out[[]T], error) {
	var rows []M
	if err := q.Find(&rows).Error; err != nil {
		return nil, dbErr(err, "records")
	}
	out := make([]T, len(rows))
	for i := range rows {
		out[i] = conv(&rows[i])
	}
	return &Out[[]T]{Body: out}, nil
}

func defaultStr(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

// like returns a case-insensitive LIKE pattern.
func like(s string) string { return "%" + strings.ToLower(strings.TrimSpace(s)) + "%" }

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
