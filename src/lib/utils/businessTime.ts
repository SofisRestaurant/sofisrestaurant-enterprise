
const PHOENIX_OFFSET_MINUTES = -7 * 60;

/**
 * Convert any date value to a YYYY-MM-DD string in Phoenix local time.
 *
 * @param date - ISO string, Date object, or milliseconds. Defaults to now.
 */
export function phoenixDateString(date?: string | Date | number): string {
  const ms =
    date === undefined
      ? Date.now()
      : typeof date === 'number'
        ? date
        : typeof date === 'string'
          ? Date.parse(date)
          : date.getTime();

  if (!Number.isFinite(ms)) {
    return new Date().toISOString().slice(0, 10);
  }

  const phoenixMs = ms + PHOENIX_OFFSET_MINUTES * 60 * 1000;
  const d = new Date(phoenixMs);

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}


export function phoenixTodayString(): string {
  return phoenixDateString(Date.now());
}


export function isSamePhoenixDay(
  a: string | Date | number,
  b: string | Date | number,
): boolean {
  return phoenixDateString(a) === phoenixDateString(b);
}


export function phoenixDayStartIso(date?: string | Date | number): string {
  const localDay = phoenixDateString(date);

  const midnightUtcMs =
    Date.parse(localDay + 'T00:00:00Z') - PHOENIX_OFFSET_MINUTES * 60 * 1000;
  return new Date(midnightUtcMs).toISOString();
}