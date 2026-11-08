package api_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/calc"
	"github.com/qwerin/tilecraft/internal/config"
	"github.com/qwerin/tilecraft/internal/model"
)

func catalogByName(c *client) map[string]api.CatalogItem {
	items := doJSON[[]api.CatalogItem](c, http.StatusOK, "GET", c.acct("/catalog"), nil)
	out := map[string]api.CatalogItem{}
	for _, it := range items {
		out[it.Name] = it
	}
	return out
}

func bathroom() []calc.Room {
	return []calc.Room{{Name: "Koupelna", Surfaces: []calc.Surface{
		{Name: "Podlaha", Kind: calc.KindFloor, Width: 2.95, Height: 1.56},
		{Name: "Stěna", Kind: calc.KindWall, Width: 2.95, Height: 2.1},
		{Name: "Stěna s dveřmi", Kind: calc.KindWall, Width: 2.44, Height: 2.1, Deductions: []calc.Deduction{{Name: "Dveře", Width: 0.8, Height: 1.97}}},
		{Name: "Lišta", Kind: calc.KindLength, Width: 7.96},
	}}}
}

// The whole path: price list → customer → quote from measurements → customer accepts → job → advance → invoice.
func TestQuoteToInvoice(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	cat := catalogByName(a)
	if len(cat) < 20 {
		t.Fatalf("default catalog: %d items", len(cat))
	}
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Marie Nováková", Email: "marie@example.cz"})

	id := func(name string) *uint { v := cat[name].ID; return &v }
	in := api.QuoteInput{CustomerID: cust.ID, Title: "Koupelna", Rooms: bathroom(), Lines: []api.LineInput{
		{CatalogItemID: id("Montáž obkladu, spárování, silikon")},                    // wall 9.75 m² × 650
		{CatalogItemID: id("Montáž dlažby, spárování epoxidem, silikon")},            // floor 4.6 m² × 650
		{CatalogItemID: id("Montáž ukončovací lišty")},                               // 7.96 bm × 90
		{CatalogItemID: id("Lepidlo Codex CX9 25 kg"), Quantity: ptr(2.0)},           // 2 × 1 694 − 25 %
		{CatalogItemID: id("Obklad (dle výběru zákazníka)"), CustomerSupplied: true}, // 9.75 + 10 % = 10.73 m², 0 Kč
		{Name: "Cestovné", Section: "other", Unit: "kpl", Quantity: ptr(1.0), UnitPrice: ptr(int64(210000))},
	}}
	q := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), in)
	if q.Number != "NA26001" || q.State != model.QuoteDraft || q.ValidUntil != "2026-12-03" {
		t.Fatalf("quote %s %s %s", q.Number, q.State, q.ValidUntil)
	}
	if q.Measurements.Total.Wall != 9.75 || q.Measurements.Total.Floor != 4.6 {
		t.Fatalf("measurements %+v", q.Measurements.Total)
	}
	want := []float64{9.75, 4.6, 7.96, 2, 10.73, 1}
	for i, l := range q.Lines {
		if l.Quantity != want[i] {
			t.Errorf("line %d %s: quantity %v, want %v", i, l.Name, l.Quantity, want[i])
		}
	}
	// 633 800 (6 337,50 → 6 338) + 299 000 + 71 600 (716,40 → 716) + 254 100 + 0 + 210 000
	if q.Totals.Work != 1004400 || q.Totals.Material != 254100 || q.Totals.Other != 210000 || q.Totals.Total != 1468500 {
		t.Fatalf("totals %+v", q.Totals)
	}

	// remeasure: a bigger floor changes the measured quantities only
	in.Rooms[0].Surfaces[0].Width = 3
	q = doJSON[api.Quote](a, http.StatusOK, "PUT", a.acct(fmt.Sprintf("/quotes/%d", q.ID)), in)
	if q.Lines[1].Quantity != 4.68 || q.Lines[3].Quantity != 2 {
		t.Fatalf("after remeasure %v %v", q.Lines[1].Quantity, q.Lines[3].Quantity)
	}

	// a draft is not public; sending (link only) publishes it
	token := q.PublicURL[strings.LastIndex(q.PublicURL, "/")+1:]
	anon := ts.anon()
	expect(t, anon, http.StatusNotFound, "GET", "/api/public/quotes/"+token, nil)
	q = doJSON[api.Quote](a, http.StatusOK, "POST", a.acct(fmt.Sprintf("/quotes/%d/send", q.ID)), api.QuoteSend{MarkOnly: true})
	pub := doJSON[api.PublicQuote](anon, http.StatusOK, "GET", "/api/public/quotes/"+token, nil)
	if !pub.CanDecide || pub.Totals.Total != q.Totals.Total || len(pub.Rooms) != 0 || pub.Lines[0].CatalogItemID != nil {
		t.Fatalf("public quote %+v", pub)
	}
	pub = doJSON[api.PublicQuote](anon, http.StatusOK, "POST", "/api/public/quotes/"+token+"/decision",
		api.PublicDecision{State: model.QuoteAccepted, Name: "Marie Nováková"})
	if pub.State != model.QuoteAccepted || pub.CanDecide {
		t.Fatalf("decided %+v", pub)
	}
	expect(t, anon, http.StatusConflict, "POST", "/api/public/quotes/"+token+"/decision", api.PublicDecision{State: model.QuoteRejected, Name: "X"})
	expect(t, a, http.StatusConflict, "PUT", a.acct(fmt.Sprintf("/quotes/%d", q.ID)), in)

	// job from the quote, real quantities differ
	job := doJSON[api.Job](a, http.StatusCreated, "POST", a.acct(fmt.Sprintf("/quotes/%d/job", q.ID)), map[string]string{"start_on": "2026-11-10"})
	if job.Number != "ZA26001" || job.State != model.JobPlanned || len(job.Lines) != 6 || job.Quote == nil || job.Totals.Total != job.Quote.Totals.Total {
		t.Fatalf("job %+v", job.JobSummary)
	}
	expect(t, a, http.StatusConflict, "POST", a.acct(fmt.Sprintf("/quotes/%d/job", q.ID)), nil)

	adv := doJSON[api.Invoice](a, http.StatusCreated, "POST", a.acct(fmt.Sprintf("/jobs/%d/invoice", job.ID)),
		api.JobInvoiceInput{Kind: model.InvoiceAdvance, Percent: 50})
	if adv.Number != "ZF26001" || adv.Total != 736900 || adv.QRPayment != "" { // no bank account yet → no QR
		t.Fatalf("advance %s %d %q", adv.Number, adv.Total, adv.QRPayment)
	}
	doJSON[api.Invoice](a, http.StatusOK, "POST", a.acct(fmt.Sprintf("/invoices/%d/paid", adv.ID)), api.PaidInput{PaidOn: ptr("2026-11-05")})

	inv := doJSON[api.Invoice](a, http.StatusCreated, "POST", a.acct(fmt.Sprintf("/jobs/%d/invoice", job.ID)),
		api.JobInvoiceInput{Kind: model.InvoiceRegular})
	if inv.Number != "26002" || inv.Total != job.Totals.Total-736900 || inv.DueOn != "2026-11-17" {
		t.Fatalf("invoice %s total %d due %s", inv.Number, inv.Total, inv.DueOn)
	}
	last := inv.Lines[len(inv.Lines)-1]
	if last.AdvanceID == nil || *last.AdvanceID != adv.ID || last.UnitPrice != -736900 {
		t.Fatalf("deduction %+v", last)
	}
	for _, l := range inv.Lines {
		if strings.HasPrefix(l.Text, "Obklad") {
			t.Fatal("customer supplied material on the invoice")
		}
	}
	job = doJSON[api.Job](a, http.StatusOK, "GET", a.acct(fmt.Sprintf("/jobs/%d", job.ID)), nil)
	if job.State != model.JobInvoiced || len(job.Invoices) != 2 {
		t.Fatalf("job after invoicing: %s, %d invoices", job.State, len(job.Invoices))
	}
	expect(t, a, http.StatusConflict, "DELETE", a.acct(fmt.Sprintf("/invoices/%d", adv.ID)), nil) // paid
	expect(t, a, http.StatusNoContent, "DELETE", a.acct(fmt.Sprintf("/invoices/%d", inv.ID)), nil)
	job = doJSON[api.Job](a, http.StatusOK, "GET", a.acct(fmt.Sprintf("/jobs/%d", job.ID)), nil)
	if job.State != model.JobDone {
		t.Fatalf("job after deleting the invoice: %s", job.State)
	}

	// PDFs render
	for _, p := range []string{fmt.Sprintf("/invoices/%d/pdf", adv.ID), fmt.Sprintf("/quotes/%d/pdf", q.ID)} {
		res, b := a.do("GET", a.acct(p), nil)
		if res.StatusCode != http.StatusOK || !strings.HasPrefix(string(b), "%PDF") {
			t.Fatalf("%s: %d", p, res.StatusCode)
		}
	}
	res, b := anon.do("GET", "/api/public/quotes/"+token+"/pdf", nil)
	if res.StatusCode != http.StatusOK || !strings.HasPrefix(string(b), "%PDF") {
		t.Fatalf("public pdf: %d", res.StatusCode)
	}

	dash := doJSON[api.Dashboard](a, http.StatusOK, "GET", a.acct("/dashboard"), nil)
	if len(dash.UpcomingJobs) != 0 || dash.MonthPaid != 736900 {
		t.Fatalf("dashboard %+v", dash)
	}
}

