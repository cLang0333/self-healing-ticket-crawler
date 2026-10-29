import fs from 'node:fs';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

function slug(titlePath: string[]): string {
  const ascii = titlePath
    .join('-')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  return ascii || 'test';
}

/**
 * 失败：全页截图、page.content() HTML、报错信息。
 * 成功：同一套页面快照，作为以后和改版页面对比的基线。
 * 目录默认是仓库下的 evidence/，可用 EVIDENCE_DIR 改。
 */
export async function saveEvidence(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.status === 'skipped') return;

  const failed = testInfo.status !== testInfo.expectedStatus;
  const bucket = failed ? 'failure' : 'baseline';
  const dir = path.join(process.env.EVIDENCE_DIR ?? 'evidence', bucket, slug(testInfo.titlePath));
  fs.mkdirSync(dir, { recursive: true });

  const notes: string[] = [];
  let url = '';
  try {
    url = page.url();
  } catch (error) {
    notes.push(`url: ${error instanceof Error ? error.message : String(error)}`);
  }

  const screenshotPath = path.join(dir, 'page.png');
  let savedScreenshot = false;
  try {
    await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 30_000 });
    savedScreenshot = true;
  } catch (error) {
    notes.push(`full-page screenshot: ${error instanceof Error ? error.message : String(error)}`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 15_000 });
      savedScreenshot = true;
      notes.push('fell back to viewport screenshot');
    } catch (inner) {
      notes.push(`viewport screenshot: ${inner instanceof Error ? inner.message : String(inner)}`);
    }
  }

  const htmlPath = path.join(dir, 'page.html');
  let savedHtml = false;
  try {
    fs.writeFileSync(htmlPath, await page.content(), 'utf8');
    savedHtml = true;
  } catch (error) {
    notes.push(`html: ${error instanceof Error ? error.message : String(error)}`);
  }

  const report = testInfo.annotations
    .filter((annotation) => annotation.type === 'flight-report' && annotation.description)
    .map((annotation) => annotation.description)
    .join('\n\n');
  if (report) fs.writeFileSync(path.join(dir, 'flights.txt'), report, 'utf8');

  fs.writeFileSync(
    path.join(dir, 'meta.json'),
    JSON.stringify(
      {
        title: testInfo.titlePath,
        status: testInfo.status,
        expectedStatus: testInfo.expectedStatus,
        url,
        savedAt: new Date().toISOString(),
        notes,
      },
      null,
      2,
    ),
    'utf8',
  );

  if (savedScreenshot) {
    await testInfo.attach('page.png', { path: screenshotPath, contentType: 'image/png' }).catch(() => undefined);
  }
  if (savedHtml) {
    await testInfo.attach('page.html', { path: htmlPath, contentType: 'text/html' }).catch(() => undefined);
  }

  if (failed) {
    const error = testInfo.error;
    const body = [
      `title: ${testInfo.titlePath.join(' > ')}`,
      `status: ${testInfo.status}`,
      `url: ${url || '(unavailable)'}`,
      '',
      error?.message ?? '(no error message)',
      '',
      error?.stack ?? '',
      notes.length ? `\ncapture notes:\n${notes.join('\n')}` : '',
    ].join('\n');
    fs.writeFileSync(path.join(dir, 'error.txt'), body, 'utf8');
    await testInfo.attach('error.txt', { body, contentType: 'text/plain' }).catch(() => undefined);
  } else if (!savedScreenshot || !savedHtml) {
    throw new Error(`成功用例没有留下完整基线（截图或 HTML 失败）：${notes.join('；')}`);
  }
}
