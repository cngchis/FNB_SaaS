# Tiến độ Sổ quỹ thật

> **Cập nhật Dashboard/Báo cáo 13/11:** đã nối read model theo cửa hàng; xem [tiến độ báo cáo](./reports-api-progress-vi.md) và các giới hạn trước khi tiếp tục.

Cập nhật: 10/11/2026.

## Đã triển khai

- Migration [00004_cashbook.sql](../apps/api/migrations/00004_cashbook.sql): bảng phiếu thu/chi nhập tay, RLS, version, mã phiếu và người thu cho payments, view `cashbook_entries` với `security_invoker=true`.
- Mỗi payment thành công hiện đúng một lần trong Sổ quỹ. Khoản thu lấy `amount_vnd` đã áp dụng, không lấy toàn bộ tiền khách đưa và không cộng tiền thừa.
- Khoản thu trước migration được cấp mã ổn định trong đợt chuyển đổi, không thay số tiền; người thu lịch sử chưa biết để `—`. Không sao chép dữ liệu prototype/localStorage vào database.
- Ba tab Tiền mặt / Ngân hàng / Tổng quỹ đã nối server. Phương thức “Khác” từ dữ liệu payment cũ chỉ thuộc Tổng quỹ, không bị gán giả là tiền ngân hàng.
- Lọc ngày theo giờ Việt Nam, chi nhánh thật từ quyền được cấp; tìm mã phiếu/nội dung/người nộp/mã hóa đơn. Có phân trang, sắp xếp mã/số tiền/ngày và CSV đủ trang.
- Số dư đầu kỳ, tổng thu, tổng chi, cuối kỳ tính trên server theo ngày/phương thức/chi nhánh. Tìm kiếm và trạng thái chỉ lọc chứng từ, không thay đổi số dư thực tế của phạm vi quỹ.
- Owner/manager xem các chi nhánh được cấp quyền, tạo phiếu tại chi nhánh được cấp quyền; cashier chỉ xem chi nhánh trong phiên; kitchen không truy cập.
- Tạo phiếu thu/chi nhập tay, chọn phương thức, thời gian ghi sổ, người nộp và ghi chú qua form hiện có. Mã phiếu/người tạo do server quyết định. API kiểm tra loại thu/chi khớp loại phiếu, số tiền VND nguyên dương.
- Phiếu chưa thanh toán có thể sửa/xóa, bảo vệ bằng version và khóa row. POST/PUT có idempotency key, request hash và kết quả trong cùng transaction.
- Phiếu đã thanh toán và khoản thu POS bị khóa sửa/xóa. Thao tác mở khoản thu POS dẫn đến trang Hóa đơn đã lọc theo hóa đơn nguồn. Không đưa một khoản thu sang CRUD độc lập để làm sai số tiền hóa đơn.
- Giữ nguyên CSS và bố cục. Dòng tìm kiếm cũ được bỏ khỏi bảng trong lúc debounce để tránh bấm nhầm chứng từ chưa khớp từ khóa mới.

## API

```text
GET /api/v1/cashbook?page=1&page_size=6&sort=occurred_at&direction=desc
GET /api/v1/cashbook?method=cash&date_from=2026-11-10&date_to=2026-11-10
GET /api/v1/cashbook?store_id=<accessible-store-uuid>&status=pending&search=<text>
POST /api/v1/cashbook
PUT /api/v1/cashbook/:manual-voucher-id
DELETE /api/v1/cashbook/:manual-voucher-id?version=1
```

GET hỗ trợ `method=cash|bank`, `status=pending|posted`, `store_id`, ngày, search, sort, pagination. Không truyền store_id: owner/manager xem toàn bộ chi nhánh được cấp; cashier chỉ chi nhánh đang đăng nhập. Chi nhánh ngoài quyền trả 404.

POST/PUT cần `Idempotency-Key`, body gồm store_id, direction (`in|out`), amount_vnd, status, method, category, payer_group, payer, note, occurred_at (RFC3339), version. Category: customer_receipt/other_receipt/purchase_expense/operating_expense. Payer_group: customer/supplier/employee/other. PUT cần version hiện có. Chỉ phiếu nhập tay chưa thanh toán được sửa; không chuyển chi nhánh khi sửa.

