package tests

import (
	"net/url"
	"testing"
)

func TestInventoryCatalogFilter(t *testing.T) {
	f := moduleTestFixture(t)
	call := func(method, path, token string, body any, status int, out any) {
		t.Helper()
		authRequest(t, f.client, f.base, method, "/api/v1"+path, token, body, status, out)
	}
	for _, item := range []struct {
		name, kind string
		tracked    bool
	}{{"INV_% one", "goods", true}, {"INV_% two", "goods", true}, {"INV_% nonstock", "goods", false}, {"INV_% prepared", "prepared", false}} {
		call("POST", "/products", f.owner, map[string]any{"name": item.name, "product_type": item.kind, "price_vnd": 100, "tracks_stock": item.tracked}, 201, nil)
	}
	type page struct {
		Items      []catalogRecord `json:"items"`
		Pagination struct {
			Total int `json:"total"`
			Pages int `json:"total_pages"`
		} `json:"pagination"`
	}
	var result moduleEnvelope[page]
	filter := "/products?product_type=goods&tracks_stock=true&search=" + url.QueryEscape("INV_%")
	call("GET", filter+"&page_size=1", f.cashier, nil, 200, &result)
	if result.Data.Pagination.Total != 2 || result.Data.Pagination.Pages != 2 || len(result.Data.Items) != 1 {
		t.Fatalf("wrong filtered pagination: %+v", result.Data)
	}
	call("GET", filter+"&page=2&page_size=1", f.owner, nil, 200, &result)
	if len(result.Data.Items) != 1 {
		t.Fatal("missing second tracked product")
	}
	call("GET", "/products?product_type=goods&tracks_stock=false", f.owner, nil, 200, &result)
	if result.Data.Pagination.Total != 1 {
		t.Fatal("false filter was treated as omitted")
	}
	call("GET", "/products?product_type=goods", f.owner, nil, 200, &result)
	if result.Data.Pagination.Total != 3 {
		t.Fatal("omitted filter changed existing catalog behavior")
	}
	call("GET", filter, f.otherOwner, nil, 200, &result)
	if result.Data.Pagination.Total != 0 {
		t.Fatal("inventory catalog leaked across tenants")
	}
	call("GET", "/products?tracks_stock=invalid", f.owner, nil, 400, nil)
}
