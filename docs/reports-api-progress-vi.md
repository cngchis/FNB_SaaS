# Tiến độ Dashboard và Báo cáo — 13/11/2026

## Đã triển khai

- API `GET /api/v1/reports/summary`: khoảng ngày Việt Nam, nhóm theo giờ/ngày, giới hạn một ngày theo giờ hoặc 366 ngày theo ngày.
- Phạm vi luôn là tenant và cửa hàng trong JWT. Owner/manager/cashier được xem; kitchen bị chặn. Không tự gộp các chi nhánh.
- Một câu SQL tổng hợp doanh thu, giảm giá, số hóa đơn, khách đã mua, công nợ, tiền đã thu của tập hóa đơn, giá vốn/lợi nhuận, khoản thanh toán, quỹ, nhóm hàng và mười hóa đơn gần nhất.
- Dashboard: ba KPI bán hàng, biểu đồ 24 giờ/ngày trong tháng và hóa đơn gần đây đã nối API. Tồn kho sắp hết hiển thị `—` vì chưa có sổ kho.
- Báo cáo bán hàng: KPI, ba đường doanh thu/giá vốn/lợi nhuận và chi tiết theo nhóm hàng dùng dữ liệu server.
- Báo cáo tài chính: doanh thu, giá vốn, chi phí vận hành từ phiếu chi đã ghi sổ, lợi nhuận gộp và biểu đồ tiền thu thực tế từ sổ quỹ.
- Báo cáo cuối ngày: doanh thu, tiền mặt/chuyển khoản đã thu và biểu đồ số giao dịch. Mặc định kỳ hôm nay trong API mode. Chưa có ca thực tế, chênh lệch kiểm đếm hoặc chốt ca; các trường này để `—`, nút chốt ca bị vô hiệu hóa.
- Bộ lọc kỳ và xuất CSV dùng cùng dữ liệu báo cáo. Cache phân tách tenant/store/user, tự làm mới sau 30 giây; chuyển bộ lọc không lấy dữ liệu demo để bù.
- Không sửa CSS, route, baseline ảnh hoặc cài thư viện mới. Mock mode giữ nguyên hình ảnh trước đây.

## Quy tắc số liệu

Doanh thu lấy theo thời điểm **phát hành hóa đơn lần đầu**, không phải giờ đến. Khoản thu lấy theo thời điểm giao dịch. Hóa đơn trả nhiều lần chỉ tạo doanh thu một lần; tiền thừa không được tính là khoản thu. Công nợ là dư nợ hiện tại của các hóa đơn được chọn, vì vậy có thể thay đổi sau kỳ báo cáo khi khách trả thêm.

Giá vốn dùng snapshot tại dòng hàng lúc bán. Nếu một món chưa có snapshot giá vốn, tổng giá vốn/lợi nhuận và điểm biểu đồ tương ứng chưa xác định, không giả định bằng 0. Các đoạn đường bị ngắt tại điểm chưa biết. Giá vốn hàng chế biến còn phụ thuộc BOM sau này.

Giảm giá được phân bổ nguyên đồng cho dòng hàng theo tỷ lệ, phần dư theo thứ tự phần lẻ và ID. Tổng nhóm hàng khớp doanh thu thuần. Nhóm hàng lấy phân loại hiện tại; chưa có snapshot nhóm trong lịch sử. Số khách chỉ đếm khách có hồ sơ, không coi mỗi lượt khách lẻ là một người riêng.

## Phần chưa nối hoặc cần duyệt

1. **Donut phương thức thanh toán:** API đã có số thực thu, nhưng nhãn cũ gọi là “doanh thu”. Đã hỏi người dùng cho phép đổi hai nhãn thành “Tỷ trọng tiền thực thu” / “Tổng tiền thực thu”. Trong khi chưa được duyệt, API mode để số liệu donut `—`; không gán tiền thực thu vào nhãn doanh thu.
2. **Báo cáo hàng hóa:** vẫn demo, có thông báo trang chưa nối API. Cần stock movements, phiếu nhập/kiểm kho và BOM trước khi báo cáo tồn kho thật.
3. **Chốt ca:** cần model ca, kiểm đếm tiền và đối soát bền vững; không giả vờ ca đã lưu trên server.
4. Không hỗ trợ hoàn tiền/điều chỉnh có kiểm toán hoặc ngân hàng thật ở giai đoạn này.
5. Chưa xác minh trên PostgreSQL 16 / GitHub Actions thực tế. Kiểm tra local dùng PostgreSQL 18.3 riêng biệt.

## Chạy trên máy hiện tại

Không có migration mới. Database cần đã ở version 4. Khởi động lại API từ root dự án:

```bash
make api-run
```

Terminal khác chạy frontend API mode:

```bash
VITE_USE_MOCK=false npm run dev
```

Đăng nhập lại nếu tải lại trình duyệt. Chọn đúng ngày phát hành hóa đơn để xem Dashboard; báo cáo bán hàng/tài chính dùng bộ lọc kỳ có sẵn.

## Bàn giao

- SQL: [reports.sql](../apps/api/sql/reports.sql).
- API: [handler.go](../apps/api/internal/modules/report/handler.go).
- Repository/hook frontend: [reports.ts](../src/api/reports.ts).
- Mapping dữ liệu/đường biểu đồ: [reportPresentation.ts](../src/api/reportPresentation.ts).
- Quyết định và giới hạn: [ADR-007](./ADR-007-report-read-model.md).
- Tests: [reports_integration_test.go](../apps/api/tests/reports_integration_test.go), [reports.test.ts](../src/api/reports.test.ts), [api.spec.ts](../tests/browser/api.spec.ts).

## Kết quả kiểm chứng ngày 13/11/2026

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run lint` | PASS; script hiện tại là TypeScript, không phải ESLint |
| `npm test` | PASS: 32 test / 8 file |
| `npm run build` | PASS; còn cảnh báo bundle JS khoảng 638 kB, lớn hơn 500 kB |
| `go vet ./...`, `go build ./...` | PASS |
| `RUN_API_TESTS=true bash scripts/test-web-api-local.sh` | PASS: Go race tests và 14 E2E desktop/mobile |
| `npm run test:visual` | PASS: 14 ảnh, 0 pixel khác baseline; không cập nhật baseline |
| `git diff --check` | PASS |

Các kiểm thử API chạy trên PostgreSQL native 18.3 tạm; không dùng database hay mật khẩu thực của người dùng. PostgreSQL 16 và GitHub Actions chưa được chạy thực tế.

Đã kiểm tra tenant/store isolation, quyền kitchen, thanh toán nhiều lần và tiền thừa, phân bổ giảm giá, ranh giới ngày Việt Nam, snapshot giá vốn, giá vốn chưa biết và số vượt giới hạn chính xác của JavaScript. PostgreSQL numeric dạng `12000.000` được chuẩn hóa thành số nguyên JSON `12000` bằng số hữu tỉ chính xác, không chuyển tiền qua float; từ chối phần lẻ hoặc giá trị vượt giới hạn.

Một lượt trước đã lỗi ở test đăng nhập sau khi tải lại URL và một lượt phát hiện định dạng numeric có phần thập phân. Đã sửa luồng test để đăng nhập lại theo cơ chế phiên trong bộ nhớ, chuẩn hóa định dạng số nguyên API và chạy lại toàn bộ thành công. Khi xác minh, giữ source ổn định và chạy từng bộ Playwright riêng để tránh dev-server reload làm mất phiên.

Không tự commit/push.
