package invoicepdf

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf16"

	"golang.org/x/image/font/sfnt"
)

// all Czech letters with diacritics, both cases, and the other non-ASCII characters of the documents
const czech = "áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ–—·−²³„“ "

// pangram is set as text of the document and must come back out unchanged.
const pangram = "Příliš žluťoučký kůň úpěl ďábelské ódy"

// The embedded fonts have a glyph for every Czech character (a missing glyph prints as an empty box).
func TestFontsCoverCzech(t *testing.T) {
	for name, data := range map[string][]byte{"regular": fontRegular, "bold": fontBold} {
		f, err := sfnt.Parse(data)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		var buf sfnt.Buffer
		for _, r := range czech + strings.ToUpper(pangram) + pangram {
			if g, err := f.GlyphIndex(&buf, r); err != nil || g == 0 {
				t.Errorf("%s: no glyph for %q (%U)", name, r, r)
			}
		}
	}
}

// pdfText is s as the content stream holds it: UTF-16BE (identity ToUnicode map) with PDF string escapes.
func pdfText(s string) []byte {
	var b []byte
	for _, u := range utf16.Encode([]rune(s)) {
		for _, c := range []byte{byte(u >> 8), byte(u)} {
			switch c {
			case '\\', '(', ')':
				b = append(b, '\\', c)
			case '\r':
				b = append(b, '\\', 'r')
			default:
				b = append(b, c)
			}
		}
	}
	return b
}

func uncompressed(t *testing.T) {
	t.Helper()
	compress = false
	t.Cleanup(func() { compress = true })
}

func checkPDF(t *testing.T) func([]byte, error) []byte {
	return func(b []byte, err error) []byte {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.HasPrefix(b, []byte("%PDF-")) {
			t.Fatalf("not a PDF: %q", b[:min(len(b), 20)])
		}
		return b
	}
}

func contains(t *testing.T, what string, b []byte, texts ...string) {
	t.Helper()
	for _, s := range texts {
		if !bytes.Contains(b, pdfText(nb(s))) {
			t.Errorf("%s: text %q missing", what, s)
		}
	}
}

// nb puts the non-breaking spaces of Money and of percentages into a test string.
func nb(s string) string {
	if strings.HasSuffix(s, "Kč") {
		s = strings.ReplaceAll(s, " ", nbsp)
	}
	return strings.ReplaceAll(s, " %", nbsp+"%")
}

func m(kc int64) int64 { return kc * 100 }

