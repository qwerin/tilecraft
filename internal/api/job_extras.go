package api

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/calc"
	"github.com/qwerin/tilecraft/internal/model"
)

// Extra work and costs of a job, travel costs and the revised quote (SPEC §6.1):
// lines added during the job carry `extra`; at completion the office adds the
// travel costs and sends the customer a revised quote (a new Quote with JobID)
// whose acceptance only records the customer's agreement on the job.

// JobExtraInput records extra work or an extra cost on a job (crew members too:
// their price is ignored and the office prices the line later).
type JobExtraInput struct {
	Section   string   `json:"section,omitempty" enum:",work,material,other" doc:"work = extra work, material = extra material or cost, other; default work"`
	Name      string   `json:"name" minLength:"1" maxLength:"300" doc:"What was done or bought (\"Vyrovnání podlahy\", \"Lepidlo navíc\")"`
	Unit      string   `json:"unit,omitempty" maxLength:"10" doc:"m2, bm, ks, hod, kpl…; default hod for work, ks otherwise"`
	Quantity  float64  `json:"quantity" minimum:"0" maximum:"1000000"`
	UnitPrice *int64   `json:"unit_price,omitempty" minimum:"0" doc:"Haléře per unit (office only; crew members' lines stay unpriced = 0)"`
	Discount  *float64 `json:"discount,omitempty" minimum:"0" maximum:"100"`
	Note      string   `json:"note,omitempty" maxLength:"1000"`
}

// JobTravelInput sets the travel costs of a job (one "Cestovné" line in section other).
type JobTravelInput struct {
	Km      float64 `json:"km,omitempty" minimum:"0" maximum:"100000" doc:"Kilometres of one trip (there and back)"`
	Trips   int     `json:"trips,omitempty" minimum:"0" maximum:"1000" doc:"Number of trips; default 1"`
	PerKm   *int64  `json:"per_km,omitempty" minimum:"0" doc:"Haléře per km; default = the catalog item \"Cestovné\" (else the current line's price)"`
	LumpSum *int64  `json:"lump_sum,omitempty" minimum:"0" doc:"Haléře: a flat amount instead of km × trips"`
	Remove  bool    `json:"remove,omitempty" doc:"Remove the travel line"`
}

// JobExtras sums the lines added during the job.
type JobExtras struct {
	Count    int   `json:"count"`
	Unpriced int   `json:"unpriced" doc:"Extra lines without a price (recorded by the crew, to be priced by the office)"`
	Amount   int64 `json:"amount" doc:"haléře without VAT (0 for workers)"`
}

// RevisionOf links a revised quote to its job and the original quote.
type RevisionOf struct {
	JobID       uint   `json:"job_id"`
	JobNumber   string `json:"job_number"`
	QuoteID     *uint  `json:"quote_id" doc:"The original quote (missing for a job without one)"`
	QuoteNumber string `json:"quote_number"`
	QuoteTotal  int64  `json:"quote_total" doc:"haléře with VAT of the original quote"`
}

func (s *server) registerJobExtras(g huma.API) {
	huma.Post(g, "/jobs/{id}/extras", s.addJobExtra, status(http.StatusCreated), auth.ForAll)
	huma.Put(g, "/jobs/{id}/travel", s.setJobTravel, auth.ForManagers)
	huma.Post(g, "/jobs/{id}/revised-quote", s.createRevisedQuote, status(http.StatusCreated), auth.ForManagers)
}

func jobExtras(lines []model.LineData, manager bool) JobExtras {
	var e JobExtras
	for i := range lines {
		l := &lines[i]
		if !l.Extra {
			continue
		}
		e.Count++
		if l.UnitPrice == 0 && !l.CustomerSupplied {
			e.Unpriced++
		}
		if manager {
			e.Amount += l.Amount()
		}
	}
	return e
}

// saveJobLines replaces the lines of a loaded job and its stored total (inside tx).
func saveJobLines(tx *gorm.DB, j *model.Job, lines []model.LineData) error {
	for i := range lines {
		lines[i].Position = i
	}
	j.Total = totalsOf(lines, j.Discount, j.VatRate).Total
	if err := tx.Model(j).Update("total", j.Total).Error; err != nil {
		return err
	}
	if err := tx.Where("job_id = ?", j.ID).Delete(&model.JobLine{}).Error; err != nil {
		return err
	}
	if len(lines) == 0 {
		return nil
	}
	rows := make([]model.JobLine, len(lines))
	for i := range lines {
		rows[i] = model.JobLine{JobID: j.ID, LineData: lines[i]}
	}
	return tx.Create(&rows).Error
}

func jobLocked(j *model.Job) error {
	if j.State == model.JobInvoiced || j.State == model.JobCancelled {
		return conflict(CodeInvoiced, "the job is invoiced or cancelled")
	}
	return nil
}

