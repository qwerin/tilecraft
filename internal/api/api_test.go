package api_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"testing"
	"time"

	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/config"
	"github.com/qwerin/tilecraft/internal/db"
	"github.com/qwerin/tilecraft/internal/storage"
)

type testServer struct {
	t       *testing.T
	srv     *httptest.Server
	handler http.Handler
	db      *gorm.DB
	now     time.Time // the API's clock; tests may move it
}

// fixed clock: Tuesday 2026-11-03 10:00 (Prague)
var now = time.Date(2026, 11, 3, 10, 0, 0, 0, time.FixedZone("CET", 3600))

func newTestServer(t *testing.T) *testServer {
	t.Helper()
	return newTestServerWith(t, func(*config.Config) {})
}

// newTestServerWith lets the test change the configuration.
func newTestServerWith(t *testing.T, configure func(*config.Config)) *testServer {
	t.Helper()
	return newTestServerDeps(t, configure, func(*api.Deps) {})
}

// newTestServerDeps lets the test change the configuration and the dependencies.
func newTestServerDeps(t *testing.T, configure func(*config.Config), deps func(*api.Deps)) *testServer {
	t.Helper()
	gdb, err := db.Open("sqlite", ":memory:", "silent")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Migrate(gdb); err != nil {
		t.Fatal(err)
	}
	ts := &testServer{t: t, db: gdb, now: now}
	cfg := config.Config{AllowSignup: true, PublicURL: "http://localhost:8080"}
	configure(&cfg)
	d := api.Deps{
		Now:     func() time.Time { return ts.now },
		Storage: storage.NewLocal(t.TempDir()),
	}
	deps(&d)
	ts.handler, _ = api.New(gdb, cfg, d)
	ts.srv = httptest.NewServer(ts.handler)
	t.Cleanup(ts.srv.Close)
	return ts
}

type client struct {
	ts    *testServer
	http  *http.Client
	slug  string
	token string // API token sent as Authorization: Bearer (instead of cookies)
}

func (ts *testServer) anon() *client {
	jar, _ := cookiejar.New(nil)
	return &client{ts: ts, http: &http.Client{Jar: jar}}
}

// signup registers a firm owner and returns a logged-in client.
func (ts *testServer) signup(email, lab string) *client {
	c := ts.anon()
	me := doJSON[api.Me](c, http.StatusCreated, "POST", "/api/auth/register",
		api.RegisterInput{Email: email, Password: "heslo1234", Name: "Jan Test", Firm: lab})
	c.slug = me.Accounts[0].Slug
	return c
}

// login logs an existing user in (into the owner's firm slug).
func (ts *testServer) login(email, slug string) *client {
	c := ts.anon()
	doJSON[api.Me](c, http.StatusOK, "POST", "/api/auth/login", api.LoginInput{Email: email, Password: "heslo1234"})
	c.slug = slug
	return c
}

func (c *client) acct(p string) string { return "/api/accounts/" + c.slug + p }

func (c *client) do(method, path string, body any) (*http.Response, []byte) {
	c.ts.t.Helper()
	var r io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, c.ts.srv.URL+path, r)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	req.Header.Set("Origin", c.ts.srv.URL)
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	hc := c.http
	if hc == nil {
		hc = http.DefaultClient
	}
	res, err := hc.Do(req)
	if err != nil {
		c.ts.t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return res, b
}

func doJSON[T any](c *client, want int, method, path string, body any) T {
	c.ts.t.Helper()
	res, b := c.do(method, path, body)
	if res.StatusCode != want {
		c.ts.t.Fatalf("%s %s: status %d, want %d: %s", method, path, res.StatusCode, want, b)
	}
	var out T
	if len(b) > 0 {
		if err := json.Unmarshal(b, &out); err != nil {
			c.ts.t.Fatalf("decode %s: %v: %s", path, err, b)
		}
	}
	return out
}

func expect(t *testing.T, c *client, want int, method, path string, body any) {
	t.Helper()
	res, b := c.do(method, path, body)
	if res.StatusCode != want {
		t.Fatalf("%s %s: status %d, want %d: %s", method, path, res.StatusCode, want, b)
	}
}

func ptr[T any](v T) *T { return &v }
