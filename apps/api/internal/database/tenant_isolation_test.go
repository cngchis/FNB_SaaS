package database

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
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
	admin, err := pgxpool.New(ctx, adminURL)
	if err != nil {
		t.Fatalf("connect using test admin role: %v", err)
	}
	defer admin.Close()
	runtime, err := pgxpool.New(ctx, runtimeURL)
	if err != nil {
		t.Fatalf("connect using runtime role: %v", err)
	}
	defer runtime.Close()

	tenantIDs := make([]string, 0, 2)
	defer func() {
		for _, tenantID := range tenantIDs {
			_, _ = admin.Exec(context.Background(), `DELETE FROM tenants WHERE id = $1`, tenantID)
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

	err = WithTenantTx(ctx, runtime, tenantIDs[0], func(tx pgx.Tx) error {
		var visible int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM product_categories`).Scan(&visible); err != nil {
			return err
		}
		if visible != 1 {
			t.Fatalf("tenant A sees %d category rows; want 1", visible)
		}
		var foreignVisible int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM product_categories WHERE tenant_id = $1`, tenantIDs[1]).Scan(&foreignVisible); err != nil {
			return err
		}
		if foreignVisible != 0 {
			t.Fatalf("tenant A sees %d tenant B rows; want 0", foreignVisible)
		}
		_, err := tx.Exec(ctx, `INSERT INTO product_categories (tenant_id, name) VALUES ($1, $2)`, tenantIDs[1], "forbidden")
		if err == nil {
			t.Fatal("runtime role inserted a row for another tenant")
		}
		return err
	})
	if err == nil {
		t.Fatal("cross-tenant write unexpectedly succeeded")
	}
}

func testSlug(t *testing.T) string {
	t.Helper()
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		t.Fatalf("generate test slug: %v", err)
	}
	return "rls-test-" + hex.EncodeToString(bytes)
}
