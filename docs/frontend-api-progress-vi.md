# Tiến độ tích hợp frontend với API

> **Nhập kho 13/11:** đã có backend migration 5 và CRUD Nhà cung cấp; giao diện Phiếu nhập chờ duyệt ngoại lệ UI. Xem [tiến độ nhập kho](./purchasing-stock-progress-vi.md).

> **Cập nhật Dashboard/Báo cáo 13/11:** đã nối read model theo cửa hàng; xem [tiến độ báo cáo](./reports-api-progress-vi.md) và các giới hạn trước khi tiếp tục.

> **Cập nhật Sổ quỹ:** đã nối khoản thu POS và phiếu thu/chi nhập tay với database. Cần migration 4; xem [tiến độ Sổ quỹ](./cashbook-progress-vi.md).

> **Cập nhật công nợ:** đã nối dòng nợ trước đó và luồng thu thêm tiền trong POS. Xem [tiến độ công nợ](./customer-debt-progress-vi.md).

> **Cập nhật Hóa đơn:** `/management/invoices` đã nối dữ liệu POS thật. Xem [tiến độ Hóa đơn](./invoices-api-progress-vi.md); các mục bên dưới ghi lại giai đoạn trước.

> **Cập nhật mới nhất:** Phòng/Bàn và POS tiền mặt đã nối API. Xem [tiến độ POS](./rooms-pos-progress-vi.md) trước khi đọc các mục lịch sử bên dưới; những ghi chú “POS chưa triển khai” chỉ phản ánh giai đoạn trước.

**Ngày:** 10/11/2026. **Trạng thái:** đã nối Món, tạo Nhóm hàng trong dropdown, Khách hàng và Nhóm khách với API thật. Người dùng đã duyệt các ngoại lệ UI giới hạn trước khi triển khai. Chế độ mock vẫn là mặc định.

## Đã thực hiện

- Thêm Playwright và tạo **14 ảnh baseline trước khi sửa component**: 7 routes × desktop 1440×1000/mobile 390×844. Routes: `/management`, `/management/menu-items`, `/management/inventory`, `/management/orders`, `/management/invoices`, `/management/reports/sales`, `/pos`.
- Cố định thời gian/locale/timezone, kiểm tra page errors và so sánh với ngưỡng 0 pixel. Chạy lại sau refactor: 14/14 PASS, không cập nhật ảnh để che khác biệt.
- Tách helper load/migrate dữ liệu management sang [localManagement.ts](../src/api/localManagement.ts). Truy cập localStorage trong ManagementRecordPage/POS đi qua [prototypeStorage.ts](../src/api/prototypeStorage.ts), giữ nguyên key, dữ liệu và hành vi cũ.
- Thêm HTTP client: envelope/error validation bằng Zod, timeout 15 giây, AbortSignal, Bearer token, retry đúng một lần sau 401 nếu refresh thành công. Không tự retry mutation lỗi 5xx và không tự fallback sang mock.
- Đã nối login/auth guard/logout, React Hook Form + Zod và Zustand session memory-only. Coalesce refresh đồng thời; response refresh cũ không khôi phục phiên đã logout. Reload cần login lại; chưa lưu refresh token lâu dài trên browser.
- Thêm typed HTTP repositories cho Món/Nhóm hàng/Khách/Nhóm khách; query hooks và mutations TanStack Query với cache theo tenant/store/user và xóa cache khi đổi phiên/quyền.
- Thêm QueryClientProvider/AuthGuard không sinh wrapper DOM. Các route cũ giữ nguyên; thêm `/login`. CSS cũ giữ nguyên byte-for-byte; chỉ nối thêm selector riêng cho màn hình auth, dùng button xanh #16794b theo yêu cầu.
- Form Món/Khách/Nhóm khách dùng adapter UUID ↔ dữ liệu hiển thị, mutation thật; chỉ đóng sau khi lưu thành công, lỗi giữ form và dữ liệu để sửa/thử lại. Không nhập dữ liệu prototype vào server, không cache dữ liệu API vào storage prototype.
- Món: tạo/sửa/xóa, tìm kiếm/lọc, tạo nhóm hàng ngay dropdown, thuộc tính và đơn vị quy đổi có giá vốn riêng. Giữ điều chỉnh giá thuộc tính và giá vốn null khi không sửa. SKU server cấp; không gửi SKU/tenant_id/store_id/tồn kho từ form.
- Khách/Nhóm khách: CRUD, lọc theo nhóm thật, số đơn/tổng mua/số thành viên chỉ đọc; cashier không được sửa điểm. Các trường email/note chưa có trên UI được giữ lại khi PUT.
- Desktop dùng phân trang server; mobile tải thêm khi cuộn đến footer vì CSS hiện tại ẩn pagination. Không sửa CSS để hiện nút mới. CSV lấy đủ các trang theo bộ lọc, không chỉ xuất trang đầu.
- Tên người dùng, role, chi nhánh lấy từ phiên thật trong Management. Desktop bấm thẻ người dùng để mở tài khoản/logout; mobile vào “Thêm”, bấm tên chi nhánh trong thẻ hồ sơ.
- Pin plugin React đúng phiên bản 6.2.1 đang dùng, thêm scripts test/typecheck/visual và workflow Web CI.
- Thêm Vite proxy `/api` → `http://127.0.0.1:8080`; không đổi URL trang web.

