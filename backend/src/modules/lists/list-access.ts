import { conflict, forbidden } from '../../lib/http-error.js';
import {
  formatMatchdays,
  isoWeekday,
  localTime,
  parseIsoDate,
  todayIso,
  toIsoDate,
} from '../../lib/dates.js';
import type { TournamentRole } from '../../lib/tokens.js';

export interface TournamentRules {
  id: string;
  name: string;
  matchdays: number[];
  /** Stored playing times – read defensively, see {@link matchdayWindowsOf}. */
  matchdayWindows?: unknown;
}

/** The optional playing time ("von"–"bis") of one weekday, e.g. `18:00`–`22:30`. */
export interface MatchdayWindow {
  from: string;
  to: string;
}

/** Which weekday (ISO 1–7) is played from when to when. Days without an entry play "all day". */
export type MatchdayWindows = Record<string, MatchdayWindow>;

const WINDOW_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Reads stored playing times defensively: the API validates them on the way in,
 * so anything that does not fit the shape is dropped here instead of trusted –
 * a hand-edited row must not break the day logic.
 */
export function matchdayWindowsOf(value: unknown): MatchdayWindows {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  const windows: MatchdayWindows = {};
  for (const [weekday, entry] of Object.entries(value)) {
    if (!/^[1-7]$/.test(weekday)) continue;
    if (typeof entry !== 'object' || entry === null) continue;

    const { from, to } = entry as { from?: unknown; to?: unknown };
    if (typeof from !== 'string' || typeof to !== 'string') continue;
    if (!WINDOW_TIME_PATTERN.test(from) || !WINDOW_TIME_PATTERN.test(to) || from >= to) continue;

    windows[weekday] = { from, to };
  }
  return windows;
}

/** The playing time of the weekday of `matchday`, if one is set. */
export function windowOf(windows: MatchdayWindows, matchday: Date): MatchdayWindow | null {
  return windows[String(isoWeekday(matchday))] ?? null;
}

/** Why a list is locked for a role. */
export type ListLockReason =
  'SUBMITTED' | 'NOT_CURRENT_MATCHDAY' | 'NOT_A_MATCHDAY' | 'WINDOW_NOT_STARTED' | 'WINDOW_OVER';

/** A list as far as the rules of this module are concerned. */
export interface ListState {
  status: 'OPEN' | 'SUBMITTED';
  matchday: Date;
}

/**
 * A list is locked for a `MEMBER` once it has been submitted, and it is always
 * locked for days other than the current matchday. On a day with a playing time
 * it is locked before the "von" and once the "bis" has passed – the evening has
 * not started yet, or it is over. An `ADMIN` is never locked out – that is the
 * whole point of the admin password.
 *
 * The checks below throw the same conditions, so the flag a frontend receives
 * and the answer the API gives cannot drift apart.
 */
export function listLockReasons(
  list: ListState,
  matchdays: readonly number[],
  windows: MatchdayWindows = {},
  role: TournamentRole,
  now: Date = new Date(),
): ListLockReason[] {
  if (role === 'ADMIN') return [];

  const reasons: ListLockReason[] = [];

  if (list.status === 'SUBMITTED') {
    reasons.push('SUBMITTED');
  }
  if (!matchdays.includes(isoWeekday(list.matchday))) {
    reasons.push('NOT_A_MATCHDAY');
  }
  if (toIsoDate(list.matchday) !== todayIso(now)) {
    reasons.push('NOT_CURRENT_MATCHDAY');
  } else if (isBeforeWindow(list.matchday, windows, now)) {
    reasons.push('WINDOW_NOT_STARTED');
  } else if (isMatchdayOver(list.matchday, windows, now)) {
    reasons.push('WINDOW_OVER');
  }

  return reasons;
}

/**
 * A list exists for **one** day and never for more than one: there is no list
 * that stays open across matchdays. Its day is therefore over as soon as the
 * server's clock has moved on (the `TZ` environment variable decides when) –
 * or, when the admin set a playing time, as soon as its "bis" has passed.
 */
export function isMatchdayOver(
  matchday: Date,
  windows: MatchdayWindows = {},
  now: Date = new Date(),
): boolean {
  const today = todayIso(now);
  if (toIsoDate(matchday) < today) return true;
  if (toIsoDate(matchday) !== today) return false;

  const window = windowOf(windows, matchday);
  return window !== null && localTime(now) >= window.to;
}

/** Is `matchday` today and has its playing time not started yet? */
export function isBeforeWindow(
  matchday: Date,
  windows: MatchdayWindows = {},
  now: Date = new Date(),
): boolean {
  if (toIsoDate(matchday) !== todayIso(now)) return false;

  const window = windowOf(windows, matchday);
  return window !== null && localTime(now) < window.from;
}

