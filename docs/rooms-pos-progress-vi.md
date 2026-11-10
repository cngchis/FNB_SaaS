# Tiến độ Phòng/Bàn và POS thật

Ngày cập nhật: 10/11/2026.

## Đã triển khai

### Backend

- Migration [00003_rooms_pos.sql](../apps/api/migrations/00003_rooms_pos.sql): phòng/bàn, phiên bản đơn hàng, snapshot giá bán/giá vốn, lượt gọi món và dòng món chuẩn hóa, hóa đơn, bản ghi chống lặp request. Có Down migration.
- Phòng/bàn: `GET/POST /api/v1/rooms`, `PUT/DELETE /api/v1/rooms/:id`.
- POS: `GET/POST /api/v1/pos/orders`, `GET/PUT /api/v1/pos/orders/:id`, `POST /api/v1/pos/orders/:id/payments`.
- List đơn nhận `state=open|history|all`, `page`, `page_size` tối đa 100. POS lấy toàn bộ trang đơn mở; lịch sử hiển thị tối đa 100 hóa đơn gần nhất.
- Mọi truy vấn theo tenant trong JWT và chi nhánh của phiên; cưỡng chế RLS, khóa ngoại composite. Owner/manager quản lý bàn; cashier thao tác POS; kitchen bị chặn POS.
- Tiền VND nguyên; tính giá từ catalog trên server. Lưu giá/giá vốn tại thời điểm gọi món, không tự đổi hóa đơn cũ khi sửa catalog.
- Một bàn có tối đa một đơn đang mở. Mang về có nhiều đơn độc lập. Đơn tạm tính có thể mở lại, gọi thêm món và lưu lượt mới.
- Mỗi lần sửa phải gửi `version`. Lưu đơn/thanh toán cần header `Idempotency-Key` 16–100 ký tự an toàn; cùng key/cùng payload trả lại kết quả, khác payload trả 409.
- Thanh toán tiền mặt: một phần, thanh toán nốt, tiền thừa và hóa đơn thật. Khóa đơn để tránh hai thu ngân ghi nhận vượt số phải trả. Đơn giá trị 0 đóng hợp lệ mà không tạo dòng thu tiền giả.

### Frontend

- Trang Phòng/Bàn dùng API thật trong chế độ API; tìm kiếm, sắp xếp, phân trang và CRUD dùng giao diện hiện có.
- POS lấy món, thuộc tính/đơn vị, khách hàng, phòng/bàn và đơn từ API. Tạo khách ngay POS lưu server.
- Bỏ `pos-topbar` và `cart-header` theo yêu cầu mới.
- Thanh ngang: tìm kiếm → Phòng/Bàn → Thực đơn → các tab Đơn hàng → nút thêm đơn. Đã bỏ nút “Đơn gần đây” ở thanh tab theo yêu cầu bổ sung; lịch sử giữ tại sidebar desktop.
- Mỗi tab giữ giỏ, khách, bàn, ghi chú, giảm giá riêng. Bấm X mở popup xác nhận; đóng tab không xóa đơn tạm tính đã lưu trên server.
- Mobile cuộn ngang thanh tab; mở giỏ từ tổng thanh toán hoặc tay nắm giỏ. Không thay layout Management.
- Chỉ bổ sung CSS ở cuối file, giới hạn selector POS. Hai ảnh POS được cập nhật theo thiết kế mới do người dùng yêu cầu; ảnh Management giữ nguyên.

## Chạy trên database local hiện có

**Agent chưa áp migration 3 vào database cửa hàng của bạn.** Các test dùng cluster tạm độc lập.

Từ thư mục dự án, dùng kết nối quản trị đã dùng để migrate trước đây:

```bash
cd /home/cngchis/Workspaces/SaaS_Management/FNB_SaaS
export MIGRATIONS_DATABASE_URL='host=localhost port=5432 user=postgres dbname=fnb_saas sslmode=disable'
read -rsp 'Mật khẩu postgres: ' PGPASSWORD
echo
export PGPASSWORD
make migrate-up-local
unset PGPASSWORD
make api-run
```

Database trên là tên đã dùng trong các bước trước. Nếu database thực tế khác, dùng đúng tên đã bootstrap, không tạo database/tenant mới. Không rollback database đang dùng, không bootstrap lại.

