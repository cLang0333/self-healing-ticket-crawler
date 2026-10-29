import { expect, type Page, type TestInfo } from '@playwright/test';
import { mandarinSelectors } from '../selectors/mandarin';
import { clock, flightId, formatSeats, type FlightJson, type FlightRecord, decodeGzipBase64Json } from './flight-json';
import { optionalText, resolveFirstNonEmpty, resolveOne, resolveOneWaiting } from './locators';
import { hardenPurchaseActions } from './readonly-guard';
import { ROUTE, departureOffsetDays } from './route';

export type UiFlightRow = {
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  promoPrice: string;
  residentPrice: string;
  actionLabel: string;
};

function clockFromText(text: string): string {
  const match = /(\d{2}:\d{2})/.exec(text);
  if (!match) throw new Error(`班次时间里没有 HH:mm：${text}`);
  return match[1];
}

async function challengeMessage(page: Page): Promise<string | undefined> {
  const html = await page.content().catch(() => '');
  if (/challenge-platform|cf-browser-verification|Just a moment|Attention Required/i.test(html)) {
    return '疑似被反爬挑战拦截：页面上没有 form#form2 的 FlightJsonStr。测试没有尝试绕过。';
  }
  return undefined;
}

export async function readFlightJson(page: Page): Promise<FlightJson> {
  let input;
  try {
    input = await resolveOneWaiting(page, mandarinSelectors.result.flightJson, 'FlightJsonStr', 30_000);
  } catch (error) {
    const challenge = await challengeMessage(page);
    if (challenge) throw new Error(challenge);
    throw error;
  }
  const raw = await input.getAttribute('value');
  if (!raw) {
    const challenge = await challengeMessage(page);
    if (challenge) throw new Error(challenge);
    throw new Error('form#form2 的 FlightJsonStr 是空的。');
  }
  const payload = decodeGzipBase64Json<FlightJson>(raw);
  await hardenPurchaseActions(page);
  return payload;
}

export function expectFlightShape(flights: FlightRecord[], requestedDate: string): void {
  expect(flights.length, '应至少有一个班次；不写死具体班次数').toBeGreaterThan(0);
  const isoDate = requestedDate.replaceAll('/', '-');
  for (const flight of flights) {
    const id = flight.flightNumber || '(missing flightNumber)';
    expect(flight.flightNumber, id).toMatch(/\S/);
    expect(flight.departureDateTime, id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(flight.arrivalDateTime, id).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(flight.departureDateTime.startsWith(isoDate), `${id} 起飞日应等于查询日`).toBe(true);
    if (flight.departureCity) expect(flight.departureCity, id).toBe(ROUTE.departure);
    if (flight.arrivalCity) expect(flight.arrivalCity, id).toBe(ROUTE.arrival);
    expect(flight.cabinInfoList?.length ?? 0, `${id} cabinInfoList`).toBeGreaterThan(0);
    for (const cabin of flight.cabinInfoList) {
      expect(cabin.rbd, id).toMatch(/^[A-Za-z0-9]+$/);
      expect(typeof cabin.seatAmount, `${id} ${cabin.rbd} seatAmount`).toBe('string');
      expect(cabin.seatAmount.length, `${id} ${cabin.rbd} seatAmount`).toBeGreaterThan(0);
    }
  }
}

export async function readUiFlights(page: Page): Promise<UiFlightRow[]> {
  const boxes = await resolveFirstNonEmpty(page, mandarinSelectors.result.ticketBox, 'ticket-box');
  const count = await boxes.count();
  const rows: UiFlightRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const box = boxes.nth(index);
    const flightNumber = (
      await (await resolveOne(box, mandarinSelectors.result.flightNumber, `航班号 #${index}`)).innerText()
    ).replace(/\s+/g, '');
    const departureTime = clockFromText(
      await (await resolveOne(box, mandarinSelectors.result.departureTime, `起飞 #${index}`)).innerText(),
    );
    const arrivalTime = clockFromText(
      await (await resolveOne(box, mandarinSelectors.result.arrivalTime, `到达 #${index}`)).innerText(),
    );
    const promoPrice = (await optionalText(box, mandarinSelectors.result.pricePromo)) ?? '';
    const residentPrice = (await optionalText(box, mandarinSelectors.result.priceResident)) ?? '';
    const actionLabel =
      (await optionalText(box, mandarinSelectors.result.buyAvailable)) ??
      (await optionalText(box, mandarinSelectors.result.buyWaitlist)) ??
      '未标示';
    rows.push({ flightNumber, departureTime, arrivalTime, promoPrice, residentPrice, actionLabel });
  }
  return rows;
}

export function formatFlightReport(date: string, flights: FlightRecord[], ui?: UiFlightRow[]): string {
  const header = [
    `route ${ROUTE.departure}->${ROUTE.arrival}`,
    `date ${date} (Asia/Taipei today+${departureOffsetDays()})`,
    `jsonFlights ${flights.length}`,
    ui ? `uiTicketBoxes ${ui.length}` : 'uiTicketBoxes n/a',
    'seatAmount 原样输出（数字或字母；字母含义不写死）',
    'read-only: 未点击我要購票/我要候補/Confirm，未填写旅客，未付款',
  ];
  const lines = flights.map((flight) => {
    const id = flightId(flight);
    const uiRow = ui?.find((row) => row.flightNumber === id || row.flightNumber === flight.flightNumber);
    const uiText = uiRow
      ? ` | ui ${uiRow.departureTime}->${uiRow.arrivalTime} ${uiRow.actionLabel} promo=${uiRow.promoPrice || '-'} resident=${uiRow.residentPrice || '-'}`
      : '';
    return `${id}  ${clock(flight.departureDateTime)} -> ${clock(flight.arrivalDateTime)}  seats ${formatSeats(flight)}${uiText}`;
  });
  return [...header, ...lines].join('\n');
}

export async function publishReport(testInfo: TestInfo, report: string): Promise<void> {
  console.log(`\n===== mandarin flights =====\n${report}\n===== end =====\n`);
  testInfo.annotations.push({ type: 'flight-report', description: report });
  await testInfo.attach('flights.txt', { body: report, contentType: 'text/plain' });
}
