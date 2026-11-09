export type ManagementValue = string | number
export type ManagementRow = Record<string, ManagementValue>

export type ManagementField = {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'tel'
  required?: boolean
}

export type ManagementModule = {
  id: string
  path: string
  title: string
  description: string
  entity: string
  searchPlaceholder: string
  columns: { key: string; label: string; type?: 'currency' | 'status' | 'date' }[]
  fields: ManagementField[]
  rows: ManagementRow[]
  filters?: string[]
  metrics: { label: string; value: string; hint: string }[]
}

export const managementModules: ManagementModule[] = [
  {
    id: 'menu-items', path: '/management/menu-items', title: 'Danh sách món', description: 'Quản lý thực đơn, giá bán và trạng thái phục vụ.', entity: 'món', searchPlaceholder: 'Tìm tên món hoặc mã món...', filters: ['Đang bán', 'Tạm hết'],
    columns: [{ key: 'name', label: 'Tên món' }, { key: 'code', label: 'Mã món' }, { key: 'category', label: 'Danh mục' }, { key: 'price', label: 'Giá bán', type: 'currency' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'name', label: 'Tên món', required: true }, { key: 'code', label: 'Mã món', required: true }, { key: 'category', label: 'Danh mục', required: true }, { key: 'price', label: 'Giá bán (₫)', type: 'number', required: true }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ name: 'Cà phê sữa', code: 'CF-001', category: 'Cà phê', price: 35000, status: 'Đang bán' }, { name: 'Trà đào cam sả', code: 'TR-004', category: 'Trà', price: 42000, status: 'Đang bán' }, { name: 'Bạc xỉu', code: 'CF-003', category: 'Cà phê', price: 45000, status: 'Đang bán' }, { name: 'Trà sữa', code: 'TR-006', category: 'Trà', price: 30000, status: 'Tạm hết' }, { name: 'Croissant', code: 'BK-001', category: 'Bánh', price: 28000, status: 'Đang bán' }],
    metrics: [{ label: 'Tổng món', value: '36', hint: '12 danh mục' }, { label: 'Đang bán', value: '32', hint: 'Sẵn sàng phục vụ' }, { label: 'Tạm hết', value: '4', hint: 'Cần cập nhật' }],
  },
  {
    id: 'suppliers', path: '/management/suppliers', title: 'Nhà cung cấp', description: 'Quản lý đối tác và công nợ nhập hàng.', entity: 'nhà cung cấp', searchPlaceholder: 'Tìm tên, mã hoặc số điện thoại...', filters: ['Đang hợp tác', 'Ngừng hợp tác'],
    columns: [{ key: 'name', label: 'Nhà cung cấp' }, { key: 'contact', label: 'Người liên hệ' }, { key: 'phone', label: 'Điện thoại' }, { key: 'debt', label: 'Công nợ', type: 'currency' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'name', label: 'Tên nhà cung cấp', required: true }, { key: 'contact', label: 'Người liên hệ' }, { key: 'phone', label: 'Số điện thoại', type: 'tel', required: true }, { key: 'debt', label: 'Công nợ (₫)', type: 'number' }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ name: 'Công ty Cà phê Tây Nguyên', contact: 'Nguyễn Văn Lâm', phone: '0903 456 123', debt: 2480000, status: 'Đang hợp tác' }, { name: 'Nông sản An Nhiên', contact: 'Trần Thị Mai', phone: '0918 220 315', debt: 0, status: 'Đang hợp tác' }, { name: 'Lò bánh Bảo Ngọc', contact: 'Phạm Minh Tâm', phone: '0908 661 092', debt: 860000, status: 'Đang hợp tác' }, { name: 'Bao bì Minh Phát', contact: 'Lê Quốc Huy', phone: '0986 003 221', debt: 0, status: 'Ngừng hợp tác' }],
    metrics: [{ label: 'Nhà cung cấp', value: '18', hint: '3 đối tác mới tháng này' }, { label: 'Đang hợp tác', value: '15', hint: 'Đang cung ứng' }, { label: 'Công nợ phải trả', value: '3.340.000 ₫', hint: 'Từ 2 nhà cung cấp' }],
  },
  {
    id: 'purchases', path: '/management/purchases', title: 'Nhập hàng', description: 'Theo dõi phiếu nhập và chi phí hàng hóa đầu vào.', entity: 'phiếu nhập', searchPlaceholder: 'Tìm mã phiếu hoặc nhà cung cấp...', filters: ['Hoàn tất', 'Chờ thanh toán', 'Đã hủy'],
    columns: [{ key: 'code', label: 'Mã phiếu' }, { key: 'date', label: 'Ngày nhập', type: 'date' }, { key: 'supplier', label: 'Nhà cung cấp' }, { key: 'items', label: 'Sản phẩm' }, { key: 'amount', label: 'Tổng tiền', type: 'currency' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'code', label: 'Mã phiếu', required: true }, { key: 'date', label: 'Ngày nhập', type: 'date', required: true }, { key: 'supplier', label: 'Nhà cung cấp', required: true }, { key: 'items', label: 'Số mặt hàng', type: 'number', required: true }, { key: 'amount', label: 'Tổng tiền (₫)', type: 'number', required: true }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ code: 'PN-0086', date: '05/11/2026', supplier: 'Công ty Cà phê Tây Nguyên', items: 5, amount: 3250000, status: 'Chờ thanh toán' }, { code: 'PN-0085', date: '04/11/2026', supplier: 'Lò bánh Bảo Ngọc', items: 3, amount: 1840000, status: 'Hoàn tất' }, { code: 'PN-0084', date: '02/11/2026', supplier: 'Nông sản An Nhiên', items: 8, amount: 2960000, status: 'Hoàn tất' }, { code: 'PN-0083', date: '01/11/2026', supplier: 'Bao bì Minh Phát', items: 2, amount: 750000, status: 'Đã hủy' }],
    metrics: [{ label: 'Phiếu nhập tháng này', value: '26', hint: 'Từ 12 nhà cung cấp' }, { label: 'Giá trị nhập', value: '48.650.000 ₫', hint: 'Tháng 11/2026' }, { label: 'Chưa thanh toán', value: '3.250.000 ₫', hint: '1 phiếu đang chờ' }],
  },
  {
    id: 'invoices', path: '/management/invoices', title: 'Hóa đơn', description: 'Tra cứu giao dịch và trạng thái thanh toán tại cửa hàng.', entity: 'hóa đơn', searchPlaceholder: 'Tìm mã hóa đơn hoặc khách hàng...', filters: ['Đã thanh toán', 'Chờ thanh toán', 'Đã hủy'],
    columns: [{ key: 'code', label: 'Mã hóa đơn' }, { key: 'date', label: 'Thời gian', type: 'date' }, { key: 'customer', label: 'Khách hàng' }, { key: 'method', label: 'Thanh toán' }, { key: 'amount', label: 'Tổng tiền', type: 'currency' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'code', label: 'Mã hóa đơn', required: true }, { key: 'date', label: 'Thời gian', required: true }, { key: 'customer', label: 'Khách hàng', required: true }, { key: 'method', label: 'Phương thức', required: true }, { key: 'amount', label: 'Tổng tiền (₫)', type: 'number', required: true }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ code: 'MOC-0188', date: '11:03 · 05/11', customer: 'Khách lẻ', method: 'QR chuyển khoản', amount: 140000, status: 'Chờ thanh toán' }, { code: 'MOC-0186', date: '10:42 · 05/11', customer: 'Khách lẻ', method: 'QR chuyển khoản', amount: 245000, status: 'Đã thanh toán' }, { code: 'MOC-0185', date: '10:39 · 05/11', customer: 'Nguyễn Minh', method: 'Tiền mặt', amount: 89000, status: 'Đã thanh toán' }, { code: 'MOC-0184', date: '10:32 · 05/11', customer: 'Khách lẻ', method: 'QR chuyển khoản', amount: 132000, status: 'Đã thanh toán' }],
    metrics: [{ label: 'Đơn hàng hôm nay', value: '186', hint: 'Tăng 8,2% so với hôm qua' }, { label: 'Doanh thu', value: '12.850.000 ₫', hint: 'Trong ngày hôm nay' }, { label: 'Chờ thanh toán', value: '3', hint: 'Cần theo dõi' }],
  },
  {
    id: 'returns', path: '/management/returns', title: 'Trả hàng', description: 'Tiếp nhận yêu cầu trả hàng và hoàn tiền cho khách.', entity: 'phiếu trả hàng', searchPlaceholder: 'Tìm mã trả hàng hoặc hóa đơn...', filters: ['Đã hoàn tiền', 'Chờ xử lý', 'Từ chối'],
    columns: [{ key: 'code', label: 'Mã trả hàng' }, { key: 'invoice', label: 'Hóa đơn gốc' }, { key: 'customer', label: 'Khách hàng' }, { key: 'reason', label: 'Lý do' }, { key: 'amount', label: 'Hoàn tiền', type: 'currency' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'code', label: 'Mã trả hàng', required: true }, { key: 'invoice', label: 'Hóa đơn gốc', required: true }, { key: 'customer', label: 'Khách hàng', required: true }, { key: 'reason', label: 'Lý do trả hàng', required: true }, { key: 'amount', label: 'Số tiền hoàn (₫)', type: 'number', required: true }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ code: 'TH-0023', invoice: 'MOC-0178', customer: 'Lê Ngọc Anh', reason: 'Sản phẩm lỗi', amount: 120000, status: 'Chờ xử lý' }, { code: 'TH-0022', invoice: 'MOC-0171', customer: 'Khách lẻ', reason: 'Đổi sản phẩm', amount: 45000, status: 'Đã hoàn tiền' }, { code: 'TH-0021', invoice: 'MOC-0165', customer: 'Phạm Hồng', reason: 'Khách đổi ý', amount: 89000, status: 'Từ chối' }],
    metrics: [{ label: 'Yêu cầu tháng này', value: '23', hint: '5 yêu cầu trong tuần' }, { label: 'Đã hoàn tiền', value: '18', hint: '78% yêu cầu' }, { label: 'Tiền đã hoàn', value: '2.460.000 ₫', hint: 'Trong tháng 11' }],
  },
  {
    id: 'customers', path: '/management/customers', title: 'Khách hàng', description: 'Quản lý hồ sơ, lịch sử mua hàng và quyền lợi khách hàng.', entity: 'khách hàng', searchPlaceholder: 'Tìm tên, số điện thoại...', filters: ['Thành viên', 'Khách mới'],
    columns: [{ key: 'name', label: 'Khách hàng' }, { key: 'phone', label: 'Điện thoại' }, { key: 'segment', label: 'Nhóm khách' }, { key: 'points', label: 'Điểm tích lũy' }, { key: 'orders', label: 'Đơn hàng' }, { key: 'spent', label: 'Chi tiêu', type: 'currency' }],
    fields: [{ key: 'name', label: 'Tên khách hàng', required: true }, { key: 'phone', label: 'Số điện thoại', type: 'tel', required: true }, { key: 'segment', label: 'Nhóm khách hàng', required: true }, { key: 'points', label: 'Điểm tích lũy', type: 'number' }, { key: 'orders', label: 'Số đơn hàng', type: 'number' }, { key: 'spent', label: 'Tổng chi tiêu (₫)', type: 'number' }],
    rows: [{ name: 'Nguyễn Minh Anh', phone: '0908 111 265', segment: 'Thân thiết', points: 1240, orders: 32, spent: 4860000 }, { name: 'Trần Hoàng Nam', phone: '0912 556 780', segment: 'VIP', points: 3860, orders: 84, spent: 12650000 }, { name: 'Lê Ngọc Anh', phone: '0934 228 105', segment: 'Thành viên', points: 420, orders: 12, spent: 1950000 }, { name: 'Phạm Hồng Hà', phone: '0981 560 312', segment: 'Khách mới', points: 0, orders: 1, spent: 89000 }, { name: 'Đỗ Thu Trang', phone: '0902 410 756', segment: 'Thân thiết', points: 860, orders: 21, spent: 3260000 }, { name: 'Võ Tuấn Kiệt', phone: '0911 230 669', segment: 'Thành viên', points: 230, orders: 8, spent: 1040000 }, { name: 'Bùi Thanh Tâm', phone: '0977 055 310', segment: 'Khách mới', points: 0, orders: 1, spent: 132000 }],
    metrics: [{ label: 'Tổng khách hàng', value: '2.486', hint: 'Tại tất cả chi nhánh' }, { label: 'Khách mới tháng này', value: '186', hint: 'Tăng 12,4%' }, { label: 'Thành viên tích cực', value: '1.320', hint: 'Có giao dịch 90 ngày qua' }],
  },
  {
    id: 'customer-groups', path: '/management/customer-groups', title: 'Nhóm khách hàng', description: 'Phân nhóm khách hàng để quản lý ưu đãi và chăm sóc.', entity: 'nhóm khách hàng', searchPlaceholder: 'Tìm tên nhóm khách hàng...',
    columns: [{ key: 'name', label: 'Tên nhóm' }, { key: 'members', label: 'Số thành viên' }, { key: 'condition', label: 'Điều kiện' }, { key: 'benefit', label: 'Ưu đãi' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'name', label: 'Tên nhóm', required: true }, { key: 'members', label: 'Số thành viên', type: 'number' }, { key: 'condition', label: 'Điều kiện tham gia', required: true }, { key: 'benefit', label: 'Ưu đãi' }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ name: 'VIP', members: 124, condition: 'Chi tiêu từ 10 triệu', benefit: 'Giảm 10%', status: 'Đang hoạt động' }, { name: 'Thân thiết', members: 684, condition: 'Từ 10 đơn hàng', benefit: 'Tích điểm x2', status: 'Đang hoạt động' }, { name: 'Thành viên', members: 512, condition: 'Đăng ký tài khoản', benefit: 'Tích điểm cơ bản', status: 'Đang hoạt động' }, { name: 'Khách mới', members: 186, condition: 'Đơn hàng đầu tiên', benefit: 'Voucher 20.000 ₫', status: 'Đang hoạt động' }],
    metrics: [{ label: 'Nhóm khách', value: '4', hint: 'Đang áp dụng' }, { label: 'Thành viên', value: '1.506', hint: 'Trong các nhóm' }, { label: 'Ưu đãi đang chạy', value: '6', hint: 'Theo nhóm khách hàng' }],
  },
  {
    id: 'employees', path: '/management/employees', title: 'Danh sách nhân viên', description: 'Quản lý nhân sự, vai trò và trạng thái làm việc.', entity: 'nhân viên', searchPlaceholder: 'Tìm tên, mã nhân viên...', filters: ['Đang làm việc', 'Tạm nghỉ'],
    columns: [{ key: 'name', label: 'Nhân viên' }, { key: 'code', label: 'Mã nhân viên' }, { key: 'role', label: 'Chức vụ' }, { key: 'phone', label: 'Điện thoại' }, { key: 'branch', label: 'Chi nhánh' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'name', label: 'Họ và tên', required: true }, { key: 'code', label: 'Mã nhân viên', required: true }, { key: 'role', label: 'Chức vụ', required: true }, { key: 'phone', label: 'Số điện thoại', type: 'tel' }, { key: 'branch', label: 'Chi nhánh', required: true }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ name: 'Nguyễn Hoàng Long', code: 'NV-001', role: 'Quản lý cửa hàng', phone: '0903 112 458', branch: 'Mộc Store · Q1', status: 'Đang làm việc' }, { name: 'Trần Thu Hà', code: 'NV-002', role: 'Thu ngân', phone: '0914 220 875', branch: 'Mộc Store · Q1', status: 'Đang làm việc' }, { name: 'Lê Quốc Bảo', code: 'NV-003', role: 'Pha chế', phone: '0938 661 430', branch: 'Mộc Store · Q1', status: 'Đang làm việc' }, { name: 'Phạm Mỹ Linh', code: 'NV-004', role: 'Phục vụ', phone: '0982 340 121', branch: 'Mộc Store · Q1', status: 'Tạm nghỉ' }, { name: 'Đặng Gia Hân', code: 'NV-005', role: 'Thu ngân', phone: '0918 431 223', branch: 'Mộc Store · Q3', status: 'Đang làm việc' }, { name: 'Phan Đức Anh', code: 'NV-006', role: 'Pha chế', phone: '0948 125 776', branch: 'Mộc Store · Q3', status: 'Đang làm việc' }, { name: 'Ngô Minh Châu', code: 'NV-007', role: 'Phục vụ', phone: '0966 420 185', branch: 'Mộc Store · Q7', status: 'Đang làm việc' }],
    metrics: [{ label: 'Tổng nhân viên', value: '18', hint: 'Tại 3 chi nhánh' }, { label: 'Đang làm việc', value: '16', hint: 'Có thể xếp lịch' }, { label: 'Ca hôm nay', value: '12', hint: '4 ca đang diễn ra' }],
  },
  {
    id: 'schedules', path: '/management/schedules', title: 'Lịch làm việc', description: 'Phân ca và theo dõi lịch làm việc của nhân viên.', entity: 'ca làm việc', searchPlaceholder: 'Tìm nhân viên hoặc ca làm...', filters: ['Sáng', 'Chiều', 'Tối'],
    columns: [{ key: 'date', label: 'Ngày', type: 'date' }, { key: 'employee', label: 'Nhân viên' }, { key: 'shift', label: 'Ca làm' }, { key: 'time', label: 'Thời gian' }, { key: 'position', label: 'Vị trí' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'date', label: 'Ngày làm', type: 'date', required: true }, { key: 'employee', label: 'Nhân viên', required: true }, { key: 'shift', label: 'Ca làm', required: true }, { key: 'time', label: 'Thời gian', required: true }, { key: 'position', label: 'Vị trí', required: true }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ date: '05/11/2026', employee: 'Trần Thu Hà', shift: 'Sáng', time: '07:00 – 13:00', position: 'Thu ngân', status: 'Đã xác nhận' }, { date: '05/11/2026', employee: 'Lê Quốc Bảo', shift: 'Chiều', time: '13:00 – 19:00', position: 'Pha chế', status: 'Đã xác nhận' }, { date: '05/11/2026', employee: 'Phạm Mỹ Linh', shift: 'Tối', time: '18:00 – 23:00', position: 'Phục vụ', status: 'Chờ xác nhận' }, { date: '06/11/2026', employee: 'Nguyễn Hoàng Long', shift: 'Sáng', time: '07:00 – 15:00', position: 'Quản lý', status: 'Đã xác nhận' }],
    metrics: [{ label: 'Ca làm tuần này', value: '64', hint: 'Tại 3 chi nhánh' }, { label: 'Chờ xác nhận', value: '4', hint: 'Cần nhân viên phản hồi' }, { label: 'Thiếu nhân sự', value: '2', hint: 'Ca tối thứ Sáu' }],
  },
  {
    id: 'attendance', path: '/management/attendance', title: 'Chấm công', description: 'Theo dõi giờ vào ca, tan ca và tình trạng đi làm.', entity: 'bản ghi chấm công', searchPlaceholder: 'Tìm tên hoặc mã nhân viên...', filters: ['Đúng giờ', 'Đi muộn', 'Vắng mặt'],
    columns: [{ key: 'employee', label: 'Nhân viên' }, { key: 'date', label: 'Ngày', type: 'date' }, { key: 'checkIn', label: 'Giờ vào' }, { key: 'checkOut', label: 'Giờ ra' }, { key: 'hours', label: 'Giờ công' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'employee', label: 'Nhân viên', required: true }, { key: 'date', label: 'Ngày', type: 'date', required: true }, { key: 'checkIn', label: 'Giờ vào' }, { key: 'checkOut', label: 'Giờ ra' }, { key: 'hours', label: 'Số giờ', type: 'number' }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ employee: 'Trần Thu Hà · NV-002', date: '05/11/2026', checkIn: '06:56', checkOut: '—', hours: 0, status: 'Đúng giờ' }, { employee: 'Lê Quốc Bảo · NV-003', date: '05/11/2026', checkIn: '13:08', checkOut: '—', hours: 0, status: 'Đi muộn' }, { employee: 'Nguyễn Hoàng Long · NV-001', date: '05/11/2026', checkIn: '06:52', checkOut: '15:02', hours: 8, status: 'Đúng giờ' }, { employee: 'Phạm Mỹ Linh · NV-004', date: '05/11/2026', checkIn: '—', checkOut: '—', hours: 0, status: 'Vắng mặt' }],
    metrics: [{ label: 'Có mặt hôm nay', value: '14/16', hint: '87,5% nhân sự' }, { label: 'Đi muộn', value: '2', hint: 'Trong ngày hôm nay' }, { label: 'Tổng giờ công', value: '128 giờ', hint: 'Trong tuần này' }],
  },
  {
    id: 'payroll', path: '/management/payroll', title: 'Bảng lương', description: 'Tổng hợp lương, phụ cấp và khoản khấu trừ theo kỳ.', entity: 'bảng lương', searchPlaceholder: 'Tìm tên nhân viên...', filters: ['Chưa thanh toán', 'Đã thanh toán'],
    columns: [{ key: 'employee', label: 'Nhân viên' }, { key: 'period', label: 'Kỳ lương' }, { key: 'hours', label: 'Giờ công' }, { key: 'base', label: 'Lương cơ bản', type: 'currency' }, { key: 'bonus', label: 'Phụ cấp', type: 'currency' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'employee', label: 'Nhân viên', required: true }, { key: 'period', label: 'Kỳ lương', required: true }, { key: 'hours', label: 'Giờ công', type: 'number' }, { key: 'base', label: 'Lương cơ bản (₫)', type: 'number', required: true }, { key: 'bonus', label: 'Phụ cấp (₫)', type: 'number' }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ employee: 'Trần Thu Hà', period: '10/2026', hours: 176, base: 8800000, bonus: 600000, status: 'Chưa thanh toán' }, { employee: 'Lê Quốc Bảo', period: '10/2026', hours: 184, base: 9200000, bonus: 400000, status: 'Đã thanh toán' }, { employee: 'Nguyễn Hoàng Long', period: '10/2026', hours: 208, base: 15600000, bonus: 1200000, status: 'Đã thanh toán' }],
    metrics: [{ label: 'Quỹ lương tháng 10', value: '168.400.000 ₫', hint: '18 nhân viên' }, { label: 'Đã thanh toán', value: '142.800.000 ₫', hint: '85% quỹ lương' }, { label: 'Chưa thanh toán', value: '25.600.000 ₫', hint: 'Hạn 07/11/2026' }],
  },
  {
    id: 'commissions', path: '/management/commissions', title: 'Hoa hồng', description: 'Theo dõi doanh số và hoa hồng theo nhân viên.', entity: 'mức hoa hồng', searchPlaceholder: 'Tìm nhân viên hoặc mã...', filters: ['Đã chốt', 'Tạm tính'],
    columns: [{ key: 'employee', label: 'Nhân viên' }, { key: 'period', label: 'Kỳ tính' }, { key: 'sales', label: 'Doanh số', type: 'currency' }, { key: 'rate', label: 'Tỷ lệ' }, { key: 'commission', label: 'Hoa hồng', type: 'currency' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'employee', label: 'Nhân viên', required: true }, { key: 'period', label: 'Kỳ tính', required: true }, { key: 'sales', label: 'Doanh số (₫)', type: 'number', required: true }, { key: 'rate', label: 'Tỷ lệ (%)', type: 'number', required: true }, { key: 'commission', label: 'Hoa hồng (₫)', type: 'number', required: true }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ employee: 'Trần Thu Hà', period: '11/2026', sales: 12850000, rate: '1,5%', commission: 192750, status: 'Tạm tính' }, { employee: 'Lê Quốc Bảo', period: '11/2026', sales: 9640000, rate: '1%', commission: 96400, status: 'Tạm tính' }, { employee: 'Nguyễn Hoàng Long', period: '10/2026', sales: 68240000, rate: '2%', commission: 1364800, status: 'Đã chốt' }],
    metrics: [{ label: 'Hoa hồng tháng này', value: '1.486.000 ₫', hint: 'Tạm tính' }, { label: 'Doanh số nhân viên', value: '96.240.000 ₫', hint: 'Tháng 11/2026' }, { label: 'Đã chốt', value: '4', hint: 'Bảng hoa hồng tháng 10' }],
  },
  {
    id: 'employee-settings', path: '/management/employee-settings', title: 'Thiết lập nhân viên', description: 'Quản lý chức vụ, phân quyền và chính sách nhân viên.', entity: 'thiết lập', searchPlaceholder: 'Tìm chức vụ hoặc chính sách...',
    columns: [{ key: 'name', label: 'Thiết lập' }, { key: 'scope', label: 'Phạm vi' }, { key: 'description', label: 'Mô tả' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'name', label: 'Tên thiết lập', required: true }, { key: 'scope', label: 'Phạm vi', required: true }, { key: 'description', label: 'Mô tả' }, { key: 'status', label: 'Trạng thái', required: true }],
    rows: [{ name: 'Quản lý cửa hàng', scope: 'Toàn bộ dữ liệu chi nhánh', description: 'Quản lý hàng hóa, nhân viên và báo cáo', status: 'Đang áp dụng' }, { name: 'Thu ngân', scope: 'POS và hóa đơn', description: 'Tạo đơn, thanh toán, tra cứu hóa đơn', status: 'Đang áp dụng' }, { name: 'Pha chế', scope: 'Danh sách món', description: 'Xem và cập nhật tình trạng món', status: 'Đang áp dụng' }],
    metrics: [{ label: 'Chức vụ', value: '5', hint: 'Đang sử dụng' }, { label: 'Nhân viên', value: '18', hint: 'Đã được phân quyền' }, { label: 'Chính sách', value: '6', hint: 'Đang áp dụng' }],
  },
  {
    id: 'cashbook', path: '/management/cashbook', title: 'Sổ quỹ', description: 'Theo dõi thu, chi và số dư tiền mặt tại cửa hàng.', entity: 'phiếu thu chi', searchPlaceholder: 'Tìm mã phiếu hoặc nội dung...', filters: ['Thu', 'Chi'],
    columns: [{ key: 'code', label: 'Mã phiếu' }, { key: 'date', label: 'Thời gian', type: 'date' }, { key: 'category', label: 'Khoản mục' }, { key: 'note', label: 'Nội dung' }, { key: 'amount', label: 'Số tiền', type: 'currency' }, { key: 'type', label: 'Loại', type: 'status' }],
    fields: [{ key: 'code', label: 'Mã phiếu', required: true }, { key: 'date', label: 'Ngày ghi sổ', type: 'date', required: true }, { key: 'category', label: 'Khoản mục', required: true }, { key: 'note', label: 'Nội dung', required: true }, { key: 'amount', label: 'Số tiền (₫)', type: 'number', required: true }, { key: 'type', label: 'Loại phiếu', required: true }],
    rows: [{ code: 'PT-0348', date: '05/11 · 11:03', category: 'Bán hàng', note: 'Thu tiền mặt từ POS', amount: 1850000, type: 'Thu' }, { code: 'PC-0204', date: '05/11 · 09:15', category: 'Nhập hàng', note: 'Thanh toán nguyên liệu', amount: 860000, type: 'Chi' }, { code: 'PT-0347', date: '04/11 · 21:30', category: 'Kết ca', note: 'Bàn giao tiền cuối ngày', amount: 4280000, type: 'Thu' }, { code: 'PC-0203', date: '04/11 · 15:20', category: 'Vận hành', note: 'Mua vật dụng cửa hàng', amount: 345000, type: 'Chi' }],
    metrics: [{ label: 'Số dư đầu kỳ', value: '18.450.000 ₫', hint: 'Ngày 01/11/2026' }, { label: 'Tổng thu', value: '46.280.000 ₫', hint: 'Từ 01/11 đến nay' }, { label: 'Tổng chi', value: '24.620.000 ₫', hint: 'Từ 01/11 đến nay' }],
  },
]
