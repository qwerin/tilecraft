package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/go-chi/chi/v5"
	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/qwerin/tilecraft/internal/auth"
	"github.com/qwerin/tilecraft/internal/httpsec"
	"github.com/qwerin/tilecraft/internal/ratelimit"
)

// MCP server (SPEC §9): POST /api/mcp speaks the Model Context Protocol
// (Streamable HTTP, stateless) to AI assistants. Every request carries an API
// token (`Authorization: Bearer tc_…`), a personal one or an OAuth access
// token (oauth.go; valid only here, not for the REST API); cookies are not accepted.
//
// A tool is a curated REST operation: its input schema is derived from the
// OpenAPI operation (path/query parameters + request body) and a call is
// dispatched in-process to the API router with the caller's token, so
// authentication, roles, client restrictions and validation are exactly those
// of the REST API. Only reads and safe writes are exposed (no deletions,
// messages to clinics, members or settings).

// mcpPath is where the MCP endpoint is mounted.
const mcpPath = "/api/mcp"

// mcpMaxBody bounds a JSON-RPC message (tool bodies are small JSON documents;
// upload_attachment carries a file of up to mcpMaxFile in base64).
const mcpMaxBody = 12 << 20

// mcpTool describes one MCP tool backed by a REST operation.
type mcpTool struct {
	Name        string
	Title       string
	Description string
	Method      string         // http.MethodGet …
	Path        string         // relative to /api/accounts/{slug} (account tools) or absolute ("/api/…")
	Write       bool           // false = read-only
	Force       map[string]any // body fields always set, whatever the model sends
	Omit        []string       // body fields hidden from the schema and dropped from calls
}

// account tools need the account slug; absolute paths do not.
func (t mcpTool) account() bool { return !strings.HasPrefix(t.Path, "/api/") }

func (t mcpTool) openAPIPath() string {
	if t.account() {
		return "/api/accounts/{slug}" + t.Path
	}
	return t.Path
}