/**
 * The first date that is still being played: normally today, but once today's
 * playing time is over it is tomorrow. Lists before this date count for the
 * standing – the boundary the database queries use.
 */
export function playingFromIso(windows: MatchdayWindows = {}, now: Date = new Date()): string {
  const today = todayIso(now);
  if (!isMatchdayOver(parseIsoDate(today), windows, now)) return today;

  return toIsoDate(new Date(parseIsoDate(today).getTime() + 86_400_000));
}

/**
 * Whether a list counts for the tournament standing. A list that was handed in
 * counts from that moment; one that was never submitted counts as submitted as
 * soon as its day is over – the evening is over, the sheet is final. A playing
 * time set by the admin makes the day end at its "bis".
 *
 * Nobody has to submit for that to happen: a list of a past day is final even
 * when its stored `status` still says `OPEN`, which is why the API reports the
 * stored status and the `counted` flag side by side.
 */
export function countsForStanding(
  list: ListState,
  windows: MatchdayWindows = {},
  now: Date = new Date(),
): boolean {
  return list.status === 'SUBMITTED' || isMatchdayOver(list.matchday, windows, now);
}

/**
 * Whether an open list still takes its place ("Serie, Tisch").
 *
 * While a list is open *and* its day is not over, its round is still being
 * played: another sheet for the same table of the same series would be a second
 * list for one table, so it is refused. As soon as the day is over the sheet is
 * final by itself – it counts for the standing and nobody could hand it in any
 * more – and the table is free for the next series.
 */
export function takesSlot(
  openList: { matchday: Date } | null,
  windows: MatchdayWindows = {},
  now: Date = new Date(),
): boolean {
  return openList !== null && !isMatchdayOver(openList.matchday, windows, now);
}

/**
 * Refuses to hand in or reopen a list whose day is over (or whose playing time
 * has passed): it already counts, no matter what its stored status says, so
 * both actions would be a lie.
 */
export function assertDayNotOver(
  matchday: Date,
  action: 'submitted' | 'reopened',
  windows: MatchdayWindows = {},
  now: Date = new Date(),
): void {
  if (!isMatchdayOver(matchday, windows, now)) return;

  const scope = windowOf(windows, matchday)
    ? 'The playing time of this list'
    : 'The day of this list';
  throw conflict(
    action === 'submitted'
      ? `${scope} is over, so it already counts as submitted`
      : `${scope} is over, so it can no longer be reopened`,
    { matchday: toIsoDate(matchday) },
  );
}

/**
 * A list always belongs to a matchday of the tournament.
 *
 * * `ADMIN` may also work on lists of past or future matchdays.
 * * `MEMBER` may only work on the list of the current matchday – and, when the
 *   admin set a playing time for that weekday, only inside it: before the "von"
 *   no list may be created, after the "bis" the day is over.
 */
export function assertMatchdayAllowed(
  tournament: TournamentRules,
  matchday: string,
  role: TournamentRole,
  now: Date = new Date(),
): void {
  const weekday = isoWeekday(parseIsoDate(matchday));
  if (!tournament.matchdays.includes(weekday)) {
    throw forbidden(
      `${matchday} is not a matchday of "${tournament.name}" (${tournament.id}) ` +
        `(matchdays: ${formatMatchdays(tournament.matchdays)})`,
    );
  }

  if (role === 'ADMIN') return;

  if (matchday !== todayIso(now)) {
    throw forbidden(
      `Lists can only be created or changed on the current matchday (${todayIso(now)}). ` +
        'Ask an admin to create or correct lists for other days.',
    );
  }

  const windows = matchdayWindowsOf(tournament.matchdayWindows);
  const window = windowOf(windows, parseIsoDate(matchday));
  if (window === null) return;

  const time = localTime(now);
  if (time < window.from) {
    throw forbidden(
      `The playing time of ${matchday} starts at ${window.from} – lists can only be ` +
        'created and changed from then on. Ask an admin to work ahead.',
    );
  }
  if (time >= window.to) {
    throw forbidden(
      `The playing time of ${matchday} ended at ${window.to} – the lists of that day ` +
        'already count as submitted. Ask an admin to correct them.',
    );
  }
}

/**
 * A submitted list is frozen for members. Admins may keep working on it at any
 * time ("Nutzer kann im Nachhinein Listen modifizieren, ggf. korrigieren und
 * löschen") – they do not have to reopen it first.
 */
export function assertListEditable(status: 'OPEN' | 'SUBMITTED', role: TournamentRole): void {
  if (status === 'SUBMITTED' && role !== 'ADMIN') {
    throw conflict(
      'This list has already been submitted and can no longer be changed. ' +
        'Ask an admin to correct it.',
    );
  }
}
