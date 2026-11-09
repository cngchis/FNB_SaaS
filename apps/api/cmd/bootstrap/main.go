package main

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"os"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$`)

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run() error {
	connectionString := strings.TrimSpace(os.Getenv("MIGRATIONS_DATABASE_URL"))
	tenantName := strings.TrimSpace(os.Getenv("BOOTSTRAP_TENANT_NAME"))
	tenantSlug := strings.ToLower(strings.TrimSpace(os.Getenv("BOOTSTRAP_TENANT_SLUG")))
	storeName := strings.TrimSpace(os.Getenv("BOOTSTRAP_STORE_NAME"))
	storeSlug := strings.ToLower(strings.TrimSpace(os.Getenv("BOOTSTRAP_STORE_SLUG")))
	ownerName := strings.TrimSpace(os.Getenv("BOOTSTRAP_OWNER_NAME"))
	ownerEmail := strings.ToLower(strings.TrimSpace(os.Getenv("BOOTSTRAP_OWNER_EMAIL")))
	ownerPassword := os.Getenv("BOOTSTRAP_OWNER_PASSWORD")
	if connectionString == "" || tenantName == "" || !slugPattern.MatchString(tenantSlug) || storeName == "" || !slugPattern.MatchString(storeSlug) || ownerName == "" || ownerPassword == "" {
		return errors.New("set MIGRATIONS_DATABASE_URL, BOOTSTRAP_TENANT_NAME/SLUG, BOOTSTRAP_STORE_NAME/SLUG, BOOTSTRAP_OWNER_NAME/EMAIL/PASSWORD")
	}
	if _, err := mail.ParseAddress(ownerEmail); err != nil {
		return errors.New("BOOTSTRAP_OWNER_EMAIL must be a valid email address")
	}
	if len(ownerPassword) < 12 || len(ownerPassword) > 72 {
		return errors.New("BOOTSTRAP_OWNER_PASSWORD must contain 12 to 72 bytes for bcrypt")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(ownerPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash owner password: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, connectionString)
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	defer pool.Close()
	tx, err := pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin bootstrap transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	var tenantID, storeID, userID, membershipID string
	if err := tx.QueryRow(ctx, `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id::text`, tenantName, tenantSlug).Scan(&tenantID); err != nil {
		return fmt.Errorf("create tenant (slug may already be used): %w", err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO stores (tenant_id, name, slug) VALUES ($1, $2, $3) RETURNING id::text`, tenantID, storeName, storeSlug).Scan(&storeID); err != nil {
		return fmt.Errorf("create first store: %w", err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id::text`, ownerEmail, ownerName, string(hash)).Scan(&userID); err != nil {
		return fmt.Errorf("create owner user (email may already be used): %w", err)
	}
	if _, err := tx.Exec(ctx, `SELECT set_config('app.tenant_id', $1, true)`, tenantID); err != nil {
		return fmt.Errorf("set tenant context: %w", err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO memberships (tenant_id, user_id, role_slug) VALUES ($1, $2, 'owner') RETURNING id::text`, tenantID, userID).Scan(&membershipID); err != nil {
		return fmt.Errorf("create owner membership: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO membership_stores (tenant_id, membership_id, store_id) VALUES ($1, $2, $3)`, tenantID, membershipID, storeID); err != nil {
		return fmt.Errorf("grant owner access to initial store: %w", err)
	}
	for _, method := range []struct{ name, kind string }{{"Tiền mặt", "cash"}, {"Chuyển khoản", "bank_transfer"}, {"QR", "qr"}} {
		if _, err := tx.Exec(ctx, `INSERT INTO payment_methods (tenant_id, store_id, name, method_type) VALUES ($1, $2, $3, $4)`, tenantID, storeID, method.name, method.kind); err != nil {
			return fmt.Errorf("create default payment method: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit bootstrap data: %w", err)
	}
	fmt.Printf("Created tenant %s and owner account %s\n", tenantSlug, ownerEmail)
	return nil
}