Phiếu thu nhập tay không tự trả nợ hóa đơn POS, kể cả khi chọn “Thu tiền khách hàng”. Thu nợ hóa đơn phải mở đúng đơn trong POS và thu qua payment để liên kết hóa đơn và giảm công nợ.

## Chạy trên máy hiện tại — cần migration 4

Agent chỉ chạy migration trên cluster tạm, **chưa áp vào database cửa hàng của bạn**.

1. Dừng API cũ bằng Ctrl+C để tránh binary cũ tạo payment thiếu mã phiếu.
2. Tại root dự án, dùng tài khoản quản trị trỏ đúng database API đang dùng:

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

Nếu tên database thực tế khác fnb_saas, dùng đúng tên đã bootstrap. Không bootstrap lại và không rollback database đang dùng. Cấu hình runtime vẫn lấy từ file .env đã có; mật khẩu admin dùng riêng cho migration.

3. Frontend chạy `VITE_USE_MOCK=false npm run dev`; tải lại web, đăng nhập và mở `/management/cashbook`.
4. Khoản thu POS cũ/mới xuất hiện từ database. Có thể vào đúng chi nhánh/ngày/phương thức để đối soát. Chọn biểu tượng mở/sửa của khoản thu POS để xem hóa đơn nguồn.

## Xác minh

- TypeScript và script lint đạt; script lint hiện vẫn là TypeScript, chưa thiết lập ESLint.
- 28 unit tests đạt, bổ sung adapter, số tiền, ngày Việt Nam và loại phiếu.
- Go race/integration native PostgreSQL 18.3 đạt: tenant/store RBAC, view không vượt RLS, chống trùng, tiền thừa, số dư, phiếu chờ/đã thanh toán, sửa/xóa draft, backfill payment lịch sử và migration up/down/up.
- 12/12 E2E desktop/mobile đạt, gồm các module cũ và Sổ quỹ: đối chiếu nguồn hóa đơn, form thật, số dư, tab, ngày/chi nhánh, phân trang/tải thêm và CSV.
- 14/14 visual tests đạt, baseline giữ nguyên; CSS không chỉnh sửa. Có ảnh Sổ quỹ API để xem thực tế.
- Build frontend/backend và Go vet đạt. Vite vẫn cảnh báo bundle trên 500 kB.
- Chưa chạy GitHub CI/PostgreSQL 16 thực tế. Không sử dụng dữ liệu hoặc credentials thật của cửa hàng để test.

## Giới hạn và việc tiếp theo

- Số dư phản ánh các khoản đã ghi sổ; không giả số dư tiền mặt/bank ban đầu từ dữ liệu mẫu. Nếu cần nhập số dư đầu, tạo phiếu phù hợp có ghi chú, ngày trước kỳ cần xem, qua tài khoản có quyền.
- Chưa có luồng điều chỉnh/đảo bút toán/hoàn tiền với audit; không sửa/xóa phiếu đã thanh toán.
- Trang Tài khoản ngân hàng vẫn là prototype, có thông báo demo. Phiếu ngân hàng nhập tay là ghi nhận của người dùng, không phải xác nhận giao dịch từ ngân hàng.
- QR/provider webhook, bank feed và tự động chi nhập hàng/kho chưa triển khai; thời gian payment hiện phù hợp tiền mặt đồng bộ. Provider bất đồng bộ sau này cần timestamp xác nhận thanh toán thật.
- Chưa nối Dashboard/Reports với SQL. Đây là bước kế tiếp sau Sổ quỹ.
- CSV đọc theo từng trang, chưa là snapshot audit cố định khi có ghi đồng thời.

## File chính

- [ADR-006](./ADR-006-cashbook.md).
- [Handler](../apps/api/internal/modules/cashbook/handler.go), [SQLC query](../apps/api/sql/cashbook.sql), [migration](../apps/api/migrations/00004_cashbook.sql).
- [Repository/adapter](../src/api/cashbook.ts), [query/mutations](../src/api/useCashbookRecords.ts).
- [Integration](../apps/api/tests/cashbook_integration_test.go), [browser E2E](../tests/browser/api.spec.ts).

Chưa commit/push. Gợi ý: `feat(cashbook): connect POS receipts and manual vouchers to store balances`.
