import { parseIsoDate } from '../../lib/dates.js';
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

/** How the time axis of the standing history is grouped. */
export type StandingsGroupBy = 'matchday' | 'week' | 'month';

/**
 * The standing at the end of one bucket of the time axis. Every map holds one
 * entry per player, in the order of `players`.
 */
export interface StandingsHistoryBucketDto {
  /** Stable key of the bucket: `2026-09-16`, `2026-W38` or `2026-09`. */
  key: string;
  /** First and last matchday of the bucket (`YYYY-MM-DD`). */
  from: string;
  to: string;
  /** How many different matchdays went into the bucket. */
  matchdayCount: number;
  /** `score / gamesPlayed` as at the end of the bucket; `null` without a game. */
  averageScore: Record<string, number | null>;
  /** The `score` of the standing up to the end of the bucket: Spielwerte plus bonuses. */
  score: Record<string, number>;
  /** The games the player took part in up to the end of the bucket. */
  gamesPlayed: Record<string, number>;
}

export interface StandingsHistoryDto {
  tournamentId: string;
  groupBy: StandingsGroupBy;
  /** The players in the order they are handed in – the order of the series. */
  players: string[];
  /** The buckets in time order, oldest first. */
  buckets: StandingsHistoryBucketDto[];
}

/** ISO-8601 calendar week of a `YYYY-MM-DD` date, as `2026-W38`. */
function isoWeekKey(matchday: string): string {
  const date = parseIsoDate(matchday);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);

  const year = date.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const week = Math.ceil(((date.getTime() - startOfYear) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** The bucket a matchday belongs to – one date, one week or one month. */
function bucketKey(matchday: string, groupBy: StandingsGroupBy): string {
  if (groupBy === 'week') return isoWeekKey(matchday);
  if (groupBy === 'month') return matchday.slice(0, 7);
  return matchday;
}

/** The ranking value of one player: the same average the table shows. */
function averageScoreOf(score: number, gamesPlayed: number): number | null {
  return gamesPlayed === 0 ? null : round2(score / gamesPlayed);
}

/**
 * The standing at the end of every bucket of the time axis – the history of the
 * ranking, as the average score per game.
 *
 * A bucket always shows where it **ended**: all its lists are added up, so the
 * last bucket matches the standing, and its `averageScore` is the one the table
 * ranks by. That is what keeps a tournament over months comparable – a player who
 * missed an evening keeps their own average instead of falling behind.
 *
 * `names` also decides the order of the series: the service hands in the order of
 * the standing, so chart and table show the players in the same order.
 */
export function standingsHistory(
  tournamentId: string,
  names: readonly string[],
  lists: readonly ListResultsDto[],
  groupBy: StandingsGroupBy = 'matchday',
): StandingsHistoryDto {
  const score: Record<string, number> = {};
  const gamesPlayed: Record<string, number> = {};
  for (const name of names) {
    score[name] = 0;
    gamesPlayed[name] = 0;
  }

  const buckets: StandingsHistoryBucketDto[] = [];
  let current: StandingsHistoryBucketDto | null = null;

  // Several lists may share a matchday, so the buckets are filled in time order.
  const ordered = [...lists].sort((a, b) => a.matchday.localeCompare(b.matchday));

  for (const list of ordered) {
    for (const player of list.players) {
      // A player outside the roster cannot happen through the API; skipping keeps
      // the history consistent with the standing.
      if (!(player.name in score)) continue;

      score[player.name] = (score[player.name] ?? 0) + player.total;
      gamesPlayed[player.name] = (gamesPlayed[player.name] ?? 0) + player.gamesPlayed;
    }

    const key = bucketKey(list.matchday, groupBy);
    if (current === null || current.key !== key) {
      current = {
        key,
        from: list.matchday,
        to: list.matchday,
        matchdayCount: 1,
        averageScore: {},
        score: {},
        gamesPlayed: {},
      };
      buckets.push(current);
    } else if (current.to !== list.matchday) {
      current.to = list.matchday;
      current.matchdayCount += 1;
    }

    current.score = { ...score };
    current.gamesPlayed = { ...gamesPlayed };
    current.averageScore = Object.fromEntries(
      names.map((name) => [name, averageScoreOf(score[name] ?? 0, gamesPlayed[name] ?? 0)]),
    );
  }

  return { tournamentId, groupBy, players: [...names], buckets };
}