// insertAfterSection puts the line after the last line of its section (sections stay grouped).
func insertAfterSection(lines []model.LineData, l model.LineData) []model.LineData {
	order := map[string]int{model.SectionWork: 0, model.SectionMaterial: 1, model.SectionOther: 2}
	at := 0
	for i := range lines {
		if order[lines[i].Section] <= order[l.Section] {
			at = i + 1
		}
	}
	return append(lines[:at], append([]model.LineData{l}, lines[at:]...)...)
}

func (s *server) addJobExtra(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body JobExtraInput
}) (*Out[Job], error) {
	b := &in.Body
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		j, err := s.loadJob(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		if err := jobLocked(j); err != nil {
			return err
		}
		l := model.LineData{Section: defaultStr(b.Section, model.SectionWork), Name: strings.TrimSpace(b.Name), Unit: strings.TrimSpace(b.Unit),
			Quantity: calc.Round2(b.Quantity), Note: strings.TrimSpace(b.Note), Extra: true}
		if l.Name == "" {
			return invalid("name", "required")
		}
		if l.Unit == "" {
			l.Unit = map[bool]string{true: "hod", false: "ks"}[l.Section == model.SectionWork]
		}
		if isManager(ctx) {
			apply(&l.UnitPrice, b.UnitPrice)
			apply(&l.Discount, b.Discount)
		} else if m := memberName(auth.MemberFrom(ctx)); m != "" {
			l.Note = strings.TrimSpace(l.Note + " (zapsal " + m + ")")
		}
		return saveJobLines(tx, j, insertAfterSection(jobLineData(j), l))
	})
	if err != nil {
		return nil, wrapTx(err, "job")
	}
	return s.jobOut(ctx, in.ID)
}

// travelLine reports whether a line is the job's travel costs.
func travelLine(l *model.LineData, catalogID uint) bool {
	if l.Section != model.SectionOther {
		return false
	}
	if catalogID != 0 && l.CatalogItemID != nil && *l.CatalogItemID == catalogID {
		return true
	}
	return strings.HasPrefix(strings.ToLower(l.Name), "cestovné")
}

func (s *server) setJobTravel(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body JobTravelInput
}) (*Out[Job], error) {
	b := &in.Body
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		j, err := s.loadJob(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		if err := jobLocked(j); err != nil {
			return err
		}
		var item model.CatalogItem
		if err := tx.Scopes(inAccount(ctx)).Where("kind = ? AND LOWER(name) LIKE ?", model.SectionOther, "cestovn%").
			Order("active DESC, id").Limit(1).Find(&item).Error; err != nil {
			return err
		}
		lines := jobLineData(j)
		at := -1
		for i := range lines {
			if travelLine(&lines[i], item.ID) {
				at = i
				break
			}
		}
		if b.Remove {
			if at >= 0 {
				lines = append(lines[:at], lines[at+1:]...)
			}
			return saveJobLines(tx, j, lines)
		}
		l := model.LineData{Section: model.SectionOther, Name: "Cestovné", Extra: j.QuoteID != nil}
		if at >= 0 {
			l = lines[at]
		} else if item.ID != 0 {
			l.CatalogItemID, l.Name = &item.ID, item.Name
		}
		l.Measure, l.Rooms, l.Waste, l.CustomerSupplied, l.Discount = "", nil, 0, false, 0
		trips := max(b.Trips, 1)
		switch {
		case b.LumpSum != nil:
			l.Unit, l.Quantity, l.UnitPrice, l.Note = "kpl", 1, *b.LumpSum, ""
			if b.Trips > 0 {
				l.Note = fmt.Sprintf("%d × cesta", b.Trips)
			}
		case b.Km > 0:
			perKm := item.Price
			if at >= 0 && lines[at].Unit == "km" && lines[at].UnitPrice > 0 {
				perKm = lines[at].UnitPrice
			}
			apply(&perKm, b.PerKm)
			l.Unit, l.Quantity, l.UnitPrice = "km", calc.Round2(b.Km*float64(trips)), perKm
			l.Note = fmt.Sprintf("%d × %s km", trips, strings.ReplaceAll(fmt.Sprint(calc.Round2(b.Km)), ".", ","))
		default:
			return invalid("km", "kilometres or a lump sum are required")
		}
		if at >= 0 {
			lines[at] = l
		} else {
			lines = insertAfterSection(lines, l)
		}
		return saveJobLines(tx, j, lines)
	})
	if err != nil {
		return nil, wrapTx(err, "job")
	}
	return s.jobOut(ctx, in.ID)
}

// revisionOf describes the job (and its original quote) a revised quote updates; nil for other quotes.
func (s *server) revisionOf(db *gorm.DB, q *model.Quote) *RevisionOf {
	if q.JobID == nil {
		return nil
	}
	var j model.Job
	if err := db.Where("account_id = ?", q.AccountID).Select("id", "number", "quote_id").First(&j, *q.JobID).Error; err != nil {
		return nil
	}
	out := &RevisionOf{JobID: j.ID, JobNumber: j.Number}
	if j.QuoteID != nil {
		var o model.Quote
		if err := db.Where("account_id = ?", q.AccountID).Select("id", "number", "total").First(&o, *j.QuoteID).Error; err == nil {
			out.QuoteID, out.QuoteNumber, out.QuoteTotal = &o.ID, o.Number, o.Total
		}
	}
	return out
}

