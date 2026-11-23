package api_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http"
	"testing"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/db"
	"github.com/qwerin/tilecraft/internal/model"
)

func pngBytes(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 40, 20))
	for x := range 40 {
		img.Set(x, 10, color.Black)
	}
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// upload posts one file (multipart) and returns the status and the saved attachments.
func upload(c *client, path, name string, data []byte) (int, []api.Attachment) {
	c.ts.t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	fw, _ := mw.CreateFormFile("file", name)
	_, _ = fw.Write(data)
	_ = mw.Close()
	req, _ := http.NewRequest("POST", c.ts.srv.URL+path, &body)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	req.Header.Set("Origin", c.ts.srv.URL)
	res, err := c.http.Do(req)
	if err != nil {
		c.ts.t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	var out []api.Attachment
	if res.StatusCode == http.StatusCreated {
		if err := json.Unmarshal(b, &out); err != nil || len(out) != 1 {
			c.ts.t.Fatalf("upload %s: %v %s", path, err, b)
		}
	}
	return res.StatusCode, out
}

func mustUpload(c *client, path, name string, data []byte) api.Attachment {
	c.ts.t.Helper()
	code, out := upload(c, path, name, data)
	if code != http.StatusCreated {
		c.ts.t.Fatalf("upload %s: status %d", path, code)
	}
	return out[0]
}

func withWorker(t *testing.T, ts *testServer, a *client) *client {
	t.Helper()
	doJSON[api.Member](a, http.StatusCreated, "POST", a.acct("/members"), api.MemberCreate{Email: "w@example.cz", Password: "heslo1234", Role: model.RoleWorker})
	return ts.login("w@example.cz", a.slug)
}

// Categories: default by the job's state, explicit on upload, changed by PATCH, filtered in the list.
func TestAttachmentCategories(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	w := withWorker(t, ts, a)
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Zákazník"})
	job := doJSON[api.Job](a, http.StatusCreated, "POST", a.acct("/jobs"), api.JobInput{CustomerID: cust.ID, Title: "Koupelna"})
	jp := a.acct(fmt.Sprintf("/jobs/%d/attachments", job.ID))
	img := pngBytes(t)

	if got := mustUpload(a, jp, "pred.png", img); got.Category != model.AttachBefore || got.JobID == nil || *got.JobID != job.ID || got.QuoteID != nil {
		t.Fatalf("planned job: %+v", got)
	}
	doJSON[api.Job](w, http.StatusOK, "POST", w.acct(fmt.Sprintf("/jobs/%d/state", job.ID)), api.JobStateInput{State: model.JobInProgress})
	during := mustUpload(w, jp, "behem.png", img) // a worker uploads to the job
	if during.Category != model.AttachDuring {
		t.Fatalf("in progress: %s", during.Category)
	}
	if got := mustUpload(w, jp+"?category=plan", "plan.pdf", []byte("%PDF-1.4")); got.Category != model.AttachPlan || got.ContentType != "application/pdf" {
		t.Fatalf("explicit: %+v", got)
	}
	if code, _ := upload(a, jp+"?category=nonsense", "x.png", img); code != http.StatusUnprocessableEntity {
		t.Fatalf("unknown category: %d", code)
	}
	doJSON[api.Job](a, http.StatusOK, "POST", a.acct(fmt.Sprintf("/jobs/%d/state", job.ID)), api.JobStateInput{State: model.JobDone})
	if got := mustUpload(a, jp, "hotovo.png", img); got.Category != model.AttachAfter {
		t.Fatalf("done: %s", got.Category)
	}

	// the worker moves their own photo; a job file cannot be shown to the customer
	got := doJSON[api.Attachment](w, http.StatusOK, "PATCH", w.acct(fmt.Sprintf("/attachments/%d", during.ID)), api.AttachmentPatch{Category: ptr(model.AttachAfter)})
	if got.Category != model.AttachAfter {
		t.Fatalf("patch: %+v", got)
	}
	expect(t, w, http.StatusForbidden, "PATCH", w.acct(fmt.Sprintf("/attachments/%d", during.ID)), api.AttachmentPatch{Shared: ptr(true)})
	expect(t, a, http.StatusUnprocessableEntity, "PATCH", a.acct(fmt.Sprintf("/attachments/%d", during.ID)), api.AttachmentPatch{Shared: ptr(true)})
	expect(t, a, http.StatusUnprocessableEntity, "PATCH", a.acct(fmt.Sprintf("/attachments/%d", during.ID)), map[string]any{"category": "nonsense"})

	list := doJSON[[]api.Attachment](a, http.StatusOK, "GET", a.acct(fmt.Sprintf("/attachments?job_id=%d&category=after", job.ID)), nil)
	if len(list) != 2 {
		t.Fatalf("after: %d", len(list))
	}
	j := doJSON[api.Job](w, http.StatusOK, "GET", w.acct(fmt.Sprintf("/jobs/%d", job.ID)), nil)
	if len(j.Attachments) != 4 {
		t.Fatalf("job attachments: %d", len(j.Attachments))
	}
}

// Files of a quote: office only; the job made from the quote gets them (same rows, same files);
// deleting the job leaves them with the quote.
func TestQuoteFilesToJob(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	w := withWorker(t, ts, a)
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Zákazník"})
	q := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "Koupelna"})
	qp := a.acct(fmt.Sprintf("/quotes/%d/attachments", q.ID))
	before := mustUpload(a, qp, "stav.png", pngBytes(t))
	plan := mustUpload(a, qp+"?category=plan", "plan.png", pngBytes(t))
	if before.Category != model.AttachBefore || before.QuoteID == nil || before.JobID != nil {
		t.Fatalf("quote file: %+v", before)
	}
	if code, _ := upload(w, qp, "x.png", pngBytes(t)); code != http.StatusForbidden {
		t.Fatalf("worker uploads to a quote: %d", code)
	}
	// workers do not see files of quotes without a job
	expect(t, w, http.StatusNotFound, "GET", w.acct(fmt.Sprintf("/attachments/%d", before.ID)), nil)
	expect(t, w, http.StatusNotFound, "DELETE", w.acct(fmt.Sprintf("/attachments/%d", before.ID)), nil)
	if l := doJSON[[]api.Attachment](w, http.StatusOK, "GET", w.acct(fmt.Sprintf("/attachments?quote_id=%d", q.ID)), nil); len(l) != 0 {
		t.Fatalf("worker lists quote files: %d", len(l))
	}
	if got := doJSON[api.Quote](a, http.StatusOK, "GET", a.acct(fmt.Sprintf("/quotes/%d", q.ID)), nil); len(got.Attachments) != 2 {
		t.Fatalf("quote attachments: %d", len(got.Attachments))
	}

	job := doJSON[api.Job](a, http.StatusCreated, "POST", a.acct(fmt.Sprintf("/quotes/%d/job", q.ID)), api.JobFromQuote{})
	if len(job.Attachments) != 2 || job.Attachments[1].ID != plan.ID || job.Attachments[1].Category != model.AttachPlan {
		t.Fatalf("job got %+v", job.Attachments)
	}
	expect(t, w, http.StatusOK, "GET", w.acct(fmt.Sprintf("/attachments/%d", plan.ID)), nil)
	// a later quote upload goes to the job too
	late := mustUpload(a, qp, "dalsi.png", pngBytes(t))
	if late.JobID == nil || *late.JobID != job.ID {
		t.Fatalf("late upload: %+v", late)
	}
	own := mustUpload(a, a.acct(fmt.Sprintf("/jobs/%d/attachments", job.ID)), "behem.png", pngBytes(t))
	if own.QuoteID != nil {
		t.Fatalf("job file of a quote job: %+v", own)
	}

	expect(t, a, http.StatusNoContent, "DELETE", a.acct(fmt.Sprintf("/jobs/%d", job.ID)), nil)
	expect(t, a, http.StatusNotFound, "GET", a.acct(fmt.Sprintf("/attachments/%d", own.ID)), nil) // the job's own photo went with it
	got := doJSON[api.Quote](a, http.StatusOK, "GET", a.acct(fmt.Sprintf("/quotes/%d", q.ID)), nil)
	if len(got.Attachments) != 3 || got.Attachments[0].JobID != nil {
		t.Fatalf("after deleting the job: %+v", got.Attachments)
	}
	expect(t, a, http.StatusOK, "GET", a.acct(fmt.Sprintf("/attachments/%d?inline=1", plan.ID)), nil)
	// a new job takes them again
	job = doJSON[api.Job](a, http.StatusCreated, "POST", a.acct(fmt.Sprintf("/quotes/%d/job", q.ID)), api.JobFromQuote{})
	if len(job.Attachments) != 3 {
		t.Fatalf("second job: %d", len(job.Attachments))
	}
}

