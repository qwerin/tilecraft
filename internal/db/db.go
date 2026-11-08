// Package db opens the database connection and migrates the schema.
package db

import (
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/qwerin/tilecraft/internal/model"
)

// Open connects to "sqlite" (pure Go) or "postgres".
//
// SQLite uses a single connection: inside a transaction always use the tx
// handle — a query on the outer *gorm.DB would wait forever.
func Open(driver, dsn, logLevel string) (*gorm.DB, error) {
	levels := map[string]logger.LogLevel{"": logger.Error, "silent": logger.Silent, "error": logger.Error, "warn": logger.Warn, "info": logger.Info}
	lvl, ok := levels[strings.ToLower(logLevel)]
	if !ok {
		return nil, fmt.Errorf("TILECRAFT_DB_LOG: unknown level %q", logLevel)
	}
	cfg := &gorm.Config{TranslateError: true, Logger: logger.New(log.New(os.Stderr, "", log.LstdFlags), logger.Config{
		SlowThreshold: time.Second, LogLevel: lvl, IgnoreRecordNotFoundError: true, ParameterizedQueries: true,
	})}
	switch driver {
	case "sqlite":
		sep := "?"
		if strings.Contains(dsn, "?") {
			sep = "&"
		}
		db, err := gorm.Open(sqlite.Open(dsn+sep+"_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)"), cfg)
		if err != nil {
			return nil, fmt.Errorf("open sqlite: %w", err)
		}
		sqlDB, err := db.DB()
		if err != nil {
			return nil, err
		}
		sqlDB.SetMaxOpenConns(1)
		return db, nil
	case "postgres":
		db, err := gorm.Open(postgres.Open(dsn), cfg)
		if err != nil {
			return nil, fmt.Errorf("open postgres: %w", err)
		}
		return db, nil
	default:
		return nil, fmt.Errorf("unsupported db driver %q", driver)
	}
}

// Migrate creates/updates the schema for all models.
func Migrate(db *gorm.DB) error {
	return db.AutoMigrate(model.All()...)
}