// mcpTools is the catalogue exposed over MCP. Keep descriptions in English
// (models follow them best); the data itself is Czech.
var mcpTools = []mcpTool{
	{Name: "list_accounts", Title: "Firmy", Method: http.MethodGet, Path: "/api/auth/me",
		Description: "The token's user with the firms (accounts) they belong to and their role (owner, admin = office, worker = crew member without prices). Every other tool takes the `account` slug from here."},
	{Name: "get_account", Title: "Firma", Method: http.MethodGet, Path: "",
		Description: "Company details and settings of the firm: VAT payer and default VAT rate, quote validity, introduction and terms of new quotes, invoice due days."},
	{Name: "list_members", Title: "Uživatelé", Method: http.MethodGet, Path: "/members",
		Description: "Users of the firm with roles; their ids are worker_ids of jobs."},
	{Name: "list_catalog", Title: "Ceník", Method: http.MethodGet, Path: "/catalog",
		Description: "The firm's price list: work, material and other items with unit (m2, bm, ks, hod, kpl, bal, kg, l, km), price per unit in haléře, default discount %, " +
			"and measure = where a quote line takes its quantity from the measurements (floor, wall, area, perimeter, length, piece; empty = quantity by hand) plus waste %. " +
			"ALWAYS read it before building a quote and use catalog_item_id on lines instead of inventing prices."},
	{Name: "create_catalog_item", Title: "Nová položka ceníku", Method: http.MethodPost, Path: "/catalog", Write: true,
		Description: "Add a price-list item (check list_catalog first so it is not duplicated). Price in haléře per unit."},
	{Name: "update_catalog_item", Title: "Upravit položku ceníku", Method: http.MethodPut, Path: "/catalog/{id}", Write: true,
		Description: "Replace a price-list item (PUT: send the complete item from list_catalog with the changes)."},
	{Name: "list_customers", Title: "Zákazníci", Method: http.MethodGet, Path: "/customers",
		Description: "Customers of the firm; q searches name, e-mail, phone, city."},
	{Name: "get_customer", Title: "Zákazník", Method: http.MethodGet, Path: "/customers/{id}",
		Description: "Customer detail with counts of quotes, jobs and invoices."},
	{Name: "create_customer", Title: "Nový zákazník", Method: http.MethodPost, Path: "/customers", Write: true,
		Description: "Create a customer (person or company; IČO/DIČ for companies; billing address). Search list_customers first to avoid duplicates."},
	{Name: "update_customer", Title: "Upravit zákazníka", Method: http.MethodPut, Path: "/customers/{id}", Write: true,
		Description: "Replace a customer's data (PUT: send the complete customer)."},
	{Name: "preview_measurements", Title: "Spočítat zaměření", Method: http.MethodPost, Path: "/measurements/preview",
		Description: "Compute measurements and lines WITHOUT saving: net areas of the surfaces, totals per room (floor m², wall m², floor perimeter bm, " +
			"lengths bm, pieces), quantities of the lines and the totals. Use it to check a sketch before create_quote."},
	{Name: "list_quotes", Title: "Nabídky", Method: http.MethodGet, Path: "/quotes",
		Description: "Quotes (nabídky) with filters: state (draft, sent, accepted, rejected, open = draft+sent), customer_id, q. expired = sent and past validity."},
	{Name: "get_quote", Title: "Detail nabídky", Method: http.MethodGet, Path: "/quotes/{id}",
		Description: "Full quote: measurements (rooms, surfaces, computed totals), lines with amounts, totals (work, material, other, discount, VAT, total), link for the customer, job."},
	{Name: "create_quote", Title: "Nová nabídka", Method: http.MethodPost, Path: "/quotes", Write: true,
		Description: "Create a draft quote from a measurement (a sketch photo, dictated dimensions). rooms[]: {name, surfaces[]}; surface {name, kind: floor|wall|length|piece, " +
			"width, height in METRES (295 cm = 2.95), count, area (m², only for irregular shapes instead of width×height), deductions[] (doors, windows, bathtub: width, height)}. " +
			"Wall surface = one wall: width = wall length, height = tiling height. length = linear element (trim, skirting; width = length in m). piece = count (holes to drill). " +
			"lines[]: prefer {catalog_item_id} — name, unit, price, discount, measure and waste come from the price list; a line with a measure gets its quantity from the rooms " +
			"(rooms = restrict to named rooms); lines without a measure need quantity. Material the customer buys: customer_supplied=true (listed, 0 Kč). " +
			"Free lines without catalog item: name, unit, quantity, unit_price (haléře), section. After creating, show the user the totals and app_url; the user reviews and sends it."},
	{Name: "update_quote", Title: "Upravit nabídku", Method: http.MethodPut, Path: "/quotes/{id}", Write: true,
		Description: "Replace a draft or sent quote (PUT: load it with get_quote and send the complete quote: rooms and ALL lines; unchanged lines can keep catalog_item_id with their quantity/price). Decided quotes are locked."},
	{Name: "duplicate_quote", Title: "Kopie nabídky", Method: http.MethodPost, Path: "/quotes/{id}/duplicate", Write: true,
		Description: "Copy a quote as a new draft (a variant: other tiles, without material …)."},
	{Name: "list_jobs", Title: "Zakázky", Method: http.MethodGet, Path: "/jobs",
		Description: "Jobs (zakázky) with filters: state (planned, in_progress, done, invoiced, cancelled, open), customer_id, from/to (calendar), q."},
	{Name: "get_job", Title: "Detail zakázky", Method: http.MethodGet, Path: "/jobs/{id}",
		Description: "Full job: site, dates, crew, measurements, lines (real quantities) and totals compared to the quote, diary notes, photos, invoices."},
	{Name: "create_job_from_quote", Title: "Zakázka z nabídky", Method: http.MethodPost, Path: "/quotes/{id}/job", Write: true,
		Description: "Turn a quote into a job (accepts the quote if the customer agreed another way). Optional start_on/end_on."},
	{Name: "update_job", Title: "Upravit zakázku", Method: http.MethodPut, Path: "/jobs/{id}", Write: true,
		Description: "Replace a job (PUT: load it with get_job and send it complete): dates, crew, real quantities, extra work."},
	{Name: "set_job_state", Title: "Stav zakázky", Method: http.MethodPost, Path: "/jobs/{id}/state", Write: true,
		Description: "Move a job to planned, in_progress, done or cancelled (invoicing sets invoiced)."},
	{Name: "add_job_note", Title: "Zápis do deníku", Method: http.MethodPost, Path: "/jobs/{id}/notes", Write: true,
		Description: "Add a diary note to a job (what was done, what is missing)."},
	{Name: "list_invoices", Title: "Faktury", Method: http.MethodGet, Path: "/invoices",
		Description: "Invoices and advance invoices with filters (kind, state unpaid/overdue/paid, customer_id, job_id, year, q)."},
	{Name: "get_invoice", Title: "Detail faktury", Method: http.MethodGet, Path: "/invoices/{id}",
		Description: "Invoice with lines, VAT recap and payment details."},
	{Name: "mark_invoice_paid", Title: "Zapsat úhradu", Method: http.MethodPost, Path: "/invoices/{id}/paid", Write: true,
		Description: "Mark an invoice paid on a date (paid_on null = unpaid again)."},
	{Name: "get_dashboard", Title: "Přehled", Method: http.MethodGet, Path: "/dashboard",
		Description: "Overview: open quotes, upcoming jobs, unpaid and overdue invoices, invoiced and paid this month."},
}