// The customer sees only the shared laying plans of their quote, through its token.
func TestPublicPlan(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Zákazník"})
	q := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "Koupelna"})
	other := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "Kuchyně"})
	qp := a.acct(fmt.Sprintf("/quotes/%d/attachments", q.ID))
	plan := mustUpload(a, qp+"?category=plan", "plan.png", pngBytes(t))
	hidden := mustUpload(a, qp+"?category=plan", "pracovni.png", pngBytes(t))
	photo := mustUpload(a, qp, "stav.png", pngBytes(t))
	pdfPlan := mustUpload(a, qp+"?category=plan", "plan.pdf", []byte("%PDF-1.4"))
	for _, id := range []uint{plan.ID, pdfPlan.ID} {
		if got := doJSON[api.Attachment](a, http.StatusOK, "PATCH", a.acct(fmt.Sprintf("/attachments/%d", id)), api.AttachmentPatch{Shared: ptr(true)}); !got.Shared {
			t.Fatal("not shared")
		}
	}
	expect(t, a, http.StatusUnprocessableEntity, "PATCH", a.acct(fmt.Sprintf("/attachments/%d", photo.ID)), api.AttachmentPatch{Shared: ptr(true)})

	anon := ts.anon()
	file := func(token string, id uint) string { return fmt.Sprintf("/api/public/quotes/%s/files/%d", token, id) }
	token := q.PublicURL[len(q.PublicURL)-22:]
	expect(t, anon, http.StatusNotFound, "GET", file(token, plan.ID), nil) // a draft is not public
	doJSON[api.Quote](a, http.StatusOK, "POST", a.acct(fmt.Sprintf("/quotes/%d/send", q.ID)), api.QuoteSend{MarkOnly: true})
	doJSON[api.Quote](a, http.StatusOK, "POST", a.acct(fmt.Sprintf("/quotes/%d/send", other.ID)), api.QuoteSend{MarkOnly: true})

	pub := doJSON[api.PublicQuote](anon, http.StatusOK, "GET", "/api/public/quotes/"+token, nil)
	if len(pub.Plans) != 2 || pub.Plans[0].ID != plan.ID || pub.Plans[0].URL != file(token, plan.ID) || pub.Plans[1].ContentType != "application/pdf" {
		t.Fatalf("plans %+v", pub.Plans)
	}
	res, b := anon.do("GET", file(token, plan.ID)+"?inline=1", nil)
	if res.StatusCode != http.StatusOK || res.Header.Get("Content-Type") != "image/png" || !bytes.Equal(b, pngBytes(t)) {
		t.Fatalf("plan: %d %s", res.StatusCode, res.Header.Get("Content-Type"))
	}
	otherToken := other.PublicURL[len(other.PublicURL)-22:]
	for _, p := range []string{file(token, hidden.ID), file(token, photo.ID), file(otherToken, plan.ID), file("nonsense", plan.ID), file(token, 0)} {
		expect(t, anon, http.StatusNotFound, "GET", p, nil)
	}
	// the account route needs a login
	expect(t, anon, http.StatusUnauthorized, "GET", a.acct(fmt.Sprintf("/attachments/%d", plan.ID)), nil)

	// the quote PDF carries the image plan
	res, b = anon.do("GET", "/api/public/quotes/"+token+"/pdf", nil)
	if res.StatusCode != http.StatusOK || !bytes.Contains(b, []byte("/Subtype /Image")) {
		t.Fatalf("pdf %d without the plan image", res.StatusCode)
	}
	// moved out of the plans = no longer shown
	got := doJSON[api.Attachment](a, http.StatusOK, "PATCH", a.acct(fmt.Sprintf("/attachments/%d", plan.ID)), api.AttachmentPatch{Category: ptr(model.AttachOther)})
	if got.Shared {
		t.Fatal("still shared")
	}
	expect(t, anon, http.StatusNotFound, "GET", file(token, plan.ID), nil)
}

