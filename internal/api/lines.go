package api

import (
	"context"
	"fmt"
	"math"
	"slices"
	"strings"

	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/calc"
	"github.com/qwerin/tilecraft/internal/model"
)

// LineInput is a line of a quote or job (SPEC §5.3). With catalog_item_id the
// empty/omitted fields are taken from the price list.
type LineInput struct {
	Section          string   `json:"section,omitempty" enum:",work,material,other" doc:"Default = the catalog item's kind (else work)"`
	CatalogItemID    *uint    `json:"catalog_item_id,omitempty" doc:"Price-list item (list_catalog)"`
	Name             string   `json:"name,omitempty" maxLength:"300" doc:"Default = the catalog item's name"`
	Unit             string   `json:"unit,omitempty" maxLength:"10" doc:"m2, bm, ks, hod, kpl, bal, kg, l, km; default = the catalog item's unit"`
	Quantity         *float64 `json:"quantity,omitempty" minimum:"0" doc:"Ignored when measure is set (computed from the measurements)"`
	UnitPrice        *int64   `json:"unit_price,omitempty" minimum:"0" doc:"Haléře per unit (1 Kč = 100); default = the catalog price"`
	Discount         *float64 `json:"discount,omitempty" minimum:"0" maximum:"100" doc:"% off this line; default = the catalog discount"`
	CustomerSupplied bool     `json:"customer_supplied,omitempty" doc:"Material supplied by the customer: listed, costs 0"`
	Measure          *string  `json:"measure,omitempty" enum:",floor,wall,area,perimeter,length,piece" doc:"Quantity from the measurements; default = the catalog item's measure, \"\" = manual quantity"`
	Rooms            []string `json:"rooms,omitempty" doc:"Names of the rooms the measure sums (empty = all rooms)"`
	Waste            *float64 `json:"waste,omitempty" minimum:"0" maximum:"100" doc:"% added to the measured quantity; default = the catalog waste"`
	Note             string   `json:"note,omitempty" maxLength:"1000"`
}

// Line is a line with its computed amount.
type Line struct {
	ID               uint     `json:"id"`
	Section          string   `json:"section" enum:"work,material,other"`
	CatalogItemID    *uint    `json:"catalog_item_id"`
	Name             string   `json:"name"`
	Unit             string   `json:"unit"`
	Quantity         float64  `json:"quantity"`
	UnitPrice        int64    `json:"unit_price" doc:"haléře"`
	Discount         float64  `json:"discount"`
	CustomerSupplied bool     `json:"customer_supplied"`
	Measure          string   `json:"measure"`
	Rooms            []string `json:"rooms" nullable:"false"`
	Waste            float64  `json:"waste"`
	Note             string   `json:"note"`
	Amount           int64    `json:"amount" doc:"haléře without VAT, rounded to whole crowns"`
}

func toLine(id uint, l *model.LineData) Line {
	rooms := l.Rooms
	if rooms == nil {
		rooms = []string{}
	}
	return Line{ID: id, Section: l.Section, CatalogItemID: l.CatalogItemID, Name: l.Name, Unit: l.Unit, Quantity: l.Quantity,
		UnitPrice: l.UnitPrice, Discount: l.Discount, CustomerSupplied: l.CustomerSupplied, Measure: l.Measure, Rooms: rooms,
		Waste: l.Waste, Note: l.Note, Amount: l.Amount()}
}

// RoomSummary is a room's measured totals.
type RoomSummary struct {
	Name string `json:"name"`
	calc.Summary
}

// Measurements are the computed totals of the rooms.
type Measurements struct {
	Rooms    []RoomSummary `json:"rooms" nullable:"false"`
	Total    calc.Summary  `json:"total"`
	Surfaces [][]float64   `json:"surfaces" nullable:"false" doc:"Net area of every surface (m²) by room, in the order of rooms[].surfaces"`
}

func measurements(rooms []calc.Room) Measurements {
	m := Measurements{Rooms: []RoomSummary{}, Surfaces: [][]float64{}, Total: calc.Total(rooms, nil)}
	for _, r := range rooms {
		m.Rooms = append(m.Rooms, RoomSummary{Name: r.Name, Summary: calc.RoomSummary(r)})
		areas := make([]float64, len(r.Surfaces))
		for i, s := range r.Surfaces {
			areas[i] = calc.SurfaceArea(s)
		}
		m.Surfaces = append(m.Surfaces, areas)
	}
	return m
}

var surfaceKinds = []string{calc.KindFloor, calc.KindWall, calc.KindLength, calc.KindPiece}

