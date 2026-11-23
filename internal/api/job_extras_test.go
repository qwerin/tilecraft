package api_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/model"
)

func jobInputOf(j api.Job) api.JobInput {
	vat := j.VatRate
	in := api.JobInput{CustomerID: j.Customer.ID, Title: j.Title, SiteAddress: j.SiteAddress, VatRate: &vat, Discount: j.Discount, Rooms: j.Rooms}
	for _, l := range j.Lines {
		q, p, d, m, w := l.Quantity, l.UnitPrice, l.Discount, l.Measure, l.Waste
		in.Lines = append(in.Lines, api.LineInput{Section: l.Section, CatalogItemID: l.CatalogItemID, Name: l.Name, Unit: l.Unit, Quantity: &q,
			UnitPrice: &p, Discount: &d, CustomerSupplied: l.CustomerSupplied, Measure: &m, Rooms: l.Rooms, Waste: &w, Note: l.Note, Extra: l.Extra})
	}
	return in
}

// Extra work during the job (crew without prices, office with), travel costs, the revised quote
// accepted by the customer without creating another job, and the invoice from the job.
func TestJobExtrasAndRevisedQuote(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	doJSON[api.Member](a, http.StatusCreated, "POST", a.acct("/members"), api.MemberCreate{Email: "w@example.cz", Password: "heslo1234", Role: model.RoleWorker})
	w := ts.login("w@example.cz", a.slug)
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Jan Novák"})
	q := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "Koupelna",
		Lines: []api.LineInput{{Name: "Obklad", Unit: "m2", Quantity: ptr(10.0), UnitPrice: ptr(int64(65000))}}})
	q = doJSON[api.Quote](a, http.StatusOK, "POST", a.acct(fmt.Sprintf("/quotes/%d/send", q.ID)), api.QuoteSend{MarkOnly: true})
	job := doJSON[api.Job](a, http.StatusCreated, "POST", a.acct(fmt.Sprintf("/quotes/%d/job", q.ID)), nil)
	jp := func(p string) string { return a.acct(fmt.Sprintf("/jobs/%d%s", job.ID, p)) }

	// the crew records extra work: no price, even if sent
	got := doJSON[api.Job](w, http.StatusCreated, "POST", w.acct(fmt.Sprintf("/jobs/%d/extras", job.ID)),
		api.JobExtraInput{Name: "Vyrovnání podlahy", Quantity: 2, UnitPrice: ptr(int64(50000))})
	l := got.Lines[len(got.Lines)-1]
	if len(got.Lines) != 2 || !l.Extra || l.Unit != "hod" || l.Quantity != 2 || got.Extras.Count != 1 || got.Extras.Unpriced != 1 || got.Extras.Amount != 0 {
		t.Fatalf("worker extra %+v %+v", l, got.Extras)
	}
	// the office adds an extra cost with a price
	job = doJSON[api.Job](a, http.StatusCreated, "POST", jp("/extras"),
		api.JobExtraInput{Section: model.SectionMaterial, Name: "Lepidlo navíc", Unit: "ks", Quantity: 2, UnitPrice: ptr(int64(30000))})
	if job.Lines[0].UnitPrice != 0 && job.Lines[1].UnitPrice != 0 || job.Lines[2].Section != model.SectionMaterial || job.Extras.Amount != 60000 {
		t.Fatalf("lines %+v extras %+v", job.Lines, job.Extras)
	}
	// the office prices the crew's line; PUT keeps the extra flags
	in := jobInputOf(job)
	in.Lines[1].UnitPrice = ptr(int64(40000))
	job = doJSON[api.Job](a, http.StatusOK, "PUT", jp(""), in)
	if job.Extras.Count != 2 || job.Extras.Unpriced != 0 || job.Extras.Amount != 140000 || job.Totals.Total != 650000+140000 {
		t.Fatalf("after pricing %+v total %d", job.Extras, job.Totals.Total)
	}

	// travel: km × trips at the catalog price, then updated in place, then a lump sum
	job = doJSON[api.Job](a, http.StatusOK, "PUT", jp("/travel"), api.JobTravelInput{Km: 35, Trips: 2})
	tr := job.Lines[len(job.Lines)-1]
	if tr.Name != "Cestovné" || tr.Section != model.SectionOther || tr.Unit != "km" || tr.Quantity != 70 || tr.UnitPrice != 1200 || tr.Amount != 84000 || !tr.Extra {
		t.Fatalf("travel %+v", tr)
	}
	job = doJSON[api.Job](a, http.StatusOK, "PUT", jp("/travel"), api.JobTravelInput{Km: 40, PerKm: ptr(int64(1500))})
	job = doJSON[api.Job](a, http.StatusOK, "PUT", jp("/travel"), api.JobTravelInput{LumpSum: ptr(int64(150000))})
	n := 0
	for _, l := range job.Lines {
		if strings.HasPrefix(l.Name, "Cestovné") {
			n++
			tr = l
		}
	}
	if n != 1 || tr.Unit != "kpl" || tr.Amount != 150000 || job.Totals.Total != 650000+140000+150000 {
		t.Fatalf("travel lines %d %+v total %d", n, tr, job.Totals.Total)
	}
	expect(t, w, http.StatusForbidden, "PUT", w.acct(fmt.Sprintf("/jobs/%d/travel", job.ID)), api.JobTravelInput{Km: 1})

	// the revised quote: the job's lines, linked to the job and the original quote; a draft is refreshed
	expect(t, w, http.StatusForbidden, "POST", w.acct(fmt.Sprintf("/jobs/%d/revised-quote", job.ID)), nil)
	rq := doJSON[api.Quote](a, http.StatusCreated, "POST", jp("/revised-quote"), nil)
	if rq.RevisionOf == nil || rq.RevisionOf.QuoteNumber != q.Number || rq.RevisionOf.QuoteTotal != 650000 || !rq.Revision ||
		rq.JobID == nil || *rq.JobID != job.ID || rq.Totals.Total != job.Totals.Total || !strings.Contains(rq.Title, "upravená nabídka") {
		t.Fatalf("revised quote %+v", rq)
	}
	extras := 0
	for _, l := range rq.Lines {
		if l.Extra {
			extras++
		}
	}
	if extras != 3 {
		t.Fatalf("extras in the revised quote: %d", extras)
	}
	again := doJSON[api.Quote](a, http.StatusCreated, "POST", jp("/revised-quote"), nil)
	if again.ID != rq.ID || again.Number != rq.Number {
		t.Fatalf("draft not refreshed: %d %d", again.ID, rq.ID)
	}
	expect(t, a, http.StatusConflict, "POST", a.acct(fmt.Sprintf("/quotes/%d/job", rq.ID)), nil)

	// the customer accepts it on the public page: no new job, the job's diary records it
	rq = doJSON[api.Quote](a, http.StatusOK, "POST", a.acct(fmt.Sprintf("/quotes/%d/send", rq.ID)), api.QuoteSend{MarkOnly: true})
	token := rq.PublicURL[strings.LastIndex(rq.PublicURL, "/")+1:]
	anon := ts.anon()
	pub := doJSON[api.PublicQuote](anon, http.StatusOK, "GET", "/api/public/quotes/"+token, nil)
	if pub.Revises == nil || pub.Revises.Number != q.Number || !pub.Lines[1].Extra || pub.Lines[0].Extra {
		t.Fatalf("public revision %+v", pub)
	}
	doJSON[api.PublicQuote](anon, http.StatusOK, "POST", "/api/public/quotes/"+token+"/decision", api.PublicDecision{State: model.QuoteAccepted, Name: "Jan Novák"})
	jobs := doJSON[api.ListResponse[api.JobSummary]](a, http.StatusOK, "GET", a.acct("/jobs"), nil)
	if jobs.Total != 1 {
		t.Fatalf("accepting the revision made a job: %d jobs", jobs.Total)
	}
	job = doJSON[api.Job](a, http.StatusOK, "GET", jp(""), nil)
	if len(job.Revisions) != 1 || job.Revisions[0].State != model.QuoteAccepted || len(job.Notes) != 1 ||
		!strings.Contains(job.Notes[0].Text, "Jan Novák přijal upravenou nabídku "+rq.Number) {
		t.Fatalf("job after acceptance: %+v %+v", job.Revisions, job.Notes)
	}
	if wj := doJSON[api.Job](w, http.StatusOK, "GET", w.acct(fmt.Sprintf("/jobs/%d", job.ID)), nil); len(wj.Revisions) != 0 || wj.Extras.Amount != 0 {
		t.Fatalf("worker sees revisions or prices: %+v", wj.Extras)
	}
	res, b := anon.do("GET", "/api/public/quotes/"+token+"/pdf", nil)
	if res.StatusCode != http.StatusOK || !strings.HasPrefix(string(b), "%PDF") {
		t.Fatalf("revision pdf: %d", res.StatusCode)
	}

	// the invoice from the job works as before
	inv := doJSON[api.Invoice](a, http.StatusCreated, "POST", jp("/invoice"), api.JobInvoiceInput{Kind: model.InvoiceRegular})
	if inv.Total != job.Totals.Total {
		t.Fatalf("invoice %d, job %d", inv.Total, job.Totals.Total)
	}
	expect(t, w, http.StatusConflict, "POST", w.acct(fmt.Sprintf("/jobs/%d/extras", job.ID)), api.JobExtraInput{Name: "x", Quantity: 1})
}
