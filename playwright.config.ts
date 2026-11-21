import { defineConfig, devices } from '@playwright/test';

/**
 * Этап 7, NFR-14: e2e-тесты в Chrome, Firefox и Safari (WebKit) + экран телефона 360 px.
 * Тестируется собранный сайт (vite preview — с той же CSP, что в продакшене) и API на хранилищах в памяти.
 * Запуск: `npm run test:e2e` (браузеры — один раз `npx playwright install`).
 */
const WEB_PORT = 4180;
const API_PORT = 8788;
const phone = { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true };

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'safari', use: { ...devices['Desktop Safari'] } },
    // US-01 / US-02 на телефоне: Chrome (Android) и Safari (iPhone) с шириной 360 px
    { name: 'phone-chrome', use: { ...devices['Pixel 7'], ...phone } },
    { name: 'phone-safari', use: { ...devices['iPhone 14'], ...phone } },
  ],
  webServer: [
    {
      command: 'npx tsx apps/api/src/memory-server.ts',
      env: { API_PORT: String(API_PORT) },
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm run build -w @cn/web && npm run preview -w @cn/web -- --port ${WEB_PORT}`,
      env: { API_TARGET: `http://127.0.0.1:${API_PORT}` },
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
