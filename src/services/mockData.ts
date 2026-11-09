import type { Product } from '../types'

export const products: Product[] = [
  { id: 'coffee-01', name: 'Cà phê sữa', sku: 'CF-001', category: 'Cà phê', price: 35000, stock: 46, minimum: 8, color: '#f2e5d6' },
  { id: 'tea-01', name: 'Trà đào cam sả', sku: 'TR-004', category: 'Trà', price: 42000, stock: 32, minimum: 10, color: '#f7e1d7' },
  { id: 'coffee-02', name: 'Cà phê đen', sku: 'CF-002', category: 'Cà phê', price: 39000, stock: 25, minimum: 8, color: '#e8ddd2' },
  { id: 'coffee-03', name: 'Bạc xỉu', sku: 'CF-003', category: 'Cà phê', price: 45000, stock: 18, minimum: 6, color: '#efe1d1' },
  { id: 'cake-01', name: 'Croissant', sku: 'BK-001', category: 'Bánh', price: 28000, stock: 12, minimum: 5, color: '#f5e4c7' },
  { id: 'retail-01', name: 'Ly giữ nhiệt', sku: 'RT-001', category: 'Retail SKU', price: 120000, stock: 4, minimum: 6, color: '#e8edf5' },
  { id: 'tea-02', name: 'Trà sữa', sku: 'TR-006', category: 'Trà', price: 30000, stock: 27, minimum: 8, color: '#ede2d6' },
  { id: 'cake-02', name: 'Bánh tiramisu', sku: 'BK-008', category: 'Bánh', price: 55000, stock: 9, minimum: 4, color: '#eadbd3' },
]

export const formatCurrency = (amount: number) => `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`

export const inventorySummary = { skuCount: 248, lowStockCount: 12, inventoryValue: 86420000 }

export const recentOrders = [
  { code: 'MOC-0188', time: '11:03', customer: 'Khách lẻ', table: 'Mang về', method: 'QR chuyển khoản', amount: 140000, status: 'Chờ thanh toán', items: [{ name: 'Cà phê sữa', quantity: 2, price: 35000 }, { name: 'Croissant', quantity: 1, price: 70000 }] },
  { code: 'MOC-0186', time: '10:42', customer: 'Khách lẻ', table: 'Bàn 1', method: 'QR chuyển khoản', amount: 245000, status: 'Đã thanh toán', items: [{ name: 'Trà đào cam sả', quantity: 2, price: 42000 }, { name: 'Bạc xỉu', quantity: 1, price: 45000 }, { name: 'Croissant', quantity: 2, price: 58000 }] },
  { code: 'MOC-0185', time: '10:39', customer: 'Nguyễn Minh', table: 'Bàn 2', method: 'Tiền mặt', amount: 89000, status: 'Đã thanh toán', items: [{ name: 'Cà phê đen', quantity: 1, price: 39000 }, { name: 'Croissant', quantity: 1, price: 50000 }] },
  { code: 'MOC-0184', time: '10:32', customer: 'Khách lẻ', table: 'Bàn 3', method: 'QR chuyển khoản', amount: 132000, status: 'Đã thanh toán', items: [{ name: 'Trà sữa', quantity: 2, price: 30000 }, { name: 'Bánh tiramisu', quantity: 1, price: 72000 }] },
  { code: 'MOC-0183', time: '10:25', customer: 'Khách lẻ', table: 'Mang về', method: 'Tiền mặt', amount: 65000, status: 'Đã thanh toán', items: [{ name: 'Cà phê sữa', quantity: 1, price: 35000 }, { name: 'Bánh tiramisu', quantity: 1, price: 30000 }] },
  { code: 'MOC-0182', time: '10:18', customer: 'Khách lẻ', table: 'Bàn 2', method: 'QR chuyển khoản', amount: 210000, status: 'Đã thanh toán', items: [{ name: 'Trà đào cam sả', quantity: 3, price: 42000 }, { name: 'Cà phê sữa', quantity: 2, price: 42000 }] },
  { code: 'MOC-0181', time: '10:12', customer: 'Khách lẻ', table: 'Bàn 1', method: 'QR chuyển khoản', amount: 210000, status: 'Đã thanh toán', items: [{ name: 'Cà phê sữa', quantity: 3, price: 35000 }, { name: 'Croissant', quantity: 3, price: 35000 }] },
]

export const hourlyRevenue = [18, 25, 34, 29, 50, 38, 66, 52, 82, 60, 73, 45]
