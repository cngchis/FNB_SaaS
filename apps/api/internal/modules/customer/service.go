package customer

import (
	"context"
	"errors"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct{ Pool *pgxpool.Pool }
type Page struct {
	Items      []dbgen.ListCustomersRow `json:"items"`
	Pagination httpx.Pagination         `json:"pagination"`
}

func (s Service) List(ctx context.Context, tenant, store string, filter ListFilter) (Page, error) {
	result := Page{Items: []dbgen.ListCustomersRow{}}
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		var storeID pgtype.UUID
		if err := storeID.Scan(store); err != nil {
			return err
		}
		groupID := httpx.OptionalUUID(filter.GroupID)
		count, err := q.CountCustomers(ctx, dbgen.CountCustomersParams{TenantID: tid, Search: filter.Pattern(), GroupID: groupID})
		if err != nil {
			return err
		}
		result.Pagination = filter.Pagination(count)
		result.Items, err = q.ListCustomers(ctx, dbgen.ListCustomersParams{TenantID: tid, StoreID: storeID, Search: filter.Pattern(), GroupID: groupID, Sort: filter.Sort, Direction: filter.Direction, PageLimit: filter.PageSize, PageOffset: filter.Offset()})
		return err
	})
	return result, err
}
func (s Service) Get(ctx context.Context, tenant, store string, id pgtype.UUID) (dbgen.GetCustomerDetailsRow, error) {
	var result dbgen.GetCustomerDetailsRow
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		var storeID pgtype.UUID
		if err := storeID.Scan(store); err != nil {
			return err
		}
		var err error
		result, err = q.GetCustomerDetails(ctx, dbgen.GetCustomerDetailsParams{TenantID: tid, StoreID: storeID, ID: id})
		return err
	})
	return result, err
}
func (s Service) Save(ctx context.Context, tenant string, id pgtype.UUID, in Input) (dbgen.Customer, error) {
	var result dbgen.Customer
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		groupID := httpx.OptionalUUID(in.GroupID)
		if groupID.Valid {
			group, err := q.GetCustomerGroup(ctx, dbgen.GetCustomerGroupParams{TenantID: tid, ID: groupID})
			if errors.Is(err, pgx.ErrNoRows) {
				return httpx.Invalid("Choose an active customer group in this tenant.")
			}
			if err != nil {
				return err
			}
			if !group.IsActive {
				return httpx.Invalid("Choose an active customer group in this tenant.")
			}
		}
		var err error
		if id.Valid {
			result, err = q.UpdateCustomer(ctx, dbgen.UpdateCustomerParams{TenantID: tid, ID: id, Name: in.Name, Phone: httpx.NullableText(in.Phone), Email: httpx.NullableText(in.Email), Note: httpx.NullableText(in.Note), GroupID: groupID, Points: httpx.NullableInt(in.Points)})
		} else {
			var points int64
			if in.Points != nil {
				points = *in.Points
			}
			result, err = q.CreateCustomer(ctx, dbgen.CreateCustomerParams{TenantID: tid, Name: in.Name, Phone: httpx.NullableText(in.Phone), Email: httpx.NullableText(in.Email), Note: httpx.NullableText(in.Note), GroupID: groupID, Points: points})
		}
		return err
	})
	return result, err
}
func (s Service) Delete(ctx context.Context, tenant string, id pgtype.UUID) error {
	return database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		// Order creation takes a shared customer lock; serialize deletion with it.
		if _, err := q.LockCustomerForDeletion(ctx, dbgen.LockCustomerForDeletionParams{TenantID: tid, ID: id}); err != nil {
			return err
		}
		used, err := q.CustomerHasOpenOrders(ctx, dbgen.CustomerHasOpenOrdersParams{TenantID: tid, CustomerID: id})
		if err != nil {
			return err
		}
		if used {
			return &httpx.PublicError{Status: 409, Code: "customer_in_use", Message: "Settle open customer orders before deleting the customer."}
		}

		count, err := q.DeleteCustomer(ctx, dbgen.DeleteCustomerParams{TenantID: tid, ID: id})
		if err != nil {
			return err
		}
		if count == 0 {
			return httpx.Missing()
		}
		return nil
	})
}
func (s Service) Groups(ctx context.Context, tenant string) ([]dbgen.ListCustomerGroupsRow, error) {
	rows := []dbgen.ListCustomerGroupsRow{}
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		var err error
		rows, err = q.ListCustomerGroups(ctx, tid)
		return err
	})
	return rows, err
}

func (s Service) Group(ctx context.Context, tenant string, id pgtype.UUID) (dbgen.CustomerGroup, error) {
	var result dbgen.CustomerGroup
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		var err error
		result, err = q.GetCustomerGroup(ctx, dbgen.GetCustomerGroupParams{TenantID: tid, ID: id})
		return err
	})
	return result, err
}
func (s Service) SaveGroup(ctx context.Context, tenant string, id pgtype.UUID, in GroupInput) (dbgen.CustomerGroup, error) {
	var result dbgen.CustomerGroup
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		var err error
		if id.Valid {
			result, err = q.UpdateCustomerGroup(ctx, dbgen.UpdateCustomerGroupParams{TenantID: tid, ID: id, Name: in.Name, Condition: in.Condition, Benefit: in.Benefit, IsActive: httpx.Bool(in.IsActive, true)})
		} else {
			result, err = q.CreateCustomerGroup(ctx, dbgen.CreateCustomerGroupParams{TenantID: tid, Name: in.Name, Condition: in.Condition, Benefit: in.Benefit, IsActive: httpx.Bool(in.IsActive, true)})
		}
		return err
	})
	return result, err
}
func (s Service) DeleteGroup(ctx context.Context, tenant string, id pgtype.UUID) error {
	return database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		count, err := q.DeleteCustomerGroup(ctx, dbgen.DeleteCustomerGroupParams{TenantID: tid, ID: id})
		if err != nil {
			return err
		}
		if count == 0 {
			return httpx.Missing()
		}
		return q.DetachCustomerGroup(ctx, dbgen.DetachCustomerGroupParams{TenantID: tid, GroupID: id})
	})
}