const mcpInstructions = `TileCraft is software for tilers (obkladači): measurement (zaměření) → quote (nabídka) → job (zakázka) → invoice (faktura).
Start with list_accounts and pass the firm slug as "account" to the other tools.
Conventions: money is an integer in haléře (65000 = 650 Kč), dimensions in metres, areas m², lengths bm, dates "YYYY-MM-DD". Data are Czech.
Building a quote from a sketch or dictation: read list_catalog, find or create the customer, describe each room as surfaces (floor; every tiled wall
with its length × tiling height minus doors/windows/bathtub), add lines with catalog_item_id (quantities with a measure are computed by the server),
check with preview_measurements or get_quote and tell the user the totals per section; ask when a dimension is unclear instead of guessing.
Writing tools create real records – confirm with the user first. Nothing is deleted or e-mailed to customers through these tools; the user sends
quotes and invoices in the web app (app_url).`

// mcpReq carries what the dispatcher needs from the outer HTTP request.
type mcpReq struct {
	remoteAddr string
	header     http.Header
}

type mcpReqKey struct{}

// mcpHandler builds the MCP endpoint dispatching tool calls to router.
func (s *server) mcpHandler(router http.Handler, api huma.API) http.Handler {
	srv := mcp.NewServer(&mcp.Implementation{Name: "tilecraft", Title: "tilecraft", Version: "1.0.0"},
		&mcp.ServerOptions{Instructions: mcpInstructions})
	oapi := api.OpenAPI()
	for _, t := range mcpTools {
		srv.AddTool(t.tool(oapi), s.mcpCall(router, t))
	}
	s.addMCPFileTools(srv, router)
	h := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return srv }, &mcp.StreamableHTTPOptions{
		Stateless: true, JSONResponse: true,
		// DNS rebinding cannot steal anything: every request needs a bearer token,
		// and the check would reject reverse proxies on localhost.
		DisableLocalhostProtection: true,
	})
	return s.mcpAuth(h)
}

