package api

import (
	"context"
	"net/http"
	"slices"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/calc"
	"github.com/qwerin/tilecraft/internal/model"
)

// Units of the price list (SPEC §4).
var units = []string{"m2", "bm", "ks", "hod", "kpl", "bal", "kg", "l", "km"}

// CatalogInput is a price-list item (SPEC §4).
type CatalogInput struct {
	Kind          string  `json:"kind" enum:"work,material,other" doc:"work = labour, material, other = travel, waste disposal …"`
	Code          string  `json:"code,omitempty" maxLength:"30"`
	Name          string  `json:"name" minLength:"1" maxLength:"300"`
	Unit          string  `json:"unit" enum:"m2,bm,ks,hod,kpl,bal,kg,l,km"`
	Price         int64   `json:"price" minimum:"0" doc:"Selling price per unit in haléře (1 Kč = 100), without VAT for a VAT payer"`
	PurchasePrice int64   `json:"purchase_price,omitempty" minimum:"0" doc:"Purchase price per unit in haléře (optional)"`
	Discount      float64 `json:"discount,omitempty" minimum:"0" maximum:"100" doc:"Default discount in % (supplier discount on material)"`
	Measure       string  `json:"measure,omitempty" enum:",floor,wall,area,perimeter,length,piece" doc:"Quantity from the measurements: floor/wall/area (m²), perimeter (of floors, bm), length (linear elements, bm), piece; empty = entered by hand"`
	Waste         float64 `json:"waste,omitempty" minimum:"0" maximum:"100" doc:"% added to a measured quantity (tile cutting waste)"`
	Note          string  `json:"note,omitempty" maxLength:"2000"`
	Active        bool    `json:"active"`
	Position      int     `json:"position,omitempty"`
}

// CatalogItem is a price-list item.
type CatalogItem struct {
	ID uint `json:"id"`
	CatalogInput
}

func toCatalogItem(c *model.CatalogItem) CatalogItem {
	return CatalogItem{ID: c.ID, CatalogInput: CatalogInput{Kind: c.Kind, Code: c.Code, Name: c.Name, Unit: c.Unit, Price: c.Price,
		PurchasePrice: c.PurchasePrice, Discount: c.Discount, Measure: c.Measure, Waste: c.Waste, Note: c.Note, Active: c.Active, Position: c.Position}}
}

func (b *CatalogInput) apply(c *model.CatalogItem) error {
	if !slices.Contains(units, b.Unit) {
		return invalid("unit", "unknown unit")
	}
	if b.Measure != "" && !slices.Contains(calc.Measures, b.Measure) {
		return invalid("measure", "unknown measure")
	}
	c.Kind, c.Code, c.Name, c.Unit = b.Kind, strings.TrimSpace(b.Code), strings.TrimSpace(b.Name), b.Unit
	c.Price, c.PurchasePrice, c.Discount, c.Measure, c.Waste = b.Price, b.PurchasePrice, b.Discount, b.Measure, b.Waste
	c.Note, c.Active, c.Position = b.Note, b.Active, b.Position
	if c.Name == "" {
		return invalid("name", "required")
	}
	return nil
}

func (s *server) registerCatalog(g huma.API) {
	huma.Get(g, "/catalog", s.listCatalog, auth.ForManagers)
	huma.Post(g, "/catalog", s.createCatalogItem, status(http.StatusCreated), auth.ForManagers)
	huma.Put(g, "/catalog/{id}", s.updateCatalogItem, auth.ForManagers)
	huma.Delete(g, "/catalog/{id}", s.deleteCatalogItem, status(http.StatusNoContent), auth.ForManagers)
}

func (s *server) listCatalog(ctx context.Context, in *struct {
	Kind     string `query:"kind" enum:",work,material,other"`
	Q        string `query:"q" doc:"Search code and name"`
	Inactive bool   `query:"inactive" doc:"Include inactive items"`
}) (*Out[[]CatalogItem], error) {
	q := s.scoped(ctx).Order("kind DESC, position, name") // work, other, material
	if in.Kind != "" {
		q = q.Where("kind = ?", in.Kind)
	}
	if !in.Inactive {
		q = q.Where("active = ?", true)
	}
	if in.Q != "" {
		p := like(in.Q)
		q = q.Where("LOWER(name) LIKE ? OR LOWER(code) LIKE ?", p, p)
	}
	return all(q, toCatalogItem)
}

func (s *server) loadCatalogItem(ctx context.Context, id uint) (*model.CatalogItem, error) {
	var c model.CatalogItem
	if err := s.scoped(ctx).First(&c, id).Error; err != nil {
		return nil, dbErr(err, "catalog item")
	}
	return &c, nil
}

func (s *server) createCatalogItem(ctx context.Context, in *struct{ Body CatalogInput }) (*Out[CatalogItem], error) {
	c := model.CatalogItem{AccountID: accountID(ctx)}
	if err := in.Body.apply(&c); err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Create(&c).Error; err != nil {
		return nil, dbErr(err, "catalog item")
	}
	return &Out[CatalogItem]{Body: toCatalogItem(&c)}, nil
}

func (s *server) updateCatalogItem(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body CatalogInput
}) (*Out[CatalogItem], error) {
	c, err := s.loadCatalogItem(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	if err := in.Body.apply(c); err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).Save(c).Error; err != nil {
		return nil, dbErr(err, "catalog item")
	}
	return &Out[CatalogItem]{Body: toCatalogItem(c)}, nil
}

