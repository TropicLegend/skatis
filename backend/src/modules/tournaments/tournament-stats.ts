import type { GameType } from '@prisma/client';
import { BASE_VALUES } from '../lists/game-rules.js';
import type { StatGame } from './player-stats.js';

/** The Spielarten in the order the rest of the API reports them. */
const GAME_TYPE_ORDER: GameType[] = [
  ...(Object.keys(BASE_VALUES) as Array<Exclude<GameType, 'NULL'>>),
  'NULL',
];

export type GameTypeGroup = 'SUIT' | 'GRAND' | 'NULL';
const GROUP_ORDER: GameTypeGroup[] = ['SUIT', 'GRAND', 'NULL'];

export type TournamentFeatureKey =
  | 'hand'
  | 'offen'
  | 'schneiderAnnounced'
  | 'schwarzAnnounced'
  | 'schneider'
  | 'schwarz';

export const TOURNAMENT_FEATURE_ORDER: TournamentFeatureKey[] = [
  'hand',
  'offen',
  'schneiderAnnounced',
  'schwarzAnnounced',
  'schneider',
  'schwarz',
];

export interface TournamentOutcomeStatsDto {
  won: number;
  lost: number;
  passedOut: number;
  /** Shares of all games, in tenths of a percent – they add up to 100. */
  wonShare: number | null;
  lostShare: number | null;
  passedOutShare: number | null;
}

export interface TournamentGameTypeStatsDto {
  gameType: GameType;
  /** Decided Alleinspiele of this type, without passed-out rounds. */
  played: number;
  won: number;
  lost: number;
  /** Share of all decided Alleinspiele. */
  share: number | null;
  /** `won / played` in percent. */
  winShare: number | null;
}

export interface TournamentGameTypeGroupStatsDto {
  group: GameTypeGroup;
  played: number;
  won: number;
  share: number | null;
  winShare: number | null;
}

export interface TournamentFeatureDistributionDto {
  key: TournamentFeatureKey;
  /** Decided Alleinspiele carrying this feature. */
  total: number;
  byGameType: Array<{ gameType: GameType; count: number; share: number | null }>;
}

export interface TournamentStatisticsDto {
  tournamentId: string;
  listsCounted: number;
  matchdaysCounted: number;
  /** Every entered round, including passed-out games. */
  totalGames: number;
  /** Alleinspiele that were played (won or lost). */
  playedGames: number;
  passedOutGames: number;
  outcomes: TournamentOutcomeStatsDto;
  gameTypes: TournamentGameTypeStatsDto[];
  gameTypeGroups: TournamentGameTypeGroupStatsDto[];
  features: TournamentFeatureDistributionDto[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : round1((part / whole) * 100);
}

/** Round to tenths and move the rounding difference to the largest part. */
function sharesOfHundred(parts: readonly number[]): Array<number | null> {
  const total = parts.reduce((sum, part) => sum + part, 0);
  if (total === 0) return parts.map(() => null);

  const tenths = parts.map((part) => Math.round((part / total) * 1000));
  const difference = 1000 - tenths.reduce((sum, part) => sum + part, 0);
  if (difference !== 0) {
    const target = parts.indexOf(Math.max(...parts));
    tenths[target] = (tenths[target] ?? 0) + difference;
  }
  return tenths.map((part) => part / 10);
}

function groupOf(gameType: GameType): GameTypeGroup {
  if (gameType === 'GRAND') return 'GRAND';
  if (gameType === 'NULL') return 'NULL';
  return 'SUIT';
}

/** Whole-tournament statistics, independent of the players. */
export function tournamentGameStats(
  tournamentId: string,
  games: readonly StatGame[],
  counted: { listsCounted: number; matchdaysCounted: number },
): TournamentStatisticsDto {
  const played = games.filter(
    (game): game is StatGame & { declarer: string; gameType: GameType; won: boolean } =>
      game.declarer !== null && game.gameType !== null && game.won !== null,
  );
  const wonGames = played.filter((game) => game.won);
  const lostGames = played.filter((game) => !game.won);
  const passedOutGames = games.filter((game) => game.declarer === null);
  const shares = sharesOfHundred([wonGames.length, lostGames.length, passedOutGames.length]);

  const gameTypes = GAME_TYPE_ORDER.map((gameType): TournamentGameTypeStatsDto => {
    const ofType = played.filter((game) => game.gameType === gameType);
    const won = ofType.filter((game) => game.won).length;
    return {
      gameType,
      played: ofType.length,
      won,
      lost: ofType.length - won,
      share: percent(ofType.length, played.length),
      winShare: percent(won, ofType.length),
    };
  });

  const gameTypeGroups = GROUP_ORDER.map((group): TournamentGameTypeGroupStatsDto => {
    const ofGroup = played.filter((game) => groupOf(game.gameType) === group);
    const won = ofGroup.filter((game) => game.won).length;
    return {
      group,
      played: ofGroup.length,
      won,
      share: percent(ofGroup.length, played.length),
      winShare: percent(won, ofGroup.length),
    };
  });

  const features = TOURNAMENT_FEATURE_ORDER.map((key): TournamentFeatureDistributionDto => {
    const matching = played.filter((game) => Boolean(game[key]));
    return {
      key,
      total: matching.length,
      byGameType: GAME_TYPE_ORDER.map((gameType) => {
        const count = matching.filter((game) => game.gameType === gameType).length;
        return { gameType, count, share: percent(count, matching.length) };
      }),
    };
  });

  return {
    tournamentId,
    listsCounted: counted.listsCounted,
    matchdaysCounted: counted.matchdaysCounted,
    totalGames: games.length,
    playedGames: played.length,
    passedOutGames: passedOutGames.length,
    outcomes: {
      won: wonGames.length,
      lost: lostGames.length,
      passedOut: passedOutGames.length,
      wonShare: shares[0] ?? null,
      lostShare: shares[1] ?? null,
      passedOutShare: shares[2] ?? null,
    },
    gameTypes,
    gameTypeGroups,
    features,
  };
}
