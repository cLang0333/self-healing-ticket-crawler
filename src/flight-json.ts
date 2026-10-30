import { gunzipSync } from 'node:zlib';

/**
 * 结果页 form#form2 里的 FlightJsonStr / FareJsonStr 是 gzip 后再 base64。
 * HTML 属性里的 "+" 有时写成 &#x2B;。浏览器 getAttribute 通常已经解码，这里再解一次，裸 HTML 也能用。
 * seatAmount 的字母（见过 L/C/S）含义没有官方说明，类型只保留原始字符串，不做语义映射。
 */
export type CabinInfo = {
  rbd: string;
  seatAmount: string;
};

export type FlightRecord = {
  airlineCode?: string;
  flightNumber: string;
  departureCity?: string;
  arrivalCity?: string;
  departureDateTime: string;
  arrivalDateTime: string;
  airplaneType?: string;
  closed?: boolean;
  cabinInfoList: CabinInfo[];
};

export type FlightJson = {
  data: FlightRecord[];
  isSuccess?: boolean;
  error?: unknown;
};

export function htmlUnescape(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (entity, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
    }
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    return named[body] ?? entity;
  });
}

export function decodeGzipBase64Json<T>(raw: string): T {
  const compact = htmlUnescape(raw).replace(/\s+/g, '');
  if (!compact) throw new Error('gzip/base64 字段是空的');
  const bytes = Buffer.from(compact, 'base64');
  if (bytes.length === 0) throw new Error('base64 解码后是空的');
  let jsonText: string;
  try {
    jsonText = gunzipSync(bytes).toString('utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`gzip 解压失败：${message}`);
  }
  try {
    return JSON.parse(jsonText) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`JSON 解析失败：${message}`);
  }
}

export function flightId(flight: FlightRecord): string {
  const code = flight.airlineCode?.trim() ?? '';
  const number = flight.flightNumber.trim();
  return code ? `${code}-${number}` : number;
}

export function clock(iso: string): string {
  const match = /T(\d{2}:\d{2})/.exec(iso);
  if (!match) throw new Error(`无法从日期时间取出时分：${iso}`);
  return match[1];
}

/** 原样拼接 rbd 与 seatAmount，不把 L/C/S 翻译成有票、候补或关闭。 */
export function formatSeats(flight: FlightRecord): string {
  return flight.cabinInfoList.map((cabin) => `${cabin.rbd}:${cabin.seatAmount}`).join(' ');
}
