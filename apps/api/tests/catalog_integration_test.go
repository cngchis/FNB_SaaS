package tests

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/cngchis/FNB_SaaS/apps/api/internal/config"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/auth"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/customer"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/pos"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/product"
	"github.com/cngchis/FNB_SaaS/apps/api/internal/modules/room"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"golang.org/x/crypto/bcrypt"
)

type moduleEnvelope[T any] struct {
	Data T `json:"data"`
}
type modulePage[T any] struct {
	Items      []T `json:"items"`
	Pagination struct {
		Total int64 `json:"total"`
	} `json:"pagination"`
}
type catalogRecord struct {
	ID         string  `json:"id"`
	SKU        string  `json:"sku"`
	Name       string  `json:"name"`
	CategoryID *string `json:"category_id"`
	GroupID    *string `json:"group_id"`
	PriceVND   int64   `json:"price_vnd"`
	CostVND    *int64  `json:"cost_vnd"`
	Points     int64   `json:"points"`
	SpentVND   int64   `json:"spent_vnd"`
	OrderCount int64   `json:"order_count"`
	Attributes []struct {
		Name  string `json:"name"`
		Value string `json:"value"`
	} `json:"attributes"`
	Units []struct {
		Name    string `json:"name"`
		Ratio   string `json:"ratio"`
		CostVND *int64 `json:"cost_vnd"`
	} `json:"units"`
}
type moduleFixture struct {
	otherStoreToken                     string
	base                                string
	client                              *http.Client
	admin                               *pgxpool.Pool
	tenant, store, otherStore           string
	owner, otherOwner, cashier, kitchen string
}

