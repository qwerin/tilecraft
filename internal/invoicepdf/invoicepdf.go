// Package invoicepdf renders the PDF documents of TileCraft (A4): the invoice
// (with QR Platba) and the quote (cenová nabídka, with a QR code of the link
// where the customer accepts it). Text is set in the embedded Noto Sans (OFL,
// fonts/OFL.txt), so Czech diacritics need no system fonts.
package invoicepdf

import (
	"bytes"
	_ "embed"
	"fmt"
	"image/color"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/boombuler/barcode/qr"
	"github.com/go-pdf/fpdf"
)

var (
	//go:embed fonts/NotoSans-Regular.ttf
	fontRegular []byte
	//go:embed fonts/NotoSans-Bold.ttf
	fontBold []byte
)

// compress the page streams (tests switch it off to read the text).
var compress = true

// Party is the supplier / firm or the client / customer of a document.
type Party struct {
	Name           string
	Street         string
	Zip            string
	City           string
	RegistrationNo string
	VatNo          string
	Contact        string // "telefon · e-mail"
}

// Line is a line of an invoice or of a quote section.
type Line struct {
	Text      string
	Unit      string  // "m2" (printed "m²"), "bm", "ks", "hod", "kpl", …
	Quantity  float64 // up to 2 decimals; 0 = quantity, unit and unit price are left blank
	UnitPrice int64   // haléře (negative for deductions)
	Discount  float64 // %, 0 = none
	VatRate   int     // %, printed only for VAT payers
	Amount    int64   // haléře, computed by the caller
	Note      string  // small grey second line (e.g. "dodá zákazník")
}

// safeName keeps only letters, digits and dashes (file names in headers).
func safeName(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r == '-' {
			return r
		}
		return -1
	}, s)
}

const (
	margin = 15.0
	width  = 180.0          // printable width (A4 210 − 2 × margin)
	right  = margin + width // right edge
	bottom = 15.0           // footer area
	lh     = 4.4            // line height
	size   = 9.0            // body font size (pt)
	small  = 7.5            // notes, labels
	nbsp   = " "
)

// colours: text, grey text, the accent (titles) and its light tint (total box, table header)
var (
	cText   = [3]int{20, 20, 20}
	cGrey   = [3]int{105, 105, 105}
	cAccent = [3]int{24, 74, 112}
	cTint   = [3]int{233, 240, 246}
	cRule   = [3]int{215, 215, 215}
)

type doc struct {
	*fpdf.Fpdf
	pageH   float64
	onBreak func() // after a page break (continuation line, table header)
}

// newDoc is an A4 document with the fonts and the footer „<footer> · strana n/N“.
func newDoc(title, author, footer string) *doc {
	f := fpdf.New("P", "mm", "A4", "")
	f.SetCompression(compress)
	f.SetMargins(margin, margin, margin)
	f.SetAutoPageBreak(false, bottom)
	f.AddUTF8FontFromBytes("noto", "", fontRegular)
	f.AddUTF8FontFromBytes("noto", "B", fontBold)
	title, author, footer = bmp(title), bmp(author), bmp(footer)
	f.SetTitle(title, true)
	f.SetAuthor(author, true)
	f.SetCreator("TileCraft", true)
	f.AliasNbPages("{nb}")
	_, pageH := f.GetPageSize()
	f.SetFooterFunc(func() {
		f.SetLineWidth(0.2)
		f.SetDrawColor(cRule[0], cRule[1], cRule[2])
		f.Line(margin, pageH-bottom+3, right, pageH-bottom+3)
		f.SetY(-bottom + 4)
		f.SetFont("noto", "", small)
		f.SetTextColor(cGrey[0], cGrey[1], cGrey[2])
		f.CellFormat(width/2, 4, author, "", 0, "L", false, 0, "")
		f.CellFormat(width/2, 4, fmt.Sprintf("%s · strana %d/{nb}", footer, f.PageNo()), "", 0, "R", false, 0, "")
	})
	return &doc{Fpdf: f, pageH: pageH}
}

