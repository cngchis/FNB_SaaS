package product

import (
	"context"
	"errors"
	"fmt"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/database"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/dbgen"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/shared/httpx"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct{ Pool *pgxpool.Pool }

func (s Service) List(ctx context.Context, tenant string, filter ListFilter) (Page, error) {
	result := Page{Items: []Item{}}
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		category := httpx.OptionalUUID(filter.CategoryID)
		count, err := q.CountProducts(ctx, dbgen.CountProductsParams{TenantID: tid, Search: filter.Pattern(), CategoryID: category, ProductType: filter.ProductType, Availability: filter.Availability})
		if err != nil {
			return err
		}
		result.Pagination = filter.Pagination(count)
		rows, err := q.ListProducts(ctx, dbgen.ListProductsParams{TenantID: tid, Search: filter.Pattern(), CategoryID: category, ProductType: filter.ProductType, Availability: filter.Availability, Sort: filter.Sort, Direction: filter.Direction, PageLimit: filter.PageSize, PageOffset: filter.Offset()})
		if err != nil {
			return err
		}
		for _, p := range rows {
			item := newItem(dbgen.Product{ID: p.ID, TenantID: p.TenantID, CategoryID: p.CategoryID, Sku: p.Sku, Name: p.Name, ProductType: p.ProductType, BaseUnit: p.BaseUnit, PriceVnd: p.PriceVnd, CostVnd: p.CostVnd, TracksStock: p.TracksStock, IsVisible: p.IsVisible, CreatedAt: p.CreatedAt, UpdatedAt: p.UpdatedAt, DeletedAt: p.DeletedAt, MenuType: p.MenuType, Availability: p.Availability, IsExtra: p.IsExtra, EarnsPoints: p.EarnsPoints, ImageUrl: p.ImageUrl})
			if p.CategoryName.Valid {
				name := p.CategoryName.String
				item.CategoryName = &name
			}
			result.Items = append(result.Items, item)
		}
		return enrich(ctx, q, tid, result.Items)
	})
	return result, err
}

func newItem(p dbgen.Product) Item {
	return Item{Product: p, Attributes: []dbgen.ProductVariant{}, Units: []dbgen.ProductUnit{}}
}
func enrich(ctx context.Context, q *dbgen.Queries, tid pgtype.UUID, items []Item) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]pgtype.UUID, len(items))
	positions := map[pgtype.UUID]int{}
	for i := range items {
		ids[i] = items[i].ID
		positions[ids[i]] = i
	}
	attributes, err := q.ListProductAttributes(ctx, dbgen.ListProductAttributesParams{TenantID: tid, ProductIds: ids})
	if err != nil {
		return err
	}
	units, err := q.ListProductUnits(ctx, dbgen.ListProductUnitsParams{TenantID: tid, ProductIds: ids})
	if err != nil {
		return err
	}
	for _, a := range attributes {
		if index, ok := positions[a.ProductID]; ok {
			items[index].Attributes = append(items[index].Attributes, a)
		}
	}
	for _, u := range units {
		if index, ok := positions[u.ProductID]; ok {
			items[index].Units = append(items[index].Units, u)
		}
	}
	return nil
}
func (s Service) Get(ctx context.Context, tenant string, id pgtype.UUID) (Item, error) {
	var item Item
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		p, err := q.GetProduct(ctx, dbgen.GetProductParams{TenantID: tid, ID: id})
		if err != nil {
			return err
		}
		item = newItem(p)
		if p.CategoryID.Valid {
			category, err := q.GetProductCategory(ctx, dbgen.GetProductCategoryParams{TenantID: tid, ID: p.CategoryID})
			if err != nil {
				return err
			}
			item.CategoryName = &category.Name
		}
		items := []Item{item}
		if err := enrich(ctx, q, tid, items); err != nil {
			return err
		}
		item = items[0]
		return nil
	})
	return item, err
}

