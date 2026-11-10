import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({
  ...base,
  outputDir: './test-results/api',
  testMatch: '**/api.spec.ts',
  timeout: 120_000,
  use: { ...base.use, baseURL: 'http://127.0.0.1:5189', trace: 'off', actionTimeout: 10_000 },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5189 --strictPort',
    url: 'http://127.0.0.1:5189', reuseExistingServer: false,
    env: { VITE_USE_MOCK: 'false', API_PROXY_TARGET: process.env.API_TEST_BASE_URL ?? 'http://127.0.0.1:18088' },
  },
})
