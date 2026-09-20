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
 *
 * `scoreList` sums all of it up into the table of the evening, `accountProgression`
 * reports the very same numbers round by round – where every player stood before
 * and after each round.
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
  /** The three players of the round – they took part, played or Eingepasst. */
  players: readonly string[];
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
  /** Games of the list the player took part in – the Geber rule decides it. */
  gamesPlayed: number;
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
  /**
   * Number of Alleinspiele **other** players lost – the "gewonnenen Gegenspiele"
   * of a player; the source of `opponentBonus`.
   */
  opponentWon: number;
  /** Bonus for the lost Alleinspiele of the other players: `opponentWon * opponentBonusPerGame`. */
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
 *
 * The tournament standing is built from these tables, and it carries
 * `points + opponentBonus` of every matchday – see `../tournaments/standings.ts`.
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
    const opponentWon = totalLost - (lostBy[name] ?? 0);
    const opponentBonus = opponentWon * bonusPerGame;

    return {
      name,
      position: index + 1,
      gamesPlayed: games.filter((game) => game.players.includes(name)).length,
      won: won.length,
      lost: lost.length,
      wonGameValue,
      lostGameValue,
      points,
      wonBonus,
      lossPenalty,
      opponentWon,
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

/**
 * What a game does to the **Spielpunkte** of its Alleinspieler – the Spielwert
 * alone: a won Alleinspiel credits it, a lost one debits **twice** of it, a game
 * that was passed out changes nothing. The flat ±50 and the opponent bonus are
 * *not* part of it – `points` and `total` of the result table differ by exactly
 * those.
 */
export function gamePointsDelta(game: ScorableGame): number {
  if (game.declarer === null) return 0;
  return game.won === true ? game.gameValue : -game.gameValue * 2;
}

/**
 * What a game credits (+) or debits (−) to the account of its **Alleinspieler**:
 * the Spielpunkte plus the flat `+50` for a won and minus the `-50` penalty for a
 * lost Alleinspiel. The opponent bonus is not part of it – it belongs to the other
 * players and is added in `accountProgression`.
 */
export function gameAccountDelta(game: ScorableGame): number {
  if (game.declarer === null) return 0;
  return gamePointsDelta(game) + (game.won === true ? WIN_BONUS : -LOSS_PENALTY);
}

/** One round of a list as far as the accounts are concerned. */
export interface RoundAccountDto {
  /** Round within the list, starts at 1. */
  position: number;
  dealer: string;
  declarer: string | null;
  gameValue: number;
  /**
   * What this round changed for every player of the lineup: the Spielwert and the
   * flat ±50 for the Alleinspieler, the opponent bonus for the others.
   */
  deltas: Record<string, number>;
  /** The account of every player after this round. */
  accounts: Record<string, number>;
  /**
   * The **Spielpunkte** of every player after this round: the Spielwerte of their
   * own Alleinspiele, without the flat ±50 and without any bonus. After the last
   * round it is the `points` of the result table.
   */
  points: Record<string, number>;
  /** Alleinspiele the player had won up to and including this round ("Gew"). */
  won: Record<string, number>;
  /** Alleinspiele the player had lost up to and including this round ("Verl"). */
  lost: Record<string, number>;
}

export interface AccountProgressionDto {
  matchday: string;
  /** The lineup in seating order – the order inside the maps below. */
  lineup: string[];
  playerCount: number;
  /** One entry per round, in the order the rounds were played. */
  rounds: RoundAccountDto[];
  /** The account of every player after the last round – the `total` of the table. */
  accounts: Record<string, number>;
}

/** A game as the progression needs it: the properties above plus their round. */
export interface ProgressableGame extends ScorableGame {
  position: number;
  dealer: string;
}

/**
 * The account of every player before and after every round of a list – the
 * "Spielstand vor und nach dem Spiel" of one round and the data of the
 * progression chart.
 *
 * The account starts at 0 and follows the result table in full, so the chart ends
 * where the table ends: the Spielwert of the own Alleinspiele (a loss counts
 * twice), the flat `+50`/`-50` of the Alleinspieler and the opponent bonus for
 * every Alleinspiel a **teammate** lost – that bonus is paid to the whole lineup,
 * also to a player who sat out that round. After the last round `accounts` is
 * therefore the `total` of the result table. `deltas` says what one round changed
 * and is `0` for everybody the round did not touch.
 *
 * Next to the account every round also reports the **Spielpunkte** (`points`,
 * Spielwerte without any bonus) and the number of won and lost Alleinspiele each
 * player had at that moment (`won`, `lost`) – everything a Spielprotokoll needs to
 * show what one game did to the player who played it.
 */
export function accountProgression(
  lineup: readonly string[],
  games: readonly ProgressableGame[],
  matchday: string,
): AccountProgressionDto {
  const accounts: Record<string, number> = {};
  const points: Record<string, number> = {};
  const won: Record<string, number> = {};
  const lost: Record<string, number> = {};
  for (const name of lineup) {
    accounts[name] = 0;
    points[name] = 0;
    won[name] = 0;
    lost[name] = 0;
  }

  const bonusPerGame = opponentBonusPerGame(lineup.length);

  const rounds = games.map((game): RoundAccountDto => {
    const declarer = game.declarer;
    // A declarer outside the lineup cannot happen through the API; `scoreList`
    // ignores such a game as well, so nobody gets a bonus for it.
    const declarerLost = declarer !== null && lineup.includes(declarer) && game.won === false;

    const deltas: Record<string, number> = {};
    for (const name of lineup) {
      const own = declarer === name ? gameAccountDelta(game) : 0;
      const opponent = declarerLost && declarer !== name ? bonusPerGame : 0;
      deltas[name] = own + opponent;
    }

    // The Spielpunkte only move through a player's own Alleinspiel, and only
    // there the counters of won and lost Alleinspiele grow.
    if (declarer !== null && lineup.includes(declarer)) {
      points[declarer] = (points[declarer] ?? 0) + gamePointsDelta(game);
      if (game.won === true) won[declarer] = (won[declarer] ?? 0) + 1;
      if (game.won === false) lost[declarer] = (lost[declarer] ?? 0) + 1;
    }

    for (const name of lineup) {
      accounts[name] = (accounts[name] ?? 0) + (deltas[name] ?? 0);
    }

    return {
      position: game.position,
      dealer: game.dealer,
      declarer,
      gameValue: game.gameValue,
      deltas,
      accounts: { ...accounts },
      points: { ...points },
      won: { ...won },
      lost: { ...lost },
    };
  });

  return {
    matchday,
    lineup: [...lineup],
    playerCount: lineup.length,
    rounds,
    accounts: { ...accounts },
  };
}
