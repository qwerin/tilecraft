package api

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"slices"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/httpsec"
	"github.com/qwerin/tilecraft/internal/model"
	"github.com/qwerin/tilecraft/internal/storage"
)

// maxLogo is the largest accepted logo.
const maxLogo = 2 << 20

// logoTypes are the accepted logo formats (sniffed, not trusted from the client; no SVG).
var logoTypes = []string{"image/png", "image/jpeg", "image/webp", "image/gif"}

// logoURL is the logo's address; the storage key in the query busts caches after a new upload.
func logoURL(a *model.Account) string {
	if a.LogoKey == "" {
		return ""
	}
	return fmt.Sprintf("/api/accounts/%s/logo?v=%s", a.Slug, a.LogoKey[strings.LastIndex(a.LogoKey, "/")+1:])
}

func (s *server) registerLogo(account huma.API) {
	huma.Delete(account, "/logo", s.deleteLogo, status(http.StatusNoContent), auth.ForManagers)
}

// uploadLogo replaces the firm's logo with the first file of a multipart body (owners and admins).
func (s *server) uploadLogo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if err := auth.RequireRole(ctx, auth.RolesManagers...); err != nil {
		httpsec.WriteProblem(w, http.StatusForbidden, "forbidden", "only owners and admins may change the logo")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxLogo+1<<20)
	mr, err := r.MultipartReader()
	if err != nil {
		httpsec.WriteProblem(w, http.StatusBadRequest, "bad_request", "multipart body expected")
		return
	}
	var data []byte
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			httpsec.WriteProblem(w, http.StatusRequestEntityTooLarge, "too_large", "logo is too large (max 2 MB)")
			return
		}
		if part.FileName() == "" {
			continue
		}
		if data, err = io.ReadAll(io.LimitReader(part, maxLogo+1)); err != nil {
			httpsec.WriteProblem(w, http.StatusBadRequest, "bad_request", "reading the file failed")
			return
		}
		break
	}
	if len(data) == 0 {
		httpsec.WriteProblem(w, http.StatusBadRequest, "bad_request", "no file")
		return
	}
	if len(data) > maxLogo {
		httpsec.WriteProblem(w, http.StatusRequestEntityTooLarge, "too_large", "logo is too large (max 2 MB)")
		return
	}
	ct := http.DetectContentType(data)
	if !slices.Contains(logoTypes, ct) {
		httpsec.WriteProblem(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "logo must be PNG, JPEG, WebP or GIF")
		return
	}
	acc := auth.AccountFrom(ctx)
	key := fmt.Sprintf("%d/logo-%s", acc.ID, randomHex())
	if err := s.deps.Storage.Put(ctx, key, bytes.NewReader(data)); err != nil {
		httpsec.WriteProblem(w, http.StatusInternalServerError, "internal", "storing the logo failed")
		return
	}
	old := acc.LogoKey
	if err := s.db.WithContext(ctx).Model(&model.Account{}).Where("id = ?", acc.ID).
		Updates(map[string]any{"logo_key": key, "logo_type": ct}).Error; err != nil {
		_ = s.deps.Storage.Delete(ctx, key)
		httpsec.WriteProblem(w, http.StatusInternalServerError, "internal", "saving the logo failed")
		return
	}
	if old != "" {
		_ = s.deps.Storage.Delete(ctx, old)
	}
	acc.LogoKey, acc.LogoType = key, ct
	writeJSON(w, http.StatusOK, toAccount(ctx, acc))
}

// downloadLogo serves the logo to every member.
func (s *server) downloadLogo(w http.ResponseWriter, r *http.Request) {
	s.serveLogo(w, r, auth.AccountFrom(r.Context()))
}

// publicQuoteLogo serves the firm's logo on the customer's quote page.
func (s *server) publicQuoteLogo(w http.ResponseWriter, r *http.Request) {
	_, acc, err := s.loadPublicQuote(r.Context(), chi.URLParam(r, "token"))
	if err != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "no logo")
		return
	}
	s.serveLogo(w, r, acc)
}

func (s *server) serveLogo(w http.ResponseWriter, r *http.Request, acc *model.Account) {
	ctx := r.Context()
	if acc.LogoKey == "" {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "no logo")
		return
	}
	f, err := s.deps.Storage.Get(ctx, acc.LogoKey)
	if err != nil {
		code := http.StatusInternalServerError
		if errors.Is(err, storage.ErrNotFound) {
			code = http.StatusNotFound
		}
		httpsec.WriteProblem(w, code, statusCodes[code], "logo is not available")
		return
	}
	defer f.Close()
	h := w.Header()
	h.Set("Content-Type", acc.LogoType)
	h.Set("Content-Security-Policy", "sandbox; default-src 'none'")
	h.Set("Cache-Control", "private, max-age=86400")
	_, _ = io.Copy(w, f)
}

func (s *server) deleteLogo(ctx context.Context, _ *struct{}) (*NoContent, error) {
	acc := auth.AccountFrom(ctx)
	if acc.LogoKey == "" {
		return &NoContent{}, nil
	}
	if err := s.db.WithContext(ctx).Model(&model.Account{}).Where("id = ?", acc.ID).
		Updates(map[string]any{"logo_key": "", "logo_type": ""}).Error; err != nil {
		return nil, dbErr(err, "account")
	}
	_ = s.deps.Storage.Delete(ctx, acc.LogoKey)
	return &NoContent{}, nil
}
