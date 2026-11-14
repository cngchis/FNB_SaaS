# Tiến độ công thức nguyên liệu (BOM)

Ngày: 14/11/2026.

## Đã triển khai

- Migration 9: công thức theo món/đơn vị/thuộc tính, định lượng nguyên liệu, RLS bắt buộc và snapshot công thức trên đơn hàng.
- API đọc/lưu công thức. Owner/manager được lưu; có version chống ghi đè và Idempotency-Key chống lưu lặp khi mất phản hồi.
- Nguyên liệu là hàng hóa thường có quản lý kho, dùng đơn vị cơ bản hiện tại. Không dùng món chế biến làm nguyên liệu, không tạo công thức lồng nhau.
- Ưu tiên công thức khớp đầy đủ thuộc tính, ví dụ Size L. Nếu không có, dùng công thức mặc định của cùng đơn vị bán. Không tự nhân tỷ lệ sang đơn vị bán khác.
- Đơn mới và từng lượt gọi món chụp định lượng/giá vốn nguyên liệu. Sửa công thức sau đó không thay đổi đơn đã lưu; xóa dòng hiện tại không xóa snapshot lịch sử lượt gọi món.
- Khi thanh toán lần đầu, xuất nguyên liệu của toàn bộ đơn trong cùng transaction với tiền/hóa đơn. Thanh toán công nợ tiếp không xuất lại. Thêm/bớt số lượng trên hóa đơn công nợ chỉ ghi phần chênh lệch kho.
- Cộng nhu cầu nguyên liệu dùng chung giữa nhiều món và hàng bán trực tiếp. Chặn âm kho, rollback toàn bộ nếu một nguyên liệu thiếu; xử lý hai quầy tranh số tồn cuối.
- Tích hợp cảnh báo tồn ngay trong giỏ POS qua data hooks, dùng thông báo hiện có. Đây là cảnh báo hỗ trợ; backend vẫn kiểm tra lại khi thanh toán.
- Không sửa CSS, layout, component render, URL hoặc baseline; không thêm dependency. Chưa tự commit/push.

## Phần giao diện đang chờ duyệt

Đã gửi đề xuất thêm mục **Công thức nguyên liệu** trong popup tạo/sửa món chế biến: chọn nguyên liệu, định lượng và công thức riêng cho đơn vị/size. UI FREEZE yêu cầu duyệt trước khi thêm phần này. Chưa triển khai editor hoặc tuyên bố hoàn tất toàn bộ tính năng.

Hiện có thể khai báo bằng API; chưa có editor công thức trong mock mode. Các màn hình hiện tại giữ nguyên.

## Quy tắc chuyển tiếp

- **Món chưa có công thức vẫn hoạt động như trước và chưa trừ nguyên liệu.** Lưu công thức đầu tiên sẽ bật kiểm tra công thức cho các lựa chọn mới của món đó. Cần chủ động cấu hình toàn bộ món chế biến trước khi coi kho nguyên liệu là đầy đủ.
- Đơn cũ không có snapshot giữ nguyên hành vi; không hồi tố trừ kho. Nếu tăng số lượng sau khi món đã bật công thức, cần tạo lại lựa chọn món để ghi nhận công thức.
- Mỗi đơn vị bán cần công thức riêng. Mặc định chỉ áp dụng cho cùng đơn vị, không tự suy đoán công thức Bình từ Ly hoặc size khác.
- Không làm tròn định lượng; tối đa 6 chữ số thập phân. Giá vốn công thức chỉ có khi tổng chi phí nguyên liệu là số nguyên VND và mọi nguyên liệu đều biết giá vốn; trường hợp khác để null.
- Chưa có FIFO/bình quân, hao hụt, chế biến bán thành phẩm, giữ chỗ nguyên liệu, hoàn/hủy chứng từ hoặc sửa/xóa lịch sử đã ghi nhận.

## API

- `GET /api/v1/products/:id/recipes`: danh sách công thức của món trong tenant hiện tại.
- `PUT /api/v1/products/:id/recipes`: lưu một lựa chọn đơn vị + thuộc tính. Cần `Idempotency-Key`, version 0 khi tạo; version hiện tại khi sửa. Trả ID/version mới cùng nguyên liệu.

