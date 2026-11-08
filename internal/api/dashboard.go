package api

import (
	"context"

	"github.com/danielgtaylor/huma/v2"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/model"
)

// Dashboard is the overview (SPEC §8); money fields are 0 for workers.
type Dashboard struct {
	OpenQuotes     []QuoteSummary   `json:"open_quotes" nullable:"false" doc:"Drafts and sent quotes"`
	UpcomingJobs   []JobSummary     `json:"upcoming_jobs" nullable:"false" doc:"Jobs in progress and planned from today to 14 days ahead, unscheduled planned jobs"`
	UnpaidInvoices []InvoiceSummary `json:"unpaid_invoices" nullable:"false"`
	UnpaidTotal    int64            `json:"unpaid_total"`
	OverdueTotal   int64            `json:"overdue_total"`
	MonthInvoiced  int64            `json:"month_invoiced" doc:"Invoiced this month (regular invoices)"`
	MonthPaid      int64            `json:"month_paid" doc:"Paid this month"`
	AcceptedQuotes int              `json:"accepted_quotes" doc:"Accepted quotes without a job"`
}

func (s *server) registerDashboard(g huma.API) {
	huma.Get(g, "/dashboard", s.getDashboard, auth.ForAll)
}

func (s *server) getDashboard(ctx context.Context, _ *struct{}) (*Out[Dashboard], error) {
	today := s.today()
	out := Dashboard{OpenQuotes: []QuoteSummary{}, UpcomingJobs: []JobSummary{}, UnpaidInvoices: []InvoiceSummary{}}
	var jobs []model.Job
	if err := s.scoped(ctx).Preload("Customer").
		Where("state = ? OR (state = ? AND (start_on = '' OR start_on <= ?))", model.JobInProgress, model.JobPlanned, addDays(today, 14)).
		Order("CASE WHEN state = 'in_progress' THEN 0 ELSE 1 END, CASE WHEN start_on = '' THEN 1 ELSE 0 END, start_on").
		Limit(30).Find(&jobs).Error; err != nil {
		return nil, dbErr(err, "jobs")
	}
	for i := range jobs {
		out.UpcomingJobs = append(out.UpcomingJobs, s.toJobSummary(ctx, &jobs[i]))
	}
	if !isManager(ctx) {
		return &Out[Dashboard]{Body: out}, nil
	}
	var quotes []model.Quote
	if err := s.scoped(ctx).Preload("Customer").Where("state IN ?", []string{model.QuoteDraft, model.QuoteSent}).
		Order("valid_until").Limit(30).Find(&quotes).Error; err != nil {
		return nil, dbErr(err, "quotes")
	}
	for i := range quotes {
		out.OpenQuotes = append(out.OpenQuotes, s.toQuoteSummary(&quotes[i], nil))
	}
	var n int64
	if err := s.scoped(ctx).Model(&model.Quote{}).Where("state = ? AND id NOT IN (?)", model.QuoteAccepted,
		s.scoped(ctx).Model(&model.Job{}).Select("quote_id").Where("quote_id IS NOT NULL")).Count(&n).Error; err != nil {
		return nil, dbErr(err, "quotes")
	}
	out.AcceptedQuotes = int(n)
	var invs []model.Invoice
	if err := s.scoped(ctx).Preload("Customer").Where("paid_on IS NULL").Order("due_on").Find(&invs).Error; err != nil {
		return nil, dbErr(err, "invoices")
	}
	for i := range invs {
		sum := s.toInvoiceSummary(&invs[i])
		out.UnpaidTotal += sum.Total
		if sum.Overdue {
			out.OverdueTotal += sum.Total
		}
		if len(out.UnpaidInvoices) < 30 {
			out.UnpaidInvoices = append(out.UnpaidInvoices, sum)
		}
	}
	month := today[:8] + "01"
	next := addDays(month, 32)[:8] + "01"
	var sums []struct{ Total int64 }
	if err := s.scoped(ctx).Model(&model.Invoice{}).Select("COALESCE(SUM(total), 0) AS total").
		Where("kind = ? AND issued_on >= ? AND issued_on < ?", model.InvoiceRegular, month, next).Scan(&sums).Error; err != nil {
		return nil, dbErr(err, "invoices")
	}
	if len(sums) > 0 {
		out.MonthInvoiced = sums[0].Total
	}
	sums = nil
	if err := s.scoped(ctx).Model(&model.Invoice{}).Select("COALESCE(SUM(total), 0) AS total").
		Where("paid_on >= ? AND paid_on < ?", month, next).Scan(&sums).Error; err != nil {
		return nil, dbErr(err, "invoices")
	}
	if len(sums) > 0 {
		out.MonthPaid = sums[0].Total
	}
	return &Out[Dashboard]{Body: out}, nil
}
