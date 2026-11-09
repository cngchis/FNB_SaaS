# Tiến độ frontend data layer và đề xuất nối API

**Ngày:** 10/11/2026. **Trạng thái:** đã chuẩn bị nền tảng; chưa bật HTTP cho form hiện tại.

## Đã thực hiện

- Thêm Playwright và tạo **14 ảnh baseline trước khi sửa component**: 7 routes × desktop 1440×1000/mobile 390×844. Routes: `/management`, `/management/menu-items`, `/management/inventory`, `/management/orders`, `/management/invoices`, `/management/reports/sales`, `/pos`.
- Cố định thời gian/locale/timezone, kiểm tra page errors và so sánh với ngưỡng 0 pixel. Chạy lại sau refactor: 14/14 PASS, không cập nhật ảnh để che khác biệt.
- Tách helper load/migrate dữ liệu management sang [localManagement.ts](../src/api/localManagement.ts). Truy cập localStorage trong ManagementRecordPage/POS đi qua [prototypeStorage.ts](../src/api/prototypeStorage.ts), giữ nguyên key, dữ liệu và hành vi cũ.
- Thêm HTTP client: envelope/error validation bằng Zod, timeout 15 giây, AbortSignal, Bearer token, retry đúng một lần sau 401 nếu refresh thành công. Không tự retry mutation lỗi 5xx và không tự fallback sang mock.
- Thêm auth service login/refresh/logout, Zustand session memory-only. Coalesce refresh đồng thời; response refresh cũ không được khôi phục phiên đã logout. Reload sẽ yêu cầu login lại khi auth guard được nối; chưa lưu refresh token lâu dài trên browser.
- Thêm typed HTTP repositories cho Món/Nhóm hàng/Khách/Nhóm khách; query hooks và mutations TanStack Query với cache theo tenant/store/user và xóa cache khi đổi phiên/quyền.
- Thêm QueryClientProvider không sinh DOM; không sửa CSS, route hoặc nội dung giao diện.
- Thêm React Hook Form cho bước login/form tiếp theo; chưa dùng cho các form hiện tại.
- Pin plugin React đúng phiên bản 6.2.1 đang dùng, thêm scripts test/typecheck/visual và workflow Web CI.
- Thêm Vite proxy `/api` → `http://127.0.0.1:8080`; không đổi URL trang web.

## Xác minh đã chạy

| Kiểm tra | Kết quả local |
|---|---|
| TypeScript | PASS |
| Unit tests | 14 PASS: HTTP/config, refresh/session và migration prototype |
| Build | PASS; Vite cảnh báo bundle trên 500 kB |
| Visual sau refactor | 14 PASS; 0 pixel khác biệt với baseline |
| CSS hiện có | Không chỉnh sửa |
| GitHub CI | Đã cấu hình, chưa chạy |
| Form → API thật → PostgreSQL | Chưa nối/chưa kiểm thử |
| ESLint | Chưa thiết lập; script lint hiện tại vẫn là kiểm tra TypeScript |

Baseline tạo trên Fedora với Chromium Playwright 1.65.0 fallback Ubuntu24.04. CI Ubuntu có thể khác font hệ thống; nếu diff, phải kiểm tra/chốt môi trường font trước, không nới tolerance hoặc tự cập nhật baseline. Snapshot của bảng/dialog tương tác sẽ bổ sung khi nối form; 14 ảnh hiện tại là trạng thái đầu của các routes yêu cầu.

## Đang chờ quyết định theo UI freeze

Người dùng yêu cầu dừng và xin duyệt nếu backend cần đổi UI. Đã gửi đề xuất dưới đây; **chưa nhận được duyệt, chưa thực hiện các thay đổi này**:

1. Chế độ API: đổi mô tả lưu/xóa “dữ liệu demo trên thiết bị” thành mô tả lưu/xóa trên server. Chế độ mock giữ nguyên toàn bộ chữ cũ.
2. Khách hàng: số đơn/tổng chi tiêu và số thành viên nhóm là dữ liệu server tính, cần chỉ đọc; cashier không được sửa điểm.
3. Món: tồn kho chưa có stock ledger, không được gửi/lưu giả vào API; hiển thị chưa có dữ liệu và chỉ đọc thay vì lấy số tồn demo. Không tự báo stock=0 như một số tồn thực tế.
4. Upload ảnh: API mới nhận URL, chưa có object storage. Khi bật API cần thông báo rõ chưa hỗ trợ upload; không được báo ảnh đã lưu khi chưa có upload API.
5. Các metric/hint demo không có API tổng hợp tương ứng không được trình bày như số liệu thật. Cần chỉ ra dữ liệu chưa có trong chế độ API hoặc thống nhất cách thay nội dung trước khi nối.

Layout, màu, spacing, typography và class hiện có giữ nguyên. Login là màn hình mới được cho phép theo kế hoạch, dùng các class sẵn có; chưa triển khai login/auth guard trong đợt chuẩn bị này.

## Bước tiếp theo cho agent

1. Nhận duyệt các thay đổi giới hạn ở trên; không tự hiểu việc im lặng là đồng ý.
2. Tạo login/auth guard, dùng React Hook Form và Zod; giữ routes management/POS hiện tại. Không ghi token/dữ liệu tenant vào storage prototype.
3. Thêm adapter mapping DTO ↔ form, giữ UUID riêng với SKU; không gửi SKU, tenant_id/store_id, stock hoặc số liệu khách tính toán lên API.
4. Nối Món/Khách/Nhóm khách từng module bằng hooks đã chuẩn bị. Query pagination server; không lấy trang đầu rồi coi là toàn bộ dataset. Không tự import dữ liệu local sang database.
5. Nhóm hàng mới trong dropdown gọi categories API; giữ UUID và không lưu bằng tên vào FK. Giá, thuộc tính và đơn vị phải giữ đúng dữ liệu server khi PUT.
6. Kiểm thử login, CRUD, refresh, 401/403/network, tải lại trang, phân trang và cách ly cache giữa tenant/store. Chạy API/PostgreSQL tạm để xác minh xuyên suốt; không dùng credential thật đã từng xuất hiện trong hội thoại.
7. Chạy lại unit/build/typecheck/visual. Kiểm tra snapshot trước/sau với cùng fixture và môi trường; không thay ảnh baseline chỉ vì implementation tạo diff.

## Chạy hiện tại

```bash
npm run dev
npm run typecheck
npm test
npm run build
npm run test:visual
```

Web hiện vẫn dùng prototype như trước. `.env.example` để `VITE_USE_MOCK=true`; cấu hình false mới điều khiển hooks đã chuẩn bị, chưa chuyển form hiện có sang HTTP. Không hướng dẫn người dùng bật false như một bản tích hợp hoàn chỉnh.

Chưa commit/push. Gợi ý commit cho phần chuẩn bị: `refactor(web): add API data layer and frozen UI visual baselines`.
