package api

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/calc"
	"github.com/qwerin/tilecraft/internal/config"
	"github.com/qwerin/tilecraft/internal/model"
)

// Demo logins created by SeedDemo.
const (
	DemoEmail       = "demo@tilecraft.cz"
	DemoWorkerEmail = "parta@tilecraft.cz"
	DemoPassword    = "demo1234"
)

// SeedDemo creates a demo firm unless the demo user exists already: the default
// price list, customers, the bathroom quote of the paper example (SPEC §0) as a
// job in progress with a paid advance, a finished invoiced job, a sent quote and
// a draft. Everything goes through the API handlers. Names are invented.
func SeedDemo(ctx context.Context, db *gorm.DB, cfg config.Config) (bool, error) {
	var n int64
	if err := db.Model(&model.User{}).Where("email IN ?", []string{DemoEmail, DemoWorkerEmail}).Count(&n).Error; err != nil || n > 0 {
		return false, err
	}
	now := time.Now()
	s := &server{db: db, cfg: cfg, deps: withDefaultDeps(Deps{Now: func() time.Time { return now }})}
	if err := seedDemo(ctx, s, db); err != nil {
		var em *ErrorModel
		if errors.As(err, &em) {
			for _, d := range em.Errors {
				err = fmt.Errorf("%w; %s: %s", err, d.Location, d.Message)
			}
		}
		return false, err
	}
	return true, nil
}

func ptr[T any](v T) *T { return &v }

