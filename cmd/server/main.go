// Command server runs the tilecraft HTTP server.
package main

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"gorm.io/gorm"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/config"
	"github.com/qwerin/tilecraft/internal/db"
	"github.com/qwerin/tilecraft/internal/httpsec"
	"github.com/qwerin/tilecraft/internal/secret"
)

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	gdb, err := db.Open(cfg.DBDriver, cfg.DBDSN, cfg.DBLog)
	if err != nil {
		return err
	}
	if err := db.Migrate(gdb); err != nil {
		return err
	}
	if cfg.SeedDemo {
		created, err := api.SeedDemo(context.Background(), gdb, cfg)
		if err != nil {
			return err
		}
		if created {
			slog.Info("demo firm created", "login", api.DemoEmail, "password", api.DemoPassword)
		}
	}

	key, generated, err := secret.LoadOrCreateKey(cfg.SecretKey, cfg.DataDir)
	if err != nil {
		return err
	}
	if generated {
		slog.Warn("TILECRAFT_SECRET_KEY is not set; generated a key for stored secrets — back it up with the database",
			"file", filepath.Join(cfg.DataDir, secret.KeyFile))
	}
	secrets, err := secret.New(key)
	if err != nil {
		return err
	}
	deps := api.Deps{Secrets: secrets}
	handler, _ := api.New(gdb, cfg, deps)
	if cfg.StaticDir != "" {
		spa, err := withSPA(handler, cfg.StaticDir, cfg.Test)
		if err != nil {
			return err
		}
		handler = httpsec.Middleware(httpsec.Options{TrustedProxies: cfg.TrustedProxies, PublicHTTPS: cfg.PublicHTTPS()})(spa)
	}
	srv := &http.Server{Addr: cfg.ListenAddr, Handler: handler, ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout: 5 * time.Minute, WriteTimeout: 5 * time.Minute, IdleTimeout: 2 * time.Minute}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go cleanup(ctx, gdb)
	errc := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", cfg.ListenAddr, "db", cfg.DBDriver, "static", cfg.StaticDir)
		errc <- srv.ListenAndServe()
	}()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// cleanup removes expired sessions, tokens and OAuth data every hour.
func cleanup(ctx context.Context, gdb *gorm.DB) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		if err := api.Cleanup(gdb.WithContext(ctx), time.Now()); err != nil && ctx.Err() == nil {
			slog.Error("cleanup", "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// withSPA serves /api/* (and the OAuth metadata for MCP clients) from the API and everything else from dir, falling
// back to index.html for client-side routes. A test instance gets <html data-env="test"> (test colors in the SPA).
func withSPA(apiHandler http.Handler, dir string, test bool) (http.Handler, error) {
	// not in Go's built-in table; minimal images have no /etc/mime.types
	_ = mime.AddExtensionType(".webmanifest", "application/manifest+json")
	files := http.FileServer(http.Dir(dir))
	index, err := os.ReadFile(filepath.Join(dir, "index.html"))
	if err != nil {
		return nil, err
	}
	if test {
		index = bytes.Replace(index, []byte("<html "), []byte(`<html data-env="test" `), 1)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/.well-known/oauth-") {
			apiHandler.ServeHTTP(w, r)
			return
		}
		// /index.html too: the service worker precaches it
		if p := filepath.Clean("/" + r.URL.Path); p != "/index.html" {
			if info, err := os.Stat(filepath.Join(dir, filepath.FromSlash(p))); err == nil && !info.IsDir() {
				switch {
				case strings.HasPrefix(r.URL.Path, "/assets/"):
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				case r.URL.Path == "/sw.js" || strings.HasPrefix(r.URL.Path, "/workbox-") || r.URL.Path == "/manifest.webmanifest":
					w.Header().Set("Cache-Control", "no-cache") // a new deploy must reach installed apps
				}
				files.ServeHTTP(w, r)
				return
			}
		}
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(index)
	}), nil
}
