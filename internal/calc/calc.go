// Package calc is the pure arithmetic of measurements, quantities and prices
// (SPEC §5.1–5.3). Lengths are metres, areas m², money haléře (int64).
package calc

import (
	"math"
	"slices"
)

// Surface kinds (SPEC §5.1).
const (
	KindFloor  = "floor"
	KindWall   = "wall"
	KindLength = "length" // linear element: Width = length in m
	KindPiece  = "piece"  // pieces: Count
)

// Measures: where a line's quantity comes from (SPEC §5.2).
const (
	MeasureFloor     = "floor"     // floor area
	MeasureWall      = "wall"      // wall area
	MeasureArea      = "area"      // floors + walls
	MeasurePerimeter = "perimeter" // perimeter of floors
	MeasureLength    = "length"    // linear elements
	MeasurePiece     = "piece"     // pieces
)

// Measures lists the valid measures.
var Measures = []string{MeasureFloor, MeasureWall, MeasureArea, MeasurePerimeter, MeasureLength, MeasurePiece}

// Deduction is an opening subtracted from a surface (window, door, bathtub).
type Deduction struct {
	Name   string  `json:"name"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
	Count  int     `json:"count,omitempty"` // 0 = 1
}

// Surface is one measured surface of a room.
type Surface struct {
	Name       string      `json:"name"`
	Kind       string      `json:"kind"`
	Width      float64     `json:"width"`
	Height     float64     `json:"height"`
	Count      int         `json:"count,omitempty"` // 0 = 1
	Area       *float64    `json:"area,omitempty"`  // manual area (irregular shape) instead of width × height
	Deductions []Deduction `json:"deductions,omitempty"`
}

// Room is a measured room.
type Room struct {
	Name     string    `json:"name"`
	Surfaces []Surface `json:"surfaces"`
}

// Summary sums the measurements of a room (or all rooms).
type Summary struct {
	Floor     float64 `json:"floor"`     // m²
	Wall      float64 `json:"wall"`      // m²
	Perimeter float64 `json:"perimeter"` // bm of floor perimeters
	Length    float64 `json:"length"`    // bm
	Pieces    float64 `json:"pieces"`
}

func count(n int) float64 {
	if n <= 0 {
		return 1
	}
	return float64(n)
}

// Round2 rounds to 2 decimal places.
func Round2(v float64) float64 { return math.Round(v*100) / 100 }

// SurfaceArea is the net area of a floor or wall (m², 2 decimals; never negative).
func SurfaceArea(s Surface) float64 {
	if s.Kind != KindFloor && s.Kind != KindWall {
		return 0
	}
	var a float64
	if s.Area != nil {
		a = *s.Area
	} else {
		a = s.Width * s.Height * count(s.Count)
	}
	for _, d := range s.Deductions {
		a -= d.Width * d.Height * count(d.Count)
	}
	return Round2(max(a, 0))
}

// Measure sums one surface into the summary.
func (sum *Summary) add(s Surface) {
	switch s.Kind {
	case KindFloor:
		sum.Floor += SurfaceArea(s)
		if s.Area == nil {
			sum.Perimeter += 2 * (s.Width + s.Height) * count(s.Count)
		}
	case KindWall:
		sum.Wall += SurfaceArea(s)
	case KindLength:
		sum.Length += s.Width * count(s.Count)
	case KindPiece:
		sum.Pieces += count(s.Count)
	}
}

func (sum Summary) rounded() Summary {
	return Summary{Floor: Round2(sum.Floor), Wall: Round2(sum.Wall), Perimeter: Round2(sum.Perimeter),
		Length: Round2(sum.Length), Pieces: sum.Pieces}
}

// RoomSummary sums one room.
func RoomSummary(r Room) Summary {
	var s Summary
	for _, f := range r.Surfaces {
		s.add(f)
	}
	return s.rounded()
}

// Total sums the rooms whose names are in only (empty = all rooms).
func Total(rooms []Room, only []string) Summary {
	var s Summary
	for _, r := range rooms {
		if len(only) > 0 && !slices.Contains(only, r.Name) {
			continue
		}
		for _, f := range r.Surfaces {
			s.add(f)
		}
	}
	return s.rounded()
}

// Of returns the value of a measure.
func (sum Summary) Of(measure string) float64 {
	switch measure {
	case MeasureFloor:
		return sum.Floor
	case MeasureWall:
		return sum.Wall
	case MeasureArea:
		return Round2(sum.Floor + sum.Wall)
	case MeasurePerimeter:
		return sum.Perimeter
	case MeasureLength:
		return sum.Length
	case MeasurePiece:
		return sum.Pieces
	}
	return 0
}

// Quantity is the quantity of a measured line: the measure over the rooms plus
// waste %, rounded to 2 decimals (pieces are rounded up to whole pieces).
func Quantity(rooms []Room, measure string, only []string, waste float64) float64 {
	q := Total(rooms, only).Of(measure) * (1 + waste/100)
	if measure == MeasurePiece {
		return math.Ceil(q - 1e-9)
	}
	return Round2(q)
}

// LineAmount is quantity × unit price − discount %, rounded to whole crowns
// like the paper quotes (SPEC §5.3); a customer-supplied line costs nothing.
func LineAmount(quantity float64, unitPrice int64, discount float64, customerSupplied bool) int64 {
	if customerSupplied {
		return 0
	}
	v := quantity * float64(unitPrice) * (1 - discount/100)
	return int64(math.Round(v/100)) * 100
}

// Totals of a quote or job.
type Totals struct {
	Work     int64 `json:"work"`
	Material int64 `json:"material"`
	Other    int64 `json:"other"`
	Subtotal int64 `json:"subtotal"` // sum of the lines
	Discount int64 `json:"discount"` // discount of the whole document (positive amount)
	Base     int64 `json:"base"`     // subtotal − discount (without VAT)
	VatRate  int   `json:"vat_rate"`
	Vat      int64 `json:"vat"`
	Total    int64 `json:"total"`
}

// SectionAmount is a line amount in its section.
type SectionAmount struct {
	Section string
	Amount  int64
}

// Sum computes the totals of lines with a document discount % and a VAT rate (0 = no VAT).
func Sum(lines []SectionAmount, discount float64, vatRate int) Totals {
	t := Totals{VatRate: vatRate}
	for _, l := range lines {
		switch l.Section {
		case "work":
			t.Work += l.Amount
		case "material":
			t.Material += l.Amount
		default:
			t.Other += l.Amount
		}
	}
	t.Subtotal = t.Work + t.Material + t.Other
	t.Discount = int64(math.Round(float64(t.Subtotal)*discount/100/100)) * 100
	t.Base = t.Subtotal - t.Discount
	t.Vat = int64(math.Round(float64(t.Base) * float64(vatRate) / 100))
	t.Total = t.Base + t.Vat
	return t
}
