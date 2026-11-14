# Tiến độ danh mục hàng hóa dùng API

Ngày: 14/11/2026.

## Đã triển khai

- `/management/inventory` dùng cùng product UUID với Món và Nhập hàng khi `VITE_USE_MOCK=false`. Không đọc hoặc cập nhật danh mục demo trong localStorage ở trang này.
- Chỉ lấy `product_type=goods&tracks_stock=true`. Lọc nhóm, tìm tên/SKU, đếm và phân trang đều thực hiện trên server; không tải toàn bộ danh mục khi mở trang.
- Desktop phân trang 6 sản phẩm; mobile tải thêm theo trang khi footer xuất hiện. Giới hạn CSS mobile được ghi riêng bên dưới.
- Xem chi tiết và đổi đơn vị giữ nguyên dropdown hiện có. Popup sửa tải lại sản phẩm theo UUID, giữ giá từng thuộc tính, giá/hiển thị đơn vị và giá vốn chưa xác định; tạo nhóm mới qua API. Lưu xong làm mới các query cùng phiên.
- Tạo mới tiếp tục mở form Món hiện có; Nhập kho chuyển sang Phiếu nhập. Owner/manager được sửa/tạo; cashier/kitchen chỉ xem. Backend vẫn kiểm tra quyền.
- CSV xuất tất cả trang theo từ khóa/nhóm hiện tại; không dùng từ khóa debounce cũ nếu bấm xuất ngay sau khi gõ.
- Loading, lỗi/retry và empty state dùng mẫu có sẵn. Query cache tách tenant/store/user; đổi phiên đóng workspace cũ.
- Mock mode giữ hành vi cũ. Không thêm dependency, route, migration hoặc thay CSS/baseline.

## Không coi số nhập là tồn kho thật

Ledger hiện chỉ có nhập hàng, chưa đủ số dư đầu kỳ, xuất POS, điều chỉnh/kiểm kê và BOM. Vì vậy số tồn, định mức, giá trị kho và trạng thái sắp hết hiển thị `—` trong API mode; CSV để trống các trường chưa biết. Không lấy số demo hoặc mặc định 0 để thể hiện tồn kho thật.

Nút Điều chỉnh tồn mobile và bộ lọc trạng thái kho bị vô hiệu hóa trong API mode. Kiểm kho vẫn là workspace demo riêng và còn thông báo chưa kết nối API. Đây là bước nối **danh mục hàng hóa**, chưa phải hoàn thiện quản trị tồn kho.

## Giới hạn mobile cần người dùng duyệt

CSS hiện có ẩn mọi dòng bảng inventory từ dòng thứ 7. Dữ liệu API tải thêm được nhưng các dòng này vẫn bị ẩn; mở chi tiết cũng làm thay đổi thứ tự dòng. Agent đã hỏi ngoại lệ UI FREEZE để thêm selector chỉ áp dụng inventory API, nhưng chưa nhận được câu trả lời. Chưa sửa CSS và chưa coi danh sách mobile trên 6 dòng là hoàn tất. Test mobile xác nhận tải dữ liệu, không khẳng định dòng thứ 7 nhìn thấy được.

Nhập hàng mobile còn một test `fixme` từ đợt trước vì CSS ẩn action; không tính là PASS.

## Chạy local

Không cần migration mới cho thay đổi này. Database vẫn cần các migration đã có đến version 6. Restart backend mới để nhận bộ lọc `tracks_stock`:

```bash
cd /home/cngchis/Workspaces/SaaS_Management/FNB_SaaS
make api-run
```

Terminal khác:

```bash
cd /home/cngchis/Workspaces/SaaS_Management/FNB_SaaS
VITE_USE_MOCK=false npm run dev
```

Đăng nhập lại nếu phiên trong bộ nhớ đã mất. Không bootstrap/reset database và không di chuyển dữ liệu demo sang server tự động.

## Kiểm chứng

- SQLC generation, Go vet và Go build: PASS.
- `npm run lint` (script TypeScript hiện tại, chưa phải ESLint): PASS. Vitest: 49 test / 14 file PASS. Build: PASS, còn cảnh báo bundle khoảng 681 kB.
- Playwright mock/visual: 30 PASS, gồm 12 E2E và 18 screenshot desktop/mobile khớp baseline với 0 pixel diff. Không cập nhật baseline.
- `RUN_API_TESTS=true bash scripts/test-web-api-local.sh`: Go race toàn bộ PASS; 29 browser API tests PASS, 1 test nhập hàng mobile bỏ qua có `fixme`.
- Fixture PostgreSQL native 18.3 riêng, migration 6 up/down/up; không thao tác database cửa hàng. Chưa chạy PostgreSQL 16 hoặc GitHub Actions thực tế.
- Backend test mới kiểm tra true/false/omitted `tracks_stock`, phân trang, tìm literal `%`/`_`, tenant isolation và boolean không hợp lệ.
- Browser test kiểm tra dữ liệu demo trùng SKU không ghi vào API, UUID thật, tạo/sửa, tìm/lọc/phân trang, đơn vị, CSV, lỗi/retry và chuyển Nhập kho.
- `git diff --check`: PASS. Không chỉnh stylesheet hoặc tự commit/push.

## Việc tiếp theo

1. Chờ duyệt ngoại lệ CSS mobile, sau đó kiểm tra dòng thứ 7 và chi tiết của dòng cuối thực sự nhìn thấy được. Không sửa selector cũ.
2. Thiết kế ledger đủ nhập/xuất/điều chỉnh và số dư đầu kỳ trước khi nối tồn kho thật. POS chỉ trừ kho trong giao dịch có idempotency; hàng chế biến cần BOM, không trừ như hàng hóa thường.
3. Nối Kiểm kho với API và snapshot số lượng hệ thống; xử lý cạnh tranh phiên bản và tenant/store scope.
4. Nhập theo đơn vị quy đổi cần snapshot tỷ lệ và giá vốn chứng từ; không tạo hai số dư độc lập cho Lon/Thùng.

Không tự commit/push. Commit gợi ý: `feat(inventory): connect goods management to catalog APIs`.
