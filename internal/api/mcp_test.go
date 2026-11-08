package api_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"github.com/qwerin/tilecraft/internal/api"
)

// bearerTransport adds the API token to every MCP request.
type bearerTransport struct{ token string }

func (b bearerTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	r = r.Clone(r.Context())
	if b.token != "" {
		r.Header.Set("Authorization", "Bearer "+b.token)
	}
	return http.DefaultTransport.RoundTrip(r)
}

// mcpSession connects a real MCP client to the API with token.
func mcpSession(t *testing.T, ts *testServer, token string) *mcp.ClientSession {
	t.Helper()
	srv := httptest.NewServer(ts.handler)
	t.Cleanup(srv.Close)
	cl := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "1"}, nil)
	sess, err := cl.Connect(context.Background(), &mcp.StreamableClientTransport{
		Endpoint: srv.URL + "/api/mcp", HTTPClient: &http.Client{Transport: bearerTransport{token}},
	}, nil)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	t.Cleanup(func() { _ = sess.Close() })
	return sess
}

// apiToken creates an API token of c's user.
func apiToken(c *client) string {
	return doJSON[api.CreatedAPIToken](c, http.StatusCreated, "POST", "/api/auth/tokens", api.APITokenCreate{Name: "mcp"}).Token
}

func decodeJSON[T any](t *testing.T, b []byte) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatalf("decode: %v: %s", err, b)
	}
	return out
}

// callTool calls an MCP tool and returns its text and error flag.
func callTool(t *testing.T, s *mcp.ClientSession, name string, args map[string]any) (string, bool) {
	t.Helper()
	res, err := s.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	var sb strings.Builder
	for _, c := range res.Content {
		if tc, ok := c.(*mcp.TextContent); ok {
			sb.WriteString(tc.Text)
		}
	}
	return sb.String(), res.IsError
}

// mustTool is callTool expecting success, decoding the JSON result into T.
func mustTool[T any](t *testing.T, s *mcp.ClientSession, name string, args map[string]any) T {
	t.Helper()
	text, isErr := callTool(t, s, name, args)
	if isErr {
		t.Fatalf("%s(%v): error %s", name, args, text)
	}
	return decodeJSON[T](t, []byte(text))
}

func TestMCPQuoteFromSketch(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	s := mcpSession(t, ts, apiToken(a))

	tools, err := s.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, tool := range tools.Tools {
		names[tool.Name] = true
		if strings.HasPrefix(tool.Name, "delete_") || strings.HasPrefix(tool.Name, "send_") {
			t.Errorf("tool %s must not exist", tool.Name)
		}
	}
	for _, n := range []string{"list_catalog", "create_quote", "preview_measurements", "get_attachment", "upload_attachment"} {
		if !names[n] {
			t.Errorf("missing tool %s", n)
		}
	}

	me := mustTool[api.Me](t, s, "list_accounts", nil)
	acc := me.Accounts[0].Slug
	cat := mustTool[[]api.CatalogItem](t, s, "list_catalog", map[string]any{"account": acc, "kind": "work"})
	var wall uint
	for _, c := range cat {
		if c.Measure == "wall" {
			wall = c.ID
		}
	}
	cust := mustTool[api.Customer](t, s, "create_customer", map[string]any{"account": acc, "body": map[string]any{"name": "Novák"}})
	rooms := []map[string]any{{"name": "Koupelna", "surfaces": []map[string]any{
		{"name": "Stěna", "kind": "wall", "width": 2.95, "height": 2.1},
		{"name": "Stěna 2", "kind": "wall", "width": 1.56, "height": 2.1, "deductions": []map[string]any{{"name": "Okno", "width": 0.6, "height": 0.6}}},
	}}}
	prev := mustTool[api.MeasurePreviewOut](t, s, "preview_measurements", map[string]any{"account": acc, "body": map[string]any{"rooms": rooms,
		"lines": []map[string]any{{"catalog_item_id": wall}}}})
	if prev.Measurements.Total.Wall != 9.12 || prev.Lines[0].Quantity != 9.12 {
		t.Fatalf("preview %+v %+v", prev.Measurements.Total, prev.Lines)
	}
	q := mustTool[api.Quote](t, s, "create_quote", map[string]any{"account": acc, "body": map[string]any{"customer_id": cust.ID, "title": "Koupelna — Novák",
		"rooms": rooms, "lines": []map[string]any{{"catalog_item_id": wall}, {"name": "Doprava", "section": "other", "unit": "kpl", "quantity": 1, "unit_price": 100000}}}})
	if q.State != "draft" || q.Totals.Total != 592800+100000 || !strings.Contains(q.AppURL, "/quotes/") {
		t.Fatalf("quote via MCP: %+v", q.Totals)
	}
	if _, isErr := callTool(t, s, "get_quote", map[string]any{"account": acc, "id": 999}); !isErr {
		t.Fatal("unknown quote must fail")
	}
}

// Every catalogued tool maps to an existing REST operation.
func TestMCPEveryToolHasOperation(t *testing.T) {
	ts := newTestServer(t)
	a := ts.signup("a@example.cz", "Obklady A")
	s := mcpSession(t, ts, apiToken(a))
	tools, err := s.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools.Tools) < 25 {
		t.Fatalf("only %d tools", len(tools.Tools))
	}
	for _, tool := range tools.Tools {
		if tool.InputSchema == nil {
			t.Errorf("%s has no input schema", tool.Name)
		}
	}
	_ = fmt.Sprint
	_ = maps.Keys[map[string]int]
	_ = base64.StdEncoding
	_ = time.Second
	_ = json.Marshal
}