const revisionSuffix = " – upravená nabídka (vícepráce)"

// revisedQuoteInput is the revised quote of a job: its current lines and measurements.
func (s *server) revisedQuoteInput(ctx context.Context, tx *gorm.DB, j *model.Job) QuoteInput {
	acc := auth.AccountFrom(ctx)
	title := strings.TrimSpace(j.Title)
	if r := []rune(title); len(r) > 200-len([]rune(revisionSuffix)) {
		title = string(r[:200-len([]rune(revisionSuffix))])
	}
	terms, show := acc.QuoteTerms, false
	// the "update of quote NA…" note is printed by the public page and the PDF (Revises), so the intro stays the firm's own
	intro := acc.QuoteIntro
	if j.QuoteID != nil {
		if o, err := s.loadQuote(ctx, tx, *j.QuoteID); err == nil {
			terms, show, intro = o.Terms, o.ShowMeasure, o.Intro
		}
	}
	vat := j.VatRate
	return QuoteInput{CustomerID: j.CustomerID, Title: title + revisionSuffix, SiteAddress: j.SiteAddress, Intro: &intro, Terms: &terms,
		VatRate: &vat, Discount: j.Discount, ShowMeasure: show, Rooms: j.Rooms, Lines: toInputs(jobLineData(j))}
}

// createRevisedQuote makes the revised quote of a job (or refreshes its draft)
// from the job's current lines; it is sent like any quote.
func (s *server) createRevisedQuote(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*Out[Quote], error) {
	var q *model.Quote
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		j, err := s.loadJob(ctx, tx, in.ID)
		if err != nil {
			return err
		}
		if j.State == model.JobCancelled {
			return conflict(CodeInvoiced, "the job is cancelled")
		}
		if len(j.Lines) == 0 {
			return conflict(CodeNothingToBill, "the job has no lines")
		}
		b := s.revisedQuoteInput(ctx, tx, j)
		var draft model.Quote
		if err := tx.Scopes(inAccount(ctx)).Where("job_id = ? AND state = ?", j.ID, model.QuoteDraft).Order("id DESC").Limit(1).Find(&draft).Error; err != nil {
			return err
		}
		if draft.ID != 0 {
			q = &draft
			b.IssuedOn = s.today()
			b.ValidUntil = addDays(b.IssuedOn, max(auth.AccountFrom(ctx).QuoteValidDays, 1))
			return s.fillQuote(ctx, tx, q, &b)
		}
		q = &model.Quote{AccountID: accountID(ctx), State: model.QuoteDraft, PublicToken: publicToken(), CreatedByID: auth.UserFrom(ctx).ID, JobID: &j.ID}
		num, err := nextNumber(tx, q.AccountID, "quote", "NA", s.deps.Now().In(prague).Year(), 3)
		if err != nil {
			return err
		}
		q.Number = num
		return s.fillQuote(ctx, tx, q, &b)
	})
	if err != nil {
		return nil, wrapTx(err, "quote")
	}
	return s.quoteOut(ctx, q.ID)
}

// noteRevisionDecision writes the customer's decision on a revised quote into the job's diary.
func (s *server) noteRevisionDecision(db *gorm.DB, q *model.Quote, userID uint) {
	if q.JobID == nil || (q.State != model.QuoteAccepted && q.State != model.QuoteRejected) {
		return
	}
	verb := "přijal"
	if q.State == model.QuoteRejected {
		verb = "odmítl"
	}
	who := strings.TrimSpace(q.DecidedBy)
	if who == "" {
		who = "Zákazník"
	} else {
		who = "Zákazník " + who
	}
	text := fmt.Sprintf("%s %s upravenou nabídku %s (%s).", who, verb, q.Number, money(q.Total))
	if r := strings.TrimSpace(q.Reason); r != "" {
		text += " Vzkaz: " + r
	}
	n := model.JobNote{AccountID: q.AccountID, JobID: *q.JobID, UserID: userID, On: s.today(), Text: text}
	if err := db.Create(&n).Error; err != nil {
		slog.Error("revision decision note", "quote", q.ID, "err", err)
	}
}

// jobRevisions lists the revised quotes of a job (newest last).
func (s *server) jobRevisions(ctx context.Context, jobID uint) ([]QuoteSummary, error) {
	var qs []model.Quote
	if err := s.scoped(ctx).Preload("Customer").Where("job_id = ?", jobID).Order("id").Find(&qs).Error; err != nil {
		return nil, dbErr(err, "quotes")
	}
	out := make([]QuoteSummary, len(qs))
	for i := range qs {
		out[i] = s.toQuoteSummary(&qs[i], nil)
	}
	return out, nil
}
