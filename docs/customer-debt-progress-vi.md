# Tiến độ công nợ khách hàng và chi tiết hóa đơn POS

Cập nhật: 10/11/2026.

## Đã triển khai

- API `GET /api/v1/customers/:id/debt`, trả `customer_id`, `outstanding_vnd` nguyên VND.
- Tổng công nợ chỉ tính hóa đơn đã phát hành còn thiếu tiền, theo tenant/chi nhánh của phiên. Không tính đơn tạm tính chưa phát hành; không tính đơn đã hủy/hoàn/đã trả đủ.
- Tham số `exclude_order_id` loại hóa đơn đang mở trong cart khỏi dòng “Nợ trước đó”; UUID loại trừ phải thuộc đúng tenant/chi nhánh. Cột “Nợ hóa đơn này” tiếp tục chỉ tính phần thiếu của đơn hiện tại.
- POS lấy công nợ theo UUID khách hàng, không theo tên; query/cache theo tenant/store/user/customer/order. Tải lại sau mutation và mỗi 15 giây. Khi đang tải/lỗi hiển thị `—`, không báo giả nợ bằng 0.
- Hóa đơn chưa trả đủ trong lịch sử có nút “Mở đơn để thu thêm tiền”. Hóa đơn tạm tính có nút “Mở đơn”. Đơn được đưa vào cart với đúng số tiền đã trả; popup thanh toán chỉ yêu cầu phần còn thiếu.
- Retry một lần thu tiền sau mất response dùng lại idempotency key. Server trả kết quả cũ, không tạo khoản thu thứ hai; giữ nguyên cơ chế khóa order và kiểm tra số phải trả.
- Không cho gán hóa đơn đã phát hành sang khách khác qua sửa cart.
- Không cho xóa khách hàng đang có đơn mở/chưa tất toán. Khóa customer row đồng bộ với luồng tạo đơn, tránh xóa khách giữa lúc phát sinh đơn.
- Popup Đơn hàng gần đây và Hóa đơn tạm tính: chi tiết nằm ngay sau đúng dòng được bấm; mở dòng khác sẽ đóng chi tiết cũ; bấm lại/đóng chi tiết để thu gọn. Xem chi tiết không tự thay cart, phải bấm mở đơn.
- Tái sử dụng class và style hiện có; không thay CSS, màu, layout chính hoặc route. Không thêm dependency hoặc migration.

## Cách dùng

1. Restart API bằng `make api-run` tại root dự án; tải lại frontend đang bật `VITE_USE_MOCK=false`.
2. Chọn khách trong cart để xem nợ trước đó tại chi nhánh đang đăng nhập.
3. Mở lịch sử POS, bấm hóa đơn chưa trả đủ, chọn “Mở đơn để thu thêm tiền”; hoặc mở đơn từ phòng/bàn/hóa đơn tạm tính.
4. Chọn Tiền mặt và nhập số tiền nhận **trong lần thu này**. Sau thành công, số đã trả và công nợ được tải lại từ server.

Không bootstrap lại, không cần chạy migration mới. Database vẫn cần đủ migrations 1–3 như đợt trước.

## Kiểm tra

- TypeScript/script lint, build frontend, Go vet/build: đạt. Vite vẫn cảnh báo bundle trên 500 kB. Script lint hiện là TypeScript, chưa có ESLint.
- 25 Vitest tests đạt.
- Go race/integration trên PostgreSQL native tạm 18.3: tenant/store isolation, quyền cashier/kitchen, công nợ, loại trừ cart/draft, khóa khách đã có hóa đơn, idempotent collection.
- 10 E2E browser đạt: gồm công nợ ở desktop/mobile và retry sau khi server đã ghi nhận thu tiền nhưng response bị mất. Có xác minh tổng công nợ giảm đúng và số đã trả không bị nhân đôi.
- Vị trí chi tiết popup được kiểm tra bằng DOM: panel là sibling ngay sau row đang mở, không nằm cuối danh sách. Desktop có kiểm tra cả hai popup; mobile kiểm tra công nợ/thu tiền qua phòng bàn theo luồng hiện có.
- 14 visual snapshots đạt, giữ nguyên baseline; đã xem ảnh hai popup để kiểm tra vị trí chi tiết. Không tuyên bố đã thêm lối vào lịch sử mới trên mobile.
- Chưa chạy GitHub CI/PostgreSQL 16 thực tế. Không đụng database hoặc credentials cửa hàng thật.

## Bước tiếp theo

- Nối Sổ quỹ với khoản thu POS thật, đối soát theo thời gian/chi nhánh.
- Thu nợ nhiều hóa đơn, đối soát/hoàn tiền, audit chỉnh sai khách và báo cáo tuổi nợ cần nghiệp vụ riêng; chưa có trong đợt này.
- Công nợ hiện theo chi nhánh của phiên, chưa tổng hợp mọi chi nhánh.
- QR, offline outbox và upload ảnh vẫn theo các giới hạn trước. Ô lọc ngày Management đang chờ phê duyệt UI.

## Nguồn

- [ADR-005](./ADR-005-customer-receivables.md).
- [Debt handler](../apps/api/internal/modules/customer/debt.go), [SQLC customer queries](../apps/api/sql/customers.sql).
- [POS controller](../src/api/usePosController.ts), [popup POS](../src/features/pos/POS.tsx).
- [Integration tests](../apps/api/tests/invoices_integration_test.go), [E2E](../tests/browser/api.spec.ts).

Chưa commit/push. Gợi ý: `feat(pos): add customer debt collection and inline invoice details`.
