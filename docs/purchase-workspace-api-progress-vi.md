# Tiến độ kết nối giao diện nhập hàng với API

Ngày: 14/11/2026.

## Phạm vi đã làm

- Route `/management/purchases` sử dụng API khi `VITE_USE_MOCK=false`; chế độ mock giữ nguyên component và storage cũ.
- Tách [giao diện API](../src/features/purchases/ApiPurchaseWorkspace.tsx) và [hook điều phối dữ liệu](../src/features/purchases/usePurchaseWorkspace.ts). Không sửa backend, migration, contract, CSS hoặc các ảnh baseline.
- Danh sách phiếu có phân trang server, tổng số phiếu, tổng giá trị, số phiếu nháp. Dữ liệu không được lấy từ localStorage prototype.
- Bấm phiếu để tải chi tiết. Phiếu nháp sửa được; phiếu đã xác nhận chỉ xem. Chi nhánh/người tạo lấy từ phiên hoặc snapshot server, không cho chọn cửa hàng khác với JWT.
- Tạo phiếu ban đầu không gọi danh sách sản phẩm. Tìm kiếm có debounce 300 ms và AbortSignal; lọc nhóm hàng trên server, chỉ lấy hàng hóa thường có quản lý tồn. Các trang kết quả được tải đầy đủ khi tìm kiếm/hiển thị tất cả.
- Tạo nhanh nhà cung cấp bằng API và tự chọn UUID mới; tạo nhanh hàng hóa bằng API, tự thêm vào phiếu. Đơn vị mặc định của popup tạo nhanh vẫn là `Cái`, như prototype; sửa đơn vị trong màn hình Món trước khi có lịch sử kho.
- Popup lưu có `Lưu nháp` và `Xác nhận nhập kho`. Nháp chưa tăng kho; xác nhận gọi endpoint post riêng.
- Khóa thao tác đang chạy; giữ khóa idempotency khi mất phản hồi. Giữ ID/version đã xác nhận để lỗi ở bước sau không biến thành phiếu mới. Nếu mất phản hồi lúc tạo, giải quyết request cũ trước khi gửi nội dung đã sửa.
- Xung đột phiên bản hiển thị lỗi; nút `Thử lại` hỏi xác nhận tải lại phiếu trước khi thay thế nội dung chưa lưu.
- Đã bỏ cảnh báo trang demo riêng cho route này trong API mode. Caption API là `Dữ liệu trên hệ thống`; metric trạng thái là `Phiếu nháp`, không đánh đồng nhập kho với thanh toán nhà cung cấp.

## Ngoại lệ UI và phần đang chờ

Người dùng đã đồng ý bắt đầu sau đề xuất thêm popup lưu nháp/xác nhận, bấm dòng mở lại và đổi caption trong API mode.

**Chưa hoàn tất nhập hàng trên mobile:** CSS hiện có ẩn `.filter-actions` và các thao tác header. Vì UI FREEZE, chưa sửa CSS hoặc đổi cách bố trí để hiện nút. Đã gửi câu hỏi xin phép chỉ hiện và xuống dòng các nút trên màn hình Nhập hàng API; chưa nhận câu trả lời.

E2E nhập hàng mobile được đánh dấu `fixme` với lý do rõ ràng trong [api.spec.ts](../tests/browser/api.spec.ts). Không coi test bị bỏ qua này là PASS. Sau khi người dùng đồng ý: thêm selector riêng chỉ cho workspace API, cho toolbar/header actions hiển thị và wrap ở mobile, bỏ fixme, chạy lại cả hai viewport và xem ảnh thực tế. Không sửa selector cũ hoặc baseline mock.

## Kiểm chứng đã chạy

- `npm run lint`: PASS (script này là TypeScript, chưa có ESLint riêng).
- `npm test`: PASS, 40 test / 11 file.
- `npm run build`: PASS, cảnh báo bundle JS khoảng 670 kB vẫn còn.
- `RUN_API_TESTS=true bash scripts/test-web-api-local.sh --project desktop`: Go race PASS, 10 E2E desktop PASS.
- Sau bổ sung xử lý mất phản hồi tạo phiếu: chạy lại E2E nhập hàng desktop PASS.
- `npx playwright test tests/browser/visual.spec.ts tests/browser/product-cart.spec.ts`: 22 PASS, gồm 18 ảnh khớp tuyệt đối và 4 E2E món/cart. Không cập nhật baseline.
- Đã mở ảnh thực tế nhập hàng API desktop để kiểm tra bằng mắt.
- `bash scripts/test-web-api-local.sh` chạy sau cùng: 19 E2E API PASS, 1 test nhập hàng mobile bị bỏ qua có ghi rõ `fixme` chờ duyệt UI; không tuyên bố toàn bộ luồng mobile đã qua.
- `git diff --check`: PASS.