// All fixture data lives in a newly created database; the configured databases
// are only used to obtain connection settings and a control connection.
func moduleTestFixture(t *testing.T) moduleFixture {
	t.Helper()
	adminURL, runtimeURL := os.Getenv("TEST_DATABASE_ADMIN_URL"), os.Getenv("TEST_DATABASE_URL")
	if adminURL == "" || runtimeURL == "" {
		t.Skip("set TEST_DATABASE_ADMIN_URL and TEST_DATABASE_URL for isolated catalog/customer integration tests")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	t.Cleanup(cancel)
	parse := func(connection, passwordVariable string) *pgxpool.Config {
		t.Helper()
		cfg, err := pgxpool.ParseConfig(connection)
		if err != nil {
			t.Fatalf("parse integration connection: %v", err)
		}
		if password, ok := os.LookupEnv(passwordVariable); ok {
			cfg.ConnConfig.Password = password
		}
		return cfg
	}
	adminCfg := parse(adminURL, "TEST_DATABASE_ADMIN_PASSWORD")
	control, err := pgxpool.NewWithConfig(ctx, adminCfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(control.Close)
	if err := control.Ping(ctx); err != nil {
		t.Fatalf("connect as fixture admin: %v", err)
	}
	random := make([]byte, 12)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	suffix := hex.EncodeToString(random)
	databaseName := "fnb_modules_" + suffix
	identifier := pgx.Identifier{databaseName}.Sanitize()
	if _, err := control.Exec(ctx, "CREATE DATABASE "+identifier+" TEMPLATE template0"); err != nil {
		t.Fatalf("create isolated module database: %v", err)
	}
	var db *sql.DB
	var admin, runtime *pgxpool.Pool
	var server *httptest.Server
	t.Cleanup(func() {
		if server != nil {
			server.Close()
		}
		if runtime != nil {
			runtime.Close()
		}
		if admin != nil {
			admin.Close()
		}
		if db != nil {
			_ = db.Close()
		}
		cleanupCtx, done := context.WithTimeout(context.Background(), 10*time.Second)
		defer done()
		if _, err := control.Exec(cleanupCtx, "DROP DATABASE "+identifier+" WITH (FORCE)"); err != nil {
			t.Errorf("remove module test database: %v", err)
		}
	})
	tempAdminCfg := adminCfg.Copy()
	tempAdminCfg.ConnConfig.Database = databaseName
	db = stdlib.OpenDB(*tempAdminCfg.ConnConfig)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	migrations, err := filepath.Abs("../migrations")
	if err != nil {
		t.Fatal(err)
	}
	if err := goose.UpContext(ctx, db, migrations); err != nil {
		t.Fatalf("migrate module fixture: %v", err)
	}
	admin, err = pgxpool.NewWithConfig(ctx, tempAdminCfg)
	if err != nil {
		t.Fatal(err)
	}
	runtimeCfg := parse(runtimeURL, "TEST_DATABASE_PASSWORD")
	runtimeCfg.ConnConfig.Database = databaseName
	runtime, err = pgxpool.NewWithConfig(ctx, runtimeCfg)
	if err != nil {
		t.Fatal(err)
	}
	var privileged bool
	if err := runtime.QueryRow(ctx, `SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user`).Scan(&privileged); err != nil {
		t.Fatalf("connect as runtime role: %v", err)
	}
	if privileged {
		t.Fatal("integration runtime role must not bypass RLS")
	}
	f := moduleFixture{admin: admin}
	var otherTenant, otherTenantStore string
	for i := 0; i < 2; i++ {
		var tid, sid string
		if err := admin.QueryRow(ctx, `INSERT INTO tenants(name,slug) VALUES($1,$2) RETURNING id::text`, "Module fixture", fmt.Sprintf("module-%s-%d", suffix, i)).Scan(&tid); err != nil {
			t.Fatal(err)
		}
		if err := admin.QueryRow(ctx, `INSERT INTO stores(tenant_id,name,slug) VALUES($1,'Store','main-store') RETURNING id::text`, tid).Scan(&sid); err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			f.tenant, f.store = tid, sid
		} else {
			otherTenant, otherTenantStore = tid, sid
		}
	}
	if err := admin.QueryRow(ctx, `INSERT INTO stores(tenant_id,name,slug) VALUES($1,'Other Store','other-store') RETURNING id::text`, f.tenant).Scan(&f.otherStore); err != nil {
		t.Fatal(err)
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		t.Fatal(err)
	}
	cfg := config.Config{JWTSecret: secret, AccessTTL: 15, RefreshTTL: 1}
	engine := gin.New()
	api := engine.Group("/api/v1")
	auth.RegisterRoutes(api.Group("/auth"), runtime, cfg)
	secured := api.Group("", auth.Authenticate(runtime, cfg.JWTSecret))
	product.RegisterRoutes(secured, runtime)
	customer.RegisterRoutes(secured, runtime)
	room.RegisterRoutes(secured, runtime)
	pos.RegisterRoutes(secured, runtime)
	server = httptest.NewServer(engine)
	f.base = server.URL
	f.client = server.Client()
	f.client.Timeout = 10 * time.Second
	password := "integration-" + suffix
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.MinCost)
	if err != nil {
		t.Fatal(err)
	}
	accounts := []struct {
		role, tenant, store string
		target              *string
	}{{"owner", f.tenant, f.store, &f.owner}, {"owner", otherTenant, otherTenantStore, &f.otherOwner}, {"cashier", f.tenant, f.store, &f.cashier}, {"kitchen", f.tenant, f.store, &f.kitchen}}
	for i, account := range accounts {
		var uid, mid, slug string
		email := fmt.Sprintf("module-%s-%d@example.test", suffix, i)
		if err := admin.QueryRow(ctx, `INSERT INTO users(email,display_name,password_hash) VALUES($1,'Test Account',$2) RETURNING id::text`, email, string(hash)).Scan(&uid); err != nil {
			t.Fatal(err)
		}
		if err := admin.QueryRow(ctx, `INSERT INTO memberships(tenant_id,user_id,role_slug) VALUES($1,$2,$3) RETURNING id::text`, account.tenant, uid, account.role).Scan(&mid); err != nil {
			t.Fatal(err)
		}
		if _, err := admin.Exec(ctx, `INSERT INTO membership_stores(tenant_id,membership_id,store_id) VALUES($1,$2,$3)`, account.tenant, mid, account.store); err != nil {
			t.Fatal(err)
		}
		if err := admin.QueryRow(ctx, `SELECT slug FROM tenants WHERE id=$1`, account.tenant).Scan(&slug); err != nil {
			t.Fatal(err)
		}
		var session tokenResponse
		authRequest(t, f.client, f.base, http.MethodPost, "/api/v1/auth/login", "", map[string]string{"tenant_slug": slug, "email": email, "password": password, "store_id": account.store}, 200, &session)
		*account.target = session.Data.AccessToken
		if i == 0 {
			if _, err := admin.Exec(ctx, "INSERT INTO membership_stores(tenant_id,membership_id,store_id) VALUES($1,$2,$3)", account.tenant, mid, f.otherStore); err != nil {
				t.Fatal(err)
			}
			var second tokenResponse
			authRequest(t, f.client, f.base, http.MethodPost, "/api/v1/auth/login", "", map[string]string{"tenant_slug": slug, "email": email, "password": password, "store_id": f.otherStore}, 200, &second)
			f.otherStoreToken = second.Data.AccessToken
		}
	}
	if _, err := admin.Exec(ctx, "INSERT INTO payment_methods(tenant_id,store_id,name,method_type) SELECT tenant_id,id,'Cash','cash' FROM stores"); err != nil {
		t.Fatal(err)
	}
	return f
}

