import type { ListResultsDto } from '../lists/scoring.js';

/**
 * The standing of a tournament.
 *
 * It is built from the result tables of the matchdays that were submitted, so
 * the two views can never drift apart. A matchday contributes two numbers per
 * player:
 *
 * * `gamesPlayed` – the games of that matchday the player took part in
 * * `points + opponentBonus` – what the player gained: the Spielwerte of their
 *   own Alleinspiele (a loss debited twice) plus the bonus for every Alleinspiel
 *   **another** player lost (+40 / +30 / +24 for a lineup of 3 / 4 / 5)
 *
 * The bonus is why a player can gain points in a game they did not take part
 * in: it is paid out to the whole lineup of the matchday, not only to the three
 * players at the table.
 *
 * Both numbers are added up over the matchdays, and the ranking value is the
 * score per game played, which makes players comparable who played a different
 * number of games. The parts of the matchday table that belong to that one
 * evening – the flat +50 per won and -50 per lost Alleinspiel – are deliberately
 * **not** carried over.
 */

export interface StandingRow {
  /** Position in the table, `1` is the best. `null` while the player has no game. */
  rank: number | null;
  name: string;
  /** Games of the counted matchdays the player took part in. */
  gamesPlayed: number;
  /** Spielwerte of the player's own Alleinspiele – a loss is debited twice. */
  points: number;
  /** Bonus for the Alleinspiele the other players lost. */
  opponentBonus: number;
  /** `points + opponentBonus` – what the whole tournament earned the player. */
  score: number;
  /** `score / gamesPlayed`, rounded to two decimals. `null` without a game. */
  averageScore: number | null;
}

export interface TournamentStandingsDto {
  tournamentId: string;
  /** How many dates went into the standing. */
  matchdaysCounted: number;
  /** How many submitted lists went into the standing – a date may have several. */
  listsCounted: number;
  /** The players of the tournament, best first. */
  players: StandingRow[];
}

/** Rounds to two decimals and never returns a negative zero. */
function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/** The numbers a player collected over the counted matchdays. */
interface Account {
  gamesPlayed: number;
  points: number;
  opponentBonus: number;
}

/**
 * Builds the standing from the result tables of the counted lists. `names` is
 * the roster of the tournament – a player without a game keeps a row, but
 * without a rank.
 */
export function tournamentStandings(
  tournamentId: string,
  names: readonly string[],
  lists: readonly ListResultsDto[],
): TournamentStandingsDto {
  const accounts = new Map<string, Account>();
  for (const name of names) {
    accounts.set(name, { gamesPlayed: 0, points: 0, opponentBonus: 0 });
  }

  for (const list of lists) {
    for (const player of list.players) {
      // A row for a player who is not in the roster cannot happen through the
      // API; ignoring it keeps the standing consistent with the roster.
      const account = accounts.get(player.name);
      if (!account) continue;

      account.gamesPlayed += player.gamesPlayed;
      account.points += player.points;
      account.opponentBonus += player.opponentBonus;
    }
  }

  const rows = names.map((name) => {
    const account = accounts.get(name) ?? { gamesPlayed: 0, points: 0, opponentBonus: 0 };
    const score = account.points + account.opponentBonus;

    return {
      name,
      gamesPlayed: account.gamesPlayed,
      points: account.points,
      opponentBonus: account.opponentBonus,
      score,
      // The ranking uses the unrounded average, so rounding cannot change it.
      average: account.gamesPlayed === 0 ? null : score / account.gamesPlayed,
    };
  });

  // Best average first; players without a game come last, sorted by name.
  rows.sort((a, b) => {
    if (a.average === null || b.average === null) {
      if (a.gamesPlayed !== b.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
      return a.name.localeCompare(b.name);
    }
    return b.average - a.average || a.name.localeCompare(b.name);
  });

  // Equal averages share a rank, the next one continues after them.
  let rank = 0;
  let previous: number | null = null;

  const players: StandingRow[] = rows.map((row, index) => {
    if (row.average !== null && row.average !== previous) {
      rank = index + 1;
      previous = row.average;
    }

    return {
      rank: row.average === null ? null : rank,
      name: row.name,
      gamesPlayed: row.gamesPlayed,
      points: row.points,
      opponentBonus: row.opponentBonus,
      score: row.score,
      averageScore: row.average === null ? null : round2(row.average),
    };
  });

  return {
    tournamentId,
    matchdaysCounted: new Set(lists.map((list) => list.matchday)).size,
    listsCounted: lists.length,
    players,
  };
}