Test nhập hàng kiểm tra: không nạp catalog khi tạo phiếu, tạo nhà cung cấp/hàng hóa, lưu nháp và mất phản hồi rồi retry cùng khóa, chưa có movement khi còn nháp, mở lại/sửa, chặn stale version và tải lại có xác nhận, mất phản hồi khi post rồi retry cùng khóa, chỉ có một movement, phiếu posted không sửa được, tìm theo nhóm hàng.

Fixture PostgreSQL native 18.3 riêng đã chạy migration 5 up/down/up. **Không chạm database thật của người dùng, không tự áp dụng migration trên database thật.** Chưa chạy PostgreSQL 16 hoặc GitHub Actions thực tế.

## Giới hạn và bước kế tiếp

1. Chờ duyệt ngoại lệ mobile nêu trên; chưa thể coi toàn bộ giao diện nhập hàng đã hoàn tất.
2. Database local thực tế cần migration 5; xem [hướng dẫn nhập kho](./purchasing-stock-progress-vi.md). Không chạy rollback trên lịch sử kho thật.
3. Retry state hiện nằm trong bộ nhớ workspace; reload/logout/navigation có thể mất trạng thái chưa lưu hoặc khóa lệnh chưa xác định. Chưa có outbox IndexedDB bền vững. Nếu mất phản hồi, xử lý bằng thử lại ngay trong workspace trước khi rời trang; tra cứu phiếu server trước khi tạo lại.
4. API tạo hàng hóa hiện chưa hỗ trợ idempotency, nên không có bảo đảm chống trùng cho riêng POST tạo nhanh hàng hóa sau mất phản hồi. Không tự thay contract backend trong task này.
5. Ledger mới ghi nhập kho; chưa phải tồn thực tế đầy đủ. Chưa xuất kho POS, kiểm kho, BOM, đổi đơn vị nhập, điều chỉnh/đảo phiếu, thanh toán nhà cung cấp hoặc báo cáo tồn kho thật. Công nợ nhà cung cấp vẫn tính từ tổng phiếu posted, chưa phân bổ thanh toán.
6. Upload ảnh tiếp tục để sau theo yêu cầu trước đó.

Không tự commit/push. Commit gợi ý sau khi xử lý điểm mobile: `feat(purchasing): connect receipt workspace to backend APIs`.

## Cập nhật: tạo sản phẩm từ Quản lý hàng hóa — 14/11

Đã xác nhận nguồn lệch trong code: Kiểm kho/Quản lý hàng hóa vẫn đọc localStorage prototype, trong khi Nhập hàng API đọc bảng `products`. Người dùng xác nhận “Bia” không có ở Danh sách món thật. Không tự sao chép hoặc seed sản phẩm demo vào database thật.

Theo yêu cầu mới, thêm nút `Tạo mới sản phẩm` vào các nhóm thao tác sẵn có trên desktop và mobile của Quản lý hàng hóa. Nút điều hướng đến `/management/menu-items` với ý định mở ngay form tạo Món sẵn có; không tạo form thứ hai hoặc đổi CSS. Chờ danh mục API tải xong mới mở form; tiêu thụ ý định điều hướng để đóng form không tự mở lại. Owner/manager tạo được trong API mode; cashier/kitchen bị vô hiệu hóa nút. Backend vẫn kiểm tra quyền.

Sau khi tạo hàng hóa thường, dữ liệu được lưu bằng API Món hiện có và có thể tìm lại ở Nhập hàng. Bảng Quản lý hàng hóa và nghiệp vụ Kiểm kho vẫn demo; thay đổi này **không** đồng nghĩa đã nối tồn kho/kiểm kho với API. Không thay dữ liệu thực bằng tồn demo, không tự tạo “Bia” cho người dùng.

Test bổ sung kiểm tra nút và lưu sản phẩm ở mock, và luồng API tạo “Bia” → tìm trong phiếu nhập ở cả desktop/mobile. Test tìm kiếm riêng kiểm tra tên tiếng Việt, SKU, đơn vị cơ bản và loại trừ prepared/non-stock goods. Cập nhật đúng hai ảnh inventory desktop/mobile cho nút được yêu cầu sau khi xem trước/sau; các ảnh khác giữ nguyên.

Commit gợi ý: `feat(inventory): add product creation action using the existing catalog editor`.

Kiểm chứng cập nhật nút tạo: TypeScript/build PASS; 40 unit test PASS; 6 E2E mock món/cart/tạo hàng PASS; bộ API 23 PASS và 1 test nhập hàng mobile cũ vẫn `fixme` chờ duyệt. Đã kiểm tra ảnh inventory trước/sau: desktop thêm đúng nút trong header, mobile thêm nút trong nhóm thao tác sẵn có. Không sửa CSS hoặc dữ liệu thật.