// A file of another firm is 404 everywhere.
func TestForeignAttachment(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	b := ts.signup("b@example.cz", "Obklady B")
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Zákazník"})
	job := doJSON[api.Job](a, http.StatusCreated, "POST", a.acct("/jobs"), api.JobInput{CustomerID: cust.ID, Title: "Koupelna"})
	q := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "Koupelna"})
	att := mustUpload(a, a.acct(fmt.Sprintf("/jobs/%d/attachments", job.ID)), "a.png", pngBytes(t))
	p := fmt.Sprintf("/attachments/%d", att.ID)
	expect(t, b, http.StatusNotFound, "GET", b.acct(p), nil)
	expect(t, b, http.StatusNotFound, "PATCH", b.acct(p), api.AttachmentPatch{Category: ptr(model.AttachOther)})
	expect(t, b, http.StatusNotFound, "DELETE", b.acct(p), nil)
	if l := doJSON[[]api.Attachment](b, http.StatusOK, "GET", b.acct(fmt.Sprintf("/attachments?job_id=%d", job.ID)), nil); len(l) != 0 {
		t.Fatalf("foreign list: %d", len(l))
	}
	for _, path := range []string{fmt.Sprintf("/jobs/%d/attachments", job.ID), fmt.Sprintf("/quotes/%d/attachments", q.ID)} {
		if code, _ := upload(b, b.acct(path), "x.png", pngBytes(t)); code != http.StatusNotFound {
			t.Fatalf("upload to a foreign %s: %d", path, code)
		}
	}
	expect(t, a, http.StatusOK, "GET", a.acct(p), nil)
}