Terminal frontend:

```bash
cd /home/cngchis/Workspaces/SaaS_Management/FNB_SaaS
VITE_USE_MOCK=false npm run dev
```

Đăng nhập owner/manager, tạo bàn tại `/management/rooms`, thêm món nếu catalog trống, vào `/pos`. Chọn bàn → chọn món → Tạm tính → mở lại bàn → thêm món → Tiền mặt. Số tiền nhập là số tiền nhận trong lần thanh toán này; tiền thừa không tính vào doanh thu. Sau reload cần đăng nhập lại vì token chưa lưu lâu dài.

## Xác minh

- TypeScript và script `lint`: đạt. Lưu ý `lint` hiện là TypeScript, **chưa có ESLint**.
- Vitest: 23 tests đạt, gồm cách ly giỏ giữa các tab, đóng tab, reset phiên và khóa lựa chọn món.
- Build frontend: đạt; vẫn có cảnh báo bundle trên 500 kB.
- Go race tests trên PostgreSQL native tạm 18.3: đạt; gồm tenant/store isolation, RBAC, revision, request lặp, thanh toán đồng thời, công nợ, tiền thừa, giá/cost snapshot và đơn 0 đồng. Auth lifecycle với credentials môi trường riêng có thể skip; các bài browser vẫn đăng nhập/refresh/logout thật.
- Browser → Vite → API → PostgreSQL: 6 E2E đạt trên desktop/mobile, gồm luồng POS mở lại bàn sau đăng nhập và thêm cùng món không tạo dòng trùng.
- Migration 3: up → down → up đạt trên cluster tạm. Kiểm tra round-trip toàn bộ schema nằm trong bộ Go tests.
- Visual: 14 đạt, gồm 12 ảnh Management không thay đổi và 2 ảnh POS được cập nhật có chủ đích.
- Chưa có lần chạy GitHub CI/PostgreSQL 16 thực tế cho thay đổi này; không coi kết quả PostgreSQL 18.3 là xác minh PostgreSQL 16.

## Chưa hoàn thành / công việc tiếp theo

1. QR/PayOS: cần cấu hình merchant/provider; xây webhook kiểm tra chữ ký và xử lý lặp trước khi xác nhận thanh toán. Hiện API mode báo chưa cấu hình, không ghi nhận thanh toán QR giả.
2. Offline: chưa có IndexedDB outbox. Chế độ API giữ giỏ chưa lưu trong bộ nhớ khi lỗi và chặn thanh toán offline; đóng/reload trang làm mất giỏ chưa lưu. Cần lưu payload đầy đủ và key bền vững trước khi hỗ trợ bán offline thật.
3. Dashboard, Inventory, Nhập hàng, Sổ quỹ, Reports và trang Management Orders/Invoices vẫn còn dữ liệu prototype; hóa đơn thật hiện xem được tại lịch sử POS. Không dùng báo cáo demo để đối soát khoản thu thật.
4. Nối read model hóa đơn và công nợ khách với Management; định nghĩa quy trình hủy/hoàn tiền, audit và phân quyền trước khi cho sửa/xóa hóa đơn đã thu tiền.
5. Stock ledger, công thức/BOM, SQL cashbook và báo cáo là giai đoạn kế tiếp; không trừ tồn hoặc giả giá vốn món chế biến.
6. Upload ảnh giữ hoãn theo yêu cầu người dùng; chưa có presigned upload/object storage.
7. Hoàn thiện ESLint/Prettier, ngân sách bundle, chính sách retention idempotency, refresh cookie và CI PostgreSQL 16 trước production.

## File chính

- [ADR-003](./ADR-003-rooms-pos-cash.md).
- [POS service](../apps/api/internal/modules/pos/service.go), [room handler](../apps/api/internal/modules/room/handler.go).
- [POS controller](../src/api/usePosController.ts), [repositories](../src/api/pos.ts), [tab store](../src/stores/posStore.ts).
- [Backend integration](../apps/api/tests/pos_integration_test.go), [browser integration](../tests/browser/api.spec.ts).

Không tự commit/push. Gợi ý: `feat(pos): add persistent table orders, cash checkout and order tabs`.