// The bathroom of SPEC §0.
func sampleQuote() Quote {
	work := []Line{
		{Text: "Montáž pancéřového pletiva", Unit: "m2", Quantity: 4.6, UnitPrice: m(150), Amount: m(690)},
		{Text: "Obklad stěn (lepení, spárování)", Unit: "m2", Quantity: 14.11, UnitPrice: m(650), Amount: m(9172)},
		{Text: "Dlažba", Unit: "m2", Quantity: 4.6, UnitPrice: m(700), Amount: m(3220)},
		{Text: "Hydroizolace (stěrka + páska) v mokré zóně", Unit: "m2", Quantity: 6.6, UnitPrice: m(250), Amount: m(1650)},
		{Text: "Lišty, ukončovací profily", Unit: "bm", Quantity: 12.85, UnitPrice: m(120), Amount: m(1542)},
		{Text: "Vykružování otvorů", Unit: "ks", Quantity: 14, UnitPrice: m(85), Amount: m(1190)},
		{Text: "Stržení korku", Unit: "hod", Quantity: 7, UnitPrice: m(400), Amount: m(2800)},
		{Text: "Silikonování, úklid", Unit: "kpl", Quantity: 1, UnitPrice: m(1992), Amount: m(1992)},
	}
	material := []Line{
		{Text: "Flexibilní lepidlo C2TE S1", Unit: "bal", Quantity: 7, UnitPrice: 48400, Discount: 25, Amount: m(2541)},
		{Text: "Hydrostop", Unit: "m2", Quantity: 6.6, UnitPrice: m(340), Amount: m(2244)},
		{Text: "Spárovací hmota", Unit: "bal", Quantity: 4, UnitPrice: m(500), Discount: 35, Amount: m(1300)},
		{Text: "Adhezní můstek", Unit: "kg", Quantity: 5, UnitPrice: m(98), Amount: 0, Note: "dodá zákazník"},
		{Text: "Obklad a dlažba", Unit: "m2", Quantity: 18.71, Amount: 0, Note: "dodá zákazník"},
		{Text: "Ukončovací lišty nerez", Unit: "ks", Quantity: 5, UnitPrice: m(289), Amount: m(1445)},
		{Text: "Samonivelační stěrka", Unit: "bal", Quantity: 4, UnitPrice: m(1250), Amount: m(5000)},
		{Text: "Drobný materiál (penetrace, silikon, křížky)", Unit: "kpl", Quantity: 1, UnitPrice: m(3558), Amount: m(3558)},
	}
	other := []Line{{Text: "Cestovné", Unit: "km", Quantity: 60, UnitPrice: m(35), Amount: m(2100)}}
	return Quote{
		Firm: Party{Name: "Obklady Dvořák", Street: "Křižíkova 18", Zip: "612 00", City: "Brno", RegistrationNo: "12345678",
			VatNo: "CZ8001011234", Contact: "+420 777 123 456 · dvorak@obklady.example"},
		Customer:    Party{Name: "Jana a Petr Novákovi", Street: "Údolní 5", Zip: "602 00", City: "Brno", Contact: "+420 603 111 222"},
		Number:      "NA26001",
		Title:       "Koupelna — Novákovi",
		SiteAddress: "Údolní 5, 602 00 Brno (2. patro, byt č. 7)",
		IssuedOn:    "2026-11-02",
		ValidUntil:  "2026-12-02",
		Intro:       "Dobrý den, na základě zaměření ze dne 30. 10. 2026 Vám posílám cenovou nabídku na kompletní obklad koupelny.",
		Measures: []RoomMeasure{
			{Name: "Koupelna", Floor: 4.6, Wall: 14.11, Perimeter: 7.96, Length: 12.85, Pieces: 14},
			{Name: "WC", Floor: 1.2, Wall: 6.2, Perimeter: 4.4},
		},
		Sections: []Section{
			{Title: "Práce", Lines: work, Subtotal: m(22256)},
			{Title: "Materiál", Lines: material, Subtotal: m(16088)},
			{Title: "Ostatní", Lines: other, Subtotal: m(2100)},
		},
		VatPayer: true, VatRate: 12,
		Subtotal: m(40444), Discount: 202220, DiscountPct: 5, Base: 3842180, Vat: 461062, Total: 4303242,
		Note:  "Obklad a dlažbu vybírá a dodá zákazník, ostatní materiál zajistí zhotovitel.",
		Terms: "Záloha 50 % ceny materiálu před zahájením prací. Doplatek po předání díla, splatnost 14 dní. Vícepráce po dohodě dle skutečnosti.",
		URL:   "https://tilecraft.svobo.cz/n/3q2v8Xk0aYc1bN7sR4tWfg",
	}
}

