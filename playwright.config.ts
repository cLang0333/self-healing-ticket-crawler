import { defineConfig } from '@playwright/test';

/**
 * 只读冒烟：全局 1 个 worker、0 次重试，避免对航司站点并发或反复重放。
 * 一次完整运行只有两条会访问网站的用例：结果页 GET，以及首页表单提交。
 * 不伪装 UA、不关闭自动化特征、不绕过 reCAPTCHA / Turnstile。
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  outputDir: 'test-results',
  use: {
    browserName: 'chromium',
    headless: true,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    viewport: { width: 1366, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'off',
    video: 'off',
  },
});