func (s Service) Save(ctx context.Context, tenant string, id pgtype.UUID, in Input) (Item, error) {
	var item Item
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		categoryID := httpx.OptionalUUID(in.CategoryID)
		var categoryName *string
		if categoryID.Valid {
			category, err := q.GetProductCategory(ctx, dbgen.GetProductCategoryParams{TenantID: tid, ID: categoryID})
			if errors.Is(err, pgx.ErrNoRows) {
				return httpx.Invalid("Choose an active product category in this tenant.")
			}
			if err != nil {
				return err
			}
			categoryName = &category.Name
		}
		tracksStock := httpx.Bool(in.TracksStock, in.ProductType == "goods")
		var p dbgen.Product
		var err error
		if !id.Valid {
			number, e := q.NextProductNumber(ctx, tid)
			if e != nil {
				return e
			}
			p, err = q.CreateProduct(ctx, dbgen.CreateProductParams{TenantID: tid, Sku: fmt.Sprintf("M%05d", number), Name: in.Name, CategoryID: categoryID, ProductType: in.ProductType, MenuType: in.MenuType, BaseUnit: in.BaseUnit, PriceVnd: *in.PriceVND, CostVnd: httpx.NullableInt(in.CostVND), TracksStock: tracksStock, IsVisible: httpx.Bool(in.IsVisible, true), IsExtra: httpx.Bool(in.IsExtra, false), EarnsPoints: httpx.Bool(in.EarnsPoints, true), Availability: in.Availability, ImageUrl: httpx.NullableText(in.ImageURL)})
		} else {
			if _, err = q.LockProduct(ctx, dbgen.LockProductParams{TenantID: tid, ID: id}); err != nil {
				return err
			}
			p, err = q.UpdateProduct(ctx, dbgen.UpdateProductParams{TenantID: tid, ID: id, Name: in.Name, CategoryID: categoryID, ProductType: in.ProductType, MenuType: in.MenuType, BaseUnit: in.BaseUnit, PriceVnd: *in.PriceVND, CostVnd: httpx.NullableInt(in.CostVND), TracksStock: tracksStock, IsVisible: httpx.Bool(in.IsVisible, true), IsExtra: httpx.Bool(in.IsExtra, false), EarnsPoints: httpx.Bool(in.EarnsPoints, true), Availability: in.Availability, ImageUrl: httpx.NullableText(in.ImageURL)})
		}
		if err != nil {
			return err
		}
		if err = q.ClearProductAttributes(ctx, dbgen.ClearProductAttributesParams{TenantID: tid, ProductID: p.ID}); err != nil {
			return err
		}
		if err = q.ClearProductUnits(ctx, dbgen.ClearProductUnitsParams{TenantID: tid, ProductID: p.ID}); err != nil {
			return err
		}
		for _, a := range in.Attributes {
			if err = q.CreateProductAttribute(ctx, dbgen.CreateProductAttributeParams{TenantID: tid, ProductID: p.ID, Name: a.Name, Value: a.Value, PriceDeltaVnd: a.PriceDeltaVND}); err != nil {
				return err
			}
		}
		for _, u := range in.Units {
			if err = q.CreateProductUnit(ctx, dbgen.CreateProductUnitParams{TenantID: tid, ProductID: p.ID, Name: u.Name, Ratio: u.Ratio, PriceVnd: *u.PriceVND, CostVnd: httpx.NullableInt(u.CostVND), IsVisible: httpx.Bool(u.IsVisible, httpx.Bool(in.IsVisible, true))}); err != nil {
				return err
			}
		}
		items := []Item{newItem(p)}
		if err = enrich(ctx, q, tid, items); err != nil {
			return err
		}
		item = items[0]
		item.CategoryName = categoryName
		return nil
	})
	return item, err
}
func (s Service) Delete(ctx context.Context, tenant string, id pgtype.UUID) error {
	return database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		count, err := q.DeleteProduct(ctx, dbgen.DeleteProductParams{TenantID: tid, ID: id})
		if err != nil {
			return err
		}
		if count == 0 {
			return httpx.Missing()
		}
		return nil
	})
}

func (s Service) Categories(ctx context.Context, tenant string) ([]dbgen.ProductCategory, error) {
	rows := []dbgen.ProductCategory{}
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		var err error
		rows, err = q.ListProductCategories(ctx, tid)
		return err
	})
	return rows, err
}

func (s Service) Category(ctx context.Context, tenant string, id pgtype.UUID) (dbgen.ProductCategory, error) {
	var result dbgen.ProductCategory
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		var err error
		result, err = q.GetProductCategory(ctx, dbgen.GetProductCategoryParams{TenantID: tid, ID: id})
		return err
	})
	return result, err
}
func (s Service) SaveCategory(ctx context.Context, tenant string, id pgtype.UUID, name string) (dbgen.ProductCategory, error) {
	var result dbgen.ProductCategory
	err := database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		var err error
		if id.Valid {
			result, err = q.UpdateProductCategory(ctx, dbgen.UpdateProductCategoryParams{TenantID: tid, ID: id, Name: name})
		} else {
			result, err = q.CreateProductCategory(ctx, dbgen.CreateProductCategoryParams{TenantID: tid, Name: name})
		}
		return err
	})
	return result, err
}
func (s Service) DeleteCategory(ctx context.Context, tenant string, id pgtype.UUID) error {
	return database.WithTenantQueries(ctx, s.Pool, tenant, func(q *dbgen.Queries, tid pgtype.UUID) error {
		count, err := q.DeleteProductCategory(ctx, dbgen.DeleteProductCategoryParams{TenantID: tid, ID: id})
		if err != nil {
			return err
		}
		if count == 0 {
			return httpx.Missing()
		}
		return q.DetachProductCategory(ctx, dbgen.DetachProductCategoryParams{TenantID: tid, CategoryID: id})
	})
}
