package api

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/model"
)

// CustomerInput is a customer's data (SPEC §3).
type CustomerInput struct {
	Name           string `json:"name" minLength:"1" maxLength:"200" doc:"Person or company name"`
	ContactPerson  string `json:"contact_person,omitempty" maxLength:"200"`
	RegistrationNo string `json:"registration_no,omitempty" maxLength:"20" doc:"IČO"`
	VatNo          string `json:"vat_no,omitempty" maxLength:"20" doc:"DIČ"`
	Email          string `json:"email,omitempty" maxLength:"254"`
	Phone          string `json:"phone,omitempty" maxLength:"50"`
	Street         string `json:"street,omitempty" maxLength:"200" doc:"Billing address"`
	City           string `json:"city,omitempty" maxLength:"200"`
	Zip            string `json:"zip,omitempty" maxLength:"20"`
	Note           string `json:"note,omitempty" maxLength:"5000"`
}

// Customer is a customer with counts of their documents.
type Customer struct {
	ID uint `json:"id"`
	CustomerInput
	Quotes   int `json:"quotes"`
	Jobs     int `json:"jobs"`
	Invoices int `json:"invoices"`
}

func toCustomer(c *model.Customer) Customer {
	return Customer{ID: c.ID, CustomerInput: CustomerInput{Name: c.Name, ContactPerson: c.ContactPerson, RegistrationNo: c.RegistrationNo,
		VatNo: c.VatNo, Email: c.Email, Phone: c.Phone, Street: c.Street, City: c.City, Zip: c.Zip, Note: c.Note}}
}

func (b *CustomerInput) apply(c *model.Customer) {
	c.Name, c.ContactPerson = strings.TrimSpace(b.Name), strings.TrimSpace(b.ContactPerson)
	c.RegistrationNo, c.VatNo = strings.TrimSpace(b.RegistrationNo), strings.TrimSpace(b.VatNo)
	c.Email, c.Phone = strings.TrimSpace(b.Email), strings.TrimSpace(b.Phone)
	c.Street, c.City, c.Zip, c.Note = strings.TrimSpace(b.Street), strings.TrimSpace(b.City), strings.TrimSpace(b.Zip), b.Note
}

func (s *server) registerCustomers(g huma.API) {
	huma.Get(g, "/customers", s.listCustomers, auth.ForManagers)
	huma.Get(g, "/customers/{id}", s.getCustomer, auth.ForManagers)
	huma.Post(g, "/customers", s.createCustomer, status(http.StatusCreated), auth.ForManagers)
	huma.Put(g, "/customers/{id}", s.updateCustomer, auth.ForManagers)
	huma.Delete(g, "/customers/{id}", s.deleteCustomer, status(http.StatusNoContent), auth.ForManagers)
}

func (s *server) listCustomers(ctx context.Context, in *struct {
	Q string `query:"q" doc:"Search name, e-mail, phone, city"`
	PageParams
}) (*Out[ListResponse[Customer]], error) {
	q := s.scoped(ctx).Model(&model.Customer{}).Order("name")
	if in.Q != "" {
		p := like(in.Q)
		q = q.Where("LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR phone LIKE ? OR LOWER(city) LIKE ? OR LOWER(contact_person) LIKE ?", p, p, p, p, p)
	}
	out, err := paginate(q, in.PageParams, toCustomer)
	if err != nil {
		return nil, err
	}
	return out, s.fillCustomerCounts(ctx, out.Body.Items)
}

func (s *server) fillCustomerCounts(ctx context.Context, cs []Customer) error {
	if len(cs) == 0 {
		return nil
	}
	ids := make([]uint, len(cs))
	idx := map[uint]int{}
	for i, c := range cs {
		ids[i] = c.ID
		idx[c.ID] = i
	}
	for _, t := range []struct {
		m   any
		set func(*Customer, int)
	}{
		{&model.Quote{}, func(c *Customer, n int) { c.Quotes = n }},
		{&model.Job{}, func(c *Customer, n int) { c.Jobs = n }},
		{&model.Invoice{}, func(c *Customer, n int) { c.Invoices = n }},
	} {
		var rows []struct {
			CustomerID uint
			N          int
		}
		if err := s.scoped(ctx).Model(t.m).Select("customer_id, COUNT(*) AS n").Where("customer_id IN ?", ids).
			Group("customer_id").Scan(&rows).Error; err != nil {
			return dbErr(err, "customers")
		}
		for _, r := range rows {
			t.set(&cs[idx[r.CustomerID]], r.N)
		}
	}
	return nil
}

func (s *server) loadCustomer(ctx context.Context, id uint) (*model.Customer, error) {
	var c model.Customer
	if err := s.scoped(ctx).First(&c, id).Error; err != nil {
		return nil, dbErr(err, "customer")
	}
	return &c, nil
}

func (s *server) customerOut(ctx context.Context, c *model.Customer) (*Out[Customer], error) {
	out := []Customer{toCustomer(c)}
	if err := s.fillCustomerCounts(ctx, out); err != nil {
		return nil, err
	}
	return &Out[Customer]{Body: out[0]}, nil
}

func (s *server) getCustomer(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*Out[Customer], error) {
	c, err := s.loadCustomer(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	return s.customerOut(ctx, c)
}

func (s *server) createCustomer(ctx context.Context, in *struct{ Body CustomerInput }) (*Out[Customer], error) {
	c := model.Customer{AccountID: accountID(ctx)}
	in.Body.apply(&c)
	if c.Name == "" {
		return nil, invalid("name", "required")
	}
	if err := s.db.WithContext(ctx).Create(&c).Error; err != nil {
		return nil, dbErr(err, "customer")
	}
	return s.customerOut(ctx, &c)
}

func (s *server) updateCustomer(ctx context.Context, in *struct {
	ID   uint `path:"id"`
	Body CustomerInput
}) (*Out[Customer], error) {
	c, err := s.loadCustomer(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	in.Body.apply(c)
	if c.Name == "" {
		return nil, invalid("name", "required")
	}
	if err := s.db.WithContext(ctx).Save(c).Error; err != nil {
		return nil, dbErr(err, "customer")
	}
	return s.customerOut(ctx, c)
}

func (s *server) deleteCustomer(ctx context.Context, in *struct {
	ID uint `path:"id"`
}) (*NoContent, error) {
	c, err := s.loadCustomer(ctx, in.ID)
	if err != nil {
		return nil, err
	}
	out := []Customer{toCustomer(c)}
	if err := s.fillCustomerCounts(ctx, out); err != nil {
		return nil, err
	}
	if out[0].Quotes+out[0].Jobs+out[0].Invoices > 0 {
		return nil, conflict(CodeReferenced, "the customer has quotes, jobs or invoices")
	}
	if err := s.db.WithContext(ctx).Delete(c).Error; err != nil {
		return nil, dbErr(err, "customer")
	}
	return &NoContent{}, nil
}
