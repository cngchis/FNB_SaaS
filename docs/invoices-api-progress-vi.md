# Tiến độ nối Hóa đơn Management với API

> **Cập nhật công nợ:** đã nối dòng nợ trước đó và luồng thu thêm tiền trong POS. Xem [tiến độ công nợ](./customer-debt-progress-vi.md).

Cập nhật: 10/11/2026.

## Đã làm

- API `GET /api/v1/invoices`, `GET /api/v1/invoices/:id`, dùng SQLC và RLS.
- Phân quyền owner/manager/cashier; kitchen không được truy cập. Tenant và chi nhánh lấy từ phiên đăng nhập, không nhận scope do browser tự khai báo.
- Chỉ lấy hóa đơn đã phát hành từ POS, không đưa đơn tạm tính chưa phát hành vào danh sách hóa đơn.
- Tìm theo mã hóa đơn, mã đơn, tên khách, phòng/bàn; tìm ký tự `%`/`_` theo nghĩa ký tự thường.
- Lọc trạng thái paid/unpaid/cancelled, phân trang server, sắp xếp mã/đơn/bàn/khách/tổng hàng/phải trả/đã trả/giờ đến/trạng thái.
- API nhận `date_from`, `date_to` dạng YYYY-MM-DD; lọc theo giờ đến, múi giờ Việt Nam, bao gồm toàn bộ ngày kết thúc.
- Một câu SQL đọc danh sách, dòng món, tổng thanh toán thành công và metric trên toàn bộ bộ lọc. Không cộng riêng sáu dòng đang xem để làm tổng toàn trang.
- Các metric dùng dữ liệu thật: số hóa đơn có giờ đến trong hôm nay theo bộ lọc, giá trị hóa đơn sau giảm giá, số hóa đơn chưa thanh toán đủ. Giá trị hóa đơn không đồng nghĩa với số tiền mặt đã thu.
- Trang `/management/invoices` dùng API khi `VITE_USE_MOCK=false`; không fallback dữ liệu mẫu khi server lỗi. Giữ nguyên layout, DOM và class, không chỉnh CSS.
- Mobile tải thêm tại footer theo pattern hiện có; CSV lấy đủ các trang theo bộ lọc và kiểm tra phiên trước/sau mỗi request.
- Dropdown chi tiết hiển thị món/số lượng, giảm giá, phải trả, đã trả và trạng thái từ server.
- Nút Thêm hóa đơn chuyển sang POS. Nút Sửa mở chi tiết và báo chỉ tra cứu; nút Xóa báo cần quy trình hủy/hoàn tiền riêng. Không sửa/xóa chứng từ thu tiền bằng CRUD thông thường.
- Người nhận đơn chưa được lưu trong schema: hiển thị `—`. Người tạo và tên chi nhánh lấy từ dữ liệu thật; không gán giả tên thu ngân.

## Hợp đồng API

```text
GET /api/v1/invoices?page=1&page_size=6&search=HD000001
GET /api/v1/invoices?status=unpaid&sort=arrived_at&direction=desc
GET /api/v1/invoices?date_from=2026-11-10&date_to=2026-11-10
GET /api/v1/invoices/:invoice_uuid
```

`page_size` tối đa 100. Envelope list gồm `items`, `pagination`, `summary`.
`summary` gồm `count`, `today_count`, `total_vnd`, `unpaid_count`, `unpaid_vnd`.
Các trường tiền là số nguyên VND; `items` của hóa đơn là mảng record chuẩn hóa, không phải chuỗi hiển thị. UUID hóa đơn khác UUID đơn hàng.

## Kiểm tra local

- 25 Vitest tests đạt; bổ sung adapter hóa đơn, giờ Việt Nam, số tiền nguyên/an toàn.
- Go race/integration trên PostgreSQL native tạm 18.3 đạt: isolation tenant/store, role gate, tìm kiếm literal, phân trang, trạng thái, tổng và công nợ, món/giảm giá, ranh giới ngày và chặn mutation hóa đơn.
- 8 browser E2E đạt trên desktop/mobile: catalog, khách, phân quyền/logout, POS, Management invoices; bao gồm CSV đủ trang, mất mạng/server lỗi không fallback demo, reload và các thao tác chỉ đọc.
- TypeScript và script `lint` đạt; lưu ý script `lint` vẫn là TypeScript, chưa có ESLint.
- Build frontend/Go và Go vet: đạt. Vite vẫn cảnh báo bundle trên 500 kB.
- Visual: 14/14 đạt, ngưỡng 0 pixel, giữ nguyên baseline. Tách output Playwright visual/API để không xóa nhầm trace khi hai bộ chạy cùng lúc.
- Chưa chạy GitHub CI/PostgreSQL 16. Không dùng database hoặc credentials thật của người dùng để test.

## Chạy trên máy hiện tại

Không có migration mới trong đợt này. Giữ database đã áp migration 3; không bootstrap lại.
Dừng API cũ bằng Ctrl+C và chạy `make api-run` từ root dự án. Frontend chạy `VITE_USE_MOCK=false npm run dev`, đăng nhập rồi vào `/management/invoices`.
Hóa đơn phát sinh từ POS sẽ xuất hiện trên trang này. Chưa có hóa đơn thì hiển thị trạng thái trống, không hiển thị số mẫu.

## Chưa làm và bước kế tiếp

1. Hai ô lọc ngày trên giao diện chưa thêm, đang chờ duyệt theo UI FREEZE; API đã hỗ trợ.
2. Thu nợ khách hàng và thanh toán tiếp; quy trình hủy/hoàn tiền có audit và phân quyền.
3. Sổ quỹ, Dashboard, báo cáo, kho và các trang nghiệp vụ khác vẫn theo tiến độ trước. Không dùng số liệu prototype để đối soát hóa đơn thật.
4. Chưa có snapshot export cố định khi có ghi đồng thời; CSV là các trang đọc tuần tự. Tên khách/bàn/người tạo đang phản ánh hồ sơ hiện tại, chưa có snapshot tên lịch sử.
5. Upload ảnh vẫn hoãn theo yêu cầu; QR và offline outbox chưa có.

## Nguồn để agent sau tiếp tục

- [ADR-004](./ADR-004-invoice-read-model.md).
- [SQLC query](../apps/api/sql/invoices.sql), [invoice handler](../apps/api/internal/modules/invoice/handler.go).
- [Repository/adapter](../src/api/invoices.ts), [query hook](../src/api/useInvoiceRecords.ts).
- [Integration test](../apps/api/tests/invoices_integration_test.go), [browser tests](../tests/browser/api.spec.ts).

Không commit hoặc push tự động. Gợi ý: `feat(invoices): connect management invoices to tenant-scoped POS data`.