## Xác minh đã chạy

| Kiểm tra | Kết quả local |
|---|---|
| TypeScript | PASS |
| Unit tests | 19 PASS: HTTP/config, refresh/session, migration prototype và DTO adapters |
| Build | PASS; Vite cảnh báo bundle trên 500 kB |
| Visual sau refactor | 14 PASS; 0 pixel khác biệt với baseline |
| CSS hiện có | Kiểm tra byte-for-byte với Git HEAD: giữ nguyên; chỉ thêm auth selectors |
| GitHub CI | Đã cấu hình, chưa chạy |
| Browser → Vite → Go API → PostgreSQL | 4 E2E PASS: CRUD và cashier/logout ở desktop/mobile, PostgreSQL native tạm 18.3 |
| ESLint | Chưa thiết lập; script lint hiện tại vẫn là kiểm tra TypeScript |

Baseline tạo trên Fedora với Chromium Playwright 1.65.0 fallback Ubuntu24.04. CI Ubuntu có thể khác font hệ thống; nếu diff, phải kiểm tra/chốt môi trường font trước, không nới tolerance hoặc tự cập nhật baseline. 14 visual snapshots so sánh chế độ mock với cùng dữ liệu/thời gian trước refactor. E2E API kiểm tra tương tác và chụp ảnh login/editor để xem; không giả định số liệu server phải giống số liệu demo.

E2E dùng tài khoản/ngữ cảnh được tạo riêng, không dùng credentials thật. Xác minh dữ liệu còn sau tải lại và đăng nhập lại, phân trang desktop/tải thêm mobile, CSV, CRUD nhóm/khách, server chặn cashier, logout, lỗi mạng không fallback demo. Có inject một response 401 để kiểm tra real refresh + retry tới backend; không chờ JWT hết hạn thực tế. Script tự dọn cluster/database. Đã sửa các lỗi tìm thấy trong kiểm thử: selector dropdown và việc thông báo lỗi gây cản trở đóng popup/điều hướng.

## Ngoại lệ UI đã được duyệt và thực hiện

Người dùng đã xác nhận “đồng ý, triển khai”. Các thay đổi dưới đây chỉ áp dụng khi bật API; mock giữ nguyên nội dung cũ:

1. Chế độ API: đổi mô tả lưu/xóa “dữ liệu demo trên thiết bị” thành mô tả lưu/xóa trên server. Chế độ mock giữ nguyên toàn bộ chữ cũ.
2. Khách hàng: số đơn/tổng chi tiêu và số thành viên nhóm là dữ liệu server tính, đã đặt chỉ đọc; cashier không được sửa điểm.
3. Món: tồn kho chưa có stock ledger, không được gửi/lưu giả vào API; hiển thị chưa có dữ liệu và chỉ đọc thay vì lấy số tồn demo. Không tự báo stock=0 như một số tồn thực tế.
4. Upload ảnh: API mới nhận URL, chưa có object storage. Trong API đã disable file picker và giải thích chưa hỗ trợ upload; vẫn có thể xóa URL ảnh hiện có và lưu thay đổi.
5. Metric/hint demo không có API tổng hợp được thay bằng dấu “—” và mô tả chưa có báo cáo; số đếm lấy từ server theo bộ lọc. Trang chưa tích hợp có thông báo demo với nút “Đã hiểu”.

