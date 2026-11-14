# API Món và Khách hàng

**Cập nhật:** 10/11/2026. Đây là backend API; frontend hiện tại vẫn dùng dữ liệu prototype. Không thay đổi UI/CSS trong đợt này.

## Chạy trên PostgreSQL local

Từ thư mục root của dự án, trong terminal đã export `MIGRATIONS_DATABASE_URL` và thông tin đăng nhập admin:

```bash
make migrate-up-local
make api-run
```

Migration mới là [00002_catalog_customers.sql](../apps/api/migrations/00002_catalog_customers.sql). Không bootstrap lại tenant/owner đã có. Migration không yêu cầu extension hoặc Docker.

Nếu database đã chứa món `prepared` có giá vốn nhập tay hoặc `tracks_stock=true`, migration sẽ từ chối thay vì tự sửa dữ liệu. Cần rà soát những bản ghi đó trước; không rollback database đang dùng để giải quyết lỗi này.

## Authentication và phân quyền

Tất cả endpoints bên dưới có prefix `/api/v1`, cần `Authorization: Bearer <access_token>`. Tenant và chi nhánh lấy từ phiên đăng nhập; không nhận `tenant_id`, `store_id` trong JSON tạo/sửa.

| Tài nguyên | Đọc | Tạo/sửa | Xóa |
|---|---|---|---|
| products, product-categories | owner, manager, cashier, kitchen | owner, manager | owner, manager |
| customers | owner, manager, cashier | owner, manager, cashier | owner, manager |
| customer-groups | owner, manager, cashier | owner, manager | owner, manager |

Cashier không được gửi `points` khi tạo/sửa khách. Khi bỏ qua trường này, tạo mới có 0 điểm; cập nhật giữ nguyên số điểm hiện có. Owner/manager có thể điều chỉnh điểm.

## Endpoints

Mỗi tài nguyên `products`, `product-categories`, `customers`, `customer-groups` hỗ trợ:

| Method | Path | Ý nghĩa |
|---|---|---|
| GET | `/<resource>` | Danh sách |
| GET | `/<resource>/:id` | Chi tiết UUID |
| POST | `/<resource>` | Tạo, trả 201 |
| PUT | `/<resource>/:id` | Cập nhật, trả 200 |
| DELETE | `/<resource>/:id` | Soft delete, trả `{"data":{"deleted":true}}` |

GET/POST/PUT trả envelope `{"data":...}`. Lỗi trả `{"error":{"code":"...","message":"..."}}`: 400 JSON/filter/UUID sai, 401 chưa xác thực, 403 thiếu quyền, 404 không tồn tại hoặc thuộc tenant khác, 409 trùng tên/mã duy nhất, 422 dữ liệu không hợp lệ, 500 lỗi nội bộ.

### Danh sách và tìm kiếm

`products` và `customers` trả:

```json
{
  "data": {
    "items": [],
    "pagination": {"page": 1, "page_size": 20, "total": 0, "total_pages": 0}
  }
}
```

- Chung: `search` tối đa 200 ký tự, `page` mặc định 1, `page_size` mặc định 20/tối đa 100, `direction=asc|desc`.
- Tìm kiếm không phân biệt hoa thường; `%`, `_` được hiểu là ký tự thường, không phải wildcard. Gửi query bằng URLSearchParams hoặc URL encoder.
- Products: tìm tên/mã; lọc `category_id`, `product_type=goods|prepared`, `tracks_stock=true|false`, `availability=available|unavailable`; sort `name|sku|price_vnd|created_at`. Bỏ `tracks_stock` sẽ không lọc trường này. Quản lý hàng hóa dùng `product_type=goods&tracks_stock=true`; đây là cờ quản lý kho, không phải số tồn.
- Customers: tìm tên/điện thoại/email; lọc `group_id`; sort `name|points|created_at`.
- `product-categories` và `customer-groups` trả mảng trong `data`, chưa phân trang. Danh sách nhóm khách có thêm `members` tính từ khách chưa xóa.

## Payload món

```json
{
  "name": "Bia lon",
  "category_id": null,
  "product_type": "goods",
  "menu_type": "drink",
  "base_unit": "Lon",
  "price_vnd": 35000,
  "cost_vnd": 16000,
  "tracks_stock": true,
  "is_visible": true,
  "is_extra": false,
  "earns_points": true,
  "availability": "available",
  "image_url": null,
  "attributes": [{"name": "Size", "value": "L", "price_delta_vnd": 5000}],
  "units": [{"name": "Thùng", "ratio": "24", "price_vnd": 720000, "cost_vnd": 384000}]
}
```

