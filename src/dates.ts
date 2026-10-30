/** 用台北日历计算今天，再加天数。不依赖跑测试的机器时区。 */
export function taipeiDatePlus(days: number, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error(`无法读取台北时区的 ${type}`);
    return Number(value);
  };
  const utc = new Date(Date.UTC(pick('year'), pick('month') - 1, pick('day') + days));
  const year = utc.getUTCFullYear();
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const day = String(utc.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}
