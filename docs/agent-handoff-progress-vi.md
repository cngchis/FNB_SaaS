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

Go 1.27.3 đã được nhận diện. `gofmt`, `go test ./...` và `go build ./...` đã chạy thành công sau khi tải dependency; test RLS bị skip vì chưa có test database URL. SQLC v1.29.0 đã sinh code và các query tra tenant, đăng nhập, store thành viên đã dùng code sinh. PostgreSQL local đang lắng nghe tại `localhost:5432`, nhưng môi trường agent chưa có thông tin đăng nhập dùng được (`cngchis` không phải role DB; đăng nhập peer bằng `postgres` bị từ chối). Theo yêu cầu người dùng, không cần dùng Docker cho quy trình này; Compose chỉ là tùy chọn.

## Việc agent tiếp theo cần làm

### P0 — Xác minh và sửa nền tảng hiện có

1. Kiểm tra `git status` trước khi sửa để phân biệt thay đổi đã có và thay đổi của mình. Không commit hoặc push tự động.
2. Kết nối PostgreSQL qua thông tin trong pgAdmin; tạo/chọn database và role `fnb_app` trước khi chạy migration. Các hướng dẫn local đã được thêm vào README.
3. Export `DATABASE_URL`, `MIGRATIONS_DATABASE_URL`, `JWT_SECRET`, `WEB_ORIGIN` và biến `BOOTSTRAP_*`; chạy `make migrate-up-local`, `make bootstrap-local`, rồi kiểm tra API bằng `make api-run`.
4. Chạy migration up/down trên database dev/test; xác nhận composite foreign keys, RLS policy, grants và bootstrap.
5. Cấu hình `TEST_DATABASE_ADMIN_URL` và `TEST_DATABASE_URL`, sau đó chạy lại `go test ./...` để thực thi thay vì skip test tenant isolation.
6. Rà soát SQLC query generation và mở rộng việc dùng query code sinh cho session/refresh và các repository nghiệp vụ.
7. Rà soát các phát hiện trong API/schema; cập nhật tài liệu phản ánh kết quả thực sự.

### P1 — Hoàn thiện SQLC và data access

1. Tiếp tục dùng code sinh từ SQLC trong repository/query layer; hiện các truy vấn session/refresh còn dùng pgx trực tiếp.
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
- SQLC generation thành công và các truy vấn thuộc module được chuyển dần sang code sinh.
- PostgreSQL local, migration, bootstrap và API chạy được theo hướng dẫn; không yêu cầu Docker.
- Tenant isolation integration test chứng minh tenant A không thể đọc/ghi tenant B.
- Không thay đổi UI/CSS và không đưa secret vào Git.
- Báo cáo build/test phản ánh đúng những gì đã chạy; chưa commit/push nếu người dùng chưa yêu cầu.
