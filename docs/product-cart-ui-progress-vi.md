# Cập nhật thuộc tính món, chi tiết hàng hóa và giỏ hàng — 13/11/2026

## Phạm vi UI đã được người dùng yêu cầu

- Mỗi lựa chọn thuộc tính có trường **Giá cộng thêm (₫)** riêng, ví dụ Size M +0 ₫, Size L +5.000 ₫. Dữ liệu cũ có giá trị `M, L` được tách thành từng lựa chọn khi chỉnh sửa; kiểm tra trùng tên/giá trị và giá bán nguyên không âm. Backend vẫn dùng contract `price_delta_vnd` có sẵn, không cần migration mới.
- Chi tiết món hiển thị giá bán sau cộng của từng lựa chọn. POS hiển thị cùng mức giá; API chỉ nhận tên/giá trị lựa chọn, vẫn tự tính giá trên server. Không gửi giá client vào thuộc tính của order.
- Click hàng hóa mở chi tiết ngay dưới dòng, click lại để đóng. Dùng chung component với Món, gồm mã/loại/thực đơn/giá vốn/tồn/flags/thuộc tính/đơn vị. Thao tác điều chỉnh tồn không vô tình mở/đóng chi tiết; detail phản ánh số lượng đang hiển thị sau điều chỉnh.
- Ô giảm giá trong cart chuyển thành trường chỉ đọc, mở popup khi click hoặc Enter/Space. Popup có ô nhập và nút %/VND, xem trước, Hủy/Áp dụng và đóng bằng Escape.
- Giảm theo % được quy đổi thành số nguyên VND tại thời điểm áp dụng, làm tròn nửa đồng lên một đồng bằng BigInt; không lưu chế độ phần trăm như một công thức tự thay đổi khi thêm món. Không giảm vượt tạm tính hoặc làm tổng phải trả thấp hơn tiền đã thu.
- Cart chỉ hiển thị số tiền đã thanh toán thực sự, không có ô nhập. Nhập tiền tại popup thanh toán tiền mặt; nợ của hóa đơn dựa vào tiền đã ghi nhận, không dựa vào số dự kiến nhập.

## Giới hạn giữ nguyên

Màn Hàng hóa vẫn thuộc prototype/demo như giai đoạn trước, có thông báo chưa nối API. Thay đổi này bổ sung chi tiết trên dữ liệu đang hiển thị; không coi số lượng demo là tồn kho thực. Chưa nối màn Phiếu nhập vì ngoại lệ UI riêng của giai đoạn trước vẫn chờ duyệt.

Không đổi API contract, dependency hoặc migration. Không sửa CSS cũ: chỉ thêm selector cho các component/thao tác được yêu cầu. Không tự commit/push.

## File chính

- [ProductDetails](../src/components/products/ProductDetails.tsx): chi tiết dùng chung.
- [Product editor](../src/features/management/ManagementRecordPage.tsx), [Inventory](../src/features/inventory/Inventory.tsx).
- [DiscountDialog](../src/features/pos/DiscountDialog.tsx), [POS](../src/features/pos/POS.tsx).
- [Tính giảm giá](../src/utils/discount.ts), [lựa chọn thuộc tính](../src/utils/productOptions.ts).

## Kiểm chứng thực tế

- TypeScript/lint script, build: PASS. Script lint hiện là TypeScript, không phải ESLint. Vẫn còn cảnh báo bundle JS khoảng 649 kB.
- Unit tests: **40 PASS / 11 file**; đã mở rộng Vitest để nhận cả `.test.tsx` cho test component. Không thêm thư viện.
- Go race tests và toàn bộ **18 API E2E** desktop/mobile: PASS trên PostgreSQL 18.3 riêng biệt. Luồng API mới cũng được chạy lại riêng sau khi hoàn thiện nhãn giá: 2 PASS.
- **4 UI E2E** prototype desktop/mobile: PASS, gồm lưu giá lựa chọn, chi tiết hàng hóa, cập nhật số tồn trong detail, giảm giá %/VND, Hủy và popup nhập tiền.
- **18 visual snapshots:** PASS sau khi xem ảnh actual/diff và cập nhật duy nhất baseline POS desktop theo yêu cầu bỏ ô nhập tiền. 17 baseline khác không thay đổi; không tự cập nhật để che khác biệt ngoài phạm vi.
- Đã xem ảnh popup giảm giá và editor trên mobile. `git diff --check` PASS. Không chạy kiểm thử trên database thật của người dùng.

Commit gợi ý: `feat(ui): add attribute pricing, inventory details and cart discount editor`.
