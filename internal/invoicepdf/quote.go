package invoicepdf

import (
	"strconv"
	"strings"
)

// Section is a part of a quote: "Práce", "Materiál", "Ostatní".
type Section struct {
	Title    string
	Lines    []Line
	Subtotal int64 // haléře
}

// RoomMeasure is the measurement summary of a room (zaměření).
type RoomMeasure struct {
	Name      string
	Floor     float64 // m²
	Wall      float64 // m²
	Perimeter float64 // bm (floor perimeter)
	Length    float64 // bm (length elements)
	Pieces    float64 // ks
}

// Quote is the quote document (cenová nabídka).
type Quote struct {
	Firm        Party
	Logo        []byte // PNG, JPEG or GIF; other formats are left out
	Customer    Party
	Number      string
	Title       string // "Koupelna — Novákovi"
	SiteAddress string
	IssuedOn    string // YYYY-MM-DD
	ValidUntil  string // YYYY-MM-DD, "" = not printed
	Intro       string
	Sections    []Section // sections without lines are left out
	Measures    []RoomMeasure
	VatPayer    bool
	VatRate     int
	Subtotal    int64
	Discount    int64 // positive amount of the document discount, 0 = no row
	DiscountPct float64
	Base        int64
	Vat         int64
	Total       int64
	Note        string
	Terms       string
	URL         string // where the customer accepts the quote, "" = not printed
}

// QuoteFilename is the quote's file name.
func QuoteFilename(number string) string {
	return "nabidka-" + safeName(number) + ".pdf"
}

// QuotePDF renders the quote.
func QuotePDF(q Quote) (_ []byte, err error) {
	defer recovered(&err)
	ref := "Cenová nabídka č. " + q.Number
	d := newDoc(strings.TrimSpace(ref+" "+q.Title), q.Firm.Name, ref)
	d.AddPage()
	d.header(q.Logo, "Cenová nabídka", q.Title, q.Number)
	d.parties("Zhotovitel", q.Firm, "Objednatel", q.Customer)
	d.onBreak = func() { d.continuation(ref) }

	left := [][2]string{{"Datum vystavení", Date(q.IssuedOn)}}
	if q.ValidUntil != "" {
		left = append(left, [2]string{"Platnost do", Date(q.ValidUntil)})
	}
	var rightCol [][2]string
	if s := strings.TrimSpace(q.SiteAddress); s != "" {
		rightCol = append(rightCol, [2]string{"Místo realizace", s})
	}
	d.infoGrid(left, rightCol)
	d.paragraph("", q.Intro)

	if len(q.Measures) > 0 {
		d.measures(ref, q.Measures)
	}

	discount := false
	for _, s := range q.Sections {
		for _, l := range s.Lines {
			discount = discount || l.Discount != 0
		}
	}
	t := newTable(discount, false)
	var rows []sumRow
	for _, s := range q.Sections {
		if len(s.Lines) == 0 {
			continue
		}
		d.section(ref, t, s)
		rows = append(rows, sumRow{s.Title, Money(s.Subtotal)})
	}
	d.onBreak = func() { d.continuation(ref) }

	if q.Discount != 0 {
		label := "Sleva"
		if q.DiscountPct != 0 {
			label += " " + Quantity(q.DiscountPct) + nbsp + "%"
		}
		rows = append(rows, sumRow{label, Money(-q.Discount)})
	}
	totalLabel, footer := "Celkem", "Nejsem plátce DPH."
	if q.VatPayer {
		rows = append(rows, sumRow{"Základ DPH", Money(q.Base)}, sumRow{"DPH " + strconv.Itoa(q.VatRate) + nbsp + "%", Money(q.Vat)})
		totalLabel, footer = "Celkem vč. DPH", ""
	}
	qb := qrBlock{size: 24}
	if u := strings.TrimSpace(q.URL); u != "" {
		qb = qrBlock{payload: u, size: 24, link: u, title: "Přijetí nabídky",
			text: "Nabídku si můžete prohlédnout a jedním kliknutím přijmout online:"}
	}
	if err := d.totals(rows, totalLabel, q.Total, footer, qb); err != nil {
		return nil, err
	}

	d.paragraph("Poznámka", q.Note)
	d.paragraph("Podmínky", q.Terms)
	return d.output()
}

