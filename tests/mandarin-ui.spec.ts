import type { Locator, Page } from '@playwright/test';
import { arrivalOptionCandidates, mandarinSelectors } from '../selectors/mandarin';
import { taipeiDatePlus } from '../src/dates';
import { clock, flightId } from '../src/flight-json';
import { resolveOne, resolveOneWaiting } from '../src/locators';
import {
  expectFlightShape,
  formatFlightReport,
  publishReport,
  readFlightJson,
  readUiFlights,
  type UiFlightRow,
} from '../src/read-flights';
import { assertReadOnly, unexpectedDialogs } from '../src/readonly-guard';
import { HOME_URL, ROUTE, departureOffsetDays } from '../src/route';
import { expect, test } from './fixtures';

/**
 * UI 层：从首页订票表单走到结果页。
 *
 * 只读保护（代码里也强制拦住了）：
 * - 不点「我要購票」(.buybt)、「我要候補」(.buybt01) 或 Confirm
 * - 不填姓名、证件、电话、邮箱
 * - 不进入确认、候补提交或付款
 * 搜索按钮 beforeSub() 会先取隐形 reCAPTCHA token 再提交，这是查票，不是下单。测试不伪造 token。
 * 选择器只来自 selectors/mandarin.ts。
 */
test('ui-layer home form TSA-KNH matches JSON flights', async ({ page }, testInfo) => {
  const offset = departureOffsetDays();
  const date = taipeiDatePlus(offset);

  await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  try {
    const cookie = await resolveOne(page, mandarinSelectors.home.cookieAccept, 'cookie');
    if (await cookie.isVisible()) await cookie.click({ timeout: 2_000 });
  } catch {
    // 横幅不在或不挡操作。
  }

  const recaptchaReady = await page
    .waitForFunction(() => typeof window.grecaptcha?.execute === 'function', null, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!recaptchaReady) {
    throw new Error(
      '首页没有出现 grecaptcha.execute。搜索按钮 beforeSub() 会先取隐形 reCAPTCHA v3 token 再提交。本次没有绕过验证码。',
    );
  }

  const departure = await resolveOneWaiting(page, mandarinSelectors.home.departure, '出发地', 20_000);
  await departure.selectOption(ROUTE.departure);

  const arrival = await resolveOne(page, mandarinSelectors.home.arrival, '目的地');
  await resolveOneWaiting(arrival, arrivalOptionCandidates(ROUTE.arrival), '金门选项', 10_000);
  await arrival.selectOption(ROUTE.arrival);

  const oneWay = await resolveOne(page, mandarinSelectors.home.oneWay, '单程');
  await expect.poll(async () => oneWay.isChecked()).toBe(true);

  const adult = await resolveOne(page, mandarinSelectors.home.adult, '成人');
  const infant = await resolveOne(page, mandarinSelectors.home.infant, '婴儿');
  await expect(adult).toHaveValue(String(ROUTE.passengers));
  await expect(infant).toHaveValue(String(ROUTE.infants));

  const dateInput = await resolveOne(page, mandarinSelectors.home.departureDate, '出发日');
  await dateInput.evaluate((element, value) => {
    const input = element as HTMLInputElement;
    input.removeAttribute('readonly');
    const jq = (window as unknown as {
      jQuery?: (el: Element) => { datepicker?: (method: string, date: string) => void };
    }).jQuery;
    try {
      jq?.(input).datepicker?.('setDate', value);
    } catch {
      // 日期插件不一定挂在这个 input 上，下面直接写 value。
    }
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, date);
  await expect(dateInput).toHaveValue(date);

  const search = await resolveOne(page, mandarinSelectors.home.searchButton, '搜索');
  await clickSearch(page, search);

  const payload = await readFlightJson(page);
  expect(payload.isSuccess, JSON.stringify(payload.error ?? null)).not.toBe(false);
  const flights = payload.data;
  let uiRows: UiFlightRow[] | undefined;
  let uiError: unknown;
  try {
    uiRows = await readUiFlights(page);
  } catch (error) {
    uiError = error;
  }
  await publishReport(testInfo, formatFlightReport(date, flights, uiRows));
  if (uiError) throw uiError;
  expectFlightShape(flights, date);

  expect(uiRows, '结果页应读出 .ticket-box').toBeTruthy();
  const rows = uiRows as UiFlightRow[];
  expect(rows.length, '结果页 .ticket-box 应多于 0，但不写死班次数').toBeGreaterThan(0);
  expect(rows.length, 'ticket-box 数量应与 FlightJsonStr 班次数一致').toBe(flights.length);
  expect(rows.map((row) => row.flightNumber).sort()).toEqual(flights.map((flight) => flightId(flight)).sort());

  for (const row of rows) {
    const flight = flights.find((item) => flightId(item) === row.flightNumber);
    expect(flight, row.flightNumber).toBeTruthy();
    expect(row.departureTime, row.flightNumber).toBe(clock(flight!.departureDateTime));
    expect(row.arrivalTime, row.flightNumber).toBe(clock(flight!.arrivalDateTime));
  }

  const current = decodeURIComponent(page.url());
  expect(current).toContain('/b2c/BookingNPurchase/SearchFlight');
  expect(current).toContain(`searchModel.DepartureCity=${ROUTE.departure}`);
  expect(current).toContain(`searchModel.ArrivalCity=${ROUTE.arrival}`);
  expect(current).toContain(`searchModel.DepartureDate=${date}`);

  await assertReadOnly(page);
});

async function clickSearch(page: Page, button: Locator): Promise<void> {
  let timer: ReturnType<typeof setInterval> | undefined;
  const dialogFailure = new Promise<never>((_, reject) => {
    timer = setInterval(() => {
      const messages = unexpectedDialogs(page);
      if (messages.length === 0) return;
      if (timer) clearInterval(timer);
      reject(new Error(`页面弹出对话框，测试已停止且未下单：${messages.join(' | ')}`));
    }, 200);
  });
  const navigated = page.waitForURL(/\/b2c\/BookingNPurchase\/SearchFlight/i, { timeout: 60_000 });
  void navigated.catch(() => undefined);

  await button.click();
  try {
    await Promise.race([navigated, dialogFailure]);
  } finally {
    if (timer) clearInterval(timer);
  }
}

declare global {
  interface Window {
    grecaptcha?: { execute?: (siteKey: string, options: { action: string }) => Promise<string> };
  }
}