// bmp replaces characters outside the Basic Multilingual Plane (emoji) with
// "?": the fonts have no glyphs for them and fpdf panics on them.
func bmp(s string) string {
	for _, r := range s {
		if r > 0xFFFF {
			return strings.Map(func(r rune) rune {
				if r > 0xFFFF {
					return '?'
				}
				return r
			}, s)
		}
	}
	return s
}

// CellFormat and GetStringWidth take any text (see bmp).
func (d *doc) CellFormat(w, h float64, txt, border string, ln int, align string, fill bool, link int, linkStr string) {
	d.Fpdf.CellFormat(w, h, bmp(txt), border, ln, align, fill, link, linkStr)
}

func (d *doc) GetStringWidth(s string) float64 { return d.Fpdf.GetStringWidth(bmp(s)) }

func (d *doc) color(c [3]int) { d.SetTextColor(c[0], c[1], c[2]) }
func (d *doc) fill(c [3]int)  { d.SetFillColor(c[0], c[1], c[2]) }
func (d *doc) rule(c [3]int, w float64) {
	d.SetDrawColor(c[0], c[1], c[2])
	d.SetLineWidth(w)
}

// font sets the font, its size and colour.
func (d *doc) font(style string, pt float64, c [3]int) {
	d.SetFont("noto", style, pt)
	d.color(c)
}

// recovered turns a panic of the PDF library into an error (no broken response).
func recovered(err *error) {
	if r := recover(); r != nil {
		*err = fmt.Errorf("pdf: %v", r)
	}
}

func (d *doc) output() ([]byte, error) {
	if err := d.Error(); err != nil {
		return nil, err
	}
	var b bytes.Buffer
	if err := d.Output(&b); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}

// ensure breaks the page when h does not fit.
func (d *doc) ensure(h float64) {
	if d.GetY()+h > d.pageH-bottom {
		d.newPage()
	}
}

func (d *doc) newPage() {
	d.AddPage()
	if d.onBreak != nil {
		d.onBreak()
	}
}

// continuation heads a further page: a grey line „<text> (pokračování)“.
func (d *doc) continuation(text string) {
	d.font("", small, cGrey)
	d.CellFormat(width, lh, text+" (pokračování)", "", 1, "L", false, 0, "")
	d.Ln(2)
}

// ---------------------------------------------------------------- header

// header draws the logo, the document title (and an optional subtitle) on the
// left and „číslo <number>“ on the right; it ends under them.
func (d *doc) header(logo []byte, title, subtitle, number string) {
	top := d.GetY()
	logoW, logoH := d.logo(logo, margin, top)
	x := margin
	if logoW > 0 {
		x += logoW + 5
	}
	const numW = 50.0
	d.font("B", 18, cAccent)
	pt := 18.0
	for pt > 11 && d.GetStringWidth(title)+2 > right-numW-x {
		pt--
		d.SetFontSize(pt)
	}
	textH := 9.0
	if subtitle != "" {
		textH += 6
	}
	ty := top + max(0, logoH-textH)/2
	d.SetXY(x, ty)
	d.CellFormat(right-numW-x, 9, title, "", 2, "L", false, 0, "")
	if subtitle != "" {
		d.SetX(x)
		d.font("", 11, cText)
		d.CellFormat(right-numW-x, 6, subtitle, "", 0, "L", false, 0, "")
	}
	d.SetXY(right-numW, top+0.5)
	d.font("", small, cGrey)
	d.CellFormat(numW, 4, "číslo", "", 2, "R", false, 0, "")
	d.SetX(right - numW)
	d.font("B", 14, cText)
	d.CellFormat(numW, 7, number, "", 0, "R", false, 0, "")
	y := top + max(logoH, textH, 12) + 3
	d.rule(cAccent, 0.6)
	d.Line(margin, y, right, y)
	d.SetY(y + 5)
}

