package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/httpsec"
	"github.com/qwerin/tilecraft/internal/model"
	"github.com/qwerin/tilecraft/internal/storage"
)

// Photos and files of quotes and jobs (SPEC §6.1). A file belongs to a quote,
// a job or both: creating the job from a quote links the quote's files to it.
// Workers (parťáci) see and upload only files of jobs; laying plans of a
// quote marked shared are served to the customer through the quote's token.

// Attachment is a photo or file of a quote or job.
type Attachment struct {
	ID          uint      `json:"id"`
	Category    string    `json:"category" enum:"before,during,after,plan,other" doc:"before = original state, during = during the work, after = finished job, plan = laying plan, other"`
	Shared      bool      `json:"shared" doc:"Laying plan shown to the customer (public quote page and quote PDF)"`
	QuoteID     *uint     `json:"quote_id"`
	JobID       *uint     `json:"job_id"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	Size        int64     `json:"size"`
	URL         string    `json:"url"`
	UploadedBy  uint      `json:"uploaded_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// AttachmentPatch changes the category of a file or shows a laying plan to the customer.
type AttachmentPatch struct {
	Category *string `json:"category,omitempty" enum:"before,during,after,plan,other"`
	Shared   *bool   `json:"shared,omitempty" doc:"Show the laying plan to the customer (category plan of a quote; office only)"`
}

func (s *server) registerAttachments(g huma.API) {
	huma.Get(g, "/attachments", s.listAttachments, auth.ForAll)
	huma.Patch(g, "/attachments/{id}", s.patchAttachment, auth.ForAll)
	huma.Delete(g, "/attachments/{id}", s.deleteAttachment, status(http.StatusNoContent), auth.ForAll)
}

func toAttachment(slug string, a *model.Attachment) Attachment {
	return Attachment{ID: a.ID, Category: a.Category, Shared: a.Shared, QuoteID: a.QuoteID, JobID: a.JobID, Filename: a.Filename,
		ContentType: a.ContentType, Size: a.Size, UploadedBy: a.UploadedBy, CreatedAt: a.CreatedAt,
		URL: fmt.Sprintf("/api/accounts/%s/attachments/%d", slug, a.ID)}
}

// visibleAttachments are the firm's files the caller may see: workers only those of jobs.
func (s *server) visibleAttachments(ctx context.Context) *gorm.DB {
	q := s.scoped(ctx).Model(&model.Attachment{})
	if !isManager(ctx) {
		q = q.Where("job_id IS NOT NULL")
	}
	return q
}

// attachmentsOf lists the files of a quote (col "quote_id") or job ("job_id").
func (s *server) attachmentsOf(ctx context.Context, col string, id uint) ([]Attachment, error) {
	var atts []model.Attachment
	if err := s.visibleAttachments(ctx).Where(col+" = ?", id).Order("id").Find(&atts).Error; err != nil {
		return nil, dbErr(err, "attachments")
	}
	slug := auth.AccountFrom(ctx).Slug
	out := make([]Attachment, len(atts))
	for i := range atts {
		out[i] = toAttachment(slug, &atts[i])
	}
	return out, nil
}

func validCategory(c string) bool { return slices.Contains(model.AttachmentCategories, c) }

// jobCategory is the default category of a photo of a job in the state.
func jobCategory(state string) string {
	switch state {
	case model.JobPlanned:
		return model.AttachBefore
	case model.JobInProgress:
		return model.AttachDuring
	case model.JobDone, model.JobInvoiced:
		return model.AttachAfter
	}
	return model.AttachOther
}

// linkQuoteFiles attaches the files of a quote to the job made from it.
func linkQuoteFiles(ctx context.Context, tx *gorm.DB, quoteID, jobID uint) error {
	return tx.Model(&model.Attachment{}).Scopes(inAccount(ctx)).Where("quote_id = ? AND job_id IS NULL", quoteID).
		Update("job_id", jobID).Error
}

// detachJobFiles deletes the rows of the job's own files and unlinks the
// quote's files; it returns the storage keys to delete after the transaction.
func detachJobFiles(tx *gorm.DB, jobID uint) ([]string, error) {
	var keys []string
	own := tx.Model(&model.Attachment{}).Where("job_id = ? AND quote_id IS NULL", jobID)
	if err := own.Pluck("storage_key", &keys).Error; err != nil {
		return nil, err
	}
	if err := tx.Where("job_id = ? AND quote_id IS NULL", jobID).Delete(&model.Attachment{}).Error; err != nil {
		return nil, err
	}
	return keys, tx.Model(&model.Attachment{}).Where("job_id = ?", jobID).Update("job_id", nil).Error
}

// deleteQuoteFiles deletes the rows of a quote's files (the quote has no job);
// it returns the storage keys to delete after the transaction.
func deleteQuoteFiles(tx *gorm.DB, quoteID uint) ([]string, error) {
	var keys []string
	if err := tx.Model(&model.Attachment{}).Where("quote_id = ? AND job_id IS NULL", quoteID).Pluck("storage_key", &keys).Error; err != nil {
		return nil, err
	}
	return keys, tx.Where("quote_id = ? AND job_id IS NULL", quoteID).Delete(&model.Attachment{}).Error
}

func (s *server) listAttachments(ctx context.Context, in *struct {
	QuoteID  uint   `query:"quote_id" doc:"Files of this quote"`
	JobID    uint   `query:"job_id" doc:"Files of this job (including the files of its quote)"`
	Category string `query:"category" doc:"before, during, after, plan, other; comma separated"`
}) (*Out[[]Attachment], error) {
	q := s.visibleAttachments(ctx).Order("id DESC").Limit(500)
	if in.QuoteID != 0 {
		q = q.Where("quote_id = ?", in.QuoteID)
	}
	if in.JobID != 0 {
		q = q.Where("job_id = ?", in.JobID)
	}
	if in.Category != "" {
		cats := strings.Split(in.Category, ",")
		for _, c := range cats {
			if !validCategory(c) {
				return nil, huma.Error422UnprocessableEntity("unknown category " + c)
			}
		}
		q = q.Where("category IN ?", cats)
	}
	var atts []model.Attachment
	if err := q.Find(&atts).Error; err != nil {
		return nil, dbErr(err, "attachments")
	}
	slug := auth.AccountFrom(ctx).Slug
	out := make([]Attachment, len(atts))
	for i := range atts {
		out[i] = toAttachment(slug, &atts[i])
	}
	return &Out[[]Attachment]{Body: out}, nil
}

// loadAttachment loads a file the caller may change: workers only their own files of jobs.
func (s *server) loadAttachment(ctx context.Context, id uint) (*model.Attachment, error) {
	var a model.Attachment
	if err := s.visibleAttachments(ctx).First(&a, id).Error; err != nil {
		return nil, dbErr(err, "attachment")
	}
	if a.UploadedBy != auth.UserFrom(ctx).ID && !isManager(ctx) {
		return nil, huma.Error403Forbidden("only your own files")
	}
	return &a, nil
}

func (s *server) patchAttachment(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body AttachmentPatch
}) (*Out[Attachment], error) {
	a, err := s.loadAttachment(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if c := in.Body.Category; c != nil {
		a.Category = *c
	}
	if in.Body.Shared != nil {
		if !isManager(ctx) {
			return nil, huma.Error403Forbidden("only the office shows files to the customer")
		}
		a.Shared = *in.Body.Shared
	}
	if a.Shared && (a.Category != model.AttachPlan || a.QuoteID == nil) {
		if in.Body.Shared != nil && *in.Body.Shared {
			return nil, invalid("shared", "only a laying plan (category plan) of a quote can be shown to the customer")
		}
		a.Shared = false // moved out of the plans: no longer shown
	}
	if err := s.scoped(ctx).Model(a).Updates(map[string]any{"category": a.Category, "shared": a.Shared}).Error; err != nil {
		return nil, dbErr(err, "attachment")
	}
	return &Out[Attachment]{Body: toAttachment(auth.AccountFrom(ctx).Slug, a)}, nil
}

func (s *server) deleteAttachment(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*NoContent, error) {
	a, err := s.loadAttachment(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if err := s.scoped(ctx).Delete(a).Error; err != nil {
		return nil, dbErr(err, "attachment")
	}
	_ = s.deps.Storage.Delete(ctx, a.StorageKey)
	return &NoContent{}, nil
}

// maxUpload bounds one uploaded file.
const maxUpload = 50 << 20

// uploadJobAttachment: POST /jobs/{id}/attachments?category= (everyone; default category by the job's state).
func (s *server) uploadJobAttachment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, _ := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	j, err := s.loadJob(ctx, s.db.WithContext(ctx), uint(id))
	if err != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "job not found")
		return
	}
	// a file of the job only (not shown on the quote; deleted with the job)
	s.saveUploads(w, r, model.Attachment{JobID: &j.ID, Category: jobCategory(j.State)})
}

