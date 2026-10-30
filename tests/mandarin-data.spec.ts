import { gzipSync } from 'node:zlib';
import { taipeiDatePlus } from '../src/dates';
import { decodeGzipBase64Json } from '../src/flight-json';
import { expectFlightShape, formatFlightReport, publishReport, readFlightJson } from '../src/read-flights';
import { assertReadOnly } from '../src/readonly-guard';
import { departureOffsetDays, searchFlightUrl } from '../src/route';
import { expect, test } from './fixtures';

function sampleWithPlus(): string {
  for (let n = 0; n < 40; n += 1) {
    const encoded = gzipSync(
      Buffer.from(JSON.stringify({ marker: 'plus-check', pad: 'x'.repeat(n) })),
    ).toString('base64');
    if (encoded.includes('+')) return encoded;
  }
  throw new Error('没有生成含 + 的 base64 样本');
}

/**
 * 数据层：直接 GET 结果页，解码 form#form2 的 FlightJsonStr。
 * 只读：不点购票、不填个人信息、不付款。选择器只来自 selectors/mandarin.ts。
 */
test('data-layer GET result page decodes FlightJsonStr', async ({ page }, testInfo) => {
  const wire = sampleWithPlus();
  const roundTrip = decodeGzipBase64Json<{ marker: string }>(wire.replaceAll('+', '&#x2B;'));
  expect(roundTrip.marker).toBe('plus-check');

  const offset = departureOffsetDays();
  expect(offset).toBeGreaterThanOrEqual(7);
  expect(offset).toBeLessThanOrEqual(14);
  const date = taipeiDatePlus(offset);
  expect(date).toMatch(/^\d{4}\/\d{2}\/\d{2}$/);

  await page.goto(searchFlightUrl(date), { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const payload = await readFlightJson(page);
  expect(payload.isSuccess, JSON.stringify(payload.error ?? null)).not.toBe(false);
  const flights = payload.data;
  await publishReport(testInfo, formatFlightReport(date, flights));
  expectFlightShape(flights, date);

  const current = decodeURIComponent(page.url());
  expect(current).toContain('searchModel.DepartureCity=TSA');
  expect(current).toContain('searchModel.ArrivalCity=KNH');
  expect(current).toContain(`searchModel.DepartureDate=${date}`);
  expect(current).toContain('searchModel.ItinType=1');
  expect(current).toContain('searchModel.PassengerNo=1');
  expect(current).toContain('searchModel.InfantNo=0');

  await assertReadOnly(page);
});