// logo draws the logo at most 45×16 mm with its top left corner at x, y and
// returns its size (0 = not drawn).
func (d *doc) logo(data []byte, x, top float64) (float64, float64) {
	if len(data) == 0 {
		return 0, 0
	}
	tp := map[string]string{"image/png": "PNG", "image/jpeg": "JPG", "image/gif": "GIF"}[http.DetectContentType(data)]
	if tp == "" {
		return 0, 0
	}
	info := d.RegisterImageOptionsReader("logo", fpdf.ImageOptions{ImageType: tp}, bytes.NewReader(data))
	if d.Err() || info == nil || info.Width() <= 0 || info.Height() <= 0 {
		d.ClearError() // unsupported variant (e.g. interlaced PNG): no logo rather than no document
		return 0, 0
	}
	w, h := info.Width(), info.Height()
	scale := min(45/w, 16/h)
	w, h = w*scale, h*scale
	d.ImageOptions("logo", x, top, w, h, false, fpdf.ImageOptions{ImageType: tp}, 0, "")
	return w, h
}

// ---------------------------------------------------------------- parties

type styledLine struct {
	text string
	bold bool
}

func (d *doc) partyLines(p Party, w float64) []styledLine {
	var out []styledLine
	if strings.TrimSpace(p.Name) != "" {
		d.SetFont("noto", "B", size+1)
		for _, l := range d.wrap(p.Name, w) {
			out = append(out, styledLine{text: l, bold: true})
		}
	}
	d.SetFont("noto", "", size)
	add := func(s string) {
		if s = strings.TrimSpace(s); s != "" {
			for _, l := range d.wrap(s, w) {
				out = append(out, styledLine{text: l})
			}
		}
	}
	add(p.Street)
	add(strings.TrimSpace(p.Zip + " " + p.City))
	var ids []string
	if p.RegistrationNo != "" {
		ids = append(ids, "IČO: "+p.RegistrationNo)
	}
	if p.VatNo != "" {
		ids = append(ids, "DIČ: "+p.VatNo)
	}
	add(strings.Join(ids, " · "))
	add(p.Contact)
	if len(out) == 0 {
		out = append(out, styledLine{text: "—"})
	}
	return out
}

func partyHeight(lines []styledLine) float64 {
	h := 0.0
	for _, l := range lines {
		h += lh
		if l.bold {
			h += 0.6
		}
	}
	return h
}

// parties draws the two boxes side by side (supplier left, client right).
func (d *doc) parties(leftLabel string, left Party, rightLabel string, rightP Party) {
	boxW := (width - 6) / 2
	a, b := d.partyLines(left, boxW-4), d.partyLines(rightP, boxW-4)
	h := max(partyHeight(a), partyHeight(b)) + 4 + 5
	y := d.GetY()
	d.party(leftLabel, a, margin, y, boxW, h)
	d.party(rightLabel, b, margin+boxW+6, y, boxW, h)
	d.SetY(y + h + 5)
}

func (d *doc) party(label string, lines []styledLine, x, y, w, h float64) {
	d.rule(cRule, 0.25)
	d.Rect(x, y, w, h, "D")
	d.SetXY(x+2, y+2)
	d.font("B", 7, cAccent)
	d.CellFormat(w-4, 4, strings.ToUpper(label), "", 2, "L", false, 0, "")
	for _, l := range lines {
		d.SetX(x + 2)
		h := lh
		if l.bold {
			d.font("B", size+1, cText)
			h += 0.6
		} else {
			d.font("", size, cText)
		}
		d.CellFormat(w-4, h, l.text, "", 2, "L", false, 0, "")
	}
}

// infoGrid draws two columns of „label value“ pairs; values wrap.
func (d *doc) infoGrid(left, rightCol [][2]string) {
	const lw = 30.0          // label width
	vw := [2]float64{44, 72} // value widths (30 + 44 + 4 + 30 + 72 = 180)
	n := max(len(left), len(rightCol))
	for i := range n {
		var cells [2][2]string
		if i < len(left) {
			cells[0] = left[i]
		}
		if i < len(rightCol) {
			cells[1] = rightCol[i]
		}
		d.SetFont("noto", "B", size)
		var vals [2][]string
		rows := 1
		for c := range 2 {
			if cells[c][0] != "" {
				vals[c] = d.wrap(cells[c][1], vw[c])
				rows = max(rows, len(vals[c]))
			}
		}
		h := float64(rows)*lh + 0.6
		d.ensure(h)
		y := d.GetY()
		for c := range 2 {
			if cells[c][0] == "" {
				continue
			}
			x := margin + float64(c)*(lw+vw[0]+4)
			d.SetXY(x, y)
			d.font("", size, cGrey)
			d.CellFormat(lw, lh, cells[c][0], "", 0, "L", false, 0, "")
			d.font("B", size, cText)
			for k, v := range vals[c] {
				d.SetXY(x+lw, y+float64(k)*lh)
				d.CellFormat(vw[c], lh, v, "", 0, "L", false, 0, "")
			}
		}
		d.SetY(y + h)
	}
	d.SetY(d.GetY() + 4)
}

