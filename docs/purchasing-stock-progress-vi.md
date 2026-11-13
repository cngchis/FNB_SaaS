# Tiến độ Nhà cung cấp, Phiếu nhập và Sổ kho — 13/11/2026

## Đã triển khai

### Database / Backend

Migration [00005_purchasing_stock.sql](../apps/api/migrations/00005_purchasing_stock.sql) bổ sung:

- Nhà cung cấp, mã NCC tự tăng, version, soft delete.
- Phiếu nhập nháp/đã xác nhận, mã PN tự tăng, cửa hàng/người tạo/người xác nhận.
- Dòng hàng chuẩn hóa: sản phẩm, mã, tên, đơn vị cơ bản, số lượng, giá nhập và thành tiền.
- Sổ biến động nhập kho bất biến; projection số lượng được cập nhật trong cùng transaction.
- RLS bắt buộc trên tất cả bảng mới, FK ghép tenant/store, unique constraints và indexes.
- Chặn đổi đơn vị cơ bản/loại hàng/quản lý tồn hoặc xóa sản phẩm đã có lịch sử nhập kho. Không ghi đè giá vốn catalog bằng giá nhập.

Chỉ owner/manager được dùng các endpoint mới, theo cửa hàng trong JWT:

| Endpoint | Chức năng |
| --- | --- |
| `GET/POST /api/v1/suppliers` | Tra cứu / tạo nhà cung cấp |
| `PUT/DELETE /api/v1/suppliers/:id` | Sửa / xóa nhà cung cấp chưa được tham chiếu |
| `GET/POST /api/v1/purchases` | Danh sách / tạo phiếu nháp |
| `GET/PUT /api/v1/purchases/:id` | Chi tiết / sửa phiếu nháp |
| `POST /api/v1/purchases/:id/post` | Xác nhận, ghi tăng tồn đúng một lần |
| `GET /api/v1/inventory/balances` | Số lượng từ các phiếu nhập đã xác nhận |
| `GET /api/v1/inventory/movements` | Lịch sử nhập kho, lọc theo product_id |

Create/update/post yêu cầu `Idempotency-Key`; cập nhật và xác nhận kiểm tra version. API kiểm tra tổng tiền và số nguyên trước khi ghi; chỉ nhận hàng hóa thường có quản lý tồn và số lượng nguyên theo đơn vị cơ bản. Phiếu nháp không tăng tồn. Bốn request xác nhận đồng thời cùng phiếu chỉ ghi một movement cho mỗi dòng.

### Frontend Nhà cung cấp

Đã nối `/management/suppliers` với API: tìm kiếm tên/mã/điện thoại, sorting tên/công nợ, phân trang desktop, tải tiếp mobile, chi tiết inline, thêm/sửa/xóa, validation, lỗi/tải/empty và CSV. Công nợ là dữ liệu dẫn xuất từ phiếu đã xác nhận của chi nhánh đang chọn; trường nhập nợ chỉ đọc. Không lấy dữ liệu localStorage làm fallback ở API mode.

Đã có repository/type/validation frontend cho phiếu nhập, sẵn sàng nối UI sau khi duyệt ngoại lệ bên dưới.

## Cần người dùng duyệt trước khi nối giao diện nhập hàng

Theo **UI FREEZE**, đã gửi hai đề xuất, chưa nhận câu trả lời:

1. Nút “Lưu phiếu nhập” mở modal dùng style có sẵn với hai lựa chọn “Lưu nháp” và “Xác nhận nhập kho”; cho phép click phiếu để mở lại phiếu nháp.
2. Riêng API mode đổi nhãn “Dữ liệu demo cục bộ” thành “Dữ liệu trên hệ thống”. Không đổi bố cục/CSS.

Vì chưa được duyệt, `/management/purchases` vẫn là prototype và còn thông báo chưa nối API. Chưa gọi lưu nháp/xác nhận từ trang này. Không coi giao diện Nhập hàng đã hoàn thành. Không áp dụng thay đổi UI ngầm.

## Giới hạn nghiệp vụ cần bàn giao

