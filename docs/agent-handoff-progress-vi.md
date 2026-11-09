# Báo cáo tiến độ và bàn giao cho agent tiếp theo

**Cập nhật:** 10/11/2026

**Phạm vi hiện tại:** Backend foundation và database cho FNB SaaS.
**Lưu ý quan trọng:** Giao diện hiện tại đang được đóng băng. Không sửa UI, CSS, nội dung tiếng Việt hoặc cấu trúc render nếu chưa có yêu cầu mới.

## Tóm tắt tiến độ

Đã thêm nền tảng API Go theo hướng modular monolith, migration PostgreSQL, authentication cơ bản, tenant isolation bằng RLS, Docker Compose và tài liệu vận hành. Các file mới nằm trong repository `FNB_SaaS`; frontend hiện có không bị chỉnh sửa.

Báo cáo chi tiết về phần đã triển khai có tại [backend-foundation-report.md](./backend-foundation-report.md). Hướng dẫn cài đặt và chạy API có tại [apps/api/README.md](../apps/api/README.md).

## Đã triển khai

- API sử dụng Go 1.22 module, Gin, pgx, goose, zerolog, JWT và bcrypt.
- Endpoints nền tảng: health, readiness, metrics, login, refresh, logout, thông tin phiên đăng nhập và ví dụ kiểm tra role.
- JWT mang tenant/store/membership context; middleware xác thực session còn hiệu lực và kiểm tra role ở route mẫu.
- Password được hash bằng bcrypt; refresh token lưu dưới dạng SHA-256 hash.
- Migration nền tảng gồm tenant, store, user, membership, role/permission, catalog, customer, order/order item, payment method và payment.
- Tenant tables sử dụng forced RLS theo `app.tenant_id`; runtime role `fnb_app` được tạo không có quyền `BYPASSRLS`.
- Docker Compose khởi động PostgreSQL, chạy migration trước API và có lệnh bootstrap tài khoản owner đầu tiên.
- Đã có test tích hợp dự kiến kiểm tra tenant A không đọc/ghi dữ liệu tenant B.
- Đã thêm ADR và hướng dẫn local development.

## Trạng thái xác minh

Các lệnh build, Go tests, SQLC, Compose và PostgreSQL integration test **chưa chạy được** trong môi trường làm việc trước đó do thiếu `go`, `gofmt`, `sqlc`, Docker và Docker Compose. Không coi migration hoặc backend đã chạy thành công trước khi xác minh lại bằng toolchain thực tế.

## Việc agent tiếp theo cần làm

### P0 — Xác minh và sửa nền tảng hiện có

1. Kiểm tra `git status` trước khi sửa để phân biệt thay đổi đã có và thay đổi của mình. Không commit hoặc push tự động.
2. Cài/chuẩn bị Go 1.22+, Docker Compose v2 và sqlc nếu môi trường cho phép; không thay đổi framework hoặc kiến trúc.
3. Chạy `gofmt` trên toàn bộ Go source, sau đó `go test ./...` và `go build ./...` trong `apps/api`.
4. Tạo `deploy/.env` từ template, điền secret local an toàn, chạy `docker compose config` và kiểm tra stack khởi động.
5. Kiểm tra migration up/down trên database dùng riêng cho dev/test; xác nhận cú pháp composite foreign keys, RLS policy, grant và bootstrap.
6. Chạy test tenant isolation bằng cả admin URL và runtime URL. Xác nhận runtime role không thể đọc hoặc ghi tenant khác.
7. Chạy SQLC generation. Sửa schema/query/config nếu generator không chấp nhận migration hiện tại. Xác định cách sinh và quản lý `go.sum`.
8. Rà soát lỗi phát hiện được trong Compose, API hoặc schema; cập nhật tài liệu và trạng thái xác minh sau khi đã chạy thật.

### P1 — Hoàn thiện SQLC và data access

1. Dùng code sinh từ SQLC trong repository/query layer thay vì để SQLC chỉ ở dạng cấu hình và query source.
2. Đưa truy vấn tenant-owned qua transaction có `SET LOCAL app.tenant_id`; tránh query trực tiếp từ pool cho bảng tenant-owned.
3. Thêm test cho login/refresh/logout, authorization role, xử lý money bằng integer VND và tenant isolation nếu toolchain chạy được.

### P2 — Tiếp tục nghiệp vụ theo phạm vi được duyệt

- Chưa triển khai đầy đủ POS, checkout, payment provider, inventory hoặc API nghiệp vụ sản phẩm/khách hàng.
- Trước khi làm order/payment, thiết kế transaction, idempotency và lưu `order_items` dạng record chuẩn hóa; không lưu danh sách món thành chuỗi hiển thị.
- Chỉ nối frontend sau khi có yêu cầu rõ ràng và phải giữ nguyên UI/CSS hiện tại theo quy tắc UI freeze.
- Những phần nghiệp vụ cần đổi UI phải được nêu đề xuất và chờ người dùng duyệt trước.

## File quan trọng để bắt đầu

- API entry point: [apps/api/cmd/api/main.go](../apps/api/cmd/api/main.go)
- Authentication/middleware: [apps/api/internal/modules/auth/auth.go](../apps/api/internal/modules/auth/auth.go)
- Tenant transaction helper: [apps/api/internal/database/pool.go](../apps/api/internal/database/pool.go)
- PostgreSQL migration: [apps/api/migrations/00001_foundation.sql](../apps/api/migrations/00001_foundation.sql)
- Tenant isolation test: [apps/api/internal/database/tenant_isolation_test.go](../apps/api/internal/database/tenant_isolation_test.go)
- SQLC config và queries: [apps/api/sqlc.yaml](../apps/api/sqlc.yaml), [apps/api/sql/auth.sql](../apps/api/sql/auth.sql)
- Docker image/Compose: [apps/api/Dockerfile](../apps/api/Dockerfile), [deploy/docker-compose.yml](../deploy/docker-compose.yml)
- Biến môi trường mẫu: [deploy/.env.example](../deploy/.env.example)
- Các lệnh dev: [Makefile](../Makefile)

## Tiêu chí hoàn tất cho giai đoạn này

- `gofmt`, `go test ./...`, `go build ./...` đều chạy thành công.
- SQLC generation thành công và code sinh được tích hợp hoặc có quyết định rõ ràng được ghi lại.
- Docker Compose config hợp lệ; PostgreSQL, migration, bootstrap và API chạy được theo hướng dẫn.
- Tenant isolation integration test chứng minh tenant A không thể đọc/ghi tenant B.
- Không thay đổi UI/CSS và không đưa secret vào Git.
- Báo cáo build/test phản ánh đúng những gì đã chạy; chưa commit/push nếu người dùng chưa yêu cầu.
