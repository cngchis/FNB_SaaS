# Tiến độ tồn kho thật và Kiểm kho API

Ngày: 14/11/2026. Quy tắc người dùng đã chốt: **không cho phép bán âm kho**.

## Đã làm

- Migration 7 mở rộng sổ kho với xuất bán và điều chỉnh kiểm kho, version số dư và trạng thái xác nhận tồn đầu kỳ; thêm phiếu/dòng kiểm kho có RLS bắt buộc và khóa ngoại theo tenant/store.
- Nhập hàng đã xác nhận cộng kho. Thanh toán POS lần đầu trừ toàn bộ hàng hóa thường có quản lý kho; thanh toán một phần cũng xuất kho toàn đơn. Thu thêm công nợ không trừ lại. Đơn tạm tính chưa giữ chỗ tồn; thanh toán vượt tồn bị chặn và giữ đơn để xử lý tiếp.
- Chốt kho và tiền/hóa đơn/idempotency trong cùng transaction. Lỗi giữa nhiều sản phẩm rollback toàn bộ. Hai quầy tranh số tồn cuối không thể cùng bán thành công.
- Snapshot tỷ lệ quy đổi và đơn vị cơ bản theo dòng đơn; đổi tỷ lệ Thùng sau khi order không làm thay đổi số Lon phải xuất của đơn cũ. Mỗi sản phẩm dùng chung một số dư cơ bản.
- Thêm/sửa món trên hóa đơn công nợ còn mở chỉ ghi chênh lệch kho. Giảm số lượng hoàn lại tồn, tăng phải đủ tồn.
- Quản lý hàng hóa đọc số dư API theo đúng trang sản phẩm và tổng hợp của chi nhánh. CSV có số lượng thật khi đã xác nhận đầu kỳ; số dư chưa xác nhận để trống. Tổng giá trị theo giá bán lẻ hiện có, không phải báo cáo định giá kế toán.
- Kiểm kho tìm hàng qua API khi gõ hoặc bấm Hiển thị tất cả; mở phiếu trống không tải danh mục sản phẩm. Hiển thị chi nhánh/người tạo theo phiên thật, không đọc phiếu demo vào API.
- Nút Lưu phiếu kiểm kho hiện có thực hiện tạo và xác nhận nguyên tử; retry sau timeout dùng cùng request key, không nhân đôi phiếu/điều chỉnh. Xung đột tồn giữ nguyên số lượng đang nhập để người dùng kiểm đếm lại.
- API riêng đã có tạo/sửa nháp và xác nhận theo version; xem ADR để biết quy tắc chi tiết. Chưa tự thêm các nút nháp vào giao diện vì UI FREEZE.
- Không đổi CSS, route, dependency hoặc tự commit/push.

## API

- `GET /api/v1/inventory/quantities?product_ids=<UUID,...>`: tối đa 100 ID, quantity dạng chuỗi thập phân hoặc null nếu chưa xác nhận đầu kỳ; kèm balance_version.
- `GET /api/v1/inventory/summary`: SKU, lượng tồn và giá trị bán lẻ; tổng lượng/giá trị null nếu còn hàng cũ chưa xác nhận.
- `GET /api/v1/stocktakes?page=1&page_size=100` và `GET /api/v1/stocktakes/:id`.
- `POST /api/v1/stocktakes`, `PUT /api/v1/stocktakes/:id`: note, version và items gồm product_id, counted_quantity dạng chuỗi không âm tối đa 6 số thập phân, balance_version từ lần đọc số dư.
- `POST /api/v1/stocktakes/:id/post`: version của phiếu nháp.
- `POST /api/v1/stocktakes/confirm`: cùng payload tạo phiếu, tạo + xác nhận trong một giao dịch cho nút Save hiện tại.
- Mọi mutation trên yêu cầu Idempotency-Key. Owner/manager được ghi; tenant/store lấy từ JWT. Không sửa/xóa phiếu đã xác nhận.

## Áp dụng vào máy người dùng

Agent chưa chạy migration trên database thật. Dừng terminal API cũ bằng Ctrl+C, rồi từ root dự án:

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

Cần version **7**, đúng database của API. Nếu cổng 8080 đang có API cũ, dừng đúng tiến trình đó trước khi chạy lại. Không bootstrap/reset database.

