package api_test

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/db"
	"github.com/qwerin/tilecraft/internal/model"
)

// The customer's invoice link /f/{token}: view without login, PDF, first view logged, link in the e-mail.
func TestPublicInvoice(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	doJSON[api.Account](a, http.StatusOK, "PATCH", a.acct(""), api.AccountPatch{BankAccount: ptr("2000145399/2010")})
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Marie Nováková", Email: "marie@example.cz"})
	inv := doJSON[api.Invoice](a, http.StatusCreated, "POST", a.acct("/invoices"), api.InvoiceInput{CustomerID: cust.ID,
		Lines: []api.InvoiceLineInput{{Text: "Obklad koupelny", Unit: "m2", Quantity: 10, UnitPrice: 65000}}})
	if !strings.HasPrefix(inv.PublicURL, "http://localhost:8080/f/") || inv.ViewedAt != nil {
		t.Fatalf("public url %q viewed %v", inv.PublicURL, inv.ViewedAt)
	}
	token := inv.PublicURL[strings.LastIndex(inv.PublicURL, "/")+1:]
	if len(token) != 22 {
		t.Fatalf("token %q", token)
	}

	anon := ts.anon()
	expect(t, anon, http.StatusNotFound, "GET", "/api/public/invoices/nesmysl", nil)
	expect(t, anon, http.StatusNotFound, "GET", "/api/public/invoices/nesmysl/pdf", nil)
	expect(t, anon, http.StatusNotFound, "GET", "/api/public/invoices/nesmysl/logo", nil)

	// the firm checking its own link is not the customer's view
	doJSON[api.PublicInvoice](a, http.StatusOK, "GET", "/api/public/invoices/"+token, nil)
	if got := doJSON[api.Invoice](a, http.StatusOK, "GET", a.acct(fmt.Sprintf("/invoices/%d", inv.ID)), nil); got.ViewedAt != nil {
		t.Fatal("the firm's own view was logged")
	}

	pub := doJSON[api.PublicInvoice](anon, http.StatusOK, "GET", "/api/public/invoices/"+token, nil)
	if pub.Number != inv.Number || pub.Total != 650000 || pub.QRPayment == "" || pub.VS != inv.VS || pub.Firm.Name != "Obklady A" ||
		pub.Firm.BankAccount != "2000145399/2010" || pub.Party.Name != "Marie Nováková" || len(pub.Lines) != 1 || pub.Lines[0].ID != 1 || pub.PaidOn != nil {
		t.Fatalf("public invoice %+v", pub)
	}
	got := doJSON[api.Invoice](a, http.StatusOK, "GET", a.acct(fmt.Sprintf("/invoices/%d", inv.ID)), nil)
	if got.ViewedAt == nil {
		t.Fatal("first view not logged")
	}
	first := *got.ViewedAt
	ts.now = ts.now.Add(time.Hour)
	doJSON[api.PublicInvoice](anon, http.StatusOK, "GET", "/api/public/invoices/"+token, nil)
	if got := doJSON[api.Invoice](a, http.StatusOK, "GET", a.acct(fmt.Sprintf("/invoices/%d", inv.ID)), nil); !got.ViewedAt.Equal(first) {
		t.Fatalf("viewed_at moved: %v → %v", first, got.ViewedAt)
	}

	res, body := anon.do("GET", "/api/public/invoices/"+token+"/pdf", nil)
	if res.StatusCode != http.StatusOK || !strings.HasPrefix(string(body), "%PDF") {
		t.Fatalf("public pdf: %d", res.StatusCode)
	}

	// paid: no QR, still public
	doJSON[api.Invoice](a, http.StatusOK, "POST", a.acct(fmt.Sprintf("/invoices/%d/paid", inv.ID)), api.PaidInput{PaidOn: ptr("2026-11-05")})
	if pub := doJSON[api.PublicInvoice](anon, http.StatusOK, "GET", "/api/public/invoices/"+token, nil); pub.QRPayment != "" || pub.PaidOn == nil {
		t.Fatalf("paid public invoice %+v", pub)
	}

	// the e-mail carries the link (PDF still attached)
	doJSON[api.Invoice](a, http.StatusOK, "POST", a.acct(fmt.Sprintf("/invoices/%d/email", inv.ID)), api.InvoiceEmail{})
	emails := doJSON[api.ListResponse[api.Email]](a, http.StatusOK, "GET", a.acct("/emails"), nil)
	if len(emails.Items) != 1 || !strings.Contains(emails.Items[0].Body, inv.PublicURL) || !strings.HasSuffix(emails.Items[0].Files, ".pdf") {
		t.Fatalf("e-mail %+v", emails.Items)
	}

	// a deleted invoice's link is gone
	inv2 := doJSON[api.Invoice](a, http.StatusCreated, "POST", a.acct("/invoices"), api.InvoiceInput{CustomerID: cust.ID,
		Lines: []api.InvoiceLineInput{{Text: "Vícepráce", Quantity: 1, UnitPrice: 100000}}})
	if inv2.PublicURL == inv.PublicURL {
		t.Fatal("same token twice")
	}
	expect(t, a, http.StatusNoContent, "DELETE", a.acct(fmt.Sprintf("/invoices/%d", inv2.ID)), nil)
	expect(t, anon, http.StatusNotFound, "GET", "/api/public/invoices/"+inv2.PublicURL[strings.LastIndex(inv2.PublicURL, "/")+1:], nil)
}

// Invoices from before the customer's link get a token on migration.
func TestMigrateFillsInvoiceTokens(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Zákazník"})
	inv := doJSON[api.Invoice](a, http.StatusCreated, "POST", a.acct("/invoices"), api.InvoiceInput{CustomerID: cust.ID,
		Lines: []api.InvoiceLineInput{{Text: "Práce", Quantity: 1, UnitPrice: 100000}}})
	doJSON[api.Invoice](a, http.StatusCreated, "POST", a.acct("/invoices"), api.InvoiceInput{CustomerID: cust.ID,
		Lines: []api.InvoiceLineInput{{Text: "Materiál", Quantity: 1, UnitPrice: 50000}}})
	// back to the schema from before the link (two invoices without the columns)
	for _, q := range []string{"DROP INDEX idx_invoices_public_token", "ALTER TABLE invoices DROP COLUMN public_token", "ALTER TABLE invoices DROP COLUMN viewed_at"} {
		if err := ts.db.Exec(q).Error; err != nil {
			t.Fatal(q, err)
		}
	}
	if err := db.Migrate(ts.db); err != nil {
		t.Fatal(err)
	}
	got := doJSON[api.Invoice](a, http.StatusOK, "GET", a.acct(fmt.Sprintf("/invoices/%d", inv.ID)), nil)
	if got.PublicURL == "" || got.PublicURL == inv.PublicURL {
		t.Fatalf("migrated url %q", got.PublicURL)
	}
	doJSON[api.PublicInvoice](ts.anon(), http.StatusOK, "GET", "/api/public/invoices/"+got.PublicURL[strings.LastIndex(got.PublicURL, "/")+1:], nil)
	var empty int64
	if err := ts.db.Model(&model.Invoice{}).Where("public_token IS NULL OR public_token = ''").Count(&empty).Error; err != nil || empty != 0 {
		t.Fatalf("invoices without a token: %d %v", empty, err)
	}
}
