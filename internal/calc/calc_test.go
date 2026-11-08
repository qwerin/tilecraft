package calc

import "testing"

// The paper quote of the bathroom (docs/SPEC.md §0).
func TestPaperQuote(t *testing.T) {
	rooms := []Room{{Name: "Koupelna", Surfaces: []Surface{
		{Name: "Podlaha", Kind: KindFloor, Width: 2.95, Height: 1.56},
		{Name: "Stěna u okna", Kind: KindWall, Width: 2.95, Height: 2.1},
		{Name: "Stěna u dveří", Kind: KindWall, Width: 2.44, Height: 2.1, Deductions: []Deduction{{Name: "Dveře", Width: 0.8, Height: 1.97}}},
		{Name: "Lišta", Kind: KindLength, Width: 7.96},
		{Name: "Vykružování", Kind: KindPiece, Count: 14},
	}}}
	s := Total(rooms, nil)
	if s.Floor != 4.6 || s.Wall != 9.75 || s.Perimeter != 9.02 || s.Length != 7.96 || s.Pieces != 14 {
		t.Fatalf("summary %+v", s)
	}
	if q := Quantity(rooms, MeasureWall, nil, 10); q != 10.73 {
		t.Fatalf("wall +10 %% = %v", q)
	}
	if q := Quantity(rooms, MeasureFloor, []string{"Kuchyň"}, 0); q != 0 {
		t.Fatalf("other room = %v", q)
	}
	cases := []struct {
		q    float64
		p    int64
		d    float64
		want int64
	}{
		{4.6, 15000, 0, 69000},      // pancéřové pletivo
		{14.11, 65000, 0, 917200},   // obklad
		{11.52, 6000, 0, 69100},     // hydroizolační páska
		{2, 169400, 25, 254100},     // lepidlo 3 388 − 25 %
		{6, 95700, 35, 373200},      // lepidlo na dlažbu 5 742 − 35 %
		{1, 32700, 25, 24500},       // 327 − 25 % = 245,25 → 245
	}
	for _, c := range cases {
		if got := LineAmount(c.q, c.p, c.d, false); got != c.want {
			t.Errorf("%v × %v − %v %% = %v, want %v", c.q, c.p, c.d, got, c.want)
		}
	}
	if LineAmount(1, 30000, 0, true) != 0 {
		t.Error("customer supplied")
	}
	tot := Sum([]SectionAmount{{"work", 2225600}, {"material", 1608800}, {"other", 210000}}, 0, 0)
	if tot.Total != 4044400 || tot.Work != 2225600 {
		t.Fatalf("totals %+v", tot)
	}
	tot = Sum([]SectionAmount{{"work", 1000000}}, 5, 12)
	if tot.Discount != 50000 || tot.Base != 950000 || tot.Vat != 114000 || tot.Total != 1064000 {
		t.Fatalf("discount/vat %+v", tot)
	}
}

func TestManualAreaAndCount(t *testing.T) {
	a := 3.3
	s := Total([]Room{{Surfaces: []Surface{
		{Kind: KindWall, Area: &a, Deductions: []Deduction{{Width: 0.5, Height: 0.5, Count: 2}}},
		{Kind: KindWall, Width: 1, Height: 2, Count: 2},
		{Kind: KindFloor, Area: &a},
	}}}, nil)
	if s.Wall != 6.8 || s.Floor != 3.3 || s.Perimeter != 0 {
		t.Fatalf("%+v", s)
	}
}
