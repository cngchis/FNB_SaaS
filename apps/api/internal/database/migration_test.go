package database

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

// TestMigrationRoundTrip only migrates a new temporary database, never the
// database supplied in TEST_DATABASE_ADMIN_URL.
func TestMigrationRoundTrip(t *testing.T) {
	adminURL := os.Getenv("TEST_DATABASE_ADMIN_URL")
	if adminURL == "" {
		t.Skip("set TEST_DATABASE_ADMIN_URL to test migrations in a temporary database")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	admin := testPool(t, ctx, adminURL, "TEST_DATABASE_ADMIN_PASSWORD")
	defer admin.Close()
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatalf("configure migration dialect: %v", err)
	}
	migrations, err := filepath.Abs("../../migrations")
	if err != nil {
		t.Fatalf("resolve migrations directory: %v", err)
	}
	databaseName := "fnb_migration_" + strings.ReplaceAll(testSlug(t), "-", "_")
	identifier := pgx.Identifier{databaseName}.Sanitize()
	if _, err := admin.Exec(ctx, "CREATE DATABASE "+identifier+" TEMPLATE template0"); err != nil {
		t.Fatalf("create temporary migration database: %v", err)
	}
	config := admin.Config().ConnConfig.Copy()
	config.Database = databaseName
	db := stdlib.OpenDB(*config)
	defer func() {
		if err := db.Close(); err != nil {
			t.Errorf("close temporary database connections: %v", err)
		}
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		if _, err := admin.Exec(cleanupCtx, "DROP DATABASE "+identifier+" WITH (FORCE)"); err != nil {
			t.Errorf("remove temporary migration database %s: %v", databaseName, err)
		}
	}()
	checkSchema := func() {
		t.Helper()
		var roleCount int
		if err := db.QueryRowContext(ctx, `SELECT count(*) FROM roles WHERE slug IN ('owner', 'manager', 'cashier', 'kitchen')`).Scan(&roleCount); err != nil {
			t.Fatalf("read seeded roles: %v", err)
		}
		if roleCount != 4 {
			t.Fatalf("found %d seeded roles; want 4", roleCount)
		}
		for _, table := range []string{"products", "product_units", "customer_groups", "customers", "entity_counters", "stocktakes", "stocktake_items", "stock_balances", "stock_movements"} {
			var forcedRLS bool
			if err := db.QueryRowContext(ctx, `SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = $1::regclass`, "public."+table).Scan(&forcedRLS); err != nil {
				t.Fatalf("inspect %s RLS: %v", table, err)
			}
			if !forcedRLS {
				t.Fatalf("%s RLS must be enabled and forced", table)
			}
		}
	}
	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatalf("apply migrations: %v", err)
	}
	checkSchema()
	t.Log("initial migration up succeeded")
	if err := goose.DownToContext(ctx, db, migrations, 0); err != nil {
		t.Fatalf("roll back migrations: %v", err)
	}
	var remainingTables int
	if err := db.QueryRowContext(ctx, `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'goose_db_version'`).Scan(&remainingTables); err != nil {
		t.Fatalf("inspect rolled-back schema: %v", err)
	}
	if remainingTables != 0 {
		t.Fatalf("rollback left %d application tables; want 0", remainingTables)
	}
	t.Log("migration down removed all application tables")
	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatalf("reapply migrations after rollback: %v", err)
	}
	checkSchema()
	t.Log("migration up after rollback succeeded")
}