// deleteCatalogItem deletes an unused item; a used one is only deactivated
// (lines keep their copy of the name and price anyway).
func (s *server) deleteCatalogItem(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*NoContent, error) {
	c, err := s.loadCatalogItem(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var n, m int64
		if err := tx.Model(&model.QuoteLine{}).Where("catalog_item_id = ?", c.ID).Count(&n).Error; err != nil {
			return err
		}
		if err := tx.Model(&model.JobLine{}).Where("catalog_item_id = ?", c.ID).Count(&m).Error; err != nil {
			return err
		}
		if n+m > 0 {
			return tx.Model(c).Update("active", false).Error
		}
		return tx.Delete(c).Error
	})
	if err != nil {
		return nil, dbErr(err, "catalog item")
	}
	return &NoContent{}, nil
}

const defaultQuoteTerms = `Ceny jsou platné po dobu platnosti nabídky. Množství materiálu a práce vychází ze zaměření; účtuje se skutečně provedené množství.
Materiál označený „dodá zákazník“ zajišťuje objednatel včas před zahájením prací.
Na provedené práce poskytujeme záruku 24 měsíců.
Platba: záloha na materiál před zahájením, doplatek po předání díla, splatnost faktury 14 dní.`

// defaultCatalog is the starting price list of a new firm (prices from the
// paper quotes, SPEC §0); the firm adjusts it.
var defaultCatalog = []model.CatalogItem{
	{Kind: model.SectionWork, Name: "Bourání, stržení původní krytiny, příprava podkladu", Unit: "hod", Price: 40000},
	{Kind: model.SectionWork, Name: "Penetrace / adhezní můstek", Unit: "m2", Price: 4000, Measure: calc.MeasureArea},
	{Kind: model.SectionWork, Name: "Montáž pancéřového pletiva", Unit: "m2", Price: 15000, Measure: calc.MeasureFloor},
	{Kind: model.SectionWork, Name: "Hydroizolační stěrka (2 vrstvy)", Unit: "m2", Price: 12000},
	{Kind: model.SectionWork, Name: "Montáž hydroizolační pásky", Unit: "bm", Price: 6000, Measure: calc.MeasurePerimeter},
	{Kind: model.SectionWork, Name: "Montáž dlažby, spárování epoxidem, silikon", Unit: "m2", Price: 65000, Measure: calc.MeasureFloor},
	{Kind: model.SectionWork, Name: "Montáž obkladu, spárování, silikon", Unit: "m2", Price: 65000, Measure: calc.MeasureWall},
	{Kind: model.SectionWork, Name: "Atypické prvky (tvar, sparování epoxidem)", Unit: "m2", Price: 100000},
	{Kind: model.SectionWork, Name: "Montáž platformy pod vaničku", Unit: "kpl", Price: 120000},
	{Kind: model.SectionWork, Name: "Montáž ukončovací lišty", Unit: "bm", Price: 9000, Measure: calc.MeasureLength},
	{Kind: model.SectionWork, Name: "Vykružování otvorů", Unit: "ks", Price: 8500, Measure: calc.MeasurePiece},
	{Kind: model.SectionWork, Name: "Montáž akrylátu", Unit: "bm", Price: 3000},
	{Kind: model.SectionMaterial, Name: "Adhezní můstek 1 l", Unit: "ks", Price: 30000},
	{Kind: model.SectionMaterial, Name: "Pancéřové pletivo Codex CX 410", Unit: "m2", Price: 27000, Measure: calc.MeasureFloor},
	{Kind: model.SectionMaterial, Name: "Hydroizolační stěrka Codex Hydrostop", Unit: "m2", Price: 34000},
	{Kind: model.SectionMaterial, Name: "Hydroizolační páska", Unit: "bm", Price: 8400, Measure: calc.MeasurePerimeter},
	{Kind: model.SectionMaterial, Name: "Hydroizolační lepidlo SK 100", Unit: "ks", Price: 32700, Discount: 25},
	{Kind: model.SectionMaterial, Name: "Lepidlo Codex CX9 25 kg", Unit: "bal", Price: 169400, Discount: 25},
	{Kind: model.SectionMaterial, Name: "Lepidlo Mapei Ultralite", Unit: "bal", Price: 95700, Discount: 35},
	{Kind: model.SectionMaterial, Name: "Epoxidová spárovací hmota složka A+B Codex", Unit: "kpl", Price: 110800},
	{Kind: model.SectionMaterial, Name: "Silikon sanitární", Unit: "ks", Price: 10000},
	{Kind: model.SectionMaterial, Name: "Silikon akryl bílý", Unit: "ks", Price: 11500},
	{Kind: model.SectionMaterial, Name: "Ukončovací lišta bílá 2,5 m", Unit: "ks", Price: 25500},
	{Kind: model.SectionMaterial, Name: "Obklad (dle výběru zákazníka)", Unit: "m2", Price: 0, Measure: calc.MeasureWall, Waste: 10},
	{Kind: model.SectionMaterial, Name: "Dlažba (dle výběru zákazníka)", Unit: "m2", Price: 0, Measure: calc.MeasureFloor, Waste: 10},
	{Kind: model.SectionOther, Name: "Cestovné", Unit: "km", Price: 1200},
	{Kind: model.SectionOther, Name: "Odvoz a likvidace odpadu", Unit: "kpl", Price: 150000},
}

// seedCatalog fills the price list of a new firm.
func seedCatalog(tx *gorm.DB, accountID uint) error {
	items := slices.Clone(defaultCatalog)
	for i := range items {
		items[i].AccountID, items[i].Active, items[i].Position = accountID, true, i
	}
	return tx.Create(&items).Error
}
