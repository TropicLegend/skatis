import { conflict, forbidden } from '../../lib/http-error.js';
import { formatMatchdays, isoWeekday, parseIsoDate, todayIso } from '../../lib/dates.js';
import type { TournamentRole } from '../../lib/tokens.js';

export interface TournamentRules {
  id: string;
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