// uploadQuoteAttachment: POST /quotes/{id}/attachments?category= (office; default category before).
func (s *server) uploadQuoteAttachment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if !isManager(ctx) {
		httpsec.WriteProblem(w, http.StatusForbidden, "forbidden", "quotes are for the office")
		return
	}
	id, _ := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	q, err := s.loadQuote(ctx, s.db.WithContext(ctx), uint(id))
	if err != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "quote not found")
		return
	}
	base := model.Attachment{QuoteID: &q.ID, Category: model.AttachBefore}
	var j model.Job
	if err := s.scoped(ctx).Select("id").Where("quote_id = ?", q.ID).Take(&j).Error; err == nil {
		base.JobID = &j.ID // the job made from the quote gets the file too
	}
	s.saveUploads(w, r, base)
}

// saveUploads stores the files of a multipart body as attachments like base.
// The category comes from ?category= or a form field "category" before the files.
func (s *server) saveUploads(w http.ResponseWriter, r *http.Request, base model.Attachment) {
	ctx := r.Context()
	acc := auth.AccountFrom(ctx)
	base.AccountID, base.UploadedBy = acc.ID, auth.UserFrom(ctx).ID
	setCategory := func(c string) bool {
		if c == "" {
			return true
		}
		base.Category = c
		return validCategory(c)
	}
	if !setCategory(r.URL.Query().Get("category")) {
		httpsec.WriteProblem(w, http.StatusUnprocessableEntity, "validation_failed", "unknown category")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload+1<<20)
	mr, err := r.MultipartReader()
	if err != nil {
		httpsec.WriteProblem(w, http.StatusBadRequest, "bad_request", "multipart body expected")
		return
	}
	saved := []Attachment{}
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			httpsec.WriteProblem(w, http.StatusRequestEntityTooLarge, "too_large", "file is too large (max 50 MB)")
			return
		}
		if part.FileName() == "" {
			if part.FormName() == "category" {
				v, _ := io.ReadAll(io.LimitReader(part, 32))
				if !setCategory(strings.TrimSpace(string(v))) {
					httpsec.WriteProblem(w, http.StatusUnprocessableEntity, "validation_failed", "unknown category")
					return
				}
			}
			continue
		}
		key := fmt.Sprintf("%d/%s", acc.ID, randomHex())
		cr := &countingReader{r: io.LimitReader(part, maxUpload+1)}
		if err := s.deps.Storage.Put(ctx, key, cr); err != nil {
			httpsec.WriteProblem(w, http.StatusInternalServerError, "internal", "storing the file failed")
			return
		}
		if cr.n > maxUpload {
			_ = s.deps.Storage.Delete(ctx, key)
			httpsec.WriteProblem(w, http.StatusRequestEntityTooLarge, "too_large", "file is too large (max 50 MB)")
			return
		}
		name := filepath.Base(part.FileName())
		ct := part.Header.Get("Content-Type")
		if ct == "" || ct == "application/octet-stream" {
			if t := mime.TypeByExtension(strings.ToLower(filepath.Ext(name))); t != "" {
				ct = t
			}
		}
		a := base
		a.Filename, a.ContentType, a.Size, a.StorageKey = name, ct, cr.n, key
		if err := s.db.WithContext(ctx).Create(&a).Error; err != nil {
			_ = s.deps.Storage.Delete(ctx, key)
			httpsec.WriteProblem(w, http.StatusInternalServerError, "internal", "saving the file failed")
			return
		}
		saved = append(saved, toAttachment(acc.Slug, &a))
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (s *server) downloadAttachment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, _ := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	var a model.Attachment
	if err := s.visibleAttachments(ctx).First(&a, id).Error; err != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "attachment not found")
		return
	}
	s.serveAttachment(w, r, &a, "private, max-age=3600")
}