// paragraph prints an optional small label and the wrapped text.
func (d *doc) paragraph(label, text string) {
	text = strings.TrimSpace(text)
	if text == "" {
		return
	}
	d.SetFont("noto", "", size)
	lines := d.wrap(text, width)
	if label != "" {
		d.ensure(5 + lh*float64(min(len(lines), 2)))
		d.SetX(margin)
		d.font("B", 7, cAccent)
		d.CellFormat(width, 5, strings.ToUpper(label), "", 1, "L", false, 0, "")
	}
	d.font("", size, cText)
	for _, l := range lines {
		d.ensure(lh)
		d.SetX(margin)
		d.CellFormat(width, lh, l, "", 1, "L", false, 0, "")
	}
	d.Ln(3)
}

// ---------------------------------------------------------------- line tables

type column struct {
	title string
	w     float64
	align string
}

// table is the column layout of the line tables (Položka | Množství | MJ | Cena/MJ | [Sleva] | [DPH] | Celkem).
type table struct {
	cols          []column
	discount, vat bool
}

func newTable(discount, vat bool) table {
	cols := []column{{"Položka", 0, "L"}, {"Množství", 18, "R"}, {"MJ", 11, "C"}, {"Cena/MJ", 25, "R"}}
	if discount {
		cols = append(cols, column{"Sleva", 15, "R"})
	}
	if vat {
		cols = append(cols, column{"DPH", 12, "R"})
	}
	cols = append(cols, column{"Celkem", 27, "R"})
	cols[0].w = width
	for _, c := range cols[1:] {
		cols[0].w -= c.w
	}
	return table{cols: cols, discount: discount, vat: vat}
}

const headH = lh + 2.4

func (d *doc) tableHeader(t table) {
	y := d.GetY()
	d.fill(cTint)
	d.Rect(margin, y, width, headH, "F")
	d.SetXY(margin, y)
	d.font("B", 8, cAccent)
	for _, c := range t.cols {
		d.CellFormat(c.w, headH, c.title, "", 0, c.align, false, 0, "")
	}
	d.SetY(y + headH + 0.4)
}

type lineLayout struct {
	text, note []string
	h          float64
}

const noteLH = 3.5

func (d *doc) layoutLine(t table, l Line) lineLayout {
	d.SetFont("noto", "", size)
	text := d.wrap(l.Text, t.cols[0].w)
	var note []string
	if n := strings.TrimSpace(l.Note); n != "" {
		d.SetFont("noto", "", small)
		note = d.wrap(n, t.cols[0].w)
	}
	return lineLayout{text: text, note: note, h: float64(len(text))*lh + float64(len(note))*noteLH + 1.8}
}

// lineRow draws a table line; ensure is the caller's job (height from layoutLine).
func (d *doc) lineRow(t table, l Line, lay lineLayout) {
	y := d.GetY()
	d.font("", size, cText)
	for k, s := range lay.text {
		d.SetXY(margin, y+0.9+float64(k)*lh)
		d.CellFormat(t.cols[0].w, lh, s, "", 0, "L", false, 0, "")
	}
	if len(lay.note) > 0 {
		d.font("", small, cGrey)
		for k, s := range lay.note {
			d.SetXY(margin, y+0.9+float64(len(lay.text))*lh+float64(k)*noteLH)
			d.CellFormat(t.cols[0].w, noteLH, s, "", 0, "L", false, 0, "")
		}
	}
	d.font("", size, cText)
	x := margin + t.cols[0].w
	for _, c := range t.cols[1:] {
		v := ""
		switch c.title {
		case "Množství":
			if l.Quantity != 0 {
				v = Quantity(l.Quantity)
			}
		case "MJ":
			if l.Quantity != 0 {
				v = Unit(l.Unit)
			}
		case "Cena/MJ":
			if l.UnitPrice != 0 {
				v = Money(l.UnitPrice)
			}
		case "Sleva":
			if l.Discount != 0 {
				v = "−" + Quantity(l.Discount) + nbsp + "%"
			}
		case "DPH":
			v = strconv.Itoa(l.VatRate) + nbsp + "%"
		case "Celkem":
			v = Money(l.Amount)
		}
		d.SetXY(x, y+0.9)
		if c.title == "Celkem" {
			d.SetFont("noto", "B", size)
		}
		d.CellFormat(c.w, lh, v, "", 0, c.align, false, 0, "")
		x += c.w
	}
	d.rule(cRule, 0.2)
	d.Line(margin, y+lay.h, right, y+lay.h)
	d.SetY(y + lay.h)
}