Terminal web:

```bash
cd /home/cngchis/Workspaces/SaaS_Management/FNB_SaaS
VITE_USE_MOCK=false npm run dev
```

Sau khi đăng nhập lại, mở Kiểm kho và xác nhận số lượng thực tế của hàng hóa cũ theo từng chi nhánh. Chưa kiểm thì số dư là `—`, checkout báo cần xác nhận tồn đầu kỳ. Không lấy ledger chỉ có nhập hàng làm số tồn đã kiểm chứng; không hồi tố xuất kho cho hóa đơn lịch sử.

Khi phiếu báo tồn thay đổi: bấm Thử lại để tải dữ liệu mới, xóa dòng bị cũ, chọn lại sản phẩm và kiểm đếm lại trước khi lưu. Không tự giữ số đếm cũ rồi âm thầm chấp nhận snapshot mới.

## Giới hạn đang chờ

- Nút Lưu nháp/Xác nhận và mở sửa nháp trên frontend cần ngoại lệ UI FREEZE; agent đã hỏi, chưa nhận câu trả lời. API có đầy đủ thao tác này; UI hiện tại chỉ lưu+xác nhận nguyên tử.
- CSS mobile cũ ẩn dòng inventory từ thứ 7, kể cả dòng phiếu kiểm. Chưa sửa nếu chưa được duyệt; dùng desktop cho danh sách/phiếu nhiều dòng trong thời gian này. Nhập hàng mobile còn test fixme do action bị CSS cũ ẩn.
- Chưa có định mức tồn tối thiểu trong schema; giá trị này và cảnh báo Sắp hết vẫn `—`, bộ lọc trạng thái kho chưa bật. Không giả định một ngưỡng cảnh báo mới.
- Hàng chế biến chưa trừ nguyên liệu vì chưa có BOM. Chưa có nhập hàng theo đơn vị quy đổi, đặt giữ tồn, hoàn/hủy đơn, FIFO/bình quân hoặc công cụ rebuild ledger tự động.
- Phiếu nháp không được tự khôi phục thành giao diện sửa nếu chưa duyệt UI. Phần tính giá vốn hóa đơn vẫn dùng snapshot hiện có, không lấy cost null của biến động kho để tính lợi nhuận.

Chi tiết quyết định: [ADR-010](./ADR-010-stock-ledger-and-stocktakes.md).

Commit gợi ý: `feat(inventory): add stocktakes and prevent POS overselling`.

## Kết quả kiểm chứng trực tiếp

- SQLC generation: PASS. Go vet/build: PASS; Go race toàn bộ với fixture PostgreSQL: PASS.
- Integration kiểm tra: hai checkout tranh tồn cuối, rollback toàn bộ khi sản phẩm thứ hai thiếu hàng, retry không trừ hai lần, thu thêm tiền, sửa số lượng hóa đơn mở, snapshot tỷ lệ, version kiểm kho, ledger bằng projection, đọc/ghi chéo tenant qua runtime role bị chặn, phân quyền/store scope, tồn đầu kỳ và rollback không được xóa audit đã ghi.
- Migration 7 up/down/up trên cluster PostgreSQL native **18.3** tạm: PASS. Chưa xác minh PostgreSQL 16 hoặc GitHub Actions thực tế.
- Browser API toàn bộ: **31 PASS, 1 skipped** (fixme nhập hàng mobile cũ). Sau chỉnh thứ tự khóa, Go race chạy lại toàn bộ và 4 E2E POS/kiểm kho desktop/mobile PASS.
- Browser mới kiểm tra mở phiếu không tải danh mục, count số thập phân, lưu vào DB, xung đột giữ dữ liệu form, chặn checkout thiếu tồn, bổ sung tồn rồi retry thành công.
- `npm run lint`/typecheck: PASS. Script lint hiện chỉ chạy TypeScript, chưa phải ESLint.
- Vitest: **50 test / 15 file PASS**. Build: PASS, còn cảnh báo bundle khoảng **688 kB**.
- Mock/visual: **30 PASS** (12 E2E + 18 baseline, 0 pixel diff), không cập nhật ảnh baseline. Đã xem ảnh thông báo thiếu tồn trong dialog thanh toán mobile.
- `git diff --check`: PASS. Không tự commit/push hoặc thao tác database cửa hàng.
