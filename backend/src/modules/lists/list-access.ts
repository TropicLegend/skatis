import { conflict, forbidden } from '../../lib/http-error.js';
import { formatMatchdays, isoWeekday, parseIsoDate, todayIso, toIsoDate } from '../../lib/dates.js';
import type { TournamentRole } from '../../lib/tokens.js';

export interface TournamentRules {
  id: string;
  name: string;
  matchdays: number[];
}

/** Why a list is locked for a role. */
export type ListLockReason = 'SUBMITTED' | 'NOT_CURRENT_MATCHDAY' | 'NOT_A_MATCHDAY';

/** A list as far as the rules of this module are concerned. */
export interface ListState {
  status: 'OPEN' | 'SUBMITTED';
  matchday: Date;
}

/**
 * A list is locked for a `MEMBER` once it has been submitted, and it is always
 * locked for days other than the current matchday. An `ADMIN` is never locked
 * out – that is the whole point of the admin password.
 *
 * The checks below throw the same conditions, so the flag a frontend receives
 * and the answer the API gives cannot drift apart.
 */
export function listLockReasons(
  list: ListState,
  matchdays: readonly number[],
  role: TournamentRole,
): ListLockReason[] {
  if (role === 'ADMIN') return [];

  const reasons: ListLockReason[] = [];

  if (list.status === 'SUBMITTED') {
    reasons.push('SUBMITTED');
  }
  if (!matchdays.includes(isoWeekday(list.matchday))) {
    reasons.push('NOT_A_MATCHDAY');
  }
  if (toIsoDate(list.matchday) !== todayIso()) {
    reasons.push('NOT_CURRENT_MATCHDAY');
  }

  return reasons;
}

/**
 * A list exists for **one** day and never for more than one: there is no list
 * that stays open across matchdays. Its day is therefore over as soon as the
 * server's clock has moved on (the `TZ` environment variable decides when).
 */
export function isMatchdayOver(matchday: Date, today: string = todayIso()): boolean {
  return toIsoDate(matchday) < today;
}

/**
 * Whether a list counts for the tournament standing. A list that was handed in
 * counts from that moment; one that was never submitted counts as submitted as
 * soon as its day is over – the evening is over, the sheet is final.
 *
 * Nobody has to submit for that to happen: a list of a past day is final even
 * when its stored `status` still says `OPEN`, which is why the API reports the
 * stored status and the `counted` flag side by side.
 */
export function countsForStanding(list: ListState, today: string = todayIso()): boolean {
  return list.status === 'SUBMITTED' || isMatchdayOver(list.matchday, today);
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
  today: string = todayIso(),
): boolean {
  return openList !== null && !isMatchdayOver(openList.matchday, today);
}

/**
 * Refuses to hand in or reopen a list of a past day: it already counts, no
 * matter what its stored status says, so both actions would be a lie.
 */
export function assertDayNotOver(matchday: Date, action: 'submitted' | 'reopened'): void {
  if (!isMatchdayOver(matchday)) return;

  throw conflict(
    action === 'submitted'
      ? 'The day of this list is over, so it already counts as submitted'
      : 'The day of this list is over, so it can no longer be reopened',
    { matchday: toIsoDate(matchday) },
  );
}

/**
 * A list always belongs to a matchday of the tournament.
 *
 * * `ADMIN` may also work on lists of past or future matchdays.
 * * `MEMBER` may only work on the list of the current matchday.
 */
export function assertMatchdayAllowed(
  tournament: TournamentRules,
  matchday: string,
  role: TournamentRole,
): void {
  const weekday = isoWeekday(parseIsoDate(matchday));
  if (!tournament.matchdays.includes(weekday)) {
    throw forbidden(
      `${matchday} is not a matchday of "${tournament.name}" (${tournament.id}) ` +
        `(matchdays: ${formatMatchdays(tournament.matchdays)})`,
    );
  }

  if (role !== 'ADMIN' && matchday !== todayIso()) {
    throw forbidden(
      `Lists can only be created or changed on the current matchday (${todayIso()}). ` +
        'Ask an admin to create or correct lists for other days.',
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
