package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/calc"
	"github.com/qwerin/tilecraft/internal/httpsec"
	"github.com/qwerin/tilecraft/internal/model"
	"github.com/qwerin/tilecraft/internal/storage"
)

// JobInput creates or replaces a job (SPEC §6).
type JobInput struct {
	CustomerID  uint        `json:"customer_id"`
	Title       string      `json:"title" minLength:"1" maxLength:"200"`
	SiteAddress string      `json:"site_address,omitempty" maxLength:"300"`
	SiteContact string      `json:"site_contact,omitempty" maxLength:"300" doc:"Contact on the site (name, phone, key at the neighbour…)"`
	StartOn     string      `json:"start_on,omitempty" doc:"YYYY-MM-DD, empty = not scheduled"`
	EndOn       string      `json:"end_on,omitempty" doc:"YYYY-MM-DD"`
	Note        string      `json:"note,omitempty" maxLength:"10000"`
	VatRate     *int        `json:"vat_rate,omitempty" minimum:"0" maximum:"21"`
	Discount    float64     `json:"discount,omitempty" minimum:"0" maximum:"100"`
	WorkerIDs   []uint      `json:"worker_ids,omitempty" doc:"Member IDs of the crew (list_members)"`
	Rooms       []calc.Room `json:"rooms,omitempty"`
	Lines       []LineInput `json:"lines,omitempty" maxItems:"500"`
}

// JobStateInput moves a job to another state.
type JobStateInput struct {
	State string `json:"state" enum:"planned,in_progress,done,cancelled"`
}

// JobSummary is a job in lists and the calendar.
type JobSummary struct {
	ID          uint        `json:"id"`
	Number      string      `json:"number"`
	Title       string      `json:"title"`
	Customer    CustomerRef `json:"customer"`
	SiteAddress string      `json:"site_address"`
	State       string      `json:"state" enum:"planned,in_progress,done,invoiced,cancelled"`
	StartOn     string      `json:"start_on"`
	EndOn       string      `json:"end_on"`
	WorkerIDs   []uint      `json:"worker_ids" nullable:"false"`
	Total       int64       `json:"total" doc:"haléře with VAT (0 for workers)"`
	QuoteID     *uint       `json:"quote_id"`
}

// JobNote is a diary entry.
type JobNote struct {
	ID        uint      `json:"id"`
	On        string    `json:"on"`
	Text      string    `json:"text"`
	Author    string    `json:"author"`
	UserID    uint      `json:"user_id"`
	CreatedAt time.Time `json:"created_at"`
}

// JobNoteInput adds a diary entry.
type JobNoteInput struct {
	On   string `json:"on,omitempty" doc:"YYYY-MM-DD, default today"`
	Text string `json:"text" minLength:"1" maxLength:"5000"`
}

// Attachment is a photo or file of a job.
type Attachment struct {
	ID          uint      `json:"id"`
	Filename    string    `json:"filename"`
	ContentType string    `json:"content_type"`
	Size        int64     `json:"size"`
	URL         string    `json:"url"`
	UploadedBy  uint      `json:"uploaded_by"`
	CreatedAt   time.Time `json:"created_at"`
}

// QuoteRef is the quote a job came from, to compare with.
type QuoteRef struct {
	ID     uint        `json:"id"`
	Number string      `json:"number"`
	Totals calc.Totals `json:"totals"`
}

// Job is the full job; prices are zero for workers.
type Job struct {
	JobSummary
	SiteContact  string           `json:"site_contact"`
	Note         string           `json:"note"`
	VatRate      int              `json:"vat_rate"`
	Discount     float64          `json:"discount"`
	Rooms        []calc.Room      `json:"rooms" nullable:"false"`
	Measurements Measurements     `json:"measurements"`
	Lines        []Line           `json:"lines" nullable:"false"`
	Totals       calc.Totals      `json:"totals"`
	Quote        *QuoteRef        `json:"quote,omitempty" doc:"The quote the job came from (missing for workers and jobs without a quote)"`
	Notes        []JobNote        `json:"notes" nullable:"false"`
	Attachments  []Attachment     `json:"attachments" nullable:"false"`
	Invoices     []InvoiceSummary `json:"invoices" nullable:"false"`
	AppURL       string           `json:"app_url"`
}