Layout, màu, spacing, typography và class hiện có giữ nguyên. Login là màn hình mới dùng các class sẵn có và auth selectors riêng; ngoại lệ copy/trạng thái dữ liệu chỉ bật trong API.

## Bước tiếp theo cho agent

1. Chạy GitHub CI sau khi người dùng chủ động commit/push; xác minh PostgreSQL 16 và môi trường font CI. Không tuyên bố CI xanh khi chưa có lần chạy.
2. Các trang Dashboard, Inventory, Orders/Invoices, Reports, POS và các module khác vẫn là prototype; chưa triển khai checkout hoặc đồng bộ đơn thật.
3. Bổ sung stock ledger, object storage/presigned uploads và read models cho metrics trước khi bật lại các trường tương ứng. Không lưu tồn kho giả hoặc base64 trong product API.
4. Frontend hiện hỗ trợ sort server theo mã/tên/giá món và tên/điểm khách; cột chưa hỗ trợ báo rõ. Nhóm khách dùng toàn bộ danh sách để sort/filter cục bộ. Mở rộng SQL sort khi cần; không sort riêng một trang rồi coi là toàn bộ dữ liệu.
5. Chưa có UI sửa/xóa nhóm hàng riêng; UI hiện có chỉ tạo nhóm trong dropdown và gán món. Backend đã có đủ endpoints. Chưa có chuyển chi nhánh trong UI hoặc refresh cookie bền vững; một chi nhánh mỗi session, reload yêu cầu login lại.
6. Chưa thiết lập ESLint/Prettier/Testing Library, chưa chuyển frontend sang apps/web. Không tự di chuyển project hoặc đổi UI khi xử lý phần hygiene này.
7. Duy trì visual baselines và kiểm thử cache/session/tenant khi mở rộng; không sửa ảnh baseline chỉ để làm test PASS. Không commit/push tự động.

## Source quan trọng

- Login và guard: [Login.tsx](../src/features/auth/Login.tsx).
- Bridge giữa màn hình và server: [useRemoteRecords.ts](../src/api/useRemoteRecords.ts), [recordAdapter.ts](../src/api/recordAdapter.ts).
- Session hiển thị: [sessionDisplay.ts](../src/api/sessionDisplay.ts).
- E2E: [api.spec.ts](../tests/browser/api.spec.ts), [playwright.api.config.ts](../playwright.api.config.ts), [test-web-api-local.sh](../scripts/test-web-api-local.sh).

## Chạy hiện tại

```bash
VITE_USE_MOCK=false npm run dev
npm run typecheck
npm test
npm run build
npm run test:visual
npm run test:api:e2e
```

Để dùng database local: ở terminal backend đã export biến môi trường theo README, chạy `make migrate-up-local` rồi `make api-run`. Không bootstrap lại. Ở terminal web chạy lệnh với VITE_USE_MOCK=false ở trên, mở `/login` trên cổng Vite hiển thị (thường localhost:5173). “Mã cửa hàng” là tenant slug đã dùng lúc bootstrap, không phải tên database.

Có thể đặt VITE_USE_MOCK=false trong `.env.local` để giữ cấu hình; restart Vite sau khi đổi. `npm run dev` không cấu hình vẫn mở prototype theo mặc định. Proxy dev gọi Go API localhost:8080; production phải cấu hình VITE_API_BASE_URL/proxy phù hợp, không nhúng secret vào biến VITE_.

`npm run test:api:e2e` cần Go, PostgreSQL native tools, goose CLI và Playwright Chromium. Script tạo cluster tạm qua Unix socket, HTTP API riêng cổng 18088 và Vite 5189; không dùng database fnb_saas hiện có. Không chạy đồng thời nhiều bản script trên cùng cổng. PostgreSQL 16 được cấu hình trong CI; local đã kiểm tra 18.3.

Chưa commit/push. Gợi ý commit: `feat(web): connect catalog and customers to authenticated APIs`.
