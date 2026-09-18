import { conflict, forbidden } from '../../lib/http-error.js';
import { formatMatchdays, isoWeekday, parseIsoDate, todayIso } from '../../lib/dates.js';
import type { TournamentRole } from '../../lib/tokens.js';

export interface TournamentRules {
  name: string;
  matchdays: number[];
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
      `${matchday} is not a matchday of "${tournament.name}" ` +
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

/** Submitted lists are frozen and have to be reopened by an admin. */
export function assertListEditable(status: 'OPEN' | 'SUBMITTED'): void {
  if (status === 'SUBMITTED') {
    throw conflict(
      'This list has already been submitted and can only be changed after an admin reopened it',
    );
  }
}
