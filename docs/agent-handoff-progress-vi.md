# Báo cáo tiến độ và bàn giao cho agent tiếp theo

> **Cập nhật Dashboard/Báo cáo 13/11:** đã nối read model theo cửa hàng; xem [tiến độ báo cáo](./reports-api-progress-vi.md) và các giới hạn trước khi tiếp tục.

> **Cập nhật Sổ quỹ:** đã nối khoản thu POS và phiếu thu/chi nhập tay với database. Cần migration 4; xem [tiến độ Sổ quỹ](./cashbook-progress-vi.md).

> **Cập nhật công nợ:** đã nối dòng nợ trước đó và luồng thu thêm tiền trong POS. Xem [tiến độ công nợ](./customer-debt-progress-vi.md).

> **Cập nhật Hóa đơn:** `/management/invoices` đã nối dữ liệu POS thật. Xem [tiến độ Hóa đơn](./invoices-api-progress-vi.md); các mục bên dưới ghi lại giai đoạn trước.

> **Cập nhật mới nhất:** Phòng/Bàn và POS tiền mặt đã nối API. Xem [tiến độ POS](./rooms-pos-progress-vi.md) trước khi đọc các mục lịch sử bên dưới; những ghi chú “POS chưa triển khai” chỉ phản ánh giai đoạn trước.

**Cập nhật:** 10/11/2026

**Phạm vi hiện tại:** Backend foundation, database và API Món/Khách hàng cho FNB SaaS.
**Lưu ý quan trọng:** Giao diện hiện tại đang được đóng băng. Không sửa UI, CSS, nội dung tiếng Việt hoặc cấu trúc render nếu chưa có yêu cầu mới.

## Tóm tắt tiến độ

**Cập nhật frontend:** Người dùng đã duyệt ngoại lệ UI giới hạn. Đã nối login/auth guard, Món, tạo nhóm hàng trong dropdown, Khách hàng và Nhóm khách với API; bật bằng VITE_USE_MOCK=false. 19 unit tests, typecheck/build, 14 visual tests (0 pixel diff) và 4 E2E browser → API → PostgreSQL native tạm 18.3 PASS. CSS cũ giữ nguyên, chỉ thêm auth selectors. Các trang khác/POS vẫn demo và có thông báo; không coi POS đã tích hợp. Xem [frontend-api-progress-vi.md](./frontend-api-progress-vi.md) để chạy và bàn giao.

Đã thêm nền tảng API Go theo hướng modular monolith, migration PostgreSQL, authentication, tenant isolation bằng RLS, API CRUD Món/Nhóm hàng/Khách hàng/Nhóm khách và workflow CI backend. Frontend hiện có không bị chỉnh sửa, vẫn dùng dữ liệu prototype. PostgreSQL native là quy trình local chính; Docker Compose chỉ tùy chọn.

Báo cáo chi tiết về phần đã triển khai có tại [backend-foundation-report.md](./backend-foundation-report.md). Hướng dẫn cài đặt và chạy API có tại [apps/api/README.md](../apps/api/README.md).

## Đã triển khai

- API sử dụng Go 1.22 module, Gin, pgx, goose, zerolog, JWT và bcrypt.
- Endpoints nền tảng: health, readiness, metrics, login, refresh, logout, thông tin phiên đăng nhập và ví dụ kiểm tra role.
- JWT mang tenant/store/membership context; middleware xác thực session còn hiệu lực và kiểm tra role ở route mẫu.
- Password được hash bằng bcrypt; refresh token lưu dưới dạng SHA-256 hash.
- Migration nền tảng gồm tenant, store, user, membership, role/permission, catalog, customer, order/order item, payment method và payment.
- Tenant tables sử dụng forced RLS theo `app.tenant_id`; runtime role `fnb_app` được tạo không có quyền `BYPASSRLS`.
- Docker Compose khởi động PostgreSQL, chạy migration trước API và có lệnh bootstrap tài khoản owner đầu tiên.
- Test tích hợp đã kiểm tra tenant A không đọc/ghi dữ liệu tenant B.
- Đã thêm ADR và hướng dẫn local development.
- Migration 2 thêm thuộc tính menu, đơn vị quy đổi có giá vốn riêng, nhóm khách và counter mã món theo tenant.
- API CRUD Món/Nhóm hàng/Khách hàng/Nhóm khách: tìm kiếm, lọc, sort, phân trang cho món/khách, validation, soft delete và role gates.
- Dữ liệu tiền dùng integer VND; tỷ lệ quy đổi dùng decimal string; món chế biến không nhập giá vốn thủ công/không quản lý tồn món.
- Tổng mua và số đơn khách tính SQL từ đơn `paid` tại chi nhánh của phiên; không nhận tổng do frontend nhập.
- Có workflow backend build/vet/tests/race/SQLC với PostgreSQL 16; chưa có lần chạy GitHub thực tế.

## Trạng thái xác minh

**Cập nhật từ người dùng:** Foundation migration 1 trên database `fnb_saas`, bootstrap owner, readiness, đăng nhập, RLS, authentication lifecycle và migration round-trip đã được xác nhận thành công trước đợt triển khai này.

**Agent trực tiếp xác minh đợt này:** SQLC v1.29.0 generation, Go unit tests/build/vet; integration HTTP CRUD/RBAC/tenant isolation/store metrics/concurrent SKU; migration 1+2 up → down → up; RLS runtime role; `go test -race ./... -count=1` PASS. Các test DB chạy trên PostgreSQL **18.3 native tạm**, qua Unix socket, tự dọn cluster sau chạy và không đụng database `fnb_saas`. Không dùng/mặc định mật khẩu người dùng. Test auth lifecycle qua API ngoài skip trong lần chạy này vì không có credentials; vẫn giữ kết quả người dùng đã xác nhận trước đó. PostgreSQL **16** và workflow GitHub chưa được xác minh.

