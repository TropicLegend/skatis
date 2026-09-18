import { MAX_LINEUP, MIN_LINEUP } from './game-rules.js';

/**
 * The result table ("Ergebnistabelle") of a list, as described in the README of
 * the repository. Everything in here is pure – the service only feeds it the
 * lineup and the games of a list.
 *
 * A player's account ("Punktekonto") starts at 0 and is updated with every
 * game:
 *
 * * a won Alleinspiel credits the Spielwert
 * * a lost Alleinspiel debits **twice** the Spielwert
 * * the Eingepasst column ("durchgestrichene Zeile") changes nothing
 *
 * The final result ("Gesamtergebnis") adds two more parts:
 *
 * * +50 per won and −50 per lost Alleinspiel
 * * a bonus for every Alleinspiel that **another** player lost (+40 with 3,
 *   +30 with 4 and +24 with 5 players)
 */

/** Bonus for every lost Alleinspiel of another player, by size of the lineup. */
const OPPONENT_BONUS = new Map<number, number>([
  [3, 40],
  [4, 30],
  [5, 24],
]);

/** Flat bonus per won and penalty per lost Alleinspiel. */
export const WIN_BONUS = 50;
export const LOSS_PENALTY = 50;

/** What one game contributes to the table. */
export interface ScorableGame {
  /** `null` when the game was passed out. */
  declarer: string | null;
  /** `null` when the game was passed out. */
  won: boolean | null;
  gameValue: number;
}

export interface PlayerResultDto {
  name: string;
  /** Seat in the lineup – position 1 dealt in round 1. */
  position: number;
  /** Number of Alleinspiele the player won ("Gew"). */
  won: number;
  /** Number of Alleinspiele the player lost ("Verl"). */
  lost: number;
  /** Sum of the Spielwerte of the won Alleinspiele ("Positiver Spielwert"). */
  wonGameValue: number;
  /** Sum of the **doubled** Spielwerte of the lost Alleinspiele ("Negativer Spielwert"). */
  lostGameValue: number;
  /** The account: `wonGameValue - lostGameValue`. */
  points: number;
  /** `+50` per won Alleinspiel. */
  wonBonus: number;
  /** `-50` per lost Alleinspiel. */
  lossPenalty: number;
  /** Bonus for the lost Alleinspiele of the other players. */
  opponentBonus: number;
  /** The final result: `points + wonBonus + lossPenalty + opponentBonus`. */
  total: number;
}

export interface ListResultsDto {
  matchday: string;
  /** Size of the lineup – it decides `opponentBonusPerGame`. */
  playerCount: number;
  gameCount: number;
  /** Games that were played, so `gameCount - passedOutCount`. */
  playedCount: number;
  /** Games that were passed out ("Eingepasst"). */
  passedOutCount: number;
  /** Sum of the Spielwerte of all games, passed out ones included (as 0). */
  totalGameValue: number;
  /** What a lost Alleinspiel of another player is worth here. */
  opponentBonusPerGame: number;
  /** One entry per player, in seating order. */
  players: PlayerResultDto[];
}

/** What a lost Alleinspiel of another player is worth in a list of this size. */
export function opponentBonusPerGame(playerCount: number): number {
  const bonus = OPPONENT_BONUS.get(playerCount);
  if (bonus === undefined) {
    throw new Error(
      `A list has ${MIN_LINEUP} to ${MAX_LINEUP} players, so a lineup of ${playerCount} cannot be scored`,
    );
  }
  return bonus;
}

/**
 * Builds the result table of a list. The lineup is taken as given, so a game
 * whose declarer is not in it (impossible through the API) is ignored.
 */
export function scoreList(
  lineup: readonly string[],
  games: readonly ScorableGame[],
  matchday: string,
): ListResultsDto {
  const playerCount = lineup.length;
  const bonusPerGame = opponentBonusPerGame(playerCount);

  const played = games.filter((game) => game.declarer !== null);
  const passedOutCount = games.length - played.length;

  const lostBy: Record<string, number> = {};
  for (const name of lineup) lostBy[name] = 0;
  for (const game of played) {
    if (game.won === false && game.declarer !== null && game.declarer in lostBy) {
      lostBy[game.declarer] = (lostBy[game.declarer] ?? 0) + 1;
    }
  }

  const totalLost = Object.values(lostBy).reduce((sum, count) => sum + count, 0);

  const players = lineup.map((name, index): PlayerResultDto => {
    const declared = played.filter((game) => game.declarer === name);
    const won = declared.filter((game) => game.won === true);
    const lost = declared.filter((game) => game.won === false);

    const wonGameValue = won.reduce((sum, game) => sum + game.gameValue, 0);
    // A lost Alleinspiel is debited twice (see the README of the repository).
    const lostGameValue = lost.reduce((sum, game) => sum + game.gameValue * 2, 0);
    const points = wonGameValue - lostGameValue;

    const wonBonus = won.length * WIN_BONUS;
    // The guard keeps a player without a loss at `0` instead of the negative
    // zero that `0 * -50` produces.
    const lossPenalty = lost.length === 0 ? 0 : lost.length * -LOSS_PENALTY;
    const opponentBonus = (totalLost - (lostBy[name] ?? 0)) * bonusPerGame;

    return {
      name,
      position: index + 1,
      won: won.length,
      lost: lost.length,
      wonGameValue,
      lostGameValue,
      points,
      wonBonus,
      lossPenalty,
      opponentBonus,
      total: points + wonBonus + lossPenalty + opponentBonus,
    };
  });

  return {
    matchday,
    playerCount,
    gameCount: games.length,
    playedCount: played.length,
    passedOutCount,
    totalGameValue: games.reduce((sum, game) => sum + game.gameValue, 0),
    opponentBonusPerGame: bonusPerGame,
    players,
  };
}
