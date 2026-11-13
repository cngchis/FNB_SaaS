# ADR-009: Đơn vị bán hàng độc lập về hiển thị, dùng chung hàng tồn

Ngày: 14/11/2026. Trạng thái: đã triển khai theo phương án được người dùng đồng ý.

## Quyết định

Một mặt hàng gốc có đơn vị cơ bản và các biến thể đơn vị quy đổi. Mỗi đơn vị có giá bán, giá vốn và tùy chọn hiển thị thực đơn riêng. Không tạo các product độc lập với lượng tồn riêng cho cùng một hàng vật lý.

- `products.is_visible`: hiển thị đơn vị cơ bản.
- `product_units.is_visible`: hiển thị đơn vị quy đổi, độc lập với đơn vị cơ bản.
- `products.availability`: vẫn áp dụng cho toàn bộ mặt hàng, mọi đơn vị.
- SKU và product ID thuộc mặt hàng gốc; biến thể được chọn theo tên đơn vị hiện có. Chưa có SKU riêng cho từng đơn vị.
- Đơn vị ẩn vẫn có trong catalog quản lý và chi tiết kho, nhưng không có lựa chọn bán trong POS. API kiểm tra lại quyền bán theo đúng đơn vị được gửi.
- Giữ giá 0 của đơn vị nếu được nhập rõ ràng; không thay bằng giá cơ bản nhân tỷ lệ.

Ví dụ: Bia cơ bản là Lon, Thùng = 24 Lon. Bật Lon, tắt Thùng để bán lon trong POS nhưng vẫn xem giá thùng trong kho. Ngược lại, tắt Lon và bật Thùng vẫn cho bán Thùng.

## Dữ liệu và tương thích

Migration 6 thêm boolean NOT NULL DEFAULT true trên bảng `product_units` đã có forced RLS. Backfill các đơn vị cũ theo trạng thái hiển thị của sản phẩm để không vô tình bật lại hàng đang ẩn. Không sửa migration đã áp dụng, không tạo bảng tồn kho riêng theo đơn vị.

Input API chấp nhận `is_visible` trong từng unit. Client cũ không gửi thì kế thừa trạng thái hiển thị đơn vị cơ bản; frontend hiện tại round-trip cả true/false. API/model/query được tạo lại bằng SQLC. Chỉ owner/manager được sửa catalog như trước.

## Đơn đã ghi nhận

Đơn vị bị ẩn không làm thay đổi snapshot dòng đơn đã ghi nhận. Có thể giữ/giảm số lượng và thanh toán đơn cũ. Thêm dòng mới hoặc tăng số lượng đơn vị đã bị ẩn sẽ bị API từ chối. Giá lịch sử không bị tính lại bằng giá hiện tại.

## Hiển thị hàng tồn

Dropdown cạnh tên trong chi tiết Quản lý hàng hóa chọn đơn vị để xem giá, vốn, trạng thái thực đơn và lượng tồn quy đổi. Tồn của đơn vị quy đổi được hiển thị từ cùng một số cơ bản; ví dụ 47 Lon hiện thành 1 Thùng + 23 Lon. Hàm hiển thị dùng số nguyên BigInt với thang 6 chữ số thập phân để tránh mất phần lẻ.

**Giới hạn hiện tại:** bảng Quản lý hàng hóa/Kiểm kho vẫn demo. Dropdown này không đồng nghĩa đã nối tồn thực tế với API. Stock ledger API hiện chỉ ghi nhập theo đơn vị cơ bản; chưa có xuất kho POS, BOM hoặc nhập phiếu bằng đơn vị quy đổi. Ví dụ bán 1 Lon từ 48 Lon → 47 Lon là quy tắc của mô hình chung; chưa được tự động thực hiện trên stock ledger bởi POS ở giai đoạn này.

Khi triển khai xuất kho/nhập theo thùng sau này, phải snapshot tỷ lệ trên dòng chứng từ và ghi movement theo đơn vị cơ bản; không dùng tỷ lệ catalog đã đổi để tính lại lịch sử. Các chức năng này chưa được thêm trong thay đổi hiển thị đơn vị.

## UI

Giữ layout, màu, route, icon và selector cũ. Chỉ thêm checkbox hiển thị cho từng đơn vị và dropdown/chi tiết đơn vị theo yêu cầu. CSS được nối cuối cho selector mới. Không thay ảnh baseline.
