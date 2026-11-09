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

**Cập nhật từ người dùng:** Migration trên database mới `fnb_saas`, bootstrap owner, kết nối API, đăng nhập, test RLS và test authentication lifecycle đều đã được người dùng xác nhận thành công. Test RLS kiểm tra đọc/ghi của cả hai tenant và không coi lỗi kết nối là bằng chứng chặn ghi chéo tenant.

Go 1.27.3 đã được nhận diện. `gofmt`, `go test ./...` và `go build ./...` đã được agent chạy thành công trước đó; các integration test cần credentials sẽ skip trong môi trường agent. SQLC v1.29.0 đã sinh code và các query tra tenant, đăng nhập, store thành viên đã dùng code sinh. Người dùng chạy PostgreSQL local và tự nhập credentials trong terminal; không lưu mật khẩu trong tài liệu/Git. Không cần Docker cho quy trình này; Compose chỉ là tùy chọn.

Test vòng đời authentication nằm tại [apps/api/tests/auth_integration_test.go](../apps/api/tests/auth_integration_test.go), mặc định dùng `http://localhost:8080`. Người dùng xác nhận PASS. Test rollback mới nằm tại [apps/api/internal/database/migration_test.go](../apps/api/internal/database/migration_test.go); đã biên dịch nhưng chờ chạy live với quyền tạo database. Phần Down đã sửa để gỡ policy trên `users` trước khi xóa bảng `memberships` mà policy tham chiếu.

## Việc agent tiếp theo cần làm

### P0 — Xác minh và sửa nền tảng hiện có

1. Kiểm tra `git status` trước khi sửa để phân biệt thay đổi đã có và thay đổi của mình. Không commit hoặc push tự động.
2. Chạy `TestMigrationRoundTrip` với `TEST_DATABASE_ADMIN_URL` và `TEST_DATABASE_ADMIN_PASSWORD`; test tự tạo/xóa database tạm để kiểm tra up → down → up.
3. Không bootstrap lại tenant hiện có; migration, owner và RLS đã được người dùng xác nhận. Khi cần chạy lại backend, dùng cấu hình local theo README.
4. Không rollback database cửa hàng đang dùng. Test round-trip chỉ thao tác trên database ngẫu nhiên do chính test tạo.
5. Khi thay đổi schema/RLS, cấu hình lại biến test DB và chạy tenant isolation test bằng runtime role `fnb_app`.
6. Rà soát SQLC query generation và mở rộng việc dùng query code sinh cho session/refresh và các repository nghiệp vụ.
7. Rà soát các phát hiện trong API/schema; cập nhật tài liệu phản ánh kết quả thực sự.

### P1 — Hoàn thiện SQLC và data access

1. Tiếp tục dùng code sinh từ SQLC trong repository/query layer; hiện các truy vấn session/refresh còn dùng pgx trực tiếp.
2. Đưa truy vấn tenant-owned qua transaction có `SET LOCAL app.tenant_id`; tránh query trực tiếp từ pool cho bảng tenant-owned.
3. Mở rộng test phân quyền bằng nhiều role khi có fixtures phù hợp. Money/idempotency tests sẽ đi cùng nghiệp vụ tương ứng.

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
