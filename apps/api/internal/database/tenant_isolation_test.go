package database

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestTenantIsolation verifies that the runtime database role cannot read or
// write another tenant's rows, even when a query supplies that tenant ID.
func TestTenantIsolation(t *testing.T) {
	adminURL := os.Getenv("TEST_DATABASE_ADMIN_URL")
	runtimeURL := os.Getenv("TEST_DATABASE_URL")
	if adminURL == "" || runtimeURL == "" {
		t.Skip("set TEST_DATABASE_ADMIN_URL and TEST_DATABASE_URL to run PostgreSQL RLS integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	admin := testPool(t, ctx, adminURL, "TEST_DATABASE_ADMIN_PASSWORD")
	defer admin.Close()
	runtime := testPool(t, ctx, runtimeURL, "TEST_DATABASE_PASSWORD")
	defer runtime.Close()
	var privileged bool
	if err := runtime.QueryRow(ctx, `SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user`).Scan(&privileged); err != nil {
		t.Fatalf("inspect runtime role: %v", err)
	}
	if privileged {
		t.Fatal("runtime role must not be a superuser or have BYPASSRLS")
	}

	tenantIDs := make([]string, 0, 2)
	defer func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		for _, tenantID := range tenantIDs {
			if _, err := admin.Exec(cleanupCtx, `DELETE FROM tenants WHERE id = $1`, tenantID); err != nil {
				t.Errorf("remove test tenant %s: %v", tenantID, err)
			}
		}
	}()
	for _, slug := range []string{testSlug(t), testSlug(t)} {
		var tenantID string
		if err := admin.QueryRow(ctx, `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id::text`, "RLS test", slug).Scan(&tenantID); err != nil {
			t.Fatalf("create test tenant: %v", err)
		}
		tenantIDs = append(tenantIDs, tenantID)
		if _, err := admin.Exec(ctx, `INSERT INTO product_categories (tenant_id, name) VALUES ($1, $2)`, tenantID, "Category "+slug); err != nil {
			t.Fatalf("create category for tenant %s: %v", tenantID, err)
		}
	}

	for index, tenantID := range tenantIDs {
		foreignID := tenantIDs[1-index]
		err := WithTenantTx(ctx, runtime, tenantID, func(tx pgx.Tx) error {
			var visible int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM product_categories`).Scan(&visible); err != nil {
				return err
			}
			if visible != 1 {
				return fmt.Errorf("tenant sees %d category rows; want 1", visible)
			}
			var foreignVisible int
			if err := tx.QueryRow(ctx, `SELECT count(*) FROM product_categories WHERE tenant_id = $1`, foreignID).Scan(&foreignVisible); err != nil {
				return err
			}
			if foreignVisible != 0 {
				return fmt.Errorf("tenant sees %d foreign rows; want 0", foreignVisible)
			}
			_, err := tx.Exec(ctx, `INSERT INTO product_categories (tenant_id, name) VALUES ($1, $2)`, tenantID, "allowed")
			return err
		})
		if err != nil {
			t.Fatalf("read isolation and own-tenant write: %v", err)
		}
		err = WithTenantTx(ctx, runtime, tenantID, func(tx pgx.Tx) error {
			_, err := tx.Exec(ctx, `INSERT INTO product_categories (tenant_id, name) VALUES ($1, $2)`, foreignID, "forbidden")
			return err
		})
		var pgError *pgconn.PgError
		if !errors.As(err, &pgError) || pgError.Code != "42501" {
			t.Fatalf("cross-tenant write must fail with PostgreSQL 42501; got %v", err)
		}
	}
}

func testPool(t *testing.T, ctx context.Context, connectionString, passwordVariable string) *pgxpool.Pool {
	t.Helper()
	config, err := pgxpool.ParseConfig(connectionString)
	if err != nil {
		t.Fatalf("parse test database connection: %v", err)
	}
	if password, present := os.LookupEnv(passwordVariable); present {
		config.ConnConfig.Password = password
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		t.Fatalf("open test database connection: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		t.Fatalf("connect to test database: %v", err)
	}
	return pool
}

func testSlug(t *testing.T) string {
	t.Helper()
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		t.Fatalf("generate test slug: %v", err)
	}
	return "rls-test-" + hex.EncodeToString(bytes)
}
