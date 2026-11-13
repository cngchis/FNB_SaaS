# Tiến độ đơn vị tính và hiển thị thực đơn

Ngày: 14/11/2026.

## Đã làm

- Form tạo/sửa Món và popup sửa hàng hóa có checkbox hiển thị thực đơn riêng cho mỗi đơn vị quy đổi.
- Đơn vị cơ bản vẫn dùng checkbox hiển thị hiện có của sản phẩm. Có thể bật Lon/tắt Thùng, hoặc ngược lại.
- Chi tiết Quản lý hàng hóa có dropdown cạnh tên; đổi đơn vị cập nhật giá bán, giá vốn, quy đổi, trạng thái hiển thị và tồn từ cùng một lượng cơ bản. Không tạo hai kho độc lập.
- POS mock/API lọc từng đơn vị, vẫn hiện sản phẩm nếu đơn vị cơ bản bị ẩn nhưng có đơn vị con được bán. Đơn vị ẩn không được chọn kể cả gọi API trực tiếp.
- Backend bảo vệ cả việc tăng số lượng dòng cũ sau khi ẩn đơn vị. Các dòng đã ghi nhận vẫn xem/thu tiền được và giữ giá lịch sử.
- Giá bán 0 của đơn vị được giữ đúng. Không thêm dependency, không đổi route, không sửa selector CSS cũ hoặc baseline.

Xem [ADR-009](./ADR-009-unit-menu-visibility.md) để biết đầy đủ ý nghĩa và giới hạn. Các unit là biến thể của một product, chưa phải SKU riêng.

## Giới hạn

Quản lý hàng hóa/Kiểm kho vẫn demo; dữ liệu này không tự trở thành dữ liệu API. Ledger API vẫn chỉ nhập theo đơn vị cơ bản. Chưa có tự trừ kho từ POS, nhập theo thùng, snapshot tỷ lệ chứng từ, BOM hoặc stocktake API. Không tuyên bố đã hoàn tất tồn kho thật.

## Áp dụng local

Chưa áp dụng migration trên database thật của bạn. Dừng API, chạy từ root dự án (đổi `dbname` nếu API dùng database khác):

```bash
cd /home/cngchis/Workspaces/SaaS_Management/FNB_SaaS
export PATH="$(go env GOPATH)/bin:$PATH"
export MIGRATIONS_DATABASE_URL='host=localhost port=5432 user=postgres dbname=fnb_saas sslmode=disable'
read -rsp 'Mật khẩu postgres: ' PGPASSWORD
echo
export PGPASSWORD
make migrate-up-local
unset PGPASSWORD
make api-run
```

Cần lên version **6**, sau đó tải lại web/đăng nhập lại. Không bootstrap lại hoặc reset database.

## Kiểm chứng

- `make sqlc`: đã chạy, tạo lại model/query.
- Go vet/build: PASS.
- Frontend typecheck/build: PASS; còn cảnh báo bundle khoảng 676 kB.
- Vitest: 48 test / 13 file PASS.
- Playwright mock/visual: 30 PASS (12 E2E + 18 baseline không thay đổi). Đã mở ảnh dropdown và checkbox mobile để kiểm tra bằng mắt.
- `RUN_API_TESTS=true bash scripts/test-web-api-local.sh`: Go race toàn bộ PASS; 27 E2E API PASS, 1 test nhập hàng mobile cũ bỏ qua có `fixme` chờ duyệt UI FREEZE. Không tính test bỏ qua là PASS.
- Migration 6 up/down/up trên PostgreSQL native 18.3 fixture riêng PASS. Test backend kiểm tra backfill dữ liệu ẩn từ version 5 lên 6, tenant isolation cho đơn vị, ẩn đơn vị chặn thêm/tăng số lượng, giữ snapshot/thanh toán đơn cũ, và giá đơn vị 0. Chưa chạy PostgreSQL 16 hoặc GitHub Actions thực tế.
- `git diff --check`: PASS.

Không tự commit/push. Commit gợi ý: `feat(products): add per-unit menu visibility and inventory unit selector`.