- Đây là nền tảng **nhập kho**, chưa phải tồn kho thực tế đầy đủ. Chưa có xuất kho từ POS, BOM, kiểm kho, chuyển kho, nhập tồn đầu hoặc đảo phiếu. Không nối số nhập lũy kế vào báo cáo tồn kho rồi coi là tồn thực tế.
- Chưa có thanh toán nhà cung cấp/phân bổ công nợ; mọi phiếu đã xác nhận đang được tính vào số phải trả. Xác nhận nhập không tự tạo phiếu chi; phiếu chi thủ công không tự trừ công nợ nhà cung cấp.
- Chưa có đổi đơn vị đóng gói khi nhập; nhập theo đơn vị cơ bản. Việc đổi đơn vị sau khi đã có lịch sử cần quy trình chuyển đổi riêng.
- Không có xóa/sửa phiếu đã xác nhận hoặc giả vờ có nghiệp vụ hoàn tiền/đảo kho.
- Donut Dashboard và chốt ca vẫn là các mục chờ ở báo cáo giai đoạn trước.

## Áp dụng trên máy người dùng

**Chưa chạy migration trên database thật của bạn.** Dừng API cũ, chạy từ root dự án:

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

Không chạy lại bootstrap. Dùng đúng database đã cấu hình cho API nếu tên khác. Frontend chạy API mode như cũ: `VITE_USE_MOCK=false npm run dev`. Không dùng rollback trên dữ liệu thật: down migration sẽ xóa lịch sử nhập kho của giai đoạn này.

## Kiểm chứng

Đã chụp bốn baseline mới cho Nhà cung cấp/Nhập hàng ở desktop/mobile **trước khi sửa frontend**; không thay ảnh cũ.

| Lệnh / kiểm tra | Kết quả |
| --- | --- |
| `npm run lint` | PASS; đây là kiểm tra TypeScript, chưa có ESLint riêng |
| `npm test` | PASS: 35 test, 9 file |
| `npm run build` | PASS; vẫn có cảnh báo bundle JS khoảng 643 kB, lớn hơn 500 kB |
| `go vet ./...`, `go build ./...` | PASS |
| `RUN_API_TESTS=true bash scripts/test-web-api-local.sh` | PASS: Go race và 16 E2E desktop/mobile |
| `npm run test:visual` | PASS: 18 ảnh, 0 pixel khác baseline |
| `git diff --check` | PASS |

Fixture PostgreSQL native 18.3 riêng đã chạy migration 5 up/down/up; không dùng database thật. Chưa chạy PostgreSQL 16 hoặc GitHub Actions thực tế.

Integration test kiểm tra nháp không tăng tồn, xác nhận đồng thời bốn request không ghi trùng, version cũ bị chặn, phiếu đã xác nhận không sửa được, giá nhập snapshot, ledger/projection khớp, tenant/store isolation, phân quyền, nhà cung cấp được tham chiếu không xóa được, prepared/overflow/số lượng không hợp lệ bị từ chối và post thất bại không để lại movement. Test backfill Sổ quỹ đã sửa để rollback rõ về version 3, vẫn kiểm tra migration 4 khi migration 5 được thêm vào.

E2E mới đã phát hiện trùng query key giữa hook Nhà cung cấp và luồng records chung; đã tách namespace cache, chạy lại toàn bộ thành công. Khóa idempotency được giữ khi chưa biết kết quả request và bỏ khi đã xác nhận thành công, để lần tạo mới sau này không replay nhầm chứng từ cũ.

## File chính và việc tiếp theo

- [Migration 5](../apps/api/migrations/00005_purchasing_stock.sql), [SQLC queries](../apps/api/sql/purchases.sql).
- [API](../apps/api/internal/modules/purchase/handler.go), [transaction nghiệp vụ](../apps/api/internal/modules/purchase/service.go).
- [Repository frontend](../src/api/purchasing.ts), [hook Nhà cung cấp](../src/api/useSupplierRecords.ts).
- [Integration tests](../apps/api/tests/purchases_integration_test.go), [ADR-008](./ADR-008-purchasing-stock-ledger.md).

Sau khi có câu trả lời UI: nối PurchaseWorkspace với repository thật, giữ danh sách sản phẩm trống đến khi tìm kiếm hoặc chọn hiển thị tất cả; nối tạo nhanh nhà cung cấp/hàng hóa; lưu nháp/mở lại phiếu; xử lý retry sau commit chưa xác định; xác nhận và hiển thị lỗi version. Sau đó làm xuất kho POS, kiểm kho/BOM và báo cáo tồn kho theo phạm vi được duyệt.

Không tự commit/push. Commit gợi ý: `feat(purchasing): add supplier APIs and idempotent stock receipts`.