func (s *server) registerJobs(g huma.API) {
	huma.Get(g, "/jobs", s.listJobs, auth.ForAll)
	huma.Get(g, "/jobs/{id}", s.getJob, auth.ForAll)
	huma.Post(g, "/jobs", s.createJob, status(http.StatusCreated), auth.ForManagers)
	huma.Post(g, "/quotes/{id}/job", s.createJobFromQuote, status(http.StatusCreated), auth.ForManagers)
	huma.Put(g, "/jobs/{id}", s.updateJob, auth.ForManagers)
	huma.Delete(g, "/jobs/{id}", s.deleteJob, status(http.StatusNoContent), auth.ForManagers)
	huma.Post(g, "/jobs/{id}/state", s.setJobState, auth.ForAll)
	huma.Post(g, "/jobs/{id}/notes", s.addJobNote, status(http.StatusCreated), auth.ForAll)
	huma.Delete(g, "/job-notes/{id}", s.deleteJobNote, status(http.StatusNoContent), auth.ForAll)
	huma.Delete(g, "/attachments/{id}", s.deleteAttachment, status(http.StatusNoContent), auth.ForAll)
}

func (s *server) toJobSummary(ctx context.Context, j *model.Job) JobSummary {
	w := j.WorkerIDs
	if w == nil {
		w = []uint{}
	}
	out := JobSummary{ID: j.ID, Number: j.Number, Title: j.Title, Customer: toCustomerRef(&j.Customer), SiteAddress: j.SiteAddress,
		State: j.State, StartOn: j.StartOn, EndOn: j.EndOn, WorkerIDs: w, Total: j.Total, QuoteID: j.QuoteID}
	if !isManager(ctx) {
		out.Total = 0
	}
	return out
}

func (s *server) listJobs(ctx context.Context, in *struct {
	State      string `query:"state" doc:"planned, in_progress, done, invoiced, cancelled; comma separated; \"open\" = planned + in_progress + done"`
	CustomerID uint   `query:"customer_id"`
	From       string `query:"from" doc:"Jobs running on or after this day (YYYY-MM-DD)"`
	To         string `query:"to" doc:"Jobs starting on or before this day"`
	Q          string `query:"q" doc:"Search number, title, customer, address"`
	PageParams
}) (*Out[ListResponse[JobSummary]], error) {
	q := s.scoped(ctx).Model(&model.Job{}).Preload("Customer").Order("CASE WHEN jobs.start_on = '' THEN 1 ELSE 0 END, jobs.start_on DESC, jobs.id DESC")
	if in.State != "" {
		states := strings.Split(in.State, ",")
		if in.State == "open" {
			states = []string{model.JobPlanned, model.JobInProgress, model.JobDone}
		}
		q = q.Where("jobs.state IN ?", states)
	}
	if in.CustomerID != 0 {
		q = q.Where("jobs.customer_id = ?", in.CustomerID)
	}
	if in.From != "" {
		q = q.Where("jobs.start_on <> '' AND (CASE WHEN jobs.end_on = '' THEN jobs.start_on ELSE jobs.end_on END) >= ?", in.From)
	}
	if in.To != "" {
		q = q.Where("jobs.start_on <> '' AND jobs.start_on <= ?", in.To)
	}
	if in.Q != "" {
		p := like(in.Q)
		q = q.Joins("JOIN customers ON customers.id = jobs.customer_id").
			Where("LOWER(jobs.number) LIKE ? OR LOWER(jobs.title) LIKE ? OR LOWER(customers.name) LIKE ? OR LOWER(jobs.site_address) LIKE ?", p, p, p, p)
	}
	return paginate(q, in.PageParams, func(j *model.Job) JobSummary { return s.toJobSummary(ctx, j) })
}

