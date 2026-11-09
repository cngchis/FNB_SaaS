import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5188',
    browserName: 'chromium',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  expect: { toHaveScreenshot: { maxDiffPixels: 0, animations: 'disabled' } },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5188 --strictPort',
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: false,
    env: { VITE_USE_MOCK: process.env.VITE_USE_MOCK ?? 'true' },
  },
})