- `name`, `product_type`, `price_vnd` bắt buộc. Các trường mặc định: `base_unit="Cái"`, `menu_type="other"`, `availability="available"`, visible/earns_points=true, is_extra=false. Tracks_stock mặc định true cho goods, false cho prepared.
- Mã SKU do server cấp M00001… riêng từng tenant, không nhận/sửa SKU từ request. Transaction counter bảo đảm không trùng khi tạo đồng thời; mã tiếp tục tăng sau xóa.
- Tiền VND dùng số nguyên, từ 0 đến 9007199254740991. Không chấp nhận số thập phân. `price_delta_vnd` có thể âm nhưng không làm giá món âm.
- `prepared` không nhận giá vốn nhập tay và không theo dõi tồn món; không cho giá vốn riêng trên đơn vị quy đổi. Chưa triển khai BOM/giá vốn tính từ nguyên liệu.
- Tối đa 50 cặp thuộc tính và 50 đơn vị. Tên/giá trị thuộc tính không được trùng; tên đơn vị không trùng nhau hoặc đơn vị cơ bản.
- `ratio` là chuỗi decimal dương, tối đa 9 chữ số phần nguyên và 3 số lẻ. Không dùng float cho tỷ lệ quy đổi. Đây là đơn vị con của món, có giá bán/giá vốn riêng, không tự tạo SKU độc lập.
- PUT thay thế toàn bộ dữ liệu món và hai mảng con trong một transaction. Bỏ mảng tương đương mảng rỗng; ID phần tử con có thể thay đổi. Chưa có optimistic concurrency/versioning.
- `image_url` nhận HTTP(S) hoặc đường dẫn asset tuyệt đối, không nhận base64/data URL. Chưa triển khai nén/upload object storage; giao diện upload cũ chưa nối API.
- Response món có `category_name`, `attributes`, `units` cùng các trường lưu trữ như `id`, `sku`, timestamp. Không có số tồn giả; stock ledger thuộc giai đoạn sau.

Nhóm hàng nhận `{"name":"Đồ uống"}`. Xóa nhóm gỡ category_id khỏi các món trong cùng transaction, không xóa món. Tên nhóm đã soft delete vẫn được unique constraint giữ lại.

## Payload khách hàng và nhóm

```json
{
  "name": "Anh Nam",
  "phone": "0900123456",
  "email": null,
  "note": null,
  "group_id": null,
  "points": 0
}
```

Chỉ tên bắt buộc. Các trường liên hệ/ghi chú/nhóm bỏ qua hoặc null sẽ được xóa khi PUT. Nhóm phải còn hoạt động và thuộc cùng tenant. POST/PUT trả hồ sơ đã lưu; GET chi tiết/danh sách có thêm tên nhóm, `order_count`, `spent_vnd`.

`order_count` và `spent_vnd` được tính SQL từ đơn chưa xóa có trạng thái `paid`, chỉ trong chi nhánh của phiên hiện tại; hồ sơ khách dùng chung trong tenant. Không nhận tổng mua hoặc số đơn do client nhập. Chưa có checkout API tạo các đơn này.

Nhóm khách nhận:

```json
{"name":"Thành viên","condition":"Theo chính sách cửa hàng","benefit":"Ưu đãi thành viên","is_active":true}
```

`condition` và `benefit` là mô tả, chưa phải rule engine. Xóa nhóm gỡ group_id khỏi khách trong transaction; không xóa khách. Tên nhóm đã soft delete vẫn được giữ bởi unique constraint.

## Kiểm tra

Từ [apps/api](../apps/api), với hai URL test admin/runtime và password override như README:

```bash
go test -v ./tests -run '^TestCatalogCustomersAPI$' -count=1
go test -v ./internal/database -count=1
go test ./...
go vet ./...
go build ./...
```

Test catalog tự tạo database ngẫu nhiên, áp dụng migration, seed hai tenant/nhiều role, chạy HTTP server test và dọn database vừa tạo. Admin cần CREATEDB và quyền migrate/grant. Role runtime phải là `fnb_app`, không superuser/BYPASSRLS. Test RLS riêng yêu cầu database chỉ định đã migrate; chỉ tạo/xóa fixture tenant của chính test.

Agent đã chạy thành công unit tests, catalog/customer integration, RLS, migration round-trip và `go test -race ./... -count=1` trên PostgreSQL **18.3 native tạm** qua Unix socket. Auth lifecycle chạy với tài khoản thật đã được người dùng xác nhận trước đó; lần chạy tự động này test đó skip vì không có credentials. Workflow [API CI](../.github/workflows/api.yml) cấu hình PostgreSQL **16**, nhưng chưa được chạy trên GitHub.

## Việc tiếp theo

1. Áp dụng migration 2 trên database local đang dùng và khởi động lại API.
2. Chạy workflow CI sau khi người dùng chủ động commit/push; xác minh PostgreSQL 16 (race detector đã PASS local).
3. Tạo visual baseline 7 routes × desktop/mobile trước mọi thay đổi frontend; sau đó repository adapters/auth/query hooks và nối từng module, giữ DOM/class/CSS hiện có.
4. Upload ảnh, rooms API, stock ledger, POS/payment/idempotency là các phần chưa triển khai; không coi frontend đã chuyển sang API.