// lines draws the lines; a page break repeats the table header (onBreak must draw it).
func (d *doc) lines(t table, ls []Line) {
	for _, l := range ls {
		lay := d.layoutLine(t, l)
		d.ensure(lay.h)
		d.lineRow(t, l, lay)
	}
}

// ---------------------------------------------------------------- totals

type sumRow struct {
	label, value string
}

// qrBlock is the QR code at the left of the totals with a title and text.
type qrBlock struct {
	payload, title, text, link string
	size                       float64
}

const totalW = 78.0

// totals draws the summary rows and the total box on the right, the QR
// block on the left and the footer text under the total box.
func (d *doc) totals(rows []sumRow, totalLabel string, total int64, footer string, q qrBlock) error {
	d.SetFont("noto", "", small)
	var foot []string
	if f := strings.TrimSpace(footer); f != "" {
		foot = d.wrap(f, totalW)
	}
	const rowH, boxH = lh + 1.2, 15.0
	rightH := float64(len(rows))*rowH + boxH + float64(len(foot))*3.6
	if len(foot) > 0 {
		rightH += 1.5
	}
	qrH := 0.0
	if q.payload != "" {
		qrH = q.size
	}
	d.ensure(max(rightH, qrH) + 4)
	y := d.GetY() + 4
	x := right - totalW

	if q.payload != "" {
		if err := d.qr(q.payload, margin, y, q.size); err != nil {
			return err
		}
		tx := margin + q.size + 3
		tw := x - 6 - tx
		d.SetXY(tx, y+3)
		d.font("B", size, cText)
		d.CellFormat(tw, lh, q.title, "", 2, "L", false, 0, "")
		d.font("", 8, cGrey)
		for _, l := range d.wrap(q.text, tw) {
			d.SetX(tx)
			d.CellFormat(tw, 3.8, l, "", 2, "L", false, 0, "")
		}
		if q.link != "" {
			d.font("", 8, cAccent)
			for _, l := range d.wrap(q.link, tw) {
				d.SetX(tx)
				d.CellFormat(tw, 3.8, l, "", 2, "L", false, 0, q.link)
			}
		}
	}

	ry := y
	for _, r := range rows {
		d.SetXY(x, ry)
		d.font("", size, cGrey)
		d.CellFormat(totalW/2+8, rowH, r.label, "", 0, "L", false, 0, "")
		d.font("", size, cText)
		d.CellFormat(totalW/2-8, rowH, r.value, "", 0, "R", false, 0, "")
		ry += rowH
	}
	if len(rows) > 0 {
		ry += 0.5
	}
	d.fill(cTint)
	d.Rect(x, ry, totalW, boxH, "F")
	d.rule(cAccent, 0.6)
	d.Line(x, ry, right, ry)
	d.SetXY(x+2, ry+1.6)
	d.font("", 8, cAccent)
	d.CellFormat(totalW-5, 4, totalLabel, "", 2, "L", false, 0, "")
	d.SetX(x)
	d.font("B", 15, cText)
	d.CellFormat(totalW-3, 7.5, Money(total), "", 0, "R", false, 0, "")
	ry += boxH
	if len(foot) > 0 {
		ry += 1.5
		d.font("", small, cGrey)
		for _, l := range foot {
			d.SetXY(x, ry)
			d.CellFormat(totalW, 3.6, l, "", 0, "R", false, 0, "")
			ry += 3.6
		}
	}
	d.SetY(max(ry, y+qrH) + 6)
	return nil
}

