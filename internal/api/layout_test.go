package api_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/calc"
)

// Laying plan (SPEC §5.6): the layout of a surface and the positions of the openings are stored with the
// measurements as they are, do not change the areas and are validated.
func TestLayingPlanLayout(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	cust := doJSON[api.Customer](a, http.StatusCreated, "POST", a.acct("/customers"), api.CustomerInput{Name: "Zákazník"})
	rooms := bathroom()
	plain := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "Koupelna", Rooms: rooms})

	waste := 12.0
	rooms[0].Surfaces[2].Layout = &calc.Layout{TileW: 30, TileH: 60, Grout: 2, Pattern: calc.PatternHalf, AlignX: "left", AlignY: "bottom",
		OffsetX: -5, Waste: &waste, BoxM2: 1.44}
	rooms[0].Surfaces[2].Deductions[0].X = ptr(0.2)
	rooms[0].Surfaces[2].Deductions[0].Y = ptr(0.0)
	rooms[0].Surfaces[3].Layout = &calc.Layout{TileW: 60, TileH: 60} // a length has no plan
	q := doJSON[api.Quote](a, http.StatusCreated, "POST", a.acct("/quotes"), api.QuoteInput{CustomerID: cust.ID, Title: "Koupelna", Rooms: rooms})
	s := q.Rooms[0].Surfaces[2]
	if s.Layout == nil || s.Layout.TileW != 30 || s.Layout.Pattern != "half" || s.Layout.OffsetX != -5 || *s.Layout.Waste != 12 || s.Layout.BoxM2 != 1.44 {
		t.Fatalf("layout %+v", s.Layout)
	}
	if d := s.Deductions[0]; d.X == nil || *d.X != 0.2 || d.Y == nil || *d.Y != 0 {
		t.Fatalf("position %+v", d)
	}
	if q.Rooms[0].Surfaces[3].Layout != nil {
		t.Fatalf("length with a layout")
	}
	if q.Measurements.Total != plain.Measurements.Total {
		t.Fatalf("areas changed %+v %+v", q.Measurements.Total, plain.Measurements.Total)
	}

	for _, bad := range []calc.Layout{{TileW: 0, TileH: 60}, {TileW: 60, TileH: 60, Grout: 80}, {TileW: 60, TileH: 60, Pattern: "diagonal"}} {
		rooms[0].Surfaces[1].Layout = &bad
		expect(t, a, http.StatusUnprocessableEntity, "PUT", a.acct(fmt.Sprintf("/quotes/%d", q.ID)), api.QuoteInput{CustomerID: cust.ID, Title: "Koupelna", Rooms: rooms})
	}
}
