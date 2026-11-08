package invoicepdf

import (
	"strconv"
	"strings"
)

// VatRow is a line of the VAT recapitulation (one rate).
type VatRow struct {
	Rate      int
	Base, Vat int64
}

// Invoice is the invoice document.
type Invoice struct {
	Title       string // "Faktura – daňový doklad", "Faktura", "Zálohová faktura"; "" = "Faktura"
	Supplier    Party
	Logo        []byte // PNG, JPEG or GIF; other formats are left out
	Client      Party
	Number      string
	VS          string // variabilní symbol
	IssuedOn    string // YYYY-MM-DD
	TaxableOn   string // DUZP, "" = not printed
	DueOn       string
	BankAccount string
	IBAN        string
	SWIFT       string
	VatPayer    bool
	Lines       []Line
	VatRows     []VatRow // recapitulation per rate (VAT payers)
	Base        int64
	Vat         int64
	Total       int64
	Note        string
	Footer      string // small text under the total (e.g. "Nejsem plátce DPH.")
	QR          string // QR Platba (SPAYD); "" = none
}

// InvoiceFilename is the invoice's file name.
func InvoiceFilename(number string) string {
	return "faktura-" + safeName(number) + ".pdf"
}

// InvoicePDF renders the invoice.
func InvoicePDF(inv Invoice) (_ []byte, err error) {
	defer recovered(&err)
	title := strings.TrimSpace(inv.Title)
	if title == "" {
		title = "Faktura"
	}
	ref := title + " č. " + inv.Number
	if i := strings.Index(title, " – "); i > 0 { // "Faktura – daňový doklad č. 1" reads badly
		ref = title[:i] + " č. " + inv.Number
	}
	d := newDoc(ref, inv.Supplier.Name, ref)
	d.AddPage()
	d.header(inv.Logo, title, "", inv.Number)
	d.parties("Dodavatel", inv.Supplier, "Odběratel", inv.Client)

	// dates and payment
	left := [][2]string{{"Datum vystavení", Date(inv.IssuedOn)}}
	if inv.TaxableOn != "" {
		left = append(left, [2]string{"DUZP", Date(inv.TaxableOn)})
	}
	left = append(left, [2]string{"Datum splatnosti", Date(inv.DueOn)}, [2]string{"Forma úhrady", "převodem"})
	account := inv.BankAccount
	if account == "" {
		account = "—"
	}
	rightCol := [][2]string{{"Bankovní účet", account}, {"Variabilní symbol", inv.VS}}
	if inv.IBAN != "" {
		iban := inv.IBAN
		if inv.SWIFT != "" {
			iban += " / " + inv.SWIFT
		}
		rightCol = append(rightCol, [2]string{"IBAN / SWIFT", iban})
	}
	d.infoGrid(left, rightCol)

	// lines
	discount := false
	for _, l := range inv.Lines {
		discount = discount || l.Discount != 0
	}
	t := newTable(discount, inv.VatPayer)
	d.onBreak = func() {
		d.continuation(ref)
		d.tableHeader(t)
	}
	d.ensure(headH + 2*lh)
	d.tableHeader(t)
	d.lines(t, inv.Lines)
	d.onBreak = func() { d.continuation(ref) }

	// VAT recapitulation
	var rows []sumRow
	if inv.VatPayer {
		d.vatRecap(inv.VatRows)
		rows = []sumRow{{"Celkem bez DPH", Money(inv.Base)}, {"DPH", Money(inv.Vat)}}
	}

	q := qrBlock{payload: inv.QR, size: 32, title: "QR Platba", text: "Naskenujte v bankovní aplikaci."}
	if err := d.totals(rows, "Celkem k úhradě", inv.Total, inv.Footer, q); err != nil {
		return nil, err
	}

	d.paragraph("Poznámka", inv.Note)
	d.ensure(lh + 4)
	d.SetY(d.GetY() + 2)
	d.font("", size, cGrey)
	d.CellFormat(width, lh, "Vystavil: "+inv.Supplier.Name, "", 1, "L", false, 0, "")
	return d.output()
}

// vatRecap draws the table „Rekapitulace DPH“ (Sazba | Základ | DPH | Celkem) on the right.
func (d *doc) vatRecap(rs []VatRow) {
	if len(rs) == 0 {
		return
	}
	cols := []float64{22, 28, 24, 28}
	w := sum(cols)
	x := right - w
	d.ensure(4 + 5 + headH + float64(len(rs))*(lh+1))
	y := d.GetY() + 4
	d.SetXY(x, y)
	d.font("B", 7, cAccent)
	d.CellFormat(w, 5, "REKAPITULACE DPH", "", 0, "L", false, 0, "")
	y += 5
	d.fill(cTint)
	d.Rect(x, y, w, headH, "F")
	d.SetXY(x, y)
	d.font("B", 8, cAccent)
	for i, s := range []string{"Sazba", "Základ", "DPH", "Celkem"} {
		d.CellFormat(cols[i], headH, s, "", 0, "R", false, 0, "")
	}
	y += headH
	d.font("", size, cText)
	for _, r := range rs {
		d.SetXY(x, y)
		for i, s := range []string{strconv.Itoa(r.Rate) + nbsp + "%", Money(r.Base), Money(r.Vat), Money(r.Base + r.Vat)} {
			d.CellFormat(cols[i], lh+1, s, "", 0, "R", false, 0, "")
		}
		y += lh + 1
		d.rule(cRule, 0.2)
		d.Line(x, y, right, y)
	}
	d.SetY(y)
}
