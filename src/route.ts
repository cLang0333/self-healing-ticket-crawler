/** 固定查一条国内线，控制请求量。金门航线的出发地只有 TSA、RMQ、KHH。 */
export const ROUTE = {
  departure: 'TSA',
  arrival: 'KNH',
  passengers: 1,
  infants: 0,
  itinType: '1',
} as const;

export const MANDARIN_ORIGIN = 'https://www.mandarin-airlines.com';
export const HOME_URL = `${MANDARIN_ORIGIN}/`;
export const SEARCH_PATH = '/b2c/BookingNPurchase/SearchFlight';

/**
 * 出发日相对台北今天的偏移。调用方要求落在 7～14 天，默认第 10 天。
 * 可用环境变量 DEPARTURE_OFFSET_DAYS 覆盖（GitHub Actions 手动触发会传入）。
 */
export function departureOffsetDays(): number {
  const raw = process.env.DEPARTURE_OFFSET_DAYS ?? '10';
  const offset = Number(raw);
  if (!Number.isInteger(offset) || offset < 7 || offset > 14) {
    throw new Error(`DEPARTURE_OFFSET_DAYS 必须是 7 到 14 的整数，收到 ${raw}`);
  }
  return offset;
}

/** 与站点现网一致的查询串：日期里的斜线保持原样，不额外编码。 */
export function searchFlightUrl(date: string): string {
  const query = [
    ['searchModel.DepartureCity', ROUTE.departure],
    ['searchModel.ArrivalCity', ROUTE.arrival],
    ['searchModel.DepartureDate', date],
    ['searchModel.ItinType', ROUTE.itinType],
    ['searchModel.PassengerNo', String(ROUTE.passengers)],
    ['searchModel.InfantNo', String(ROUTE.infants)],
  ]
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return `${MANDARIN_ORIGIN}${SEARCH_PATH}?${query}`;
}