func seedDemo(ctx context.Context, s *server, db *gorm.DB) error {
	hash, err := auth.HashPassword(DemoPassword)
	if err != nil {
		return err
	}
	owner := model.User{Email: DemoEmail, PasswordHash: hash, Name: "Jan Obkladač"}
	worker := model.User{Email: DemoWorkerEmail, PasswordHash: hash, Name: "Petr Parťák"}
	var acc *model.Account
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&owner).Error; err != nil {
			return err
		}
		if err := tx.Create(&worker).Error; err != nil {
			return err
		}
		var err error
		if acc, err = createAccount(tx, owner.ID, "Obklady Demo", "Jan", "Obkladač"); err != nil {
			return err
		}
		acc.RegistrationNo, acc.Street, acc.City, acc.Zip = "12345678", "Dlažební 12", "Brno", "602 00"
		acc.Phone, acc.Email, acc.BankAccount, acc.Web = "+420 777 123 456", "demo@tilecraft.cz", "2000145399/2010", "tilecraft.svobo.cz"
		acc.QuoteIntro = "Děkujeme za poptávku. Na základě zaměření Vám nabízíme provedení obkladačských prací:"
		if err := tx.Save(acc).Error; err != nil {
			return err
		}
		return tx.Create(&model.Membership{AccountID: acc.ID, UserID: worker.ID, Role: model.RoleWorker, FirstName: "Petr", LastName: "Parťák",
			Phone: "+420 605 555 666", Color: "#f97316"}).Error
	})
	if err != nil {
		return err
	}
	var m, wm model.Membership
	if err := db.Where("account_id = ? AND user_id = ?", acc.ID, owner.ID).First(&m).Error; err != nil {
		return err
	}
	if err := db.Where("account_id = ? AND user_id = ?", acc.ID, worker.ID).First(&wm).Error; err != nil {
		return err
	}
	ctx = auth.WithAccount(auth.WithUser(ctx, &owner), acc, &m)

	var items []model.CatalogItem
	if err := db.Where("account_id = ?", acc.ID).Find(&items).Error; err != nil {
		return err
	}
	cat := map[string]uint{}
	for _, it := range items {
		cat[it.Name] = it.ID
	}
	line := func(name string) LineInput {
		id, ok := cat[name]
		if !ok {
			panic("demo catalog item " + name)
		}
		return LineInput{CatalogItemID: &id}
	}
	qty := func(l LineInput, q float64) LineInput { l.Quantity, l.Measure = &q, ptr(""); return l }
	supplied := func(l LineInput, q float64) LineInput { l = qty(l, q); l.CustomerSupplied = true; return l }

	customers := []CustomerInput{
		{Name: "Marie Nováková", Email: "novakova@example.cz", Phone: "+420 603 111 222", Street: "Lipová 8", City: "Brno", Zip: "612 00"},
		{Name: "Tomáš Dvořák", Email: "dvorak@example.cz", Phone: "+420 604 333 444", Street: "Na Výsluní 21", City: "Kuřim", Zip: "664 34"},
		{Name: "Bytové družstvo Slunečná", ContactPerson: "Ing. Eva Malá", RegistrationNo: "87654321", Email: "spravce@example.cz",
			Street: "Slunečná 1", City: "Brno", Zip: "625 00"},
	}
	ids := make([]uint, len(customers))
	for i := range customers {
		out, err := s.createCustomer(ctx, &struct{ Body CustomerInput }{Body: customers[i]})
		if err != nil {
			return err
		}
		ids[i] = out.Body.ID
	}

	// the paper bathroom (SPEC §0)
	bathroom := []calc.Room{{Name: "Koupelna", Surfaces: []calc.Surface{
		{Name: "Podlaha", Kind: calc.KindFloor, Width: 2.95, Height: 1.56},
		{Name: "Stěna za vanou", Kind: calc.KindWall, Width: 2.95, Height: 2.1},
		{Name: "Stěna u dveří", Kind: calc.KindWall, Width: 2.95, Height: 2.1, Deductions: []calc.Deduction{{Name: "Dveře", Width: 0.8, Height: 1.97}}},
		{Name: "Boční stěna", Kind: calc.KindWall, Width: 1.56, Height: 2.1},
		{Name: "Boční stěna u okna", Kind: calc.KindWall, Width: 1.56, Height: 2.1, Deductions: []calc.Deduction{{Name: "Okno", Width: 0.9, Height: 0.6}}},
		{Name: "Lišta", Kind: calc.KindLength, Width: 6.25},
		{Name: "Vykružování", Kind: calc.KindPiece, Count: 14},
	}}, {Name: "WC", Surfaces: []calc.Surface{
		{Name: "Podlaha", Kind: calc.KindFloor, Width: 1.25, Height: 0.9},
		{Name: "Stěna za WC", Kind: calc.KindWall, Width: 0.9, Height: 1.5},
	}}}
	bathLines := []LineInput{
		qty(line("Bourání, stržení původní krytiny, příprava podkladu"), 7),
		line("Montáž pancéřového pletiva"),
		qty(line("Hydroizolační stěrka (2 vrstvy)"), 6.6),
		qty(line("Montáž hydroizolační pásky"), 11.52),
		line("Montáž dlažby, spárování epoxidem, silikon"),
		line("Montáž obkladu, spárování, silikon"),
		qty(line("Atypické prvky (tvar, sparování epoxidem)"), 1.8),
		qty(line("Montáž platformy pod vaničku"), 1),
		line("Montáž ukončovací lišty"),
		line("Vykružování otvorů"),
		qty(line("Montáž akrylátu"), 9),
		supplied(line("Adhezní můstek 1 l"), 1),
		line("Pancéřové pletivo Codex CX 410"),
		qty(line("Hydroizolační stěrka Codex Hydrostop"), 6.6),
		qty(line("Hydroizolační páska"), 11.52),
		qty(line("Hydroizolační lepidlo SK 100"), 1),
		qty(line("Lepidlo Codex CX9 25 kg"), 2),
		qty(line("Lepidlo Mapei Ultralite"), 6),
		qty(line("Epoxidová spárovací hmota složka A+B Codex"), 1),
		supplied(line("Silikon sanitární"), 3),
		qty(line("Ukončovací lišta bílá 2,5 m"), 3),
		supplied(line("Obklad (dle výběru zákazníka)"), 0),
		supplied(line("Dlažba (dle výběru zákazníka)"), 0),
		qty(line("Cestovné"), 175),
	}
	// measured tiles: keep the measure (customer supplied)
	for i := len(bathLines) - 3; i < len(bathLines)-1; i++ {
		bathLines[i].Measure, bathLines[i].Quantity = nil, nil
	}
	today := s.today()
	q1, err := s.createQuote(ctx, &struct{ Body QuoteInput }{Body: QuoteInput{CustomerID: ids[0], Title: "Koupelna a WC — Nováková",
		SiteAddress: "Lipová 8, Brno", IssuedOn: addDays(today, -20), ShowMeasure: true, Rooms: bathroom, Lines: bathLines}})
	if err != nil {
		return fmt.Errorf("demo quote: %w", err)
	}
	if _, err := s.sendQuote(ctx, &struct {
		ID   uint `path:"id"`
		Body QuoteSend
	}{ID: q1.Body.ID, Body: QuoteSend{MarkOnly: true}}); err != nil {
		return err
	}
	job, err := s.createJobFromQuote(ctx, &struct {
		ID   uint `path:"id"`
		Body *JobFromQuote
	}{ID: q1.Body.ID, Body: &JobFromQuote{StartOn: addDays(today, -3), EndOn: addDays(today, 6)}})
	if err != nil {
		return fmt.Errorf("demo job: %w", err)
	}
	if err := db.Model(&model.Job{}).Where("id = ?", job.Body.ID).Updates(map[string]any{"state": model.JobInProgress,
		"worker_ids": fmt.Sprintf("[%d,%d]", m.ID, wm.ID), "site_contact": "klíč u sousedky, byt č. 3"}).Error; err != nil {
		return err
	}
	adv, err := s.invoiceJob(ctx, &struct {
		ID   uint `path:"id"`
		Body JobInvoiceInput
	}{ID: job.Body.ID, Body: JobInvoiceInput{Kind: model.InvoiceAdvance, Amount: 1500000, IssuedOn: addDays(today, -8)}})
	if err != nil {
		return fmt.Errorf("demo advance: %w", err)
	}
	if _, err := s.markInvoicePaid(ctx, &struct {
		ID   uint `path:"id"`
		Body PaidInput
	}{ID: adv.Body.ID, Body: PaidInput{PaidOn: ptr(addDays(today, -5))}}); err != nil {
		return err
	}
	for _, n := range []JobNoteInput{{On: addDays(today, -3), Text: "Stržen korek, penetrace, pletivo na podlaze."},
		{On: addDays(today, -1), Text: "Hydroizolace hotová. Chybí 2 balení lepidla Ultralite — dovézt zítra."}} {
		if _, err := s.addJobNote(ctx, &struct {
			ID   uint `path:"id"`
			Body JobNoteInput
		}{ID: job.Body.ID, Body: n}); err != nil {
			return err
		}
	}

	// a finished and invoiced job
	hall := []calc.Room{{Name: "Chodba", Surfaces: []calc.Surface{{Name: "Podlaha", Kind: calc.KindFloor, Width: 4.2, Height: 1.3}}}}
	q2, err := s.createQuote(ctx, &struct{ Body QuoteInput }{Body: QuoteInput{CustomerID: ids[1], Title: "Dlažba na chodbě — Dvořák",
		SiteAddress: "Na Výsluní 21, Kuřim", IssuedOn: addDays(today, -60), Rooms: hall, Lines: []LineInput{
			line("Montáž dlažby, spárování epoxidem, silikon"), qty(line("Lepidlo Codex CX9 25 kg"), 1),
			supplied(line("Dlažba (dle výběru zákazníka)"), 0), qty(line("Cestovné"), 40)}}})
	if err != nil {
		return err
	}
	job2, err := s.createJobFromQuote(ctx, &struct {
		ID   uint `path:"id"`
		Body *JobFromQuote
	}{ID: q2.Body.ID})
	if err != nil {
		return err
	}
	if err := db.Model(&model.Job{}).Where("id = ?", job2.Body.ID).Updates(map[string]any{"state": model.JobDone,
		"start_on": addDays(today, -40), "end_on": addDays(today, -38)}).Error; err != nil {
		return err
	}
	inv, err := s.invoiceJob(ctx, &struct {
		ID   uint `path:"id"`
		Body JobInvoiceInput
	}{ID: job2.Body.ID, Body: JobInvoiceInput{Kind: model.InvoiceRegular, IssuedOn: addDays(today, -37)}})
	if err != nil {
		return fmt.Errorf("demo invoice: %w", err)
	}
	if _, err := s.markInvoicePaid(ctx, &struct {
		ID   uint `path:"id"`
		Body PaidInput
	}{ID: inv.Body.ID, Body: PaidInput{PaidOn: ptr(addDays(today, -30))}}); err != nil {
		return err
	}

	// a sent quote and a draft
	kitchen := []calc.Room{{Name: "Kuchyň", Surfaces: []calc.Surface{{Name: "Kuchyňská linka", Kind: calc.KindWall, Width: 3.4, Height: 0.6}}}}
	q3, err := s.createQuote(ctx, &struct{ Body QuoteInput }{Body: QuoteInput{CustomerID: ids[1], Title: "Obklad kuchyňské linky — Dvořák",
		SiteAddress: "Na Výsluní 21, Kuřim", IssuedOn: addDays(today, -4), Rooms: kitchen, Lines: []LineInput{
			line("Montáž obkladu, spárování, silikon"), qty(line("Lepidlo Codex CX9 25 kg"), 1), line("Obklad (dle výběru zákazníka)"),
			qty(line("Cestovné"), 40)}}})
	if err != nil {
		return err
	}
	if _, err := s.sendQuote(ctx, &struct {
		ID   uint `path:"id"`
		Body QuoteSend
	}{ID: q3.Body.ID, Body: QuoteSend{MarkOnly: true}}); err != nil {
		return err
	}
	stairs := []calc.Room{{Name: "Schodiště 1. NP", Surfaces: []calc.Surface{{Name: "Stupně", Kind: calc.KindFloor, Width: 1.2, Height: 0.3, Count: 16},
		{Name: "Podstupnice", Kind: calc.KindWall, Width: 1.2, Height: 0.17, Count: 16}, {Name: "Sokl", Kind: calc.KindLength, Width: 9.6}}}}
	_, err = s.createQuote(ctx, &struct{ Body QuoteInput }{Body: QuoteInput{CustomerID: ids[2], Title: "Schodiště — BD Slunečná",
		SiteAddress: "Slunečná 1, Brno", Rooms: stairs, Lines: []LineInput{line("Montáž dlažby, spárování epoxidem, silikon"),
			line("Montáž obkladu, spárování, silikon"), line("Montáž ukončovací lišty"), line("Dlažba (dle výběru zákazníka)"),
			qty(line("Odvoz a likvidace odpadu"), 1)}}})
	return err
}