func TestVatPayerAndDiscount(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	doJSON[api.Account](a, http.StatusOK, "PATCH", a.acct(""), api.AccountPatch{Settings: &api.Settings{VatPayer: true, DefaultVatRate: 12,
		QuoteValidDays: 14, InvoiceDueDays: 10}, BankAccount: ptr("2000145399/2010")})
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Firma s.r.o.", RegistrationNo: "12345678"})
	q := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "Terasa", Discount: 10,
		Lines: []api.LineInput{{Name: "Montáž dlažby", Unit: "m2", Quantity: ptr(10.0), UnitPrice: ptr(int64(80000))}}})
	if q.VatRate != 12 || q.Totals.Discount != 80000 || q.Totals.Base != 720000 || q.Totals.Vat != 86400 || q.Totals.Total != 806400 {
		t.Fatalf("totals %+v", q.Totals)
	}
	job := doJSON[api.Job](a, http.StatusCreated, "POST", a.acct(fmt.Sprintf("/quotes/%d/job", q.ID)), nil)
	inv := doJSON[api.Invoice](a, http.StatusCreated, "POST", a.acct(fmt.Sprintf("/jobs/%d/invoice", job.ID)),
		api.JobInvoiceInput{Kind: model.InvoiceRegular, Summary: true})
	if inv.Total != 806400 || len(inv.VatRows) != 1 || inv.VatRows[0].Vat != 86400 || inv.QRPayment == "" || inv.VS != "26001" {
		t.Fatalf("invoice total %d vat %+v qr %q", inv.Total, inv.VatRows, inv.QRPayment)
	}
}

