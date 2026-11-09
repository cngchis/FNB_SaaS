export type ManagementValue = string | number | boolean
export type ManagementRow = Record<string, ManagementValue>

export type ManagementField = {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'tel' | 'select' | 'checkbox' | 'textarea' | 'bank-picker' | 'multi-select'
  required?: boolean
  options?: string[]
  readOnly?: boolean
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
    columns: [{ key: 'code', label: 'Mã hàng' }, { key: 'name', label: 'Tên hàng' }, { key: 'category', label: 'Nhóm hàng' }, { key: 'productType', label: 'Loại hàng' }, { key: 'menuType', label: 'Loại thực đơn' }, { key: 'price', label: 'Giá bán', type: 'currency' }, { key: 'stock', label: 'Tồn kho' }, { key: 'visible', label: 'Hiển thị' }],
    fields: [
      { key: 'code', label: 'Mã hàng', readOnly: true, required: true }, { key: 'name', label: 'Tên hàng', required: true },
      { key: 'category', label: 'Nhóm hàng', type: 'select', options: ['Cà phê', 'Cacao', 'Trà', 'Bia', 'Đồ ăn', 'Khác'], required: true },
      { key: 'productType', label: 'Loại hàng', type: 'select', options: ['Hàng hóa thường', 'Chế biến'], required: true },
      { key: 'menuType', label: 'Loại thực đơn', type: 'select', options: ['Đồ uống', 'Đồ ăn', 'Khác'], required: true },
      { key: 'price', label: 'Giá bán (₫)', type: 'number', required: true }, { key: 'status', label: 'Trạng thái', type: 'select', options: ['Đang bán', 'Tạm hết'], required: true },
      { key: 'visible', label: 'Hiển thị trong thực đơn', type: 'checkbox' }, { key: 'extra', label: 'Là món thêm', type: 'checkbox' }, { key: 'points', label: 'Tích điểm', type: 'checkbox' },
    ],
    rows: [
      { code: 'M00001', name: 'Cà phê sữa', category: 'Cà phê', productType: 'Chế biến', menuType: 'Đồ uống', price: 35000, status: 'Đang bán', visible: true, extra: false, points: true, image: '', attributes: '[]', units: '[]' },
      { code: 'M00002', name: 'Trà đào cam sả', category: 'Trà', productType: 'Chế biến', menuType: 'Đồ uống', price: 42000, status: 'Đang bán', visible: true, extra: false, points: true, image: '', attributes: '[]', units: '[]' },
      { code: 'M00003', name: 'Bia lon', category: 'Bia', productType: 'Hàng hóa thường', menuType: 'Khác', price: 22000, cost: 16000, stock: 48, status: 'Đang bán', visible: true, extra: false, points: true, image: '', attributes: '[]', units: '[{"name":"Thùng","ratio":24}]' },
      { code: 'M00004', name: 'Bạc xỉu', category: 'Cà phê', productType: 'Chế biến', menuType: 'Đồ uống', price: 45000, status: 'Đang bán', visible: true, extra: false, points: true, image: '', attributes: '[]', units: '[]' },
      { code: 'M00005', name: 'Croissant', category: 'Đồ ăn', productType: 'Hàng hóa thường', menuType: 'Đồ ăn', price: 28000, cost: 14000, stock: 12, status: 'Đang bán', visible: true, extra: true, points: true, image: '', attributes: '[]', units: '[]' },
    ],
    metrics: [{ label: 'Tổng món', value: '36', hint: '12 danh mục' }, { label: 'Đang bán', value: '32', hint: 'Sẵn sàng phục vụ' }, { label: 'Tạm hết', value: '4', hint: 'Cần cập nhật' }],
  },
  {
    id: 'suppliers', path: '/management/suppliers', title: 'Nhà cung cấp', description: 'Quản lý đối tác và công nợ nhập hàng.', entity: 'nhà cung cấp', searchPlaceholder: 'Tìm tên, mã hoặc số điện thoại...',
    columns: [{ key: 'name', label: 'Nhà cung cấp' }, { key: 'contact', label: 'Người liên hệ' }, { key: 'phone', label: 'Điện thoại' }, { key: 'debt', label: 'Công nợ', type: 'currency' }],
    fields: [{ key: 'name', label: 'Tên nhà cung cấp', required: true }, { key: 'contact', label: 'Người liên hệ' }, { key: 'phone', label: 'Số điện thoại', type: 'tel', required: true }, { key: 'debt', label: 'Công nợ (₫)', type: 'number' }, { key: 'address', label: 'Địa chỉ' }, { key: 'note', label: 'Ghi chú', type: 'textarea' }],
    rows: [{ name: 'Công ty Cà phê Tây Nguyên', contact: 'Nguyễn Văn Lâm', phone: '0903 456 123', debt: 2480000, address: 'Đắk Lắk', note: 'Nhà cung cấp cà phê' }, { name: 'Nông sản An Nhiên', contact: 'Trần Thị Mai', phone: '0918 220 315', debt: 0, address: 'Lâm Đồng', note: '' }, { name: 'Lò bánh Bảo Ngọc', contact: 'Phạm Minh Tâm', phone: '0908 661 092', debt: 860000, address: 'Quận 3, TP.HCM', note: 'Giao hàng buổi sáng' }, { name: 'Bao bì Minh Phát', contact: 'Lê Quốc Huy', phone: '0986 003 221', debt: 0, address: 'TP.HCM', note: '' }],
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
    columns: [{ key: 'code', label: 'Mã hóa đơn' }, { key: 'table', label: 'Phòng/bàn' }, { key: 'order', label: 'Đơn hàng' }, { key: 'customer', label: 'Khách hàng' }, { key: 'amount', label: 'Tổng tiền hàng', type: 'currency' }, { key: 'due', label: 'Khách cần trả', type: 'currency' }, { key: 'paid', label: 'Khách đã trả', type: 'currency' }, { key: 'date', label: 'Giờ đến' }, { key: 'branch', label: 'Chi nhánh' }, { key: 'receiver', label: 'Người nhận đơn' }, { key: 'creator', label: 'Người tạo đơn' }, { key: 'status', label: 'Trạng thái', type: 'status' }],
    fields: [{ key: 'code', label: 'Mã hóa đơn', readOnly: true, required: true }, { key: 'table', label: 'Phòng/bàn', type: 'select', options: ['Mang về', 'Bàn 01', 'Bàn 02', 'Bàn 03'] }, { key: 'order', label: 'Đơn hàng', required: true }, { key: 'customer', label: 'Khách hàng', required: true }, { key: 'items', label: 'Order / sản phẩm', type: 'textarea' }, { key: 'amount', label: 'Tổng tiền hàng (₫)', type: 'number', required: true }, { key: 'discount', label: 'Giảm giá (₫)', type: 'number' }, { key: 'due', label: 'Khách cần trả (₫)', type: 'number', required: true, readOnly: true }, { key: 'paid', label: 'Khách đã trả (₫)', type: 'number' }, { key: 'date', label: 'Giờ đến', type: 'text', required: true }, { key: 'branch', label: 'Chi nhánh', type: 'select', options: ['Mộc Store · Quận 1', 'Mộc Store · Quận 3'] }, { key: 'receiver', label: 'Người nhận đơn', type: 'select', options: ['Thu ngân A', 'Quản lý chi nhánh', 'Pha chế'] }, { key: 'creator', label: 'Người tạo đơn', type: 'select', options: ['Thu ngân A', 'Quản lý chi nhánh', 'Pha chế'] }, { key: 'method', label: 'Phương thức thanh toán', type: 'select', options: ['Tiền mặt', 'Chuyển khoản', 'QR'] }, { key: 'status', label: 'Trạng thái', type: 'select', options: ['Đã thanh toán', 'Chờ thanh toán', 'Đã hủy'] }],
    rows: [{ code: 'HD000188', table: 'Mang về', order: '168-32', customer: 'Khách lẻ', items: 'Cà phê sữa ×2 · Croissant ×1', amount: 140000, discount: 0, due: 140000, paid: 0, date: '09/11/2026 08:48', branch: 'Mộc Store · Quận 1', receiver: 'Thu ngân A', creator: 'Thu ngân A', method: 'QR', status: 'Chờ thanh toán' }, { code: 'HD000186', table: 'Bàn 01', order: '168-15', customer: 'Khách lẻ', items: 'Trà đào ×2 · Bạc xỉu ×1', amount: 245000, discount: 0, due: 245000, paid: 245000, date: '09/11/2026 08:42', branch: 'Mộc Store · Quận 1', receiver: 'Quản lý chi nhánh', creator: 'Thu ngân A', method: 'Chuyển khoản', status: 'Đã thanh toán' }, { code: 'HD000185', table: 'Bàn 03', order: '163-358', customer: 'Nguyễn Minh', items: 'Cà phê đen ×1 · Bánh ×1', amount: 89000, discount: 0, due: 89000, paid: 89000, date: '09/11/2026 08:39', branch: 'Mộc Store · Quận 1', receiver: 'Pha chế', creator: 'Thu ngân A', method: 'Tiền mặt', status: 'Đã thanh toán' }],
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
    id: 'cashbook', path: '/management/cashbook', title: 'Sổ quỹ', description: 'Theo dõi thu, chi và số dư tiền mặt tại cửa hàng.', entity: 'phiếu thu chi', searchPlaceholder: 'Tìm mã phiếu hoặc nội dung...', filters: ['Đã thanh toán', 'Chưa thanh toán'],
    columns: [{ key: 'code', label: 'Mã phiếu' }, { key: 'status', label: 'Thanh toán', type: 'status' }, { key: 'voucher', label: 'Loại phiếu' }, { key: 'amount', label: 'Giá trị', type: 'currency' }, { key: 'category', label: 'Loại thu/chi' }, { key: 'payerGroup', label: 'Nhóm người nộp' }, { key: 'payer', label: 'Người nộp' }, { key: 'method', label: 'Phương thức' }, { key: 'branch', label: 'Chi nhánh' }, { key: 'creator', label: 'Người tạo' }],
    fields: [{ key: 'code', label: 'Mã phiếu', readOnly: true }, { key: 'status', label: 'Trạng thái thanh toán', type: 'select', options: ['Đã thanh toán', 'Chưa thanh toán'] }, { key: 'voucher', label: 'Loại phiếu', type: 'select', options: ['Phiếu Thu', 'Phiếu Chi'] }, { key: 'amount', label: 'Giá trị (₫)', type: 'number', required: true }, { key: 'category', label: 'Loại thu/chi', type: 'select', options: ['Thu tiền khách hàng', 'Thu khác', 'Chi nhập hàng', 'Chi vận hành'] }, { key: 'payerGroup', label: 'Nhóm người nộp', type: 'select', options: ['Khách hàng', 'Nhà cung cấp', 'Nhân viên', 'Khác'] }, { key: 'payer', label: 'Người nộp' }, { key: 'method', label: 'Phương thức', type: 'select', options: ['Tiền mặt', 'Chuyển khoản'] }, { key: 'branch', label: 'Chi nhánh', type: 'select', options: ['Mộc Store · Quận 1', 'Mộc Store · Quận 3'] }, { key: 'creator', label: 'Người tạo', type: 'select', options: ['Thu ngân A', 'Quản lý chi nhánh', 'Pha chế'] }, { key: 'date', label: 'Ngày ghi sổ', type: 'text', required: true }, { key: 'note', label: 'Ghi chú' }],
    rows: [{ code: 'TTHD039369', status: 'Đã thanh toán', voucher: 'Phiếu Thu', amount: 146000, category: 'Thu tiền khách hàng', payerGroup: 'Khách hàng', payer: 'Nguyễn Minh', method: 'Tiền mặt', branch: 'Mộc Store · Quận 1', creator: 'Thu ngân A', date: '09/11/2026 08:48', note: 'Thanh toán hóa đơn HD000186' }, { code: 'TTHD039368', status: 'Chưa thanh toán', voucher: 'Phiếu Thu', amount: 245000, category: 'Thu tiền khách hàng', payerGroup: 'Khách hàng', payer: '', method: 'Chuyển khoản', branch: 'Mộc Store · Quận 1', creator: 'Quản lý chi nhánh', date: '09/11/2026 08:42', note: '' }, { code: 'CCHD020401', status: 'Đã thanh toán', voucher: 'Phiếu Chi', amount: 860000, category: 'Chi nhập hàng', payerGroup: 'Nhà cung cấp', payer: 'Cà phê Tây Nguyên', method: 'Chuyển khoản', branch: 'Mộc Store · Quận 1', creator: 'Quản lý chi nhánh', date: '09/11/2026 09:15', note: 'Thanh toán nhập hàng' }],
    metrics: [{ label: 'Số dư đầu kỳ', value: '18.450.000 ₫', hint: 'Ngày 01/11/2026' }, { label: 'Tổng thu', value: '46.280.000 ₫', hint: 'Từ 01/11 đến nay' }, { label: 'Tổng chi', value: '24.620.000 ₫', hint: 'Từ 01/11 đến nay' }, { label: 'Cuối kỳ', value: '40.110.000 ₫', hint: 'Số dư sau thu chi' }],
  },
  {
    id: 'bank-accounts', path: '/management/bank-accounts', title: 'Tài khoản ngân hàng', description: 'Quản lý tài khoản nhận và đối soát chuyển khoản.', entity: 'tài khoản ngân hàng', searchPlaceholder: 'Tìm tên tài khoản, ngân hàng hoặc số tài khoản...',
    columns: [{ key: 'name', label: 'Tên tài khoản' }, { key: 'bank', label: 'Ngân hàng' }, { key: 'accountNumber', label: 'Số tài khoản' }, { key: 'holder', label: 'Chủ tài khoản' }, { key: 'branches', label: 'Chi nhánh áp dụng' }, { key: 'note', label: 'Ghi chú' }],
    fields: [{ key: 'name', label: 'Tên tài khoản', required: true }, { key: 'bank', label: 'Ngân hàng', type: 'bank-picker', required: true }, { key: 'accountNumber', label: 'Số tài khoản', required: true }, { key: 'holder', label: 'Chủ tài khoản', required: true }, { key: 'note', label: 'Ghi chú', type: 'textarea' }, { key: 'branches', label: 'Chi nhánh áp dụng', type: 'multi-select', options: ['Tất cả chi nhánh', 'Mộc Store · Quận 1', 'Mộc Store · Quận 3'] }],
    rows: [{ name: 'Tài khoản chính', bank: 'Vietcombank', accountNumber: '0123456789', holder: 'CONG TY MOC STORE', branches: 'Tất cả chi nhánh', note: 'Tài khoản nhận thanh toán QR' }],
    metrics: [{ label: 'Tài khoản đang dùng', value: '1', hint: 'Đang nhận thanh toán' }, { label: 'Chi nhánh áp dụng', value: 'Tất cả', hint: 'Có thể giới hạn theo tài khoản' }, { label: 'Đối soát', value: 'Sẵn sàng', hint: 'Cấu hình tài khoản demo' }],
  },
  {
    id: 'rooms', path: '/management/rooms', title: 'Phòng / bàn', description: 'Tạo và quản lý khu vực phục vụ tại cửa hàng.', entity: 'phòng / bàn', searchPlaceholder: 'Tìm tên bàn hoặc ghi chú...',
    columns: [{ key: 'name', label: 'Tên phòng/bàn' }, { key: 'note', label: 'Ghi chú' }],
    fields: [{ key: 'name', label: 'Tên', required: true }, { key: 'note', label: 'Ghi chú', type: 'textarea' }],
    rows: [{ name: 'Mang về', note: 'Đơn mua mang đi' }, { name: 'Bàn 01', note: 'Gần cửa sổ' }, { name: 'Bàn 02', note: '' }, { name: 'Bàn 03', note: 'Khu vực ngoài trời' }],
    metrics: [{ label: 'Phòng / bàn', value: '4', hint: 'Có thể thêm bàn mới' }, { label: 'Đang phục vụ', value: '1', hint: 'Cập nhật theo đơn' }, { label: 'Chi nhánh', value: 'Quận 1', hint: 'Mộc Store' }],
  },
]