// mcpAuth requires a valid API token (401 with WWW-Authenticate otherwise;
// failed attempts are rate limited per IP) and remembers the request for the
// dispatcher.
func (s *server) mcpAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		unauthorized := func(msg string) {
			// RFC 9728: where clients find the OAuth server
			w.Header().Set("WWW-Authenticate", `Bearer realm="tilecraft", resource_metadata="`+
				s.oauthIssuer()+"/.well-known/oauth-protected-resource"+mcpPath+`"`)
			http.Error(w, msg, http.StatusUnauthorized)
		}
		ip := clientIP(r.Context())
		if blocked, wait := s.limits.mcpAuth.Blocked(ip); blocked {
			w.Header().Set("Retry-After", retryAfter(wait))
			http.Error(w, "too many failed attempts", http.StatusTooManyRequests)
			return
		}
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok {
			unauthorized("API token required (Authorization: Bearer tc_…)")
			return
		}
		if _, err := s.auth.UserByAPIToken(r.Context(), token); err != nil {
			if !errors.Is(err, auth.ErrInvalidCredentials) {
				slog.ErrorContext(r.Context(), "mcp token check", "err", err)
				http.Error(w, "authentication failed", http.StatusInternalServerError)
				return
			}
			s.limits.mcpAuth.Allow(ip)
			unauthorized("invalid or expired API token")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, mcpMaxBody)
		ctx := context.WithValue(r.Context(), mcpReqKey{}, mcpReq{remoteAddr: r.RemoteAddr, header: r.Header.Clone()})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// mcpLimits count failed authentications per IP (in memory, per process).
type mcpLimits struct {
	mcpAuth       *ratelimit.Limiter // invalid API tokens on the MCP endpoint
	oauthRegister *ratelimit.Limiter // OAuth client registrations
	oauthToken    *ratelimit.Limiter // failed OAuth token requests
	signupCode    *ratelimit.Limiter // wrong registration codes
}

func newMCPLimits(now func() time.Time) mcpLimits {
	return mcpLimits{
		mcpAuth:       ratelimit.New(20, 20, 10*time.Minute, now),
		oauthRegister: ratelimit.New(20, 20, time.Hour, now),
		oauthToken:    ratelimit.New(20, 20, 10*time.Minute, now),
		signupCode:    ratelimit.New(10, 10, time.Hour, now),
	}
}

func clientIP(ctx context.Context) string { return httpsec.InfoFrom(ctx).IP }

func retryAfter(wait time.Duration) string { return strconv.Itoa(int(wait.Seconds())) }

var mcpPathParam = regexp.MustCompile(`\{([a-z_]+)\}`)

// tool builds the MCP tool definition from the OpenAPI operation.
func (t mcpTool) tool(oapi *huma.OpenAPI) *mcp.Tool {
	op := mcpOperation(oapi, t.Method, t.openAPIPath())
	props := map[string]any{}
	var required []string
	if t.account() {
		props["account"] = map[string]any{"type": "string", "description": "Account slug (see list_accounts)"}
		required = append(required, "account")
	}
	defs := map[string]any{}
	for _, p := range op.Parameters {
		if p.Name == "slug" || (p.In != "path" && p.In != "query") {
			continue
		}
		sch := mcpSchemaJSON(p.Schema, oapi, defs)
		if p.Description != "" {
			sch["description"] = p.Description
		}
		props[p.Name] = sch
		if p.Required || p.In == "path" {
			required = append(required, p.Name)
		}
	}
	if rb := op.RequestBody; rb != nil {
		if c := rb.Content["application/json"]; c != nil && c.Schema != nil {
			props["body"] = mcpOmit(mcpSchemaJSON(c.Schema, oapi, defs), defs, t.Omit)
			required = append(required, "body")
		}
	}
	in := map[string]any{"type": "object", "properties": props, "additionalProperties": false}
	if len(required) > 0 {
		in["required"] = required
	}
	if len(defs) > 0 {
		in["$defs"] = defs
	}
	desc := t.Description
	if roles := auth.AllowedRoles(op); len(roles) > 0 {
		desc += " Roles: " + strings.Join(roles, ", ") + "."
	}
	return &mcp.Tool{
		Name: t.Name, Title: t.Title, Description: desc, InputSchema: in,
		Annotations: &mcp.ToolAnnotations{
			Title: t.Title, ReadOnlyHint: !t.Write, IdempotentHint: !t.Write,
			DestructiveHint: new(false), OpenWorldHint: new(false),
		},
	}
}

