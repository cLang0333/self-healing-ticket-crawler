import type { Page } from '@playwright/test';

/**
 * 只读保护。
 *
 * 本项目只查班次，绝不购票。护栏会拦住：
 * - 点击「我要購票」「我要候補」或英文 Confirm（.buybt / .buybt01）
 * - 提交候补确认表单 form#Waittingform（action 为 /b2c/Waiting/FlightConfirm）
 * - 发往付款、出票、旅客资料、FlightConfirm 的请求
 *
 * 允许的唯一提交是首页 form#book 的航班搜索。搜索不是下单。
 * 不填写姓名、证件、联络方式，不进入付款。
 * 拦截名单写死在这里，不放到选择器文件里，避免以后自动改选择器时把保护放宽。
 *
 * 注意：合法的结果页 URL 含有 searchModel.PassengerNo，不能用裸的 /Passenger/ 做拦截。
 */

const networkViolations = new WeakMap<Page, string[]>();
const dialogs = new WeakMap<Page, string[]>();

const PURCHASE_URL = /FlightConfirm|\/Payment\b|Checkout|IssueTicket|PassengerInfo/i;

export async function installReadOnlyGuard(page: Page): Promise<void> {
  const hits: string[] = [];
  const dialogHits: string[] = [];
  networkViolations.set(page, hits);
  dialogs.set(page, dialogHits);

  await page.addInitScript(() => {
    const blocked = (window.__mandarinReadOnlyBlocked = window.__mandarinReadOnlyBlocked ?? []);
    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const control = target.closest('.buybt, .buybt01, button, a, p');
        if (!control) return;
        const label = (control.textContent ?? '').replace(/\s+/g, '');
        const classHit = control.matches('.buybt, .buybt01');
        const textHit = label === '我要購票' || label === '我要候補' || label.toLowerCase() === 'confirm';
        if (!classHit && !textHit) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        blocked.push(label || control.className || 'click');
      },
      true,
    );

    document.addEventListener(
      'submit',
      (event) => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (form.id === 'book' || form.getAttribute('name') === 'book') return;
        const action = `${form.getAttribute('action') ?? ''} ${form.action}`;
        const waitlist = form.id === 'Waittingform' || form.getAttribute('name') === 'Waittingform';
        const purchase = /FlightConfirm|\/Payment\b|Checkout|IssueTicket|PassengerInfo/i.test(action);
        if (!waitlist && !purchase) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        blocked.push(`submit:${form.id}:${form.getAttribute('action') ?? ''}`);
      },
      true,
    );
  });

  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (PURCHASE_URL.test(url)) {
      hits.push(`${route.request().method()} ${url}`);
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });

  page.on('dialog', async (dialog) => {
    dialogHits.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.accept().catch(() => undefined);
  });
}

/** 结果页脚本加载完之后，把购票/票价弹窗入口改成空操作。测试本身不会调用它们。 */
export async function hardenPurchaseActions(page: Page): Promise<void> {
  await page.evaluate(() => {
    const host = window as unknown as Record<string, unknown> & { __mandarinReadOnlyBlocked?: string[] };
    host.__mandarinReadOnlyBlocked = host.__mandarinReadOnlyBlocked ?? [];
    for (const name of ['doConfirm', 'ShowFareInfo']) {
      host[name] = () => {
        host.__mandarinReadOnlyBlocked?.push(name);
        return false;
      };
    }
  });
}

export function networkViolationList(page: Page): string[] {
  return networkViolations.get(page) ?? [];
}

export function unexpectedDialogs(page: Page): string[] {
  return dialogs.get(page) ?? [];
}

export async function assertReadOnly(page: Page): Promise<void> {
  const dom = await page
    .evaluate(() => window.__mandarinReadOnlyBlocked ?? [])
    .catch(() => [] as string[]);
  const problems = [...networkViolationList(page), ...dom, ...unexpectedDialogs(page)];
  if (problems.length > 0) {
    throw new Error(`只读保护：出现拦截或对话框，测试没有继续购票。\n${problems.join('\n')}`);
  }
  const url = page.url();
  if (PURCHASE_URL.test(url)) {
    throw new Error(`只读保护：页面进入了购票/付款地址 ${url}`);
  }
}

declare global {
  interface Window {
    __mandarinReadOnlyBlocked?: string[];
  }
}
