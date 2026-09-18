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

export interface LockableList {
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
  list: LockableList,
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
