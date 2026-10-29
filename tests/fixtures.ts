import { test as base, expect } from '@playwright/test';
import { saveEvidence } from '../src/evidence';
import { installReadOnlyGuard } from '../src/readonly-guard';

/**
 * 只读保护装在每条用例的 page 上。用例之间空 2 秒，避免连续砸站点。
 * workers 在 playwright.config.ts 里固定为 1。
 */
let started = 0;

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (started > 0) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    started += 1;
    await installReadOnlyGuard(page);
    await use(page);
    // 现场写在 fixture 拆除里，而不是 afterEach。
    // 从被多个 spec 导入的模块里调用 test.afterEach，钩子只会挂到第一个导入它的文件上。
    await saveEvidence(page, testInfo);
  },
});

export { expect };
