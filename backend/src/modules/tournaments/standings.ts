/**
 * The standings of a tournament ("Turnierwertung").
 *
 * A matchday is scored on its own table (see `../lists/scoring.ts`), which
 * contains parts that only make sense for that one evening – the flat +50/−50
 * per Alleinspiel and the bonus for the losses of the other players. Those are
 * deliberately **not** carried over between matchdays.
 *
 * The tournament standing therefore tracks just two things per player, added up
 * over the matchdays:
 *
 * * how many games they took part in
 * * how many points they gained with them (the account of the matchday)
 *
 * and ranks by the average points per game, which makes players comparable who
 * played a different number of games. Everything here is pure – the service
 * only feeds it the games of the submitted matchdays.
 */

/** One game, as far as the standing cares about it. */
export interface StandingGame {
  /** The three players of the round – they took part, whether or not it was played. */
  players: readonly string[];
  /** `null` for a game that was passed out. */
  declarer: string | null;
  /** `null` for a game that was passed out. */
  won: boolean | null;
  gameValue: number;
}

export interface StandingRow {
  /** Position in the table, `1` is the best. `null` while the player has no game. */
  rank: number | null;
  name: string;
  /** Games of the counted matchdays the player took part in. */
  gamesPlayed: number;
  /** Points gained with those games: a loss counts twice, as in the table. */
  points: number;
  /** `points / gamesPlayed`, rounded to two decimals. `null` without a game. */
  averagePoints: number | null;
}

export interface TournamentStandingsDto {
  tournamentId: string;
  /** How many submitted matchdays went into the standing. */
  matchdaysCounted: number;
  /** The players of the tournament, best first. */
  players: StandingRow[];
}

/** What one game is worth to its Alleinspieler – a loss is debited twice. */
export function gamePoints(game: StandingGame): number {
  if (game.declarer === null || game.won === null) return 0;
  return game.won ? game.gameValue : -2 * game.gameValue;
}

/** Rounds to two decimals and never returns a negative zero. */
function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * Builds the standing from the games of the counted matchdays. `names` is the
 * roster of the tournament – a player without a game keeps a row, but without a
 * rank.
 */
export function tournamentStandings(
  tournamentId: string,
  names: readonly string[],
  games: readonly StandingGame[],
  matchdaysCounted: number,
): TournamentStandingsDto {
  const counted = new Map<string, { gamesPlayed: number; points: number }>();
  for (const name of names) counted.set(name, { gamesPlayed: 0, points: 0 });

  for (const game of games) {
    for (const name of game.players) {
      const entry = counted.get(name);
      // A game of a player who is not in the roster cannot happen through the
      // API; ignoring it keeps the standing consistent with the roster.
      if (entry) entry.gamesPlayed += 1;
    }

    if (game.declarer !== null) {
      const entry = counted.get(game.declarer);
      if (entry) entry.points += gamePoints(game);
    }
  }

  const rows = names.map((name) => {
    const { gamesPlayed, points } = counted.get(name) ?? { gamesPlayed: 0, points: 0 };
    // The ranking uses the unrounded average, so rounding cannot change it.
    return { name, gamesPlayed, points, average: gamesPlayed === 0 ? null : points / gamesPlayed };
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
      averagePoints: row.average === null ? null : round2(row.average),
    };
  });

  return { tournamentId, matchdaysCounted, players };
}