// section draws the section title, the table header, the lines and the subtotal row.
func (d *doc) section(ref string, t table, s Section) {
	title := func(cont bool) {
		d.font("B", 11, cAccent)
		txt := s.Title
		if cont {
			txt += " (pokračování)"
		}
		d.SetX(margin)
		d.CellFormat(width, 7, txt, "", 1, "L", false, 0, "")
		d.tableHeader(t)
	}
	first := d.layoutLine(t, s.Lines[0])
	d.ensure(4 + 7 + headH + first.h)
	d.SetY(d.GetY() + 2)
	title(false)
	d.onBreak = func() {
		d.continuation(ref)
		title(true)
	}
	for i, l := range s.Lines {
		lay := d.layoutLine(t, l)
		if i == len(s.Lines)-1 {
			d.ensure(lay.h + lh + 2) // the subtotal row is not left alone on the next page
		} else {
			d.ensure(lay.h)
		}
		d.lineRow(t, l, lay)
	}
	d.onBreak = func() { d.continuation(ref) }
	y := d.GetY()
	d.rule(cAccent, 0.4)
	d.Line(margin, y, right, y)
	d.SetXY(margin, y+0.6)
	d.font("", size, cGrey)
	last := t.cols[len(t.cols)-1].w
	d.CellFormat(width-last, lh+0.6, s.Title+" celkem", "", 0, "R", false, 0, "")
	d.font("B", size, cText)
	d.CellFormat(last, lh+0.6, Money(s.Subtotal), "", 1, "R", false, 0, "")
	d.SetY(d.GetY() + 3)
}

// measures draws the compact table „Zaměření“ with a total row.
func (d *doc) measures(ref string, ms []RoomMeasure) {
	cols := []column{{"Místnost", 0, "L"}, {"Podlaha m²", 24, "R"}, {"Stěny m²", 24, "R"}, {"Obvod bm", 24, "R"},
		{"Délky bm", 24, "R"}, {"Kusy ks", 20, "R"}}
	cols[0].w = width
	for _, c := range cols[1:] {
		cols[0].w -= c.w
	}
	t := table{cols: cols}
	head := func() {
		d.font("B", 11, cAccent)
		d.SetX(margin)
		d.CellFormat(width, 7, "Zaměření", "", 1, "L", false, 0, "")
		d.tableHeader(t)
	}
	d.ensure(4 + 7 + headH + 2*lh)
	d.SetY(d.GetY() + 2)
	head()
	d.onBreak = func() {
		d.continuation(ref)
		head()
	}
	num := func(v float64) string {
		if v == 0 {
			return "–"
		}
		return Quantity(v)
	}
	var tot RoomMeasure
	row := func(m RoomMeasure, bold bool) {
		style := ""
		if bold {
			style = "B"
		}
		d.SetFont("noto", style, size)
		name := d.wrap(m.Name, cols[0].w)
		h := float64(len(name))*lh + 1
		d.ensure(h)
		y := d.GetY()
		d.font(style, size, cText)
		for k, s := range name {
			d.SetXY(margin, y+0.5+float64(k)*lh)
			d.CellFormat(cols[0].w, lh, s, "", 0, "L", false, 0, "")
		}
		d.SetXY(margin+cols[0].w, y+0.5)
		for i, v := range []float64{m.Floor, m.Wall, m.Perimeter, m.Length, m.Pieces} {
			d.CellFormat(cols[i+1].w, lh, num(v), "", 0, "R", false, 0, "")
		}
		d.rule(cRule, 0.2)
		d.Line(margin, y+h, right, y+h)
		d.SetY(y + h)
	}
	for _, m := range ms {
		row(m, false)
		tot.Floor += m.Floor
		tot.Wall += m.Wall
		tot.Perimeter += m.Perimeter
		tot.Length += m.Length
		tot.Pieces += m.Pieces
	}
	if len(ms) > 1 {
		tot.Name = "Celkem"
		row(tot, true)
	}
	d.onBreak = func() { d.continuation(ref) }
	d.SetY(d.GetY() + 3)
}