func TestWorkerSeesNoPrices(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	doJSON[api.Member](a, http.StatusCreated, "POST", a.acct("/members"), api.MemberCreate{Email: "w@example.cz", Password: "heslo1234", Role: model.RoleWorker})
	w := ts.login("w@example.cz", a.slug)
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Zákazník"})
	job := doJSON[api.Job](a, http.StatusCreated, "POST", a.acct("/jobs"), api.JobInput{CustomerID: cust.ID, Title: "Koupelna",
		Lines: []api.LineInput{{Name: "Obklad", Unit: "m2", Quantity: ptr(10.0), UnitPrice: ptr(int64(65000))}}})
	for _, p := range []string{"/quotes", "/invoices", "/catalog", "/customers"} {
		expect(t, w, http.StatusForbidden, "GET", w.acct(p), nil)
	}
	got := doJSON[api.Job](w, http.StatusOK, "GET", w.acct(fmt.Sprintf("/jobs/%d", job.ID)), nil)
	if got.Total != 0 || got.Lines[0].Amount != 0 || got.Lines[0].UnitPrice != 0 || got.Totals.Total != 0 || got.Lines[0].Quantity != 10 {
		t.Fatalf("worker sees prices: %+v", got)
	}
	got = doJSON[api.Job](w, http.StatusOK, "POST", w.acct(fmt.Sprintf("/jobs/%d/state", job.ID)), api.JobStateInput{State: model.JobInProgress})
	if got.State != model.JobInProgress || got.StartOn != "2026-11-03" {
		t.Fatalf("state %s start %s", got.State, got.StartOn)
	}
	expect(t, w, http.StatusForbidden, "POST", w.acct(fmt.Sprintf("/jobs/%d/state", job.ID)), api.JobStateInput{State: model.JobCancelled})
	doJSON[api.Job](w, http.StatusCreated, "POST", w.acct(fmt.Sprintf("/jobs/%d/notes", job.ID)), api.JobNoteInput{Text: "Hotová hydroizolace"})
	expect(t, w, http.StatusForbidden, "PUT", w.acct(fmt.Sprintf("/jobs/%d", job.ID)), api.JobInput{CustomerID: cust.ID, Title: "x"})
}