// cleanRooms validates the measurements and names unnamed rooms (names must be unique: lines refer to them).
func cleanRooms(rooms []calc.Room) ([]calc.Room, error) {
	if rooms == nil {
		return []calc.Room{}, nil
	}
	seen := map[string]bool{}
	for i := range rooms {
		r := &rooms[i]
		r.Name = strings.TrimSpace(r.Name)
		if r.Name == "" {
			r.Name = fmt.Sprintf("Místnost %d", i+1)
		}
		if seen[r.Name] {
			return nil, invalid(fmt.Sprintf("rooms[%d].name", i), "room names must be unique")
		}
		seen[r.Name] = true
		if r.Surfaces == nil {
			r.Surfaces = []calc.Surface{}
		}
		for j := range r.Surfaces {
			f := &r.Surfaces[j]
			f.Name = strings.TrimSpace(f.Name)
			loc := fmt.Sprintf("rooms[%d].surfaces[%d]", i, j)
			if !slices.Contains(surfaceKinds, f.Kind) {
				return nil, invalid(loc+".kind", "floor, wall, length or piece")
			}
			if f.Width < 0 || f.Height < 0 || f.Count < 0 || (f.Area != nil && *f.Area < 0) || f.Width > 1000 || f.Height > 1000 {
				return nil, invalid(loc, "dimensions must be positive metres")
			}
			for k, d := range f.Deductions {
				if d.Width < 0 || d.Height < 0 || d.Count < 0 {
					return nil, invalid(fmt.Sprintf("%s.deductions[%d]", loc, k), "dimensions must be positive metres")
				}
			}
		}
	}
	return rooms, nil
}

// buildLines turns input lines into line data: catalog defaults, measured quantities.
func buildLines(ctx context.Context, tx *gorm.DB, rooms []calc.Room, in []LineInput) ([]model.LineData, error) {
	ids := []uint{}
	for _, l := range in {
		if l.CatalogItemID != nil {
			ids = append(ids, *l.CatalogItemID)
		}
	}
	items := map[uint]*model.CatalogItem{}
	if len(ids) > 0 {
		var rows []model.CatalogItem
		if err := tx.Scopes(inAccount(ctx)).Where("id IN ?", uniq(ids)).Find(&rows).Error; err != nil {
			return nil, err
		}
		for i := range rows {
			items[rows[i].ID] = &rows[i]
		}
	}
	roomNames := map[string]bool{}
	for _, r := range rooms {
		roomNames[r.Name] = true
	}
	out := make([]model.LineData, 0, len(in))
	for i, l := range in {
		loc := fmt.Sprintf("lines[%d]", i)
		d := model.LineData{Section: l.Section, Name: strings.TrimSpace(l.Name), Unit: strings.TrimSpace(l.Unit),
			CustomerSupplied: l.CustomerSupplied, Note: l.Note, Position: i}
		if l.CatalogItemID != nil {
			c, ok := items[*l.CatalogItemID]
			if !ok {
				return nil, invalid(loc+".catalog_item_id", "unknown catalog item")
			}
			d.CatalogItemID = &c.ID
			d.Section = defaultStr(d.Section, c.Kind)
			d.Name = defaultStr(d.Name, c.Name)
			d.Unit = defaultStr(d.Unit, c.Unit)
			d.UnitPrice, d.Discount, d.Measure, d.Waste = c.Price, c.Discount, c.Measure, c.Waste
		}
		d.Section = defaultStr(d.Section, model.SectionWork)
		if d.Name == "" {
			return nil, invalid(loc+".name", "a line needs a name or a catalog item")
		}
		apply(&d.UnitPrice, l.UnitPrice)
		apply(&d.Discount, l.Discount)
		apply(&d.Measure, l.Measure)
		apply(&d.Waste, l.Waste)
		if d.Measure != "" && !slices.Contains(calc.Measures, d.Measure) {
			return nil, invalid(loc+".measure", "unknown measure")
		}
		for _, r := range l.Rooms {
			if !roomNames[r] {
				return nil, invalid(loc+".rooms", fmt.Sprintf("no room named %q", r))
			}
		}
		if d.Measure != "" {
			d.Rooms = l.Rooms
			d.Quantity = calc.Quantity(rooms, d.Measure, d.Rooms, d.Waste)
		} else {
			if l.Quantity == nil {
				return nil, invalid(loc+".quantity", "required without a measure")
			}
			d.Quantity = calc.Round2(*l.Quantity)
		}
		if math.IsNaN(d.Quantity) || d.Quantity > 1e7 {
			return nil, invalid(loc+".quantity", "out of range")
		}
		out = append(out, d)
	}
	return out, nil
}

// remeasure recomputes the quantities of measured lines (after a change of the rooms).
func remeasure(rooms []calc.Room, lines []model.LineData) {
	for i := range lines {
		if lines[i].Measure != "" {
			lines[i].Quantity = calc.Quantity(rooms, lines[i].Measure, lines[i].Rooms, lines[i].Waste)
		}
	}
}

func totalsOf(lines []model.LineData, discount float64, vatRate int) calc.Totals {
	sa := make([]calc.SectionAmount, len(lines))
	for i := range lines {
		sa[i] = calc.SectionAmount{Section: lines[i].Section, Amount: lines[i].Amount()}
	}
	return calc.Sum(sa, discount, vatRate)
}

// toInputs turns stored lines back into inputs (copying a quote, a job).
func toInputs(lines []model.LineData) []LineInput {
	out := make([]LineInput, len(lines))
	for i, l := range lines {
		q, p, d, m, w := l.Quantity, l.UnitPrice, l.Discount, l.Measure, l.Waste
		out[i] = LineInput{Section: l.Section, CatalogItemID: l.CatalogItemID, Name: l.Name, Unit: l.Unit, Quantity: &q, UnitPrice: &p,
			Discount: &d, CustomerSupplied: l.CustomerSupplied, Measure: &m, Rooms: l.Rooms, Waste: &w, Note: l.Note}
	}
	return out
}
