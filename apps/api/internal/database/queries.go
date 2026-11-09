package database

import (
	"context"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

func WithTenantQueries(ctx context.Context, pool *pgxpool.Pool, tenantID string, fn func(*dbgen.Queries, pgtype.UUID) error) error {
	var id pgtype.UUID
	if err := id.Scan(tenantID); err != nil {
		return err
	}
	return WithTenantTx(ctx, pool, tenantID, func(tx pgx.Tx) error { return fn(dbgen.New(tx), id) })
}