func sampleInvoice() Invoice {
	return Invoice{
		Title: "Faktura – daňový doklad",
		Supplier: Party{Name: "Obklady Dvořák", Street: "Křižíkova 18", Zip: "612 00", City: "Brno", RegistrationNo: "12345678",
			VatNo: "CZ8001011234", Contact: "+420 777 123 456 · dvorak@obklady.example"},
		Client:      Party{Name: "Jana a Petr Novákovi", Street: "Údolní 5", Zip: "602 00", City: "Brno"},
		Number:      "26001",
		VS:          "26001",
		IssuedOn:    "2026-12-10",
		TaxableOn:   "2026-12-08",
		DueOn:       "2026-12-24",
		BankAccount: "19-2000145399/0800",
		IBAN:        "CZ6508000000192000145399",
		SWIFT:       "GIBACZPX",
		VatPayer:    true,
		Lines: []Line{
			{Text: "Práce dle nabídky NA26001 – obklad koupelny", Unit: "kpl", Quantity: 1, UnitPrice: m(22256), VatRate: 12, Amount: m(22256)},
			{Text: "Vícepráce: obklad za vanou", Unit: "m2", Quantity: 1.8, UnitPrice: m(650), VatRate: 12, Amount: m(1170)},
			{Text: "Flexibilní lepidlo C2TE S1", Unit: "bal", Quantity: 7, UnitPrice: 48400, Discount: 25, VatRate: 12, Amount: m(2541)},
			{Text: "Hydrostop", Unit: "m2", Quantity: 6.6, UnitPrice: m(340), VatRate: 12, Amount: m(2244)},
			{Text: "Adhezní můstek", Unit: "kg", Quantity: 5, UnitPrice: m(98), VatRate: 12, Amount: 0, Note: "dodá zákazník"},
			{Text: "Cestovné", Unit: "km", Quantity: 60, UnitPrice: m(35), VatRate: 21, Amount: m(2100)},
			{Text: "Odpočet zaplacené zálohy (zálohová faktura ZF26001)", Unit: "kpl", Quantity: 1, UnitPrice: m(-10000), VatRate: 12, Amount: m(-10000)},
		},
		VatRows: []VatRow{{Rate: 12, Base: m(18211), Vat: 218532}, {Rate: 21, Base: m(2100), Vat: m(441)}},
		Base:    m(20311), Vat: 262632, Total: 2293732,
		Note: "Děkujeme za důvěru. Na provedené práce poskytujeme záruku 24 měsíců.",
		QR:   "SPD*1.0*ACC:CZ6508000000192000145399+GIBACZPX*AM:22937.32*CC:CZK*MSG:Faktura 26001*X-VS:26001",
	}
}

func nonPayerInvoice() Invoice {
	inv := sampleInvoice()
	inv.Title, inv.TaxableOn, inv.VatPayer, inv.VatRows, inv.Supplier.VatNo = "Faktura", "", false, nil, ""
	inv.Total, inv.Base, inv.Vat = m(20311), m(20311), 0
	inv.Footer = "Nejsem plátce DPH."
	inv.QR = "SPD*1.0*ACC:CZ6508000000192000145399*AM:20311.00*CC:CZK*X-VS:26001"
	return inv
}

// Text with diacritics is written as Unicode (not as „?“ or Latin-1 bytes) in the embedded Unicode font.
func TestInvoiceDiacritics(t *testing.T) {
	uncompressed(t)
	inv := sampleInvoice()
	inv.Client.Name = "Řeháková Ůrsula"
	inv.Lines = append(inv.Lines, Line{Text: pangram, Note: czech, Unit: "m2", Quantity: 1, Amount: 1})
	b := checkPDF(t)(InvoicePDF(inv))
	contains(t, "invoice", b, pangram, strings.TrimSpace(czech), "Faktura – daňový doklad", "číslo", "26001", "DODAVATEL", "ODBĚRATEL",
		"Obklady Dvořák", "Křižíkova 18", "IČO: 12345678 · DIČ: CZ8001011234", "Řeháková Ůrsula", "Údolní 5",
		"Datum vystavení", "10. 12. 2026", "DUZP", "8. 12. 2026", "Datum splatnosti", "24. 12. 2026", "převodem",
		"Variabilní symbol", "CZ6508000000192000145399 / GIBACZPX",
		"Položka", "Množství", "MJ", "Cena/MJ", "Sleva", "DPH", "Celkem",
		"m²", "1,8", "−25 %", "12 %", "21 %", "484 Kč", "2 541 Kč", "dodá zákazník", "0 Kč",
		"REKAPITULACE DPH", "18 211 Kč", "2 185,32 Kč", "441 Kč", "Celkem bez DPH", "20 311 Kč", "2 626,32 Kč",
		"Celkem k úhradě", "22 937,32 Kč", "QR Platba", "POZNÁMKA", "Děkujeme za důvěru.",
		"Vystavil: Obklady Dvořák", "Faktura č. 26001 · strana 1/1")
	// the Unicode font is embedded and maps the codes back to Unicode (copying text, search)
	for _, s := range []string{"/Encoding /Identity-H", "/ToUnicode", "/FontFile2"} {
		if !bytes.Contains(b, []byte(s)) {
			t.Errorf("%s missing", s)
		}
	}
	if !bytes.Contains(b, []byte("/Title (\xfe\xff")) {
		t.Error("title is not Unicode")
	}
	if InvoiceFilename("26/001") != "faktura-26001.pdf" {
		t.Error(InvoiceFilename("26/001"))
	}
}