Ví dụ body, dùng UUID thật của món và hàng hóa:

```json
{
  "unit": "Ly",
  "version": 0,
  "attributes": [{ "name": "Size", "value": "L" }],
  "ingredients": [
    { "product_id": "<UUID nguyên liệu sữa>", "base_unit": "L", "quantity": "0.125" },
    { "product_id": "<UUID cà phê>", "base_unit": "kg", "quantity": "0.02" }
  ]
}
```

Công thức không thuộc tính (`attributes: []`) là mặc định của đơn vị đó. Đơn vị và thuộc tính phải tồn tại trên món. Một nguyên liệu chỉ có một dòng trong công thức. Giá vốn và tồn kho không lấy từ client.

## Áp dụng migration

Agent chưa áp dụng migration trên database thật. Dừng API cũ, chạy từ root dự án:

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

Cần version **9**, đúng database API. Chạy qua Goose, không dán toàn bộ SQL vào pgAdmin vì có cả Up và Down. Không bootstrap/reset dữ liệu. Rollback bị chặn khi đã có công thức/snapshot để tránh mất lịch sử.

Nguyên liệu cũ phải xác nhận tồn đầu kỳ bằng Kiểm kho trước khi xuất bán; không bỏ qua quy tắc migration 7. Thử công thức 0.125 L × 2 ly thì tồn giảm 0.25 L.

Xem [ADR-012](./ADR-012-recipe-stock-snapshots.md).

## Kết quả kiểm tra thực tế

- `npm run lint` (TypeScript, chưa phải ESLint), `npm run build`: đạt. Bundle vẫn có cảnh báo lớn hơn 500 kB, khoảng 697 kB trước gzip.
- `npm test`: 59 bài đạt / 18 file.
- `go vet ./...`, `go build ./...`, `make sqlc`: đạt.
- Toàn bộ Go tests chạy với `-race` trong PostgreSQL fixture: đạt. Có test RLS đọc chéo tenant, quyền ghi, idempotency/version, snapshot size/default, thiếu công thức theo đơn vị, số lượng thập phân, công nợ, thiếu nguyên liệu rollback và hai quầy tranh tồn cuối.
- Bộ browser API đầy đủ: 35 bài đạt / 1 skip. Bài skip là giới hạn CSS mobile cũ ở phiếu nhập, không liên quan BOM.
- Sau khi thêm snapshot lịch sử lượt gọi món và test rollback/legacy, chạy lại toàn bộ Go race tests và 2 browser test BOM desktop/mobile: đạt.
- Mock flow + visual regression: 30 bài đạt, gồm 18 ảnh baseline desktop/mobile không thay đổi; không cập nhật baseline.
- Migration 9 up/down/up trên PostgreSQL native tạm 18.3 đạt; rollback có dữ liệu công thức bị chặn như thiết kế. Chưa chạy riêng PostgreSQL 16 hoặc CI từ xa; database thật chưa được cập nhật.
- `git diff --check`: đạt.

## Việc tiếp theo cho agent

1. Nhận câu trả lời cho đề xuất UI FREEZE đã gửi: thêm mục công thức vào popup món, hoặc chỉ giữ backend trước. Không tự coi im lặng là đồng ý.
2. Nếu được duyệt, dùng repository công thức hiện có để xây editor; chỉ tải tìm kiếm nguyên liệu theo nhu cầu, không tải toàn bộ kho khi mở popup. Giữ nguyên các phần UI khác và kiểm tra baseline.
3. Editor cần lưu product trước để có UUID, rồi lưu công thức bằng version/Idempotency-Key ổn định khi retry; báo rõ nếu product đã lưu nhưng công thức chưa lưu, không đóng popup và giả vờ thành công.
4. Khai báo công thức và xác nhận tồn đầu kỳ cho dữ liệu thật sau khi người dùng áp dụng migration 9; không tự suy đoán nguyên liệu/định lượng cho món hiện có.
