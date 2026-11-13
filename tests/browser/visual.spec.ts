import { test, expect } from '@playwright/test'

const routes = [
  '/management', '/management/menu-items', '/management/inventory',
  '/management/orders', '/management/invoices', '/management/suppliers', '/management/purchases', '/management/reports/sales', '/pos',
]

for (const route of routes) {
  test(`frozen UI: ${route}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.clock.setFixedTime(new Date('2026-11-10T03:00:00Z'))
    await page.goto(route)
    await expect(page.locator('h1')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`${route.replaceAll('/', '-').slice(1)}.png`, { fullPage: true })
    expect(errors).toEqual([])
  })
}