func (s *server) loadJob(ctx context.Context, tx *gorm.DB, id uint) (*model.Job, error) {
	var j model.Job
	if err := tx.Scopes(inAccount(ctx)).Preload("Customer").Preload("Lines", func(db *gorm.DB) *gorm.DB { return db.Order("position") }).
		First(&j, id).Error; err != nil {
		return nil, dbErr(err, "job")
	}
	return &j, nil
}

func jobLineData(j *model.Job) []model.LineData {
	out := make([]model.LineData, len(j.Lines))
	for i := range j.Lines {
		out[i] = j.Lines[i].LineData
	}
	return out
}

func toAttachment(slug string, a *model.Attachment) Attachment {
	return Attachment{ID: a.ID, Filename: a.Filename, ContentType: a.ContentType, Size: a.Size, UploadedBy: a.UploadedBy, CreatedAt: a.CreatedAt,
		URL: fmt.Sprintf("/api/accounts/%s/attachments/%d", slug, a.ID)}
}

func (s *server) jobOut(ctx context.Context, id uint) (*Out[Job], error) {
	db := s.db.WithContext(ctx)
	j, err := s.loadJob(ctx, db, id)
	if err != nil {
		return nil, err
	}
	manager := isManager(ctx)
	rooms := j.Rooms
	if rooms == nil {
		rooms = []calc.Room{}
	}
	slug := auth.AccountFrom(ctx).Slug
	out := Job{JobSummary: s.toJobSummary(ctx, j), SiteContact: j.SiteContact, Note: j.Note, Rooms: rooms, Measurements: measurements(rooms),
		Lines: make([]Line, len(j.Lines)), Notes: []JobNote{}, Attachments: []Attachment{}, Invoices: []InvoiceSummary{},
		AppURL: strings.TrimRight(s.cfg.PublicURL, "/") + "/a/" + slug + "/jobs/" + fmt.Sprint(j.ID)}
	for i := range j.Lines {
		out.Lines[i] = toLine(j.Lines[i].ID, &j.Lines[i].LineData)
		if !manager {
			out.Lines[i].UnitPrice, out.Lines[i].Amount, out.Lines[i].Discount = 0, 0, 0
		}
	}
	if manager {
		out.VatRate, out.Discount = j.VatRate, j.Discount
		out.Totals = totalsOf(jobLineData(j), j.Discount, j.VatRate)
		if j.QuoteID != nil {
			if q, err := s.loadQuote(ctx, db, *j.QuoteID); err == nil {
				out.Quote = &QuoteRef{ID: q.ID, Number: q.Number, Totals: totalsOf(quoteLineData(q), q.Discount, q.VatRate)}
			}
		}
		var invs []model.Invoice
		if err := s.scoped(ctx).Preload("Customer").Where("job_id = ?", j.ID).Order("id").Find(&invs).Error; err != nil {
			return nil, dbErr(err, "invoices")
		}
		for i := range invs {
			out.Invoices = append(out.Invoices, s.toInvoiceSummary(&invs[i]))
		}
	}
	var notes []model.JobNote
	if err := s.scoped(ctx).Preload("User").Where("job_id = ?", j.ID).Order("\"on\" DESC, id DESC").Find(&notes).Error; err != nil {
		return nil, dbErr(err, "notes")
	}
	for _, n := range notes {
		out.Notes = append(out.Notes, JobNote{ID: n.ID, On: n.On, Text: n.Text, Author: defaultStr(n.User.Name, n.User.Email), UserID: n.UserID, CreatedAt: n.CreatedAt})
	}
	var atts []model.Attachment
	if err := s.scoped(ctx).Where("job_id = ?", j.ID).Order("id").Find(&atts).Error; err != nil {
		return nil, dbErr(err, "attachments")
	}
	for i := range atts {
		out.Attachments = append(out.Attachments, toAttachment(slug, &atts[i]))
	}
	return &Out[Job]{Body: out}, nil
}

