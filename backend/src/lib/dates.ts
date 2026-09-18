/** Calendar date helpers. All dates are handled as `YYYY-MM-DD` strings at UTC midnight. */

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

/** Parses `YYYY-MM-DD` into a `Date` at UTC midnight. */
export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Formats a `Date` as `YYYY-MM-DD` (UTC). */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True when `value` is a syntactically valid and real calendar date. */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsed = parseIsoDate(value);
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === value;
}

/** ISO-8601 weekday number: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/** Current date of the server's timezone (see the `TZ` environment variable). */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday - 1] ?? `weekday ${weekday}`;
}

export function formatMatchdays(matchdays: readonly number[]): string {
  return [...matchdays]
    .sort((a, b) => a - b)
    .map((weekday) => weekdayName(weekday))
    .join(', ');
}
