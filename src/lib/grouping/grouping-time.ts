const TAIPEI_PARTS = new Intl.DateTimeFormat('zh-TW', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

/**
 * Taipei time as `2026/10/19 下午12:14:45`. The string is assembled from parts because ICU versions differ in the
 * separators they emit (Node 24 puts U+2009 before the time), and server render and hydration must match exactly.
 */
export function formatGroupingTime(createdAt: string): string {
  const part = Object.fromEntries(
    TAIPEI_PARTS.formatToParts(new Date(createdAt)).map(({ type, value }) => [type, value])
  );
  return `${part.year}/${part.month}/${part.day} ${part.dayPeriod}${part.hour}:${part.minute}:${part.second}`;
}