func (s *server) getJob(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*Out[Job], error) {
	return s.jobOut(ctx, in.ID)
}

func (s *server) fillJob(ctx context.Context, tx *gorm.DB, j *model.Job, b *JobInput) error {
	acc := auth.AccountFrom(ctx)
	if _, err := s.loadCustomerTx(ctx, tx, b.CustomerID); err != nil {
		return invalid("customer_id", "unknown customer")
	}
	for _, d := range []struct{ f, v string }{{"start_on", b.StartOn}, {"end_on", b.EndOn}} {
		if d.v != "" && !validDate(d.v) {
			return invalid(d.f, "YYYY-MM-DD")
		}
	}
	if b.EndOn != "" && b.StartOn != "" && b.EndOn < b.StartOn {
		return invalid("end_on", "must not be before start_on")
	}
	if len(b.WorkerIDs) > 0 {
		var n int64
		if err := tx.Model(&model.Membership{}).Scopes(inAccount(ctx)).Where("id IN ?", uniq(b.WorkerIDs)).Count(&n).Error; err != nil {
			return err
		}
		if int(n) != len(uniq(b.WorkerIDs)) {
			return invalid("worker_ids", "unknown member")
		}
	}
	j.CustomerID, j.Title, j.SiteAddress, j.SiteContact = b.CustomerID, strings.TrimSpace(b.Title), strings.TrimSpace(b.SiteAddress), strings.TrimSpace(b.SiteContact)
	j.StartOn, j.EndOn, j.Note, j.Discount, j.WorkerIDs = b.StartOn, b.EndOn, b.Note, b.Discount, uniq(b.WorkerIDs)
	if j.Title == "" {
		return invalid("title", "required")
	}
	switch {
	case !acc.VatPayer:
		j.VatRate = 0
	case b.VatRate != nil:
		j.VatRate = *b.VatRate
	case j.ID == 0:
		j.VatRate = acc.DefaultVatRate
	}
	rooms, err := cleanRooms(b.Rooms)
	if err != nil {
		return err
	}
	j.Rooms = rooms
	lines, err := buildLines(ctx, tx, rooms, b.Lines)
	if err != nil {
		return err
	}
	j.Total = totalsOf(lines, j.Discount, j.VatRate).Total
	if j.ID == 0 {
		if err := tx.Create(j).Error; err != nil {
			return err
		}
	} else {
		if err := tx.Omit("Customer", "Lines").Save(j).Error; err != nil {
			return err
		}
		if err := tx.Where("job_id = ?", j.ID).Delete(&model.JobLine{}).Error; err != nil {
			return err
		}
	}
	if len(lines) == 0 {
		return nil
	}
	rows := make([]model.JobLine, len(lines))
	for i := range lines {
		rows[i] = model.JobLine{JobID: j.ID, LineData: lines[i]}
	}
	return tx.Create(&rows).Error
}

func (s *server) newJob(ctx context.Context, tx *gorm.DB, b *JobInput, quoteID *uint) (*model.Job, error) {
	j := model.Job{AccountID: accountID(ctx), State: model.JobPlanned, QuoteID: quoteID}
	num, err := nextNumber(tx, j.AccountID, "job", "ZA", s.deps.Now().In(prague).Year(), 3)
	if err != nil {
		return nil, err
	}
	j.Number = num
	return &j, s.fillJob(ctx, tx, &j, b)
}

func (s *server) createJob(ctx context.Context, in *struct{ Body JobInput }) (*Out[Job], error) {
	var j *model.Job
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var err error
		j, err = s.newJob(ctx, tx, &in.Body, nil)
		return err
	})
	if err != nil {
		return nil, wrapTx(err, "job")
	}
	return s.jobOut(ctx, j.ID)
}

// JobFromQuote schedules the job made from a quote.
type JobFromQuote struct {
	StartOn string `json:"start_on,omitempty" doc:"YYYY-MM-DD"`
	EndOn   string `json:"end_on,omitempty" doc:"YYYY-MM-DD"`
}