// A non-payer: no VAT column, no recapitulation, no DUZP, the footer under the total.
func TestInvoiceNonPayer(t *testing.T) {
	uncompressed(t)
	b := checkPDF(t)(InvoicePDF(nonPayerInvoice()))
	contains(t, "invoice", b, "Faktura", "Nejsem plátce DPH.", "Celkem k úhradě", "20 311 Kč", "Faktura č. 26001")
	for _, s := range []string{"DUZP", "REKAPITULACE DPH", "Celkem bez DPH", "12 %"} {
		if bytes.Contains(b, pdfText(nb(s))) {
			t.Errorf("%q printed for a non-payer", s)
		}
	}
}

// The variable symbol is printed as given and the QR code is drawn (many filled modules); none without a payload.
func TestInvoiceVSAndQR(t *testing.T) {
	uncompressed(t)
	inv := nonPayerInvoice()
	inv.Number, inv.VS = "2026/0042", "20260042"
	b := checkPDF(t)(InvoicePDF(inv))
	contains(t, "invoice", b, "20260042", "2026/0042", "QR Platba")
	if n := bytes.Count(b, []byte(" re f")); n < 100 {
		t.Errorf("QR code: %d filled rectangles", n)
	}
	inv.QR = ""
	b = checkPDF(t)(InvoicePDF(inv))
	if bytes.Contains(b, pdfText("QR Platba")) || bytes.Count(b, []byte(" re f")) > 30 {
		t.Error("QR code without a payload")
	}
}

// A long invoice continues on further pages with the table header again; a negative deduction line prints.
func TestInvoicePages(t *testing.T) {
	uncompressed(t)
	inv := sampleInvoice()
	for i := range 80 {
		inv.Lines = append(inv.Lines, Line{Text: fmt.Sprintf("Řádek faktury %d", i), Unit: "ks", Quantity: 1, UnitPrice: 100, VatRate: 12, Amount: 100})
	}
	b := checkPDF(t)(InvoicePDF(inv))
	contains(t, "invoice", b, "strana 2/", "(pokračování)", "-10 000 Kč", "Řádek faktury 79")
	if bytes.Contains(b, pdfText("strana 1/1")) || bytes.Count(b, pdfText("Cena/MJ")) < 2 {
		t.Fatal("pages")
	}
}

// Quote: diacritics, header, parties, measures, sections with subtotals, summary, acceptance link.
func TestQuote(t *testing.T) {
	uncompressed(t)
	q := sampleQuote()
	q.Customer.Name = pangram
	b := checkPDF(t)(QuotePDF(q))
	contains(t, "quote", b, pangram, "Cenová nabídka", "NA26001", "Koupelna — Novákovi", "ZHOTOVITEL", "OBJEDNATEL",
		"Obklady Dvořák", "Datum vystavení", "2. 11. 2026", "Platnost do", "2. 12. 2026", "Místo realizace",
		"Zaměření", "Podlaha m²", "Koupelna", "14,11", "7,96", "5,8", "Celkem",
		"Práce", "Materiál", "Ostatní", "Položka", "Množství", "MJ", "Cena/MJ", "Sleva", "Celkem",
		"Montáž pancéřového pletiva", "4,6", "m²", "bm", "hod", "9 172 Kč", "−25 %", "−35 %", "dodá zákazník",
		"Práce celkem", "22 256 Kč", "Materiál celkem", "16 088 Kč", "Ostatní celkem", "2 100 Kč",
		"Sleva 5 %", "-2 022,20 Kč", "Základ DPH", "38 421,80 Kč", "DPH 12 %", "4 610,62 Kč", "Celkem vč. DPH", "43 032,42 Kč",
		"Přijetí nabídky", "https://tilecraft.svobo.cz/n/", "POZNÁMKA", "PODMÍNKY",
		"Cenová nabídka č. NA26001 · strana 1/")
	if n := bytes.Count(b, []byte(" re f")); n < 100 {
		t.Errorf("QR code of the URL: %d filled rectangles", n)
	}
	if !bytes.Contains(b, []byte("/URI")) {
		t.Error("URL is not a link")
	}
	if QuoteFilename("NA26001") != "nabidka-NA26001.pdf" {
		t.Error(QuoteFilename("NA26001"))
	}
}