// mcpOmit removes fields from a body schema: a referenced component is
// inlined without them.
func mcpOmit(body, defs map[string]any, fields []string) map[string]any {
	if len(fields) == 0 {
		return body
	}
	if ref, ok := body["$ref"].(string); ok {
		name := strings.TrimPrefix(ref, "#/$defs/")
		body = maps.Clone(defs[name].(map[string]any))
		delete(defs, name) // the request body component is not referenced elsewhere
	}
	props := maps.Clone(body["properties"].(map[string]any))
	for _, f := range fields {
		delete(props, f)
	}
	body["properties"] = props
	if req, ok := body["required"].([]any); ok {
		body["required"] = slices.DeleteFunc(slices.Clone(req), func(v any) bool { return slices.Contains(fields, v.(string)) })
	}
	return body
}

// mcpOperation finds a registered operation; the catalogue must match the API.
func mcpOperation(oapi *huma.OpenAPI, method, path string) *huma.Operation {
	if pi := oapi.Paths[path]; pi != nil {
		var op *huma.Operation
		switch method {
		case http.MethodGet:
			op = pi.Get
		case http.MethodPost:
			op = pi.Post
		case http.MethodPut:
			op = pi.Put
		case http.MethodPatch:
			op = pi.Patch
		}
		if op != nil {
			return op
		}
	}
	panic(fmt.Sprintf("mcp: no operation %s %s", method, path))
}

// mcpSchemaJSON converts a huma schema to plain JSON Schema, moving the
// referenced components (transitively) into defs as "#/$defs/Name".
func mcpSchemaJSON(sch *huma.Schema, oapi *huma.OpenAPI, defs map[string]any) map[string]any {
	const prefix = "#/components/schemas/"
	b, err := json.Marshal(sch)
	if err != nil {
		panic(err)
	}
	var out map[string]any
	if err := json.Unmarshal(bytes.ReplaceAll(b, []byte(prefix), []byte("#/$defs/")), &out); err != nil {
		panic(err)
	}
	for _, ref := range mcpRefs(out) {
		if _, done := defs[ref]; done {
			continue
		}
		comp := oapi.Components.Schemas.Map()[ref]
		if comp == nil {
			panic("mcp: unknown schema " + ref)
		}
		defs[ref] = nil // cycle guard
		defs[ref] = mcpSchemaJSON(comp, oapi, defs)
	}
	return out
}

// mcpRefs lists the $defs names referenced anywhere in v.
func mcpRefs(v any) []string {
	var refs []string
	switch x := v.(type) {
	case map[string]any:
		if r, ok := x["$ref"].(string); ok {
			refs = append(refs, strings.TrimPrefix(r, "#/$defs/"))
		}
		for _, k := range slices.Sorted(maps.Keys(x)) {
			refs = append(refs, mcpRefs(x[k])...)
		}
	case []any:
		for _, e := range x {
			refs = append(refs, mcpRefs(e)...)
		}
	}
	return refs
}