func TestIsolation(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	b := ts.signup("b@example.cz", "Obklady B")
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Zákazník A"})
	q := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "x"})
	expect(t, b, http.StatusNotFound, "GET", b.acct(fmt.Sprintf("/quotes/%d", q.ID)), nil)
	expect(t, b, http.StatusNotFound, "GET", b.acct(fmt.Sprintf("/customers/%d", cust.ID)), nil)
	expect(t, b, http.StatusUnprocessableEntity, "POST", b.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "x"})
	expect(t, b, http.StatusNotFound, "GET", a.acct("/quotes"), nil)
	// catalog items of another firm are unknown
	other := catalogByName(a)["Montáž obkladu, spárování, silikon"].ID
	bc := doJSON[api.Customer](b, http.StatusCreated, "POST", b.acct("/customers"), api.CustomerInput{Name: "Zákazník B"})
	expect(t, b, http.StatusUnprocessableEntity, "POST", b.acct("/quotes"), api.QuoteInput{CustomerID: bc.ID, Title: "x",
		Lines: []api.LineInput{{CatalogItemID: &other}}})
}

func TestSeedDemo(t *testing.T) {
	ts := newTestServer(t)
	ts.signup("someone@example.cz", "Jiná firma") // an existing firm does not prevent the demo
	created, err := api.SeedDemo(context.Background(), ts.db, config.Config{PublicURL: "http://localhost:8080"})
	if err != nil || !created {
		t.Fatalf("seed: %v %v", created, err)
	}
	if again, err := api.SeedDemo(context.Background(), ts.db, config.Config{}); err != nil || again {
		t.Fatalf("second seed: %v %v", again, err)
	}
	c := ts.anon()
	me := doJSON[api.Me](c, http.StatusOK, "POST", "/api/auth/login", api.LoginInput{Email: api.DemoEmail, Password: api.DemoPassword})
	c.slug = me.Accounts[0].Slug
	quotes := doJSON[api.ListResponse[api.QuoteSummary]](c, http.StatusOK, "GET", c.acct("/quotes"), nil)
	jobs := doJSON[api.ListResponse[api.JobSummary]](c, http.StatusOK, "GET", c.acct("/jobs"), nil)
	invs := doJSON[api.ListResponse[api.InvoiceSummary]](c, http.StatusOK, "GET", c.acct("/invoices"), nil)
	if quotes.Total != 4 || jobs.Total != 2 || invs.Total != 2 {
		t.Fatalf("demo: %d quotes, %d jobs, %d invoices", quotes.Total, jobs.Total, invs.Total)
	}
}