// Empty sections are left out (title, subtotal and summary row), so are measures, discount and URL when absent;
// a non-payer gets the note under the total.
func TestQuoteEmptyParts(t *testing.T) {
	uncompressed(t)
	q := sampleQuote()
	q.Sections[1].Lines, q.Sections[1].Subtotal = nil, 0
	q.Measures, q.Discount, q.DiscountPct, q.URL = nil, 0, 0, ""
	q.VatPayer, q.Base, q.Vat, q.Total = false, m(24356), 0, m(24356)
	b := checkPDF(t)(QuotePDF(q))
	contains(t, "quote", b, "Práce celkem", "Ostatní celkem", "Celkem", "24 356 Kč", "Zhotovitel není plátcem DPH.")
	for _, s := range []string{"Materiál", "Zaměření", "Sleva", "Přijetí nabídky", "Základ DPH"} {
		if bytes.Contains(b, pdfText(nb(s))) {
			t.Errorf("%q printed", s)
		}
	}
	if n := bytes.Count(b, []byte(" re f")); n > 30 {
		t.Errorf("QR code without a URL: %d rectangles", n)
	}
}

// A long quote: page breaks repeat the section title and the table header.
func TestQuotePages(t *testing.T) {
	uncompressed(t)
	q := sampleQuote()
	for i := range 70 {
		q.Sections[1].Lines = append(q.Sections[1].Lines, Line{Text: fmt.Sprintf("Položka materiálu č. %d s dlouhým názvem, který se nevejde na jeden řádek tabulky a musí se zalomit", i),
			Unit: "ks", Quantity: 1, UnitPrice: 100, Amount: 100, Note: "dodá zákazník"})
	}
	b := checkPDF(t)(QuotePDF(q))
	contains(t, "quote", b, "strana 2/", "Materiál (pokračování)", "Položka materiálu č. 69", "Celkem vč. DPH")
	if bytes.Count(b, pdfText("Cena/MJ")) < 3 {
		t.Error("table header not repeated")
	}
}

// Edge cases: no logo, an empty client, a long word wrapped, a zero total; emoji print as „?“.
func TestEdgeCases(t *testing.T) {
	uncompressed(t)
	inv := nonPayerInvoice()
	inv.Client = Party{}
	inv.Logo = nil
	long := strings.Repeat("Velmi dlouhý popis položky faktury ", 20) + strings.Repeat("Bezmezerovýtextbezmezer", 10)
	inv.Lines = []Line{{Text: long, Quantity: 1, Unit: "kpl", UnitPrice: m(1000), Amount: m(1000)},
		{Text: "Odpočet zálohy", Quantity: 1, UnitPrice: m(-1000), Amount: m(-1000)}, {Text: "Text bez množství"}}
	inv.Total, inv.QR = 0, ""
	b := checkPDF(t)(InvoicePDF(inv))
	contains(t, "invoice", b, "ODBĚRATEL", "—", "Velmi", "Bezmezerovýtext", "-1 000 Kč", "Text bez množství", "0 Kč")
	q := sampleQuote()
	q.Customer, q.Firm, q.Sections, q.Title, q.SiteAddress, q.ValidUntil = Party{}, Party{}, nil, "", "", ""
	b = checkPDF(t)(QuotePDF(q))
	contains(t, "quote", b, "Cenová nabídka", "OBJEDNATEL")

	for _, s := range []string{"Novák 😀", "x\U00010000y"} {
		inv := sampleInvoice()
		inv.Client.Name, inv.Note, inv.Lines[0].Text, inv.Number = s, s, s, s
		b := checkPDF(t)(InvoicePDF(inv))
		contains(t, "invoice", b, bmp(s))
		q := sampleQuote()
		q.Customer.Name, q.Title, q.Sections[0].Lines[0].Note = s, s, s
		b = checkPDF(t)(QuotePDF(q))
		contains(t, "quote", b, bmp(s))
	}
	var err error
	func() {
		defer recovered(&err)
		panic("boom")
	}()
	if err == nil || !strings.Contains(err.Error(), "boom") {
		t.Fatalf("recovered: %v", err)
	}
}