// createJobFromQuote makes the job of a quote; a quote not decided yet is
// accepted by it (the customer agreed by phone).
func (s *server) createJobFromQuote(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body *JobFromQuote
}) (*Out[Job], error) {
	if in.Body == nil {
		in.Body = &JobFromQuote{}
	}
	var j *model.Job
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		q, err := s.loadQuote(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		if q.State == model.QuoteRejected {
			return conflict(CodeNotAccepted, "the quote was rejected")
		}
		var n int64
		if err := tx.Model(&model.Job{}).Where("quote_id = ?", q.ID).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return conflict(CodeJobExists, "the quote already has a job")
		}
		if q.State != model.QuoteAccepted {
			now := s.deps.Now()
			if err := tx.Model(q).Updates(map[string]any{"state": model.QuoteAccepted, "decided_at": now,
				"decided_by": memberName(auth.MemberFrom(ctx))}).Error; err != nil {
				return err
			}
		}
		vat := q.VatRate
		b := JobInput{CustomerID: q.CustomerID, Title: q.Title, SiteAddress: q.SiteAddress, StartOn: in.Body.StartOn, EndOn: in.Body.EndOn,
			VatRate: &vat, Discount: q.Discount, Rooms: q.Rooms, Lines: toInputs(quoteLineData(q))}
		j, err = s.newJob(ctx, tx, &b, &q.ID)
		return err
	})
	if err != nil {
		return nil, wrapTx(err, "job")
	}
	return s.jobOut(ctx, j.ID)
}

func (s *server) updateJob(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body JobInput
}) (*Out[Job], error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		j, err := s.loadJob(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		return s.fillJob(ctx, tx, j, &in.Body)
	})
	if err != nil {
		return nil, wrapTx(err, "job")
	}
	return s.jobOut(ctx, in.ID)
}

func (s *server) deleteJob(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*NoContent, error) {
	var keys []string
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		j, err := s.loadJob(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		var n int64
		if err := tx.Model(&model.Invoice{}).Where("job_id = ?", j.ID).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return conflict(CodeInvoiced, "the job has invoices")
		}
		if err := tx.Model(&model.Attachment{}).Where("job_id = ?", j.ID).Pluck("storage_key", &keys).Error; err != nil {
			return err
		}
		for _, m := range []any{&model.JobLine{}, &model.JobNote{}, &model.Attachment{}} {
			if err := tx.Where("job_id = ?", j.ID).Delete(m).Error; err != nil {
				return err
			}
		}
		return tx.Delete(j).Error
	})
	if err != nil {
		return nil, wrapTx(err, "job")
	}
	for _, k := range keys {
		_ = s.deps.Storage.Delete(ctx, k)
	}
	return &NoContent{}, nil
}

func (s *server) setJobState(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body JobStateInput
}) (*Out[Job], error) {
	j, err := s.loadJob(ctx, s.db.WithContext(ctx), in.ID)
	if err != nil {
		return nil, err
	}
	if !isManager(ctx) && (in.Body.State == model.JobCancelled || j.State == model.JobCancelled || j.State == model.JobInvoiced) {
		return nil, huma.Error403Forbidden("only the office cancels, restores or reopens invoiced jobs")
	}
	if j.State == model.JobInvoiced {
		var n int64
		if err := s.scoped(ctx).Model(&model.Invoice{}).Where("job_id = ? AND kind = ?", j.ID, model.InvoiceRegular).Count(&n).Error; err != nil {
			return nil, dbErr(err, "job")
		}
		if n > 0 {
			return nil, conflict(CodeInvoiced, "the job has a final invoice (delete it first)")
		}
	}
	upd := map[string]any{"state": in.Body.State}
	if in.Body.State == model.JobInProgress && j.StartOn == "" {
		upd["start_on"] = s.today()
	}
	if in.Body.State == model.JobDone && j.EndOn == "" {
		upd["end_on"] = s.today()
	}
	if err := s.scoped(ctx).Model(j).Updates(upd).Error; err != nil {
		return nil, dbErr(err, "job")
	}
	return s.jobOut(ctx, j.ID)
}

