# Tiến độ nhập hàng theo đơn vị quy đổi

Ngày: 14/11/2026.

## Đã triển khai

- Chọn đơn vị cơ bản hoặc đơn vị quy đổi ngay trên dòng phiếu nhập, kể cả đơn vị không hiển thị trên thực đơn.
- Giá nhập tính theo đơn vị đang chọn và có thể sửa riêng trên phiếu; chọn đơn vị sẽ lấy giá vốn mặc định tương ứng nếu có.
- Hiển thị tỷ lệ và số lượng quy đổi. Ví dụ 2 Thùng × 24 Lon = cộng 48 Lon vào số dư chung khi xác nhận nhập kho.
- Phiếu lưu snapshot tên hàng, mã hàng, đơn vị cơ bản, tỷ lệ, giá nhập và số lượng. Mở lại/sửa số lượng không tự lấy tỷ lệ hoặc giá mới từ danh mục. Chọn lại đơn vị là thao tác chủ động lấy thông tin hiện tại.
- Ghi phiếu, biến động kho, số dư và khóa chống trùng trong một transaction. Retry sau mất phản hồi không tạo thêm phiếu hoặc cộng kho lần hai.
- Giữ tenant/store scope, quyền owner/manager và quy tắc không sửa phiếu đã nhập kho.
- Mock mode có cùng lựa chọn đơn vị và dữ liệu chi tiết cục bộ; không ghi số dư PostgreSQL.
- Không sửa CSS, route, dependency; không tự commit/push. Database thật của người dùng chưa được agent cập nhật.

## Cần làm trên máy người dùng

Dừng API cũ bằng Ctrl+C, rồi chạy từ root dự án:

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

Cần migration **8**, đúng database API đang dùng. Dùng Goose qua lệnh trên; không dán toàn bộ SQL vào pgAdmin vì file chứa cả Up và Down. Không bootstrap hoặc reset dữ liệu.

Terminal web:

```bash
cd /home/cngchis/Workspaces/SaaS_Management/FNB_SaaS
VITE_USE_MOCK=false npm run dev
```

Thử trên desktop: chọn Bia → Thùng → số lượng 2 → giá nhập theo Thùng → lưu nháp/mở lại → xác nhận nhập kho. Với hàng cũ chưa xác nhận tồn đầu kỳ, vẫn phải kiểm kho theo [quy trình migration 7](./stock-ledger-stocktake-progress-vi.md).

## Giới hạn

- Một sản phẩm chỉ có một dòng trong một phiếu; chưa nhập đồng thời Lon và Thùng thành hai dòng cùng sản phẩm.
- Số lượng đơn vị được nhập là số nguyên; tỷ lệ quy đổi có thể thập phân, số dư cơ bản giữ tối đa 6 chữ số thập phân.
- Chưa có BOM, FIFO/bình quân, tự cập nhật giá vốn danh mục hoặc thanh toán nhà cung cấp.
- Nếu giá Thùng chia tỷ lệ không ra số nguyên VND/Lon, giá vốn cơ bản trên biến động kho để null; không làm tròn tiền. Giá nhập và tổng tiền phiếu vẫn được lưu nguyên vẹn.
- Rollback migration 8 bị chặn khi đã có lịch sử quy đổi để tránh mất dữ liệu.
- CSS mobile cũ vẫn ẩn nút lưu phiếu và các dòng inventory từ dòng thứ 7. Chưa tự sửa vì UI FREEZE. Kiểm tra mobile chỉ xác minh chọn đơn vị/xem phiếu; không tuyên bố đã hoàn thiện thao tác lưu mobile.

Quyết định kỹ thuật: [ADR-011](./ADR-011-purchase-unit-snapshots.md).

## Kết quả kiểm tra thực tế

- `npm run lint`: đạt kiểm tra TypeScript; script hiện tại chưa phải ESLint.
- `npm test`: 56 bài đạt / 17 file.
- `npm run build`: đạt. Vẫn có cảnh báo bundle JavaScript khoảng 694 kB trước gzip.
- `go vet ./...`, `go build ./...`: đạt.
- `GIN_MODE=release RUN_API_TESTS=true bash scripts/test-web-api-local.sh`: Go race tests đạt; browser API 33 bài đạt, 1 bài mobile skip vì nút lưu phiếu bị CSS cũ ẩn.
- `npx playwright test tests/browser/product-cart.spec.ts tests/browser/visual.spec.ts`: 30 bài đạt, gồm 18 ảnh baseline desktop/mobile không thay đổi. Không cập nhật baseline để che khác biệt.
- Sau khi thêm kiểm tra backfill, chạy lại toàn bộ Go race tests trong fixture và 2 browser test nhập quy đổi: đều đạt. Kiểm tra có tỷ lệ thập phân, retry mất phản hồi, snapshot sau đổi/xóa đơn vị danh mục, tenant/store isolation, rollback chặn mất lịch sử và backfill phiếu legacy giữ nguyên dữ liệu.
- Migration 8 up/down/up chạy trên PostgreSQL native tạm **18.3**. Chưa xác minh riêng trên PostgreSQL 16 hoặc chạy CI từ xa; chưa chạy migration trên database thật.
- `git diff --check`: đạt.