// qr draws the QR code (level M, as QR Platba recommends) with a quiet zone of 4 modules into a square of the size.
func (d *doc) qr(payload string, x, y, size float64) error {
	code, err := qr.Encode(payload, qr.M, qr.Unicode)
	if err != nil {
		return err
	}
	n := code.Bounds().Dx()
	m := size / float64(n+8)
	d.SetFillColor(0, 0, 0)
	for row := range n {
		for col := 0; col < n; {
			if !dark(code.At(col, row)) {
				col++
				continue
			}
			run := col
			for run < n && dark(code.At(run, row)) {
				run++
			}
			d.Rect(x+float64(4+col)*m, y+float64(4+row)*m, float64(run-col)*m, m, "F")
			col = run
		}
	}
	return nil
}

func dark(c color.Color) bool {
	r, g, b, _ := c.RGBA()
	return r+g+b < 3*0x8000
}

// ---------------------------------------------------------------- text

// wrap splits s into lines of at most w mm (cell padding included) in the current font; long words are cut.
func (d *doc) wrap(s string, w float64) []string {
	w -= 2 * 1.0 // fpdf's default cell margin is 1 mm on each side
	var lines []string
	for _, para := range strings.Split(s, "\n") {
		line := ""
		for _, word := range strings.Split(para, " ") { // not Fields: a non-breaking space stays inside the word
			if word == "" {
				continue
			}
			cand := word
			if line != "" {
				cand = line + " " + word
			}
			if d.GetStringWidth(cand) <= w {
				line = cand
				continue
			}
			if line != "" {
				lines = append(lines, line)
			}
			line = word
			for d.GetStringWidth(line) > w {
				r := []rune(line)
				n := len(r) - 1
				for n > 1 && d.GetStringWidth(string(r[:n])) > w {
					n--
				}
				lines = append(lines, string(r[:n]))
				line = string(r[n:])
			}
		}
		if line != "" || len(lines) == 0 {
			lines = append(lines, line)
		}
	}
	return lines
}

// Quantity formats a quantity Czech style with at most 2 decimals: „14,11“, „7“, „1 250,5“.
func Quantity(q float64) string {
	q = math.Round(q*100) / 100
	sign := ""
	if q < 0 {
		sign, q = "-", -q
	}
	s := strconv.FormatFloat(q, 'f', -1, 64)
	whole, frac, _ := strings.Cut(s, ".")
	var b strings.Builder
	for i, c := range whole {
		if i > 0 && (len(whole)-i)%3 == 0 {
			b.WriteString(nbsp)
		}
		b.WriteRune(c)
	}
	if frac != "" {
		b.WriteString("," + frac)
	}
	return sign + b.String()
}

// Unit prints a unit code: "m2" → „m²“, "m3" → „m³“, others as they are.
func Unit(u string) string {
	switch strings.ToLower(strings.TrimSpace(u)) {
	case "m2":
		return "m²"
	case "m3":
		return "m³"
	}
	return u
}

func sum(v []float64) float64 {
	s := 0.0
	for _, x := range v {
		s += x
	}
	return s
}

// Money formats haléře as „3 300 Kč“ / „3 300,50 Kč“ (non-breaking spaces).
func Money(minor int64) string {
	sign := ""
	if minor < 0 {
		sign, minor = "-", -minor
	}
	s := strconv.FormatInt(minor/100, 10)
	var b strings.Builder
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			b.WriteString(nbsp)
		}
		b.WriteRune(c)
	}
	if h := minor % 100; h != 0 {
		fmt.Fprintf(&b, ",%02d", h)
	}
	return sign + b.String() + nbsp + "Kč"
}

// Date formats YYYY-MM-DD as „1. 9. 2026“.
func Date(d string) string {
	t, err := time.Parse(time.DateOnly, d)
	if err != nil {
		return d
	}
	return fmt.Sprintf("%d. %d. %d", t.Day(), int(t.Month()), t.Year())
}
