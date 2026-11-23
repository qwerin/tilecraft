package api_test

import (
	"fmt"
	"net/http"
	"slices"
	"testing"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/model"
)

// Tile-size tiers (SPEC §4): tier prices of a catalog item, the line's tier picks the price and is printed by its label.
func TestTilePriceTiers(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	cat := catalogByName(a)
	floor := cat["Montáž dlažby, spárování epoxidem, silikon"]
	if !slices.Equal(floor.TierPrices, []int64{75000, 65000, 85000}) || floor.Price != 65000 {
		t.Fatalf("default tier prices %v %d", floor.TierPrices, floor.Price)
	}
	acc := doJSON[api.Account](a, http.StatusOK, "GET", a.acct(""), nil)
	if !slices.Equal(acc.Settings.TierLabels, model.DefaultTierLabels[:]) {
		t.Fatalf("default labels %v", acc.Settings.TierLabels)
	}

	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Zákazník"})
	in := api.QuoteInput{CustomerID: cust.ID, Title: "Koupelna", Rooms: bathroom(), Lines: []api.LineInput{
		{CatalogItemID: &floor.ID},                                        // 4.6 m² × 650 (no tier = the base price)
		{CatalogItemID: &floor.ID, Tier: 1},                               // × 750
		{CatalogItemID: &floor.ID, Tier: 3},                               // × 850
		{CatalogItemID: &floor.ID, Tier: 3, UnitPrice: ptr(int64(90000))}, // explicit price wins
		{Name: "Pokládka teras", Unit: "m2", Quantity: ptr(2.0), UnitPrice: ptr(int64(50000)), Tier: 2}, // label only
	}}
	q := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), in)
	wantPrice := []int64{65000, 75000, 85000, 90000, 50000}
	wantLabel := []string{"", "Malý formát (do 30×30)", "Velký formát (nad 60×60)", "Velký formát (nad 60×60)", "Standard (do 60×60)"}
	for i, l := range q.Lines {
		if l.UnitPrice != wantPrice[i] || l.TierLabel != wantLabel[i] || l.Tier != in.Lines[i].Tier {
			t.Errorf("line %d: price %d tier %d %q", i, l.UnitPrice, l.Tier, l.TierLabel)
		}
	}
	// 4.6 × (650 + 750 + 850 + 900) = 14 490 Kč + 1 000 Kč
	if q.Totals.Work != 1549000 {
		t.Fatalf("work %d", q.Totals.Work)
	}
	bad := in
	bad.Lines = []api.LineInput{{CatalogItemID: &floor.ID, Tier: 4}}
	expect(t, a, http.StatusUnprocessableEntity, "POST", a.acct("/quotes"), bad)

	// renamed labels are used by lines saved afterwards; settings without tier_labels keep them
	doJSON[api.Account](a, http.StatusOK, "PATCH", a.acct(""), api.AccountPatch{Settings: &api.Settings{QuoteValidDays: 30, InvoiceDueDays: 14,
		TierLabels: []string{"Mozaika", " Standard (do 60×60) ", "Velkoformát"}}})
	acc = doJSON[api.Account](a, http.StatusOK, "PATCH", a.acct(""), api.AccountPatch{Settings: &api.Settings{QuoteValidDays: 30, InvoiceDueDays: 14}})
	if !slices.Equal(acc.Settings.TierLabels, []string{"Mozaika", "Standard (do 60×60)", "Velkoformát"}) {
		t.Fatalf("labels %v", acc.Settings.TierLabels)
	}
	q = doJSON[api.Quote](a, http.StatusOK, "PUT", a.acct(fmt.Sprintf("/quotes/%d", q.ID)), in)
	if q.Lines[1].TierLabel != "Mozaika" || q.Lines[2].TierLabel != "Velkoformát" {
		t.Fatalf("renamed labels %q %q", q.Lines[1].TierLabel, q.Lines[2].TierLabel)
	}

	// the job keeps the tiers, the invoice names them
	doJSON[api.Quote](a, http.StatusOK, "POST", a.acct(fmt.Sprintf("/quotes/%d/send", q.ID)), api.QuoteSend{MarkOnly: true})
	job := doJSON[api.Job](a, http.StatusCreated, "POST", a.acct(fmt.Sprintf("/quotes/%d/job", q.ID)), nil)
	if job.Lines[2].Tier != 3 || job.Lines[2].UnitPrice != 85000 || job.Lines[2].TierLabel != "Velkoformát" {
		t.Fatalf("job line %+v", job.Lines[2])
	}
	inv := doJSON[api.Invoice](a, http.StatusCreated, "POST", a.acct(fmt.Sprintf("/jobs/%d/invoice", job.ID)), api.JobInvoiceInput{Kind: model.InvoiceRegular})
	if inv.Lines[1].Text != "Montáž dlažby, spárování epoxidem, silikon — Mozaika" || inv.Lines[0].Text != "Montáž dlažby, spárování epoxidem, silikon" {
		t.Fatalf("invoice texts %q %q", inv.Lines[0].Text, inv.Lines[1].Text)
	}
	res, b := a.do("GET", a.acct(fmt.Sprintf("/quotes/%d/pdf", q.ID)), nil)
	if res.StatusCode != http.StatusOK || len(b) == 0 {
		t.Fatalf("pdf %d", res.StatusCode)
	}
}

// Catalog: tier prices are 3 or none, quick picks of the additional work (SPEC §4).
func TestCatalogTiersAndQuickPicks(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	cat := catalogByName(a)
	for _, name := range []string{"Vykružování otvorů", "Kamenický roh (broušení hrany 45°)", "Nika (obklad výklenku)",
		"Hydroizolační stěrka (2 vrstvy)", "Betonování, vyrovnání podlahy", "Spárování (samostatně)"} {
		if c, ok := cat[name]; !ok || !c.Quick || c.Kind != model.SectionWork {
			t.Errorf("quick pick %q: %+v", name, c)
		}
	}
	if cat["Lepidlo Codex CX9 25 kg"].Quick || cat["Lepidlo Codex CX9 25 kg"].TierPrices != nil {
		t.Error("material is not a quick pick")
	}

	item := api.CatalogInput{Kind: model.SectionWork, Name: "Pokládka velkoformátu", Unit: "m2", Price: 70000, TierPrices: []int64{80000, 70000}, Active: true}
	expect(t, a, http.StatusUnprocessableEntity, "POST", a.acct("/catalog"), item)
	item.TierPrices = []int64{80000, 70000, -1}
	expect(t, a, http.StatusUnprocessableEntity, "POST", a.acct("/catalog"), item)
	item.TierPrices, item.Quick = []int64{80000, 70000, 95000}, true
	c := doJSON[api.CatalogItem](a, http.StatusCreated, "POST", a.acct("/catalog"), item)
	if !slices.Equal(c.TierPrices, item.TierPrices) || !c.Quick {
		t.Fatalf("created %+v", c)
	}
	item.TierPrices, item.Quick = nil, false
	c = doJSON[api.CatalogItem](a, http.StatusOK, "PUT", a.acct(fmt.Sprintf("/catalog/%d", c.ID)), item)
	if c.TierPrices != nil || c.Quick {
		t.Fatalf("updated %+v", c)
	}
	// without tier prices the tier is only a label
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Zákazník"})
	q := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "x",
		Lines: []api.LineInput{{CatalogItemID: &c.ID, Quantity: ptr(1.0), Tier: 3}}})
	if q.Lines[0].UnitPrice != 70000 || q.Lines[0].TierLabel != "Velký formát (nad 60×60)" {
		t.Fatalf("line %+v", q.Lines[0])
	}
}