// publicQuoteFile serves a laying plan shown to the customer: only a shared
// plan of the token's quote, anything else is 404.
func (s *server) publicQuoteFile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	q, _, err := s.loadPublicQuote(ctx, chi.URLParam(r, "token"))
	id, perr := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	var a model.Attachment
	if err != nil || perr != nil || s.db.WithContext(ctx).Where(sharedPlans, q.AccountID, q.ID, model.AttachPlan).First(&a, id).Error != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "file not found")
		return
	}
	s.serveAttachment(w, r, &a, "private, no-cache")
}

// sharedPlans selects the laying plans of a quote shown to the customer (account, quote, category).
const sharedPlans = "account_id = ? AND quote_id = ? AND category = ? AND shared"

// publicPlans are the laying plans the customer sees.
func (s *server) publicPlans(ctx context.Context, tx *gorm.DB, q *model.Quote) ([]model.Attachment, error) {
	var atts []model.Attachment
	err := tx.WithContext(ctx).Where(sharedPlans, q.AccountID, q.ID, model.AttachPlan).Order("id").Find(&atts).Error
	return atts, err
}

func (s *server) serveAttachment(w http.ResponseWriter, r *http.Request, a *model.Attachment, cache string) {
	f, err := s.deps.Storage.Get(r.Context(), a.StorageKey)
	if err != nil {
		code := http.StatusInternalServerError
		if errors.Is(err, storage.ErrNotFound) {
			code = http.StatusNotFound
		}
		httpsec.WriteProblem(w, code, statusCodes[code], "file is not available")
		return
	}
	defer f.Close()
	h := w.Header()
	h.Set("Content-Type", a.ContentType)
	h.Set("Content-Length", strconv.FormatInt(a.Size, 10))
	h.Set("Content-Security-Policy", "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'")
	disp := "attachment"
	if r.URL.Query().Get("inline") == "1" && inlineType(a.ContentType) {
		disp = "inline"
	}
	h.Set("Content-Disposition", mime.FormatMediaType(disp, map[string]string{"filename": a.Filename}))
	h.Set("Cache-Control", cache)
	_, _ = io.Copy(w, f)
}

func inlineType(ct string) bool {
	return strings.HasPrefix(ct, "image/") || strings.HasPrefix(ct, "video/") || ct == "application/pdf"
}
