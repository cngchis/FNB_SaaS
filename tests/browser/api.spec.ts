import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const base = process.env.API_TEST_BASE_URL ?? 'http://127.0.0.1:18088'
const tenant = process.env.WEB_TEST_TENANT
const email = process.env.WEB_TEST_EMAIL
const password = process.env.WEB_TEST_PASSWORD

async function signIn(page: Page, path: string, account = email!) {
  await page.goto(path)
  await expect(page).toHaveURL(/\/login$/)
  await page.screenshot({ path: test.info().outputPath('login.png') })
  await page.getByLabel('Mã cửa hàng', { exact: true }).fill(tenant!)
  await page.getByLabel('Email', { exact: true }).fill(account)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password!)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(path)
}

test('real API: catalog, groups, customers, reload, pagination and errors', async ({ page, request }, info) => {
  test.skip(!tenant || !email || !password, 'Use scripts/test-web-api-local.sh to provision an isolated PostgreSQL fixture.')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const login = await request.post(`${base}/api/v1/auth/login`, { data: { tenant_slug: tenant, email, password } })
  expect(login.ok()).toBeTruthy()
  const { data: session } = await login.json()
  const headers = { Authorization: `Bearer ${session.access_token}` }
  const suffix = `${info.project.name}-${Date.now()}`
  for (let i = 0; i < 7; i++) {
    const response = await request.post(`${base}/api/v1/products`, { headers, data: { name: `Seed ${suffix} ${i}`, product_type: 'goods', price_vnd: 1000 } })
    expect(response.status()).toBe(201)
  }
  // Unscoped prototype data must never appear as server data.
  await page.addInitScript(() => localStorage.setItem('fnb-management:menu-items', JSON.stringify([{ name: 'POISON PROTOTYPE', code: 'M99999' }])))
  await signIn(page, '/management/menu-items')
  await expect(page.getByText('POISON PROTOTYPE')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Tìm tên món hoặc mã món...' }).fill(`Seed ${suffix}`)
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
    await expect(page.getByRole('button', { name: /^2 \/ / })).toBeVisible()
  } else {
    await expect(page.locator('tbody tr').filter({ hasText: `Seed ${suffix} 0` })).toBeVisible()
    await page.locator('.record-page .table-footer').scrollIntoViewIfNeeded()
    await expect(page.locator('tbody tr').filter({ hasText: `Seed ${suffix} 6` })).toBeVisible()
  }
  await page.getByRole('button', { name: 'Thêm món', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const productName = `Món API ${suffix}`
  await page.screenshot({ path: info.outputPath('api-product-editor.png') })
  await dialog.getByLabel('Tên hàng', { exact: true }).fill(productName)
  await dialog.locator('select[name="category"]').selectOption('__create__')
  await dialog.getByRole('textbox', { name: 'Tên nhóm hàng mới' }).fill(`Nhóm ${suffix}`)
  await dialog.getByRole('button', { name: 'Thêm nhóm', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: 'Tên nhóm hàng mới' })).toHaveCount(0)
  await dialog.getByLabel('Giá bán (₫)', { exact: true }).fill('35000')
  await dialog.getByLabel('Giá vốn (₫)', { exact: true }).fill('16000')
  await expect(dialog.getByLabel('Tồn kho', { exact: true })).toHaveAttribute('readonly', '')
  await expect(dialog.locator('input[type=file]')).toBeDisabled()
  await dialog.getByRole('textbox', { name: 'Đơn vị cơ bản', exact: true }).fill('Lon')
  await dialog.getByRole('button', { name: '+ Thêm thuộc tính', exact: true }).click()
  await dialog.getByRole('textbox', { name: 'Tên thuộc tính' }).fill('Size')
  await dialog.getByRole('textbox', { name: 'Giá trị thuộc tính' }).fill('L')
  await dialog.getByRole('button', { name: '+ Thêm đơn vị', exact: true }).click()
  await dialog.getByRole('textbox', { name: 'Tên đơn vị' }).fill('Thùng')
  await dialog.getByRole('spinbutton', { name: /Số Lon/ }).fill('24')
  await dialog.getByRole('spinbutton', { name: 'Giá bán đơn vị', exact: true }).fill('700000')
  await dialog.getByRole('spinbutton', { name: 'Giá vốn đơn vị', exact: true }).fill('384000')
  await dialog.getByRole('button', { name: 'Lưu món', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const search = page.getByRole('textbox', { name: 'Tìm tên món hoặc mã món...' })
  await search.fill(productName)
  let row = page.locator('tr.record-expandable-row').filter({ hasText: productName })
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: /^Sửa / }).click()
  await page.getByRole('dialog').getByLabel('Giá bán (₫)', { exact: true }).fill('40000')
  await page.getByRole('button', { name: 'Lưu món', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row).toContainText('40.000')
  const result = await request.get(`${base}/api/v1/products?search=${encodeURIComponent(productName)}`, { headers })
  const persisted = (await result.json()).data.items[0]
  expect(persisted.price_vnd).toBe(40000)
  expect(persisted.units[0].cost_vnd).toBe(384000)
  expect(persisted.attributes[0].value).toBe('L')
  await signIn(page, '/management/menu-items')
  await search.fill(productName)
  await expect(page.locator('tr.record-expandable-row').filter({ hasText: productName })).toHaveCount(1)
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Xuất file', exact: true }).click()
  const download = await downloadEvent
  expect(await readFile((await download.path())!, 'utf8')).toContain(productName)

  const groupName = `VIP ${suffix}`
  await signIn(page, '/management/customer-groups')
  await page.getByRole('button', { name: 'Thêm nhóm khách hàng', exact: true }).click()
  await page.getByLabel('Tên nhóm', { exact: true }).fill(groupName)
  await page.getByLabel('Điều kiện tham gia', { exact: true }).fill('Đăng ký')
  await expect(page.getByLabel('Số thành viên', { exact: true })).toHaveAttribute('readonly', '')
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm nhóm khách hàng', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await signIn(page, '/management/customers')
  await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).click()
  const customerName = `Khách ${suffix}`
  await page.getByLabel('Tên khách hàng', { exact: true }).fill(customerName)
  await page.getByLabel('Số điện thoại', { exact: true }).fill('0900123456')
  await page.getByLabel('Nhóm khách hàng', { exact: true }).fill(groupName)
  await page.getByLabel('Điểm tích lũy', { exact: true }).fill('12')
  await expect(page.getByLabel('Số đơn hàng', { exact: true })).toHaveAttribute('readonly', '')
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm khách hàng', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Tìm tên, số điện thoại...' }).fill(customerName)
  row = page.locator('tbody tr').filter({ hasText: customerName })
  await expect(row).toContainText(groupName)
  await row.getByRole('button', { name: /^Sửa / }).click()
  await page.getByLabel('Điểm tích lũy', { exact: true }).fill('24')
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row).toContainText('24')
  const customerResponse = await request.get(`${base}/api/v1/customers?search=${encodeURIComponent(customerName)}`, { headers })
  const customer = (await customerResponse.json()).data.items[0]
  await signIn(page, '/management/customer-groups')
  await page.getByRole('textbox', { name: 'Tìm tên nhóm khách hàng...' }).fill(groupName)
  const groupRow = page.locator('tbody tr').filter({ hasText: groupName })
  await groupRow.getByRole('button', { name: /^Sửa / }).click()
  await page.getByLabel('Ưu đãi', { exact: true }).fill('Ưu đãi API')
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(groupRow).toContainText('Ưu đãi API')
  await groupRow.getByRole('button', { name: /^Xóa / }).click()
  await page.getByRole('button', { name: 'Xóa bản ghi', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const detached = await request.get(`${base}/api/v1/customers/${customer.id}`, { headers })
  expect((await detached.json()).data.group_id).toBeNull()
  await signIn(page, '/management/customers')
  await page.getByRole('textbox', { name: 'Tìm tên, số điện thoại...' }).fill(customerName)
  await row.getByRole('button', { name: /^Xóa / }).click()
  await page.getByRole('button', { name: 'Xóa bản ghi', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row).toHaveCount(0)

  await page.route('**/api/v1/products?*', (route) => route.abort())
  await signIn(page, '/management/menu-items')
  await expect(page.getByRole('button', { name: 'Thử lại', exact: true })).toBeVisible()
  await expect(page.getByText('POISON PROTOTYPE')).toHaveCount(0)
  await page.unroute('**/api/v1/products?*')
  const refreshed = page.waitForResponse((response) => response.url().endsWith('/auth/refresh') && response.ok())
  // Inject one expired-token response, then use real refresh and protected APIs.
  await page.route('**/api/v1/products?*', (route) => route.fulfill({ status: 401, json: { error: { code: 'invalid_token', message: 'Expired' } } }), { times: 1 })
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click()
  await refreshed
  await expect(page.getByRole('button', { name: 'Thêm món', exact: true })).toBeEnabled()
  await page.getByRole('textbox', { name: 'Tìm tên món hoặc mã món...' }).fill(productName)
  const productRow = page.locator('tr.record-expandable-row').filter({ hasText: productName })
  await productRow.getByRole('button', { name: /^Xóa / }).click()
  await page.getByRole('button', { name: 'Xóa bản ghi', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect((await request.get(`${base}/api/v1/products/${persisted.id}`, { headers })).status()).toBe(404)
  expect(errors).toEqual([])
})

test('cashier permissions and logout use the real backend', async ({ page, request }, info) => {
  test.skip(!tenant || !email || !password || !process.env.WEB_TEST_CASHIER_EMAIL, 'Requires the isolated native fixture.')
  const response = await request.post(`${base}/api/v1/auth/login`, { data: { tenant_slug: tenant, email, password } })
  const { data: session } = await response.json()
  const name = `Cashier ${info.project.name} ${Date.now()}`
  expect((await request.post(`${base}/api/v1/customer-groups`, { headers: { Authorization: `Bearer ${session.access_token}` }, data: { name } })).status()).toBe(201)
  await signIn(page, '/management/menu-items', process.env.WEB_TEST_CASHIER_EMAIL)
  await page.getByRole('button', { name: 'Thêm món', exact: true }).click()
  await page.getByLabel('Tên hàng', { exact: true }).fill('Denied product')
  await page.getByLabel('Giá bán (₫)', { exact: true }).fill('1000')
  await page.getByRole('button', { name: 'Lưu món', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('không có quyền')
  await signIn(page, '/management/customers', process.env.WEB_TEST_CASHIER_EMAIL)
  await page.getByRole('button', { name: 'Thêm khách hàng', exact: true }).click()
  await page.getByLabel('Tên khách hàng', { exact: true }).fill(name)
  await page.getByLabel('Số điện thoại', { exact: true }).fill('0900123456')
  await page.getByLabel('Nhóm khách hàng', { exact: true }).fill(name)
  await expect(page.getByLabel('Điểm tích lũy', { exact: true })).toHaveAttribute('readonly', '')
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm khách hàng', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Tìm tên, số điện thoại...' }).fill(name)
  await page.locator('tbody tr').filter({ hasText: name }).getByRole('button', { name: /^Xóa / }).click()
  await page.getByRole('button', { name: 'Xóa bản ghi', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('không có quyền')
  await page.getByRole('button', { name: 'Đóng', exact: true }).click()
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Thêm', exact: true }).click()
    await page.locator('.mobile-more-user button').click()
  } else await page.locator('.user-card').click()
  await expect(page).toHaveURL('/login')
  const loggedOut = page.waitForResponse((result) => result.url().endsWith('/auth/logout') && result.ok())
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await loggedOut
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible()
})

test('real POS: rooms, isolated tabs, ordering rounds, cash and invoice', async ({ page, request }, info) => {
  test.skip(!tenant || !email || !password, 'Use the isolated native PostgreSQL fixture.')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const auth = await request.post(`${base}/api/v1/auth/login`, { data: { tenant_slug: tenant, email, password } })
  const { data: session } = await auth.json()
  const headers = { Authorization: `Bearer ${session.access_token}` }
  const suffix = `${info.project.name}-${Date.now()}`
  const name = `Coffee POS ${suffix}`
  const product = await request.post(`${base}/api/v1/products`, { headers, data: { name, product_type: 'prepared', price_vnd: 35000 } })
  expect(product.status()).toBe(201)
  await signIn(page, '/management/rooms')
  await page.getByRole('button', { name: 'Thêm phòng / bàn', exact: true }).click()
  await page.getByRole('dialog').getByLabel('Tên', { exact: true }).fill(`Bàn ${suffix}`)
  await page.getByRole('dialog').getByLabel('Ghi chú', { exact: true }).fill('Window')
  await page.getByRole('dialog').getByRole('button', { name: 'Thêm phòng / bàn', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await signIn(page, '/pos')
  await expect(page.locator('.pos-topbar')).toHaveCount(0)
  await expect(page.locator('.cart-header')).toHaveCount(0)
  await page.locator('.pos-table-grid button').filter({ hasText: `Bàn ${suffix}` }).click()
  const search = page.locator('.pos-workflow-tabs input')
  await search.fill(name)
  await page.getByRole('button', { name: `Thêm ${name} vào đơn hàng`, exact: true }).click()
  await page.getByRole('button', { name: 'Thêm đơn hàng', exact: true }).click()
  await expect(page.locator('.cart-item')).toHaveCount(0)
  await page.getByRole('button', { name: 'Đơn hàng 1', exact: true }).click()
  await expect(page.locator('.cart-item')).toHaveCount(1)
  await page.getByRole('button', { name: 'Đóng Đơn hàng 2', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Hủy', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Đơn hàng 2', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Đóng Đơn hàng 2', exact: true }).click()
  await page.getByRole('button', { name: 'Đóng đơn hàng', exact: true }).click()
  await page.getByRole('button', { name: 'Đóng Đơn hàng 1', exact: true }).click()
  await page.getByRole('button', { name: 'Đóng đơn hàng', exact: true }).click()
  await expect(page.locator('.pos-order-tab')).toHaveCount(0)
  await expect(page.locator('.cart-item')).toHaveCount(0)
  await page.getByRole('button', { name: 'Thêm đơn hàng', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Đơn hàng 1', exact: true })).toBeVisible()
  await page.locator('.pos-workflow-tabs').getByRole('button', { name: 'Phòng/Bàn', exact: true }).click()
  await page.locator('.pos-table-grid button').filter({ hasText: `Bàn ${suffix}` }).click()
  await page.getByRole('button', { name: `Thêm ${name} vào đơn hàng`, exact: true }).click()
  const estimate = info.project.name === 'mobile' ? page.locator('.mobile-cart-actions').getByRole('button', { name: 'Tạm tính', exact: true }) : page.locator('.cart-estimate-button')
  const saved = page.waitForResponse((r) => r.url().endsWith('/pos/orders') && r.request().method() === 'POST')
  await estimate.click()
  const response = await saved
  expect(response.status()).toBe(201)
  const order = (await response.json()).data
  await expect(page.locator('.order-type')).toContainText(order.code)
  await signIn(page, '/pos')
  await page.locator('.pos-table-grid button').filter({ hasText: `Bàn ${suffix}` }).click()
  await search.fill(name)
  await page.getByRole('button', { name: `Thêm ${name} vào đơn hàng`, exact: true }).click()
  await expect(page.locator('.cart-item')).toHaveCount(1)
  await expect(page.locator('.quantity-control strong')).toHaveText('2')
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Mở giỏ hàng', exact: true }).click()
  await page.getByRole('button', { name: 'Tiền mặt', exact: true }).click()
  const payment = page.getByRole('dialog', { name: 'Thanh toán tiền mặt' })
  await payment.getByLabel('Khách thanh toán', { exact: true }).fill('100000')
  await payment.getByRole('button', { name: 'Ghi nhận thanh toán', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Thanh toán thành công')
  await expect(page.getByRole('dialog')).toContainText('Tiền thừa: 30.000')
  await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click()
  const persisted = await request.get(`${base}/api/v1/pos/orders/${order.id}`, { headers })
  const final = (await persisted.json()).data
  expect(final.status).toBe('paid')
  expect(final.items[0].quantity).toBe(2)
  expect(final.paid_vnd).toBe(70000)
  await expect(page.locator('.pos-workflow-tabs').getByRole('button', { name: 'Đơn gần đây', exact: true })).toHaveCount(0)
  if (info.project.name === 'desktop') {
    await page.locator('.pos-sidebar').getByRole('button', { name: 'Đơn hàng', exact: true }).click()
    await page.getByRole('dialog').locator('.recent-order-row').filter({ hasText: final.invoice_code }).click()
    await expect(page.locator('.invoice-detail-items')).toContainText(`${name} × 2`)
    await page.screenshot({ path: info.outputPath('real-pos-invoice.png') })
  }
  expect(errors).toEqual([])
})

test('real Management invoices: POS data, filtering, export, pagination and read-only actions', async ({ page, request }, info) => {
  test.skip(!tenant || !email || !password, 'Use the isolated native PostgreSQL fixture.')
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const auth = await request.post(`${base}/api/v1/auth/login`, { data: { tenant_slug: tenant, email, password } })
  const { data: session } = await auth.json()
  const headers = { Authorization: `Bearer ${session.access_token}` }
  const suffix = `${info.project.name}-${Date.now()}`
  const name = `Invoice customer ${suffix}`
  const productResponse = await request.post(`${base}/api/v1/products`, { headers, data: { name: `Invoice drink ${suffix}`, product_type: 'prepared', price_vnd: 10000 } })
  expect(productResponse.status()).toBe(201)
  const product = (await productResponse.json()).data
  const customerResponse = await request.post(`${base}/api/v1/customers`, { headers, data: { name } })
  expect(customerResponse.status()).toBe(201)
  const customer = (await customerResponse.json()).data
  const invoiceCodes: string[] = []
  for (let i = 0; i < 8; i++) {
    const saved = await request.post(`${base}/api/v1/pos/orders`, { headers: { ...headers, 'Idempotency-Key': `web-invoice-order-${suffix}-${i}` }, data: { customer_id: customer.id, discount_vnd: 1000, items: [{ product_id: product.id, quantity: 2 }] } })
    expect(saved.status()).toBe(201)
    const order = (await saved.json()).data
    const payment = await request.post(`${base}/api/v1/pos/orders/${order.id}/payments`, { headers: { ...headers, 'Idempotency-Key': `web-invoice-pay-${suffix}-${i}` }, data: { received_vnd: i === 0 ? 5000 : 19000 } })
    expect(payment.status()).toBe(200)
    invoiceCodes.push((await payment.json()).data.order.invoice_code)
  }
  await page.addInitScript(() => localStorage.setItem('fnb-management:invoices', JSON.stringify([{ code: 'POISON-INVOICE' }])))
  await signIn(page, '/management/invoices')
  const search = page.getByRole('textbox', { name: 'Tìm mã hóa đơn hoặc khách hàng...', exact: true })
  await search.fill(name)
  await expect(page.getByText('POISON-INVOICE')).toHaveCount(0)
  await expect(page.locator('.record-metric').nth(1)).toContainText('152.000')
  await expect(page.locator('.record-metric').nth(2).locator('strong')).toHaveText('1')
  if (info.project.name === 'desktop') {
    await expect(page.locator('.record-expandable-row')).toHaveCount(6)
    await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
    await expect(page.locator('.record-expandable-row')).toHaveCount(2)
  } else {
    await page.locator('.record-page .table-footer').scrollIntoViewIfNeeded()
    await expect(page.locator('.record-expandable-row')).toHaveCount(8)
  }
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Xuất file', exact: true }).click()
  const csv = await readFile((await (await downloadEvent).path())!, 'utf8')
  for (const code of invoiceCodes) expect(csv).toContain(code)
  await page.locator('.record-filters').getByRole('button', { name: 'Chờ thanh toán', exact: true }).click()
  const row = page.locator('.record-expandable-row')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(invoiceCodes[0])
  await row.click()
  const detail = page.locator('.record-detail-content')
  await expect(detail).toContainText(`Invoice drink ${suffix} × 2`)
  await expect(detail).toContainText('Giảm giá: 1.000')
  await expect(detail).toContainText('Khách đã trả: 5.000')
  await page.screenshot({ path: info.outputPath('management-api-invoice-detail.png') })
  await row.getByRole('button', { name: /^Sửa / }).click()
  await expect(page.getByRole('alert')).toContainText('chỉ được tra cứu')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await row.getByRole('button', { name: /^Xóa / }).click()
  await expect(page.getByRole('alert')).toContainText('Không thể xóa hóa đơn')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.record-filters').getByRole('button', { name: 'Đã hủy', exact: true }).click()
  await expect(page.getByText('Không tìm thấy dữ liệu', { exact: true })).toBeVisible()
  await page.locator('.record-filters').getByRole('button', { name: 'Đã thanh toán', exact: true }).click()
  await expect(page.locator('.record-expandable-row').first()).toBeVisible()
  await signIn(page, '/management/invoices')
  await search.fill(invoiceCodes[0])
  await expect(page.locator('.record-expandable-row')).toHaveCount(1)
  await page.route('**/api/v1/invoices?**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: { code: 'internal_error', message: 'fixture failure' } }) }))
  await search.fill('Network error fixture')
  await expect(page.getByRole('alert')).toContainText('Không thể tải hoặc lưu dữ liệu')
  await page.unroute('**/api/v1/invoices?**')
  await search.fill(invoiceCodes[0])
  await expect(page.locator('.record-expandable-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Thêm hóa đơn', exact: true }).click()
  await expect(page).toHaveURL('/pos')
  expect(errors).toEqual([])
})

test('customer debt: inline invoice details, resume and idempotent collection', async ({ page, request }, info) => {
  test.skip(!tenant || !email || !password, 'Use the isolated native PostgreSQL fixture.')
  const auth = await request.post(`${base}/api/v1/auth/login`, { data: { tenant_slug: tenant, email, password } })
  const { data: session } = await auth.json()
  const headers = { Authorization: `Bearer ${session.access_token}` }
  const suffix = `${info.project.name}-${Date.now()}`
  const customerResult = await request.post(`${base}/api/v1/customers`, { headers, data: { name: `Debt customer ${suffix}` } })
  expect(customerResult.status()).toBe(201)
  const customer = (await customerResult.json()).data
  const productResult = await request.post(`${base}/api/v1/products`, { headers, data: { name: `Debt drink ${suffix}`, product_type: 'prepared', price_vnd: 35000 } })
  expect(productResult.status()).toBe(201)
  const product = (await productResult.json()).data
  const orders: { id: string; code: string; invoice: string; room: string }[] = []
  for (let i = 0; i < 3; i++) {
    const roomResult = await request.post(`${base}/api/v1/rooms`, { headers, data: { name: `Debt table ${suffix}-${i}`, note: '' } })
    expect(roomResult.status()).toBe(201)
    const room = (await roomResult.json()).data
    const saved = await request.post(`${base}/api/v1/pos/orders`, { headers: { ...headers, 'Idempotency-Key': `debt-order-${suffix}-${i}` }, data: { room_id: room.id, customer_id: customer.id, items: [{ product_id: product.id, quantity: i === 1 ? 2 : 1 }] } })
    expect(saved.status()).toBe(201)
    const order = (await saved.json()).data
    let invoice = ''
    if (i < 2) {
      const payment = await request.post(`${base}/api/v1/pos/orders/${order.id}/payments`, { headers: { ...headers, 'Idempotency-Key': `debt-initial-payment-${suffix}-${i}` }, data: { received_vnd: i === 0 ? 5000 : 10000 } })
      expect(payment.status()).toBe(200)
      invoice = (await payment.json()).data.order.invoice_code
    }
    orders.push({ id: order.id, code: order.code, invoice, room: room.name })
  }
  await signIn(page, '/pos')
  if (info.project.name === 'mobile') await page.getByRole('button', { name: 'Mở giỏ hàng', exact: true }).click()
  await page.locator('.cart-metadata select').selectOption(customer.id)
  const previousDebt = page.locator('.debt-line').filter({ hasText: 'Nợ trước đó' })
  await expect(previousDebt).toContainText('90.000')
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: 'Đơn hàng', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Đơn hàng gần đây' })
    const first = dialog.locator('.recent-order-row').filter({ hasText: orders[0].invoice })
    const second = dialog.locator('.recent-order-row').filter({ hasText: orders[1].invoice })
    await first.click()
    expect(await first.evaluate((element) => element.nextElementSibling?.classList.contains('invoice-detail-panel'))).toBe(true)
    await second.click()
    await expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(await second.evaluate((element) => element.nextElementSibling?.classList.contains('invoice-detail-panel'))).toBe(true)
    await expect(dialog.locator('.invoice-detail-panel')).toHaveCount(1)
    await first.click()
    await page.screenshot({ path: info.outputPath('inline-recent-invoice.png') })
    await dialog.getByRole('button', { name: 'Mở đơn để thu thêm tiền', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'Thu gọn giỏ hàng', exact: true }).click()
    await page.locator('.pos-table-grid button').filter({ hasText: orders[0].room }).click()
    await page.getByRole('button', { name: 'Mở giỏ hàng', exact: true }).click()
  }
  await expect(page.locator('.order-type')).toContainText(orders[0].code)
  await expect(previousDebt).toContainText('60.000')
  await page.getByRole('button', { name: 'Tiền mặt', exact: true }).click()
  const payment = page.getByRole('dialog', { name: 'Thanh toán tiền mặt' })
  await expect(payment.locator('.payment-amount')).toContainText('30.000')
  await payment.getByLabel('Khách thanh toán', { exact: true }).fill('30000')
  let attempts = 0
  const keys: string[] = []
  await page.route(`**/api/v1/pos/orders/${orders[0].id}/payments`, async (route) => {
    attempts++
    keys.push(route.request().headers()['idempotency-key'])
    if (attempts === 1) { const result = await route.fetch(); expect(result.status()).toBe(200); await route.abort('failed') }
    else await route.continue()
  })
  await payment.getByRole('button', { name: 'Ghi nhận thanh toán', exact: true }).click()
  await expect(payment.getByRole('alert')).toBeVisible()
  await payment.getByRole('button', { name: 'Ghi nhận thanh toán', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Thanh toán thành công')
  expect(keys).toHaveLength(2)
  expect(keys[0]).toBe(keys[1])
  await page.getByRole('button', { name: 'Hoàn tất', exact: true }).click()
  const balance = await request.get(`${base}/api/v1/customers/${customer.id}/debt`, { headers })
  expect((await balance.json()).data.outstanding_vnd).toBe(60000)
  const settled = await request.get(`${base}/api/v1/pos/orders/${orders[0].id}`, { headers })
  expect((await settled.json()).data.paid_vnd).toBe(35000)
  if (info.project.name === 'desktop') {
    await page.getByRole('button', { name: 'Xem hóa đơn tạm tính', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Hóa đơn tạm tính' })
    const draft = dialog.locator('.draft-order-row').filter({ hasText: orders[2].code })
    await draft.click()
    expect(await draft.evaluate((element) => element.nextElementSibling?.classList.contains('invoice-detail-panel'))).toBe(true)
    await expect(dialog.locator('.invoice-detail-items')).toContainText(`Debt drink ${suffix} × 1`)
    const unpaid = dialog.locator('.draft-order-row').filter({ hasText: orders[1].code })
    await unpaid.click()
    await expect(draft).toHaveAttribute('aria-expanded', 'false')
    expect(await unpaid.evaluate((element) => element.nextElementSibling?.classList.contains('invoice-detail-panel'))).toBe(true)
    await page.screenshot({ path: info.outputPath('inline-draft-invoice.png') })
    await dialog.getByRole('button', { name: 'Mở đơn', exact: true }).click()
    await expect(page.locator('.order-type')).toContainText(orders[1].code)
    await expect(previousDebt).toContainText('0 ₫')
  }
})

test('real cashbook: payment reconciliation, vouchers, balances, tabs and export', async ({ page, request }, info) => {
  test.skip(!tenant || !email || !password, 'Use the isolated native PostgreSQL fixture.')
  const auth = await request.post(`${base}/api/v1/auth/login`, { data: { tenant_slug: tenant, email, password } })
  const { data: session } = await auth.json()
  const headers = { Authorization: `Bearer ${session.access_token}` }
  const suffix = `${info.project.name}-${Date.now()}`
  const label = `Cashbook ${suffix}`
  const month = info.project.name === 'desktop' ? '01' : '02'
  const date = `2046-${month}-10`
  const localDate = `10/${month}/2046 09:00`
  const before = (await (await request.get(`${base}/api/v1/cashbook`, { headers })).json()).data.summary.income_vnd
  const productResponse = await request.post(`${base}/api/v1/products`, { headers, data: { name: label, product_type: 'prepared', price_vnd: 35000 } })
  expect(productResponse.status()).toBe(201)
  const product = (await productResponse.json()).data
  const orderResponse = await request.post(`${base}/api/v1/pos/orders`, { headers: { ...headers, 'Idempotency-Key': `book-order-${suffix}` }, data: { items: [{ product_id: product.id, quantity: 1 }] } })
  const order = (await orderResponse.json()).data
  let invoice = ''
  for (const [key, received] of [['partial', 5000], ['partial', 5000], ['final', 50000]] as const) {
    const result = await request.post(`${base}/api/v1/pos/orders/${order.id}/payments`, { headers: { ...headers, 'Idempotency-Key': `book-pay-${key}-${suffix}` }, data: { received_vnd: received } })
    expect(result.status()).toBe(200)
    invoice = (await result.json()).data.order.invoice_code
  }
  const after = (await (await request.get(`${base}/api/v1/cashbook`, { headers })).json()).data.summary.income_vnd
  expect(after - before).toBe(35000)
  const baseline = (await (await request.get(`${base}/api/v1/cashbook?date_from=${date}&date_to=${date}&store_id=${session.store_id}`, { headers })).json()).data.summary
  await page.addInitScript(() => localStorage.setItem('fnb-management:cashbook', JSON.stringify([{ code: 'POISON-CASHBOOK' }])))
  await signIn(page, '/management/cashbook')
  const search = page.getByRole('textbox', { name: 'Tìm mã phiếu hoặc nội dung...', exact: true })
  await search.fill('Thanh toán hóa đơn ' + invoice)
  await expect(page.locator('.record-table tbody tr')).toHaveCount(2)
  await expect(page.getByText('POISON-CASHBOOK')).toHaveCount(0)
  await expect(page.locator('.record-table tbody')).toContainText('30.000')
  await expect(page.locator('.record-table tbody')).toContainText('5.000')
  await page.locator('.record-table tbody tr').first().getByRole('button', { name: /^Sửa / }).click()
  await expect(page).toHaveURL('/management/invoices')
  await expect(page.getByRole('textbox', { name: 'Tìm mã hóa đơn hoặc khách hàng...', exact: true })).toHaveValue(invoice)
  await expect(page.locator('.record-expandable-row')).toHaveCount(1)
  await signIn(page, '/management/cashbook')
  const create = async (status: string, value: string, recorded: string, note: string) => {
    await page.getByRole('button', { name: 'Thêm phiếu thu chi', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByLabel('Mã phiếu', { exact: true })).toHaveValue('Tự động')
    await dialog.locator('select[name="status"]').selectOption(status)
    await dialog.getByLabel('Giá trị (₫)', { exact: true }).fill(value)
    await dialog.locator('select[name="category"]').selectOption('Thu khác')
    await dialog.locator('select[name="payerGroup"]').selectOption('Khác')
    await dialog.getByLabel('Ngày ghi sổ', { exact: true }).fill(recorded)
    await dialog.getByLabel('Ghi chú', { exact: true }).fill(note)
    await dialog.getByRole('button', { name: 'Thêm phiếu thu chi', exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
  await create('Đã thanh toán', '100000', `09/${month}/2046 09:00`, label + ' opening')
  await search.fill(label + ' opening')
  let row = page.locator('.record-table tbody tr')
  await expect(row).toHaveCount(1)
  await row.getByRole('button', { name: /^Sửa / }).click()
  await expect(page.getByRole('alert')).toContainText('không thể sửa')
  await row.getByRole('button', { name: /^Xóa / }).click()
  await expect(page.getByRole('alert')).toContainText('không thể xóa')
  await create('Chưa thanh toán', '9000', localDate, label + ' editable')
  await search.fill(label + ' editable')
  row = page.locator('.record-table tbody tr')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('Chưa thanh toán')
  await expect(row).toContainText('9.000')
  await row.getByRole('button', { name: /^Sửa / }).click()
  await page.getByRole('dialog').getByLabel('Giá trị (₫)', { exact: true }).fill('11000')
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row).toContainText('11.000')
  await row.getByRole('button', { name: /^Xóa / }).click()
  await page.getByRole('button', { name: 'Xóa bản ghi', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(row).toHaveCount(0)
  for (let i = 0; i < 9; i++) {
    const result = await request.post(`${base}/api/v1/cashbook`, { headers: { ...headers, 'Idempotency-Key': `book-manual-${suffix}-${i}` }, data: { store_id: session.store_id, direction: i === 0 ? 'out' : 'in', amount_vnd: i === 0 ? 20000 : i === 1 ? 70000 : 1000, status: i < 2 ? 'posted' : 'pending', method: i === 1 ? 'bank' : 'cash', category: i === 0 ? 'operating_expense' : 'other_receipt', payer_group: 'other', payer: '', note: `${label} seeded ${i}`, occurred_at: `${date}T09:00:00+07:00`, version: 0 } })
    expect(result.status()).toBe(201)
  }
  await search.fill(label)
  await page.locator('.cashbook-date-filters').getByLabel('Từ', { exact: true }).fill(date)
  await page.locator('.cashbook-date-filters').getByLabel('Đến', { exact: true }).fill(date)
  await page.getByLabel('Chi nhánh sổ quỹ', { exact: true }).selectOption(session.store_id)
  const metric = (index: number) => page.locator('.record-metric').nth(index).locator('strong')
  await expect(metric(1)).toContainText('70.000')
  await expect(metric(2)).toContainText('20.000')
  const expected = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(baseline.opening_vnd + 150000)
  await expect(metric(3)).toHaveText(expected)
  await page.locator('.cashbook-tabs').getByRole('button', { name: 'Ngân hàng', exact: true }).click()
  await expect(metric(1)).toContainText('70.000')
  await expect(metric(2)).toContainText('0')
  await expect(page.getByRole('link', { name: 'Tài khoản ngân hàng', exact: true })).toBeVisible()
  await page.locator('.cashbook-tabs').getByRole('button', { name: 'Tiền mặt', exact: true }).click()
  await expect(metric(1)).toContainText('0')
  await expect(metric(2)).toContainText('20.000')
  await page.locator('.cashbook-tabs').getByRole('button', { name: 'Tổng quỹ', exact: true }).click()
  await page.locator('.record-toolbar .record-filters').getByRole('button', { name: 'Chưa thanh toán', exact: true }).click()
  if (info.project.name === 'desktop') {
    await expect(page.locator('.record-table tbody tr')).toHaveCount(6)
    await page.getByRole('button', { name: 'Trang sau', exact: true }).click()
    await expect(page.locator('.record-table tbody tr')).toHaveCount(1)
  } else {
    await page.locator('.record-page .table-footer').scrollIntoViewIfNeeded()
    await expect(page.locator('.record-table tbody tr')).toHaveCount(7)
  }
  await expect(metric(1)).toContainText('70.000')
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Xuất file', exact: true }).click()
  const csv = await readFile((await (await downloadEvent).path())!, 'utf8')
  expect(csv.trim().split('\n')).toHaveLength(8)
  await page.screenshot({ path: info.outputPath('cashbook-api.png') })
})