Test vòng đời authentication nằm tại [apps/api/tests/auth_integration_test.go](../apps/api/tests/auth_integration_test.go), mặc định dùng `http://localhost:8080`. Test rollback nằm tại [apps/api/internal/database/migration_test.go](../apps/api/internal/database/migration_test.go), kiểm tra up → down → up trên database tạm. Cả hai đã được người dùng xác nhận PASS. Phần Down đã sửa để gỡ policy trên `users` trước khi xóa bảng `memberships` mà policy tham chiếu.

## Việc agent tiếp theo cần làm

### P0 — Tiếp tục từ foundation đã kiểm tra local

1. Kiểm tra `git status` trước khi sửa để phân biệt thay đổi đã có và thay đổi của mình. Không commit hoặc push tự động.
2. Áp dụng migration 2 trên database local đã dùng, sau đó restart API. Không bootstrap lại. Nếu có prepared product chứa cost/tracks_stock không hợp lệ, migration từ chối; rà soát dữ liệu trước khi xử lý, không tự sửa/xóa dữ liệu.
3. Không bootstrap lại tenant hiện có; migration, owner và RLS đã được người dùng xác nhận. Khi cần chạy lại backend, dùng cấu hình local theo README.
4. Không rollback database cửa hàng đang dùng. Test round-trip chỉ thao tác trên database ngẫu nhiên do chính test tạo.
5. Khi thay đổi schema/RLS, cấu hình lại biến test DB và chạy tenant isolation test bằng runtime role `fnb_app`.
6. Đọc [API contract](./catalog-customers-api.md) và [ADR-002](./ADR-002-catalog-customers.md) trước khi viết frontend adapter. Không gửi tenant_id/store_id/SKU; không gửi base64 vào image_url.
7. Sau khi người dùng chủ động commit/push, kiểm tra workflow CI PostgreSQL 16. Không báo CI xanh khi chưa chạy. Visual baseline 7 routes × desktop/mobile đã có; mọi refactor tiếp theo phải giữ so sánh PASS.

### P1 — Hoàn thiện SQLC và data access

1. Tiếp tục dùng code sinh từ SQLC trong repository/query layer; hiện các truy vấn session/refresh còn dùng pgx trực tiếp.
2. Đưa truy vấn tenant-owned qua transaction có `SET LOCAL app.tenant_id`; tránh query trực tiếp từ pool cho bảng tenant-owned.
3. Mở rộng test phân quyền bằng nhiều role khi có fixtures phù hợp. Money/idempotency tests sẽ đi cùng nghiệp vụ tương ứng.

### P2 — Tiếp tục nghiệp vụ theo phạm vi được duyệt

- Chưa triển khai đầy đủ POS, checkout, payment provider, inventory hoặc upload ảnh. API sản phẩm/khách hàng và frontend HTTP integration cho Món/Khách/Nhóm khách đã có.
- Trước khi làm order/payment, thiết kế transaction, idempotency và lưu `order_items` dạng record chuẩn hóa; không lưu danh sách món thành chuỗi hiển thị.
- Tiếp theo tạo visual baseline rồi nối frontend từng module theo kế hoạch đã duyệt, giữ nguyên UI/CSS; không thay toàn bộ localStorage khi chưa có adapter/mock mode và kiểm tra hồi quy.
- Những phần nghiệp vụ cần đổi UI phải được nêu đề xuất và chờ người dùng duyệt trước.

## File quan trọng để bắt đầu

- API entry point: [apps/api/cmd/api/main.go](../apps/api/cmd/api/main.go)
- Authentication/middleware: [apps/api/internal/modules/auth/auth.go](../apps/api/internal/modules/auth/auth.go)
- Tenant transaction helper: [apps/api/internal/database/pool.go](../apps/api/internal/database/pool.go)
- PostgreSQL migration: [apps/api/migrations/00001_foundation.sql](../apps/api/migrations/00001_foundation.sql)
- Catalog/customer migration: [00002_catalog_customers.sql](../apps/api/migrations/00002_catalog_customers.sql)
- Domain modules: [product](../apps/api/internal/modules/product), [customer](../apps/api/internal/modules/customer)
- HTTP integration test: [catalog_integration_test.go](../apps/api/tests/catalog_integration_test.go)
- API contract: [catalog-customers-api.md](./catalog-customers-api.md)
- Backend CI: [api.yml](../.github/workflows/api.yml)
- Tenant isolation test: [apps/api/internal/database/tenant_isolation_test.go](../apps/api/internal/database/tenant_isolation_test.go)
- SQLC config và queries: [apps/api/sqlc.yaml](../apps/api/sqlc.yaml), [apps/api/sql/auth.sql](../apps/api/sql/auth.sql)
- Docker image/Compose: [apps/api/Dockerfile](../apps/api/Dockerfile), [deploy/docker-compose.yml](../deploy/docker-compose.yml)
- Biến môi trường mẫu: [deploy/.env.example](../deploy/.env.example)
- Các lệnh dev: [Makefile](../Makefile)

## Tiêu chí hoàn tất cho giai đoạn này

- `gofmt`, `go test ./...`, `go build ./...` đều chạy thành công.
- SQLC generation thành công và các truy vấn thuộc module được chuyển dần sang code sinh.
- PostgreSQL local, migration, bootstrap và API chạy được theo hướng dẫn; không yêu cầu Docker.
- Tenant isolation integration test chứng minh tenant A không thể đọc/ghi tenant B.
- Không thay đổi UI/CSS và không đưa secret vào Git.
- Báo cáo build/test phản ánh đúng những gì đã chạy; chưa commit/push nếu người dùng chưa yêu cầu.