func TestCatalogCustomersAPI(t *testing.T) {
	f := moduleTestFixture(t)
	call := func(method, path, token string, input any, status int, output any) {
		t.Helper()
		authRequest(t, f.client, f.base, method, "/api/v1"+path, token, input, status, output)
	}
	call("GET", "/products", "", nil, 401, nil)
	call("GET", "/products", f.owner+"tampered", nil, 401, nil)
	call("POST", "/products", f.cashier, map[string]any{}, 403, nil)
	call("POST", "/products", f.kitchen, map[string]any{}, 403, nil)
	call("GET", "/customers", f.kitchen, nil, 403, nil)
	call("GET", "/products", f.kitchen, nil, 200, nil)
	var category, foreignCategory moduleEnvelope[catalogRecord]
	call("POST", "/product-categories", f.owner, map[string]string{"name": "Cà phê"}, 201, &category)
	call("POST", "/product-categories", f.otherOwner, map[string]string{"name": "Other"}, 201, &foreignCategory)
	call("POST", "/product-categories", f.owner, map[string]string{"name": "Cà phê"}, 409, nil)
	call("PUT", "/product-categories/"+foreignCategory.Data.ID, f.owner, map[string]string{"name": "hidden"}, 404, nil)
	var item moduleEnvelope[catalogRecord]
	input := map[string]any{"name": "Catalog_% đồ uống", "product_type": "goods", "menu_type": "drink", "category_id": category.Data.ID, "base_unit": "Lon", "price_vnd": 35000, "cost_vnd": 16000, "attributes": []any{map[string]any{"name": "Size", "value": "M"}, map[string]any{"name": "Size", "value": "L", "price_delta_vnd": 5000}}, "units": []any{map[string]any{"name": "Thùng", "ratio": "24", "price_vnd": 700000, "cost_vnd": 384000}}}
	call("POST", "/products", f.owner, input, 201, &item)
	if item.Data.SKU != "M00001" || len(item.Data.Attributes) != 2 || len(item.Data.Units) != 1 || item.Data.Units[0].CostVND == nil || *item.Data.Units[0].CostVND != 384000 {
		t.Fatal("product code, attributes, or independent unit cost was not persisted")
	}
	var foreignItem moduleEnvelope[catalogRecord]
	call("POST", "/products", f.otherOwner, map[string]any{"name": "Other product", "product_type": "goods", "price_vnd": 1}, 201, &foreignItem)
	if foreignItem.Data.SKU != "M00001" {
		t.Fatal("product codes must be scoped to each tenant")
	}
	call("GET", "/products/"+foreignItem.Data.ID, f.owner, nil, 404, nil)
	call("PUT", "/products/"+foreignItem.Data.ID, f.owner, input, 404, nil)
	call("DELETE", "/products/"+foreignItem.Data.ID, f.owner, nil, 404, nil)
	call("POST", "/products", f.owner, map[string]any{"name": "Spoof", "product_type": "goods", "price_vnd": 1, "tenant_id": f.tenant}, 400, nil)
	call("POST", "/products", f.owner, map[string]any{"name": "Invalid", "product_type": "goods", "price_vnd": 1.5}, 400, nil)
	call("POST", "/products", f.owner, map[string]any{"name": "Invalid", "product_type": "prepared", "price_vnd": 1, "cost_vnd": 0}, 422, nil)
	call("POST", "/products", f.owner, map[string]any{"name": "Invalid", "product_type": "goods", "price_vnd": 1, "category_id": foreignCategory.Data.ID}, 422, nil)
	call("GET", "/products?page=0", f.owner, nil, 200, nil)
	call("GET", "/products?page_size=101", f.owner, nil, 400, nil)
	call("GET", "/products?sort=unknown", f.owner, nil, 422, nil)
	var products moduleEnvelope[modulePage[catalogRecord]]
	call("GET", "/products?search=_%25%20&page_size=1&sort=price_vnd&direction=desc", f.owner, nil, 200, &products)
	if products.Data.Pagination.Total != 1 || len(products.Data.Items) != 1 || products.Data.Items[0].ID != item.Data.ID {
		t.Fatal("literal search/pagination leaked another tenant or lost matching product")
	}
	input["price_vnd"] = 42000
	call("PUT", "/products/"+item.Data.ID, f.owner, input, 200, &item)
	if item.Data.PriceVND != 42000 || item.Data.SKU != "M00001" {
		t.Fatal("product update changed SKU or failed to persist integer money")
	}
	var group, foreignGroup moduleEnvelope[catalogRecord]
	call("POST", "/customer-groups", f.owner, map[string]any{"name": "Thành viên", "benefit": "Ưu đãi"}, 201, &group)
	call("POST", "/customer-groups", f.otherOwner, map[string]any{"name": "Foreign"}, 201, &foreignGroup)
	var person moduleEnvelope[catalogRecord]
	profile := map[string]any{"name": "Khách hàng API", "phone": "0900123456", "group_id": group.Data.ID, "points": 12}
	call("POST", "/customers", f.owner, profile, 201, &person)
	call("POST", "/customers", f.owner, map[string]any{"name": "Invalid", "group_id": foreignGroup.Data.ID}, 422, nil)
	call("GET", "/customers/"+person.Data.ID, f.otherOwner, nil, 404, nil)
	call("PUT", "/customers/"+person.Data.ID, f.otherOwner, map[string]any{"name": "hidden"}, 404, nil)
	call("DELETE", "/customers/"+person.Data.ID, f.otherOwner, nil, 404, nil)
	call("POST", "/customers", f.cashier, map[string]any{"name": "Cashier customer"}, 201, nil)
	call("PUT", "/customers/"+person.Data.ID, f.cashier, map[string]any{"name": "Points change", "points": 0}, 403, nil)
	call("DELETE", "/customers/"+person.Data.ID, f.cashier, nil, 403, nil)
	call("POST", "/customer-groups", f.cashier, map[string]any{"name": "Blocked"}, 403, nil)
	call("PUT", "/customers/"+person.Data.ID, f.cashier, map[string]any{"name": "Updated by cashier", "group_id": group.Data.ID}, 200, &person)
	if person.Data.Points != 12 {
		t.Fatal("omitted points must preserve the existing value")
	}
	call("POST", "/customers", f.owner, map[string]any{"name": "Invalid", "spent_vnd": 999}, 400, nil)
	for i, store := range []string{f.store, f.otherStore} {
		if _, err := f.admin.Exec(context.Background(), `INSERT INTO orders(tenant_id,store_id,customer_id,order_code,status,subtotal_vnd,total_vnd,idempotency_key) VALUES($1,$2,$3,$4,'paid',$5,$5,$4)`, f.tenant, store, person.Data.ID, fmt.Sprintf("fixture-%d", i), int64((i+1)*100)); err != nil {
			t.Fatal(err)
		}
	}
	call("GET", "/customers/"+person.Data.ID, f.owner, nil, 200, &person)
	if person.Data.OrderCount != 1 || person.Data.SpentVND != 100 {
		t.Fatal("customer transaction statistics must only include the session store")
	}
	var customers moduleEnvelope[modulePage[catalogRecord]]
	call("GET", "/customers?group_id="+group.Data.ID+"&page_size=1", f.owner, nil, 200, &customers)
	if customers.Data.Pagination.Total != 1 || customers.Data.Items[0].ID != person.Data.ID {
		t.Fatal("customer group filter did not select the expected customer")
	}
	call("DELETE", "/customer-groups/"+group.Data.ID, f.owner, nil, 200, nil)
	call("GET", "/customers/"+person.Data.ID, f.owner, nil, 200, &person)
	if person.Data.GroupID != nil {
		t.Fatal("deleting a group must detach customer profiles")
	}
	call("DELETE", "/product-categories/"+category.Data.ID, f.owner, nil, 200, nil)
	call("GET", "/products/"+item.Data.ID, f.owner, nil, 200, &item)
	if item.Data.CategoryID != nil {
		t.Fatal("deleting a category must detach product profiles")
	}
	call("DELETE", "/products/"+item.Data.ID, f.owner, nil, 200, nil)
	call("GET", "/products/"+item.Data.ID, f.owner, nil, 404, nil)
	call("DELETE", "/customers/"+person.Data.ID, f.owner, nil, 200, nil)
	call("GET", "/customers/"+person.Data.ID, f.owner, nil, 404, nil)

	t.Run("concurrent product codes", func(t *testing.T) {
		var wg sync.WaitGroup
		results := make(chan string, 8)
		failures := make(chan error, 8)
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func(index int) {
				defer wg.Done()
				body, _ := json.Marshal(map[string]any{"name": fmt.Sprintf("Concurrent %d", index), "product_type": "goods", "price_vnd": 1})
				request, err := http.NewRequest("POST", f.base+"/api/v1/products", bytes.NewReader(body))
				if err != nil {
					failures <- err
					return
				}
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set("Authorization", "Bearer "+f.owner)
				response, err := f.client.Do(request)
				if err != nil {
					failures <- err
					return
				}
				defer response.Body.Close()
				if response.StatusCode != 201 {
					failures <- fmt.Errorf("concurrent create returned %d", response.StatusCode)
					return
				}
				var value moduleEnvelope[catalogRecord]
				if err := json.NewDecoder(response.Body).Decode(&value); err != nil {
					failures <- err
					return
				}
				results <- value.Data.SKU
			}(i)
		}
		wg.Wait()
		close(results)
		close(failures)
		for err := range failures {
			t.Error(err)
		}
		seen := map[string]bool{}
		for sku := range results {
			if sku == "" || seen[sku] {
				t.Errorf("invalid or duplicate product code %q", sku)
			}
			seen[sku] = true
		}
		if len(seen) != 8 {
			t.Errorf("created %d unique codes; want 8", len(seen))
		}
	})
}