// mcpCall dispatches a tool call as a REST request through router.
func (s *server) mcpCall(router http.Handler, t mcpTool) mcp.ToolHandler {
	return func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		args := map[string]any{}
		if len(req.Params.Arguments) > 0 {
			if err := json.Unmarshal(req.Params.Arguments, &args); err != nil {
				return mcpError("arguments must be a JSON object"), nil
			}
		}
		path := t.Path
		if t.account() {
			slug, _ := args["account"].(string)
			if slug == "" {
				return mcpError(`missing "account" (account slug, see list_accounts)`), nil
			}
			path = "/api/accounts/" + url.PathEscape(slug) + path
			delete(args, "account")
		}
		var missing []string
		path = mcpPathParam.ReplaceAllStringFunc(path, func(m string) string {
			name := m[1 : len(m)-1]
			v, ok := args[name]
			delete(args, name)
			if !ok {
				missing = append(missing, name)
				return m
			}
			return url.PathEscape(mcpScalar(v))
		})
		if len(missing) > 0 {
			return mcpError("missing " + strings.Join(missing, ", ")), nil
		}
		var body io.Reader = http.NoBody
		if b, ok := args["body"]; ok {
			delete(args, "body")
			if obj, ok := b.(map[string]any); ok {
				for _, f := range t.Omit {
					delete(obj, f)
				}
				maps.Copy(obj, t.Force)
			}
			raw, err := json.Marshal(b)
			if err != nil {
				return mcpError("invalid body"), nil
			}
			body = bytes.NewReader(raw)
		}
		q := url.Values{}
		for _, k := range slices.Sorted(maps.Keys(args)) {
			if args[k] != nil {
				q.Set(k, mcpScalar(args[k]))
			}
		}
		if len(q) > 0 {
			path += "?" + q.Encode()
		}

		rec, err := mcpDo(ctx, router, req, t.Method, path, body, "application/json")
		if err != nil {
			return mcpError("invalid request: " + err.Error()), nil
		}
		return mcpResult(rec), nil
	}
}

// mcpDo dispatches one REST request through router with the credentials of
// the MCP request.
func mcpDo(ctx context.Context, router http.Handler, req *mcp.CallToolRequest, method, path string, body io.Reader, contentType string) (*mcpRecorder, error) {
	// a fresh chi routing context: the outer one belongs to /api/mcp; WithMCP admits OAuth access tokens
	r, err := http.NewRequestWithContext(auth.WithMCP(context.WithValue(ctx, chi.RouteCtxKey, nil)), method, path, body)
	if err != nil {
		return nil, err
	}
	if outer, ok := ctx.Value(mcpReqKey{}).(mcpReq); ok {
		r.RemoteAddr = outer.remoteAddr
		for k, v := range outer.header { // forwarded headers (client IP), Authorization
			r.Header[k] = v
		}
	} else if req.Extra != nil {
		r.Header = req.Extra.Header.Clone()
	}
	r.Header.Del("Cookie") // the token is the only credential
	r.Header.Del("Content-Length")
	r.Header.Set("Accept", "application/json")
	r.Header.Set("Content-Type", contentType)
	rec := &mcpRecorder{header: http.Header{}, status: http.StatusOK}
	router.ServeHTTP(rec, r)
	return rec, nil
}

func mcpScalar(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(x)
	default:
		b, _ := json.Marshal(x)
		return string(b)
	}
}

func mcpError(msg string) *mcp.CallToolResult {
	return &mcp.CallToolResult{IsError: true, Content: []mcp.Content{&mcp.TextContent{Text: msg}}}
}

// mcpResult turns the REST response into a tool result: the JSON body as
// text (and structured content for objects); errors keep the problem+json.
func mcpResult(rec *mcpRecorder) *mcp.CallToolResult {
	text := strings.TrimSpace(rec.body.String())
	if rec.status >= 400 {
		return mcpError(fmt.Sprintf("HTTP %d: %s", rec.status, text))
	}
	if text == "" {
		text = http.StatusText(rec.status)
	}
	res := &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: text}}}
	var obj map[string]any
	if json.Unmarshal(rec.body.Bytes(), &obj) == nil {
		res.StructuredContent = obj
	}
	return res
}

// mcpRecorder buffers the in-process REST response.
type mcpRecorder struct {
	header http.Header
	status int
	body   bytes.Buffer
	wrote  bool
}

func (r *mcpRecorder) Header() http.Header { return r.header }

func (r *mcpRecorder) WriteHeader(code int) {
	if !r.wrote {
		r.status, r.wrote = code, true
	}
}

func (r *mcpRecorder) Write(b []byte) (int, error) {
	r.wrote = true
	return r.body.Write(b)
}