func (s *server) addJobNote(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body JobNoteInput
}) (*Out[Job], error) {
	j, err := s.loadJob(ctx, s.db.WithContext(ctx), in.ID)
	if err != nil {
		return nil, err
	}
	on := defaultStr(in.Body.On, s.today())
	if !validDate(on) {
		return nil, invalid("on", "YYYY-MM-DD")
	}
	n := model.JobNote{AccountID: j.AccountID, JobID: j.ID, UserID: auth.UserFrom(ctx).ID, On: on, Text: strings.TrimSpace(in.Body.Text)}
	if err := s.db.WithContext(ctx).Create(&n).Error; err != nil {
		return nil, dbErr(err, "note")
	}
	return s.jobOut(ctx, j.ID)
}

func (s *server) deleteJobNote(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*NoContent, error) {
	var n model.JobNote
	if err := s.scoped(ctx).First(&n, in.ID).Error; err != nil {
		return nil, dbErr(err, "note")
	}
	if n.UserID != auth.UserFrom(ctx).ID && !isManager(ctx) {
		return nil, huma.Error403Forbidden("only your own notes")
	}
	if err := s.db.WithContext(ctx).Delete(&n).Error; err != nil {
		return nil, dbErr(err, "note")
	}
	return &NoContent{}, nil
}

// maxUpload bounds one uploaded file.
const maxUpload = 50 << 20

func (s *server) uploadAttachment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, _ := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	j, err := s.loadJob(ctx, s.db.WithContext(ctx), uint(id))
	if err != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "job not found")
		return
	}
	accID, slug := auth.AccountFrom(ctx).ID, auth.AccountFrom(ctx).Slug
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
			continue
		}
		key := fmt.Sprintf("%d/%s", accID, randomHex())
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
		a := model.Attachment{AccountID: accID, JobID: j.ID, Filename: name, ContentType: ct, Size: cr.n, StorageKey: key, UploadedBy: auth.UserFrom(ctx).ID}
		if err := s.db.WithContext(ctx).Create(&a).Error; err != nil {
			_ = s.deps.Storage.Delete(ctx, key)
			httpsec.WriteProblem(w, http.StatusInternalServerError, "internal", "saving the file failed")
			return
		}
		saved = append(saved, toAttachment(slug, &a))
	}
	writeJSON(w, http.StatusCreated, saved)
}

func (s *server) downloadAttachment(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id, _ := strconv.ParseUint(chi.URLParam(r, "id"), 10, 64)
	var a model.Attachment
	if err := s.scoped(ctx).First(&a, id).Error; err != nil {
		httpsec.WriteProblem(w, http.StatusNotFound, "not_found", "attachment not found")
		return
	}
	f, err := s.deps.Storage.Get(ctx, a.StorageKey)
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
	if r.URL.Query().Get("inline") == "1" && (strings.HasPrefix(a.ContentType, "image/") || strings.HasPrefix(a.ContentType, "video/") || a.ContentType == "application/pdf") {
		disp = "inline"
	}
	h.Set("Content-Disposition", mime.FormatMediaType(disp, map[string]string{"filename": a.Filename}))
	h.Set("Cache-Control", "private, max-age=3600")
	_, _ = io.Copy(w, f)
}

func (s *server) deleteAttachment(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*NoContent, error) {
	var a model.Attachment
	if err := s.scoped(ctx).First(&a, in.ID).Error; err != nil {
		return nil, dbErr(err, "attachment")
	}
	if a.UploadedBy != auth.UserFrom(ctx).ID && !isManager(ctx) {
		return nil, huma.Error403Forbidden("only your own files")
	}
	if err := s.db.WithContext(ctx).Delete(&a).Error; err != nil {
		return nil, dbErr(err, "attachment")
	}
	_ = s.deps.Storage.Delete(ctx, a.StorageKey)
	return &NoContent{}, nil
}