func TestFormat(t *testing.T) {
	if Money(330000) != nb("3 300 Kč") || Money(-5) != nb("-0,05 Kč") || Money(123456789) != nb("1 234 567,89 Kč") {
		t.Error(Money(330000), Money(-5), Money(123456789))
	}
	for q, want := range map[float64]string{14.11: "14,11", 7: "7", 4.6: "4,6", 1250.5: "1\u00a0250,5", 0.004: "0", -2.5: "-2,5"} {
		if got := Quantity(q); got != want {
			t.Errorf("Quantity(%v) = %q, want %q", q, got, want)
		}
	}
	if Unit("m2") != "m²" || Unit("bm") != "bm" || Date("2026-09-01") != "1. 9. 2026" {
		t.Error(Unit("m2"), Date("2026-09-01"))
	}
}

func logoPNG(t *testing.T) []byte {
	img := image.NewRGBA(image.Rect(0, 0, 120, 40))
	for x := range 120 {
		for y := range 40 {
			if (x/10+y/10)%2 == 0 {
				img.Set(x, y, color.RGBA{24, 74, 112, 255})
			}
		}
	}
	var p bytes.Buffer
	if err := png.Encode(&p, img); err != nil {
		t.Fatal(err)
	}
	return p.Bytes()
}

// A PNG logo is embedded; an unsupported one (WebP) is left out and the document still renders.
func TestLogo(t *testing.T) {
	uncompressed(t)
	inv := sampleInvoice()
	inv.Logo = logoPNG(t)
	if b := checkPDF(t)(InvoicePDF(inv)); !bytes.Contains(b, []byte("/Subtype /Image")) {
		t.Fatal("logo missing")
	}
	q := sampleQuote()
	q.Logo = []byte("RIFF\x00\x00\x00\x00WEBPVP8 ")
	if b := checkPDF(t)(QuotePDF(q)); bytes.Contains(b, []byte("/Subtype /Image")) {
		t.Fatal("webp embedded")
	}
}

// INVOICEPDF_SAMPLES=dir writes sample documents to look at.
func TestSamples(t *testing.T) {
	dir := os.Getenv("INVOICEPDF_SAMPLES")
	if dir == "" {
		t.Skip("INVOICEPDF_SAMPLES not set")
	}
	logo := logoPNG(t)
	inv := sampleInvoice()
	inv.Logo = logo
	q := sampleQuote()
	q.Logo = logo
	long := sampleQuote()
	for i := range 40 {
		long.Sections[1].Lines = append(long.Sections[1].Lines, Line{Text: fmt.Sprintf("Položka materiálu č. %d", i), Unit: "ks", Quantity: 2, UnitPrice: 5000, Amount: 10000})
	}
	for name, f := range map[string]func() ([]byte, error){
		"sample-invoice.pdf":          func() ([]byte, error) { return InvoicePDF(inv) },
		"sample-invoice-nonpayer.pdf": func() ([]byte, error) { return InvoicePDF(nonPayerInvoice()) },
		"sample-quote.pdf":            func() ([]byte, error) { return QuotePDF(q) },
		"sample-quote-long.pdf":       func() ([]byte, error) { return QuotePDF(long) },
	} {
		b := checkPDF(t)(f())
		if err := os.WriteFile(filepath.Join(dir, name), b, 0o644); err != nil {
			t.Fatal(err)
		}
	}
}