// Existing attachments (job_id NOT NULL, no category) migrate to category other, job_id becomes optional.
func TestAttachmentMigration(t *testing.T) {
	gdb, err := db.Open("sqlite", ":memory:", "silent")
	if err != nil {
		t.Fatal(err)
	}
	type oldAttachment struct {
		ID        uint
		AccountID uint `gorm:"not null;index"`
		JobID     uint `gorm:"not null;index"`
		Filename  string
	}
	if err := gdb.Table("attachments").AutoMigrate(&oldAttachment{}); err != nil {
		t.Fatal(err)
	}
	if err := gdb.Table("attachments").Create(&oldAttachment{AccountID: 1, JobID: 7, Filename: "stara.jpg"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(gdb); err != nil {
		t.Fatal(err)
	}
	var got model.Attachment
	if err := gdb.First(&got).Error; err != nil || got.Category != model.AttachOther || got.JobID == nil || *got.JobID != 7 || got.Filename != "stara.jpg" {
		t.Fatalf("migrated %+v %v", got, err)
	}
	qid := uint(3)
	if err := gdb.Create(&model.Attachment{AccountID: 1, QuoteID: &qid, Category: model.AttachPlan}).Error; err != nil {
		t.Fatalf("quote file without a job: %v", err)
	}
}
