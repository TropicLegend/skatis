import type { ListResultsDto } from '../lists/scoring.js';

/**
 * The standing of a tournament.
 *
 * It is built from the result tables of the counted lists, so the two views can
 * never drift apart. A list contributes the whole final result of every player:
 *
 * * `gamesPlayed` – the games of that list the player took part in
 * * `points` – the Spielwerte of the player's own Alleinspiele (a loss debited
 *   twice)
 * * `wonBonus` / `lossPenalty` – the flat +50 per won and -50 per lost
 *   Alleinspiel; the tournament carries them over like the Spielwerte
 * * `opponentBonus` – the bonus for every Alleinspiel **another** player lost
 *   (+40 / +30 / +24 for a lineup of 3 / 4 / 5)
 *
 * `score = points + wonBonus + lossPenalty + opponentBonus` is the `total` of
 * that evening's sheet, so a score is the sum of the player's list results and
 * nothing is dropped on the way from the sheet to the standing.
 *
 * The bonus is why a player can gain points in a game they did not take part
 * in: it is paid out to the whole lineup of the list, not only to the three
 * players at the table.
 *
 * All parts are added up over the counted lists, and the ranking value is the
 * score per game played, which makes players comparable who played a different
 * number of games.
 */

export interface StandingRow {
  /** Position in the table, `1` is the best. `null` while the player has no game. */
  rank: number | null;
  name: string;
  /** Games of the counted lists the player took part in. */
  gamesPlayed: number;
  /** Spielwerte of the player's own Alleinspiele – a loss is debited twice. */
  points: number;
  /** Flat bonus for the won Alleinspiele: `+50` each. */
  wonBonus: number;
  /** Flat penalty for the lost Alleinspiele: `-50` each. */
  lossPenalty: number;
  /** Bonus for the Alleinspiele the other players lost. */
  opponentBonus: number;
  /** `points + wonBonus + lossPenalty + opponentBonus`. */
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

/** The numbers a player collected over the counted lists. */
interface Account {
  gamesPlayed: number;
  points: number;
  wonBonus: number;
  lossPenalty: number;
  opponentBonus: number;
}

/** An account that was never touched. */
function emptyAccount(): Account {
  return { gamesPlayed: 0, points: 0, wonBonus: 0, lossPenalty: 0, opponentBonus: 0 };
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
    accounts.set(name, emptyAccount());
  }

  for (const list of lists) {
    for (const player of list.players) {
      // A row for a player who is not in the roster cannot happen through the
      // API; ignoring it keeps the standing consistent with the roster.
      const account = accounts.get(player.name);
      if (!account) continue;

      account.gamesPlayed += player.gamesPlayed;
      account.points += player.points;
      account.wonBonus += player.wonBonus;
      account.lossPenalty += player.lossPenalty;
      account.opponentBonus += player.opponentBonus;
    }
  }

  const rows = names.map((name) => {
    const account = accounts.get(name) ?? emptyAccount();
    const score = account.points + account.wonBonus + account.lossPenalty + account.opponentBonus;

    return {
      name,
      gamesPlayed: account.gamesPlayed,
      points: account.points,
      wonBonus: account.wonBonus,
      lossPenalty: account.lossPenalty,
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
      wonBonus: row.wonBonus,
      lossPenalty: row.lossPenalty,
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
