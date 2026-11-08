// Package api registers the HTTP API (huma v2 on chi).
//
// Route groups (every operation is registered into exactly one):
//
//   - public  — no authentication (health, login, register, logout).
//   - authed  — auth.RequireUser: 401 without a valid tc_session cookie or API
//     token (Authorization: Bearer tc_…).
//   - account — authed + "/api/accounts/{slug}" + auth.RequireAccount: the slug is
//     resolved to a firm the user is a member of (non-member → 404) and the
//     roles declared at registration (auth.ForAll, auth.ForManagers) are
//     enforced (403).
//
// MCP (mcp.go) and its OAuth server (oauth.go) are plain handlers around the router.
//
// Query firm data only through s.scoped(ctx) or tx.Scopes(inAccount(ctx)).
package api

import (
	"context"
	"crypto/tls"
	"net/http"
	"path/filepath"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/config"
	"github.com/qwerin/tilecraft/internal/httpsec"
	"github.com/qwerin/tilecraft/internal/mail"
	"github.com/qwerin/tilecraft/internal/maildiag"
	"github.com/qwerin/tilecraft/internal/secret"
	"github.com/qwerin/tilecraft/internal/storage"
)

// Deps holds swappable dependencies (tests replace them).
type Deps struct {
	Now     func() time.Time // defaults to time.Now
	Storage storage.Storage  // defaults to storage.NewLocal(cfg.DataDir + "/attachments")
	Mailer  mail.Mailer      // tests: replaces every SMTP server; used only with live sending
	// Resolver and SMTPTLSConfig serve the e-mail diagnostics (tests: fakes, smtptest certificates)
	Resolver       maildiag.Resolver
	SMTPTLSConfig  *tls.Config
	LabSMTPAnyHost bool        // tests: a firm's own SMTP server may be local and on any port (smtptest)
	Secrets        *secret.Box // encrypts stored secrets (SMTP passwords); default = random (tests)
}

// withDefaultDeps fills the dependencies a caller did not set.
func withDefaultDeps(deps Deps) Deps {
	if deps.Now == nil {
		deps.Now = time.Now
	}
	if deps.Secrets == nil {
		deps.Secrets = secret.NewRandom()
	}
	return deps
}

type server struct {
	db     *gorm.DB
	cfg    config.Config
	deps   Deps
	auth   *auth.Service
	limits mcpLimits
}

// New builds the API router. db may be nil when only the OpenAPI document is needed.
func New(db *gorm.DB, cfg config.Config, deps Deps) (http.Handler, huma.API) {
	deps = withDefaultDeps(deps)
	if deps.Storage == nil {
		deps.Storage = storage.NewLocal(filepath.Join(cfg.DataDir, "attachments"))
	}
	s := &server{db: db, cfg: cfg, deps: deps, auth: auth.NewService(db, deps.Now, secureCookies(cfg), cfg.Superadmins), limits: newMCPLimits(deps.Now)}

	secOpts := httpsec.Options{TrustedProxies: cfg.TrustedProxies, PublicHTTPS: cfg.PublicHTTPS()}
	router := chi.NewRouter()
	router.Use(httpsec.Middleware(secOpts))
	router.Use(httpsec.CSRF)
	hc := huma.DefaultConfig("tilecraft API", "1.0.0")
	hc.OpenAPIPath = "/api/openapi"
	hc.DocsPath = "/api/docs"
	hc.SchemasPath = "/api/schemas"
	hc.CreateHooks = nil
	hc.Components.SecuritySchemes = map[string]*huma.SecurityScheme{
		"session": {Type: "apiKey", In: "cookie", Name: auth.SessionCookie},
		"bearer":  {Type: "http", Scheme: "bearer", Description: "API token (tc_…)"},
	}
	api := humachi.New(router, hc)

	public := huma.NewGroup(api)
	authed := huma.NewGroup(api)
	authed.UseMiddleware(s.auth.RequireUser(api))
	authed.UseSimpleModifier(func(o *huma.Operation) { o.Security = []map[string][]string{{"session": {}}, {"bearer": {}}} })
	account := huma.NewGroup(authed, "/api/accounts/{slug}")
	account.UseMiddleware(s.auth.RequireAccount(api))
	account.UseSimpleModifier(addSlugParam)

	huma.Get(public, "/api/health", func(context.Context, *struct{}) (*Out[map[string]string], error) {
		return &Out[map[string]string]{Body: map[string]string{"status": "ok"}}, nil
	})
	s.registerAuth(public, authed)
	s.registerTokens(authed)
	s.registerOAuth(authed)
	s.registerAccounts(authed, account)
	s.registerAdmin(authed)
	s.registerAdminEmail(authed)
	s.registerAdminSettings(authed)
	s.registerMembers(account)
	s.registerLabMail(account)
	s.registerLogo(account)
	s.registerEmails(account)
	s.registerCustomers(account)
	s.registerCatalog(account)
	s.registerQuotes(account)
	s.registerJobs(account)
	s.registerInvoices(account)
	s.registerInvoicePDF(account)
	s.registerDashboard(account)
	s.registerPublicQuotes(public)

	// file uploads/downloads are plain handlers (multipart, streaming)
	router.With(s.plainAccount).Post("/api/accounts/{slug}/jobs/{id}/attachments", s.uploadAttachment)
	router.With(s.plainAccount).Get("/api/accounts/{slug}/attachments/{id}", s.downloadAttachment)
	router.With(s.plainAccount).Post("/api/accounts/{slug}/logo", s.uploadLogo)
	router.With(s.plainAccount).Get("/api/accounts/{slug}/logo", s.downloadLogo)
	router.Get("/api/public/quotes/{token}/logo", s.publicQuoteLogo)
	router.Get("/api/public/quotes/{token}/pdf", s.publicQuotePDF)

	// MCP for AI assistants: plain handler (streaming transport), tools dispatch to the routes above
	router.Handle(mcpPath, s.mcpHandler(router, api))
	// OAuth metadata, client registration and token endpoint skip CSRF (oauth.go)
	return s.withOAuth(router, secOpts), api
}

// Cleanup removes expired sessions, API tokens and OAuth codes/grants and
// unused OAuth clients (run periodically by the server).
func Cleanup(db *gorm.DB, now time.Time) error {
	if err := auth.DeleteExpired(db, now); err != nil {
		return err
	}
	return cleanupOAuth(db, now)
}

func secureCookies(cfg config.Config) func(context.Context) bool {
	return func(ctx context.Context) bool {
		if cfg.SecureCookies != nil {
			return *cfg.SecureCookies
		}
		return cfg.PublicHTTPS() || httpsec.InfoFrom(ctx).HTTPS
	}
}

func addSlugParam(o *huma.Operation) {
	for _, p := range o.Parameters {
		if p.In == "path" && p.Name == "slug" {
			return
		}
	}
	o.Parameters = append([]*huma.Param{{
		Name: "slug", In: "path", Required: true, Schema: &huma.Schema{Type: "string"}, Description: "Firm slug",
	}}, o.Parameters...)
}
