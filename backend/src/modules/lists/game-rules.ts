import type { GameType, Matadors } from '@prisma/client';

/**
 * The rules of a game ("Spiel") as described in the README of the repository.
 * Everything in here is pure – the service combines it with the data of a list.
 */

/** A list consists of 3, 4 or 5 players. */
export const MIN_LINEUP = 3;
export const MAX_LINEUP = 5;

/** Grundwerte of the suit and grand games. */
export const BASE_VALUES: Record<Exclude<GameType, 'NULL'>, number> = {
  KARO: 9,
  HERZ: 10,
  PIK: 11,
  KREUZ: 12,
  GRAND: 24,
};

/** The null games have fixed Spielwerte. */
export const NULL_VALUES = {
  plain: 23,
  hand: 35,
  offen: 46,
  handOffen: 59,
} as const;

/** The announced levels and the results count as Gewinnstufen. */
export interface GameLevels {
  hand: boolean;
  schneiderAnnounced: boolean;
  schwarzAnnounced: boolean;
  offen: boolean;
  schneider: boolean;
  schwarz: boolean;
}

export interface GameValueInput extends GameLevels {
  gameType: GameType;
  /** Number of Spitzen – always `null` for a null game. */
  matadorsCount: number | null;
}

/** Highest number of Spitzen: 4 for grand, 11 for the suits, none for null. */
export function maxMatadors(gameType: GameType): number | null {
  if (gameType === 'NULL') return null;
  return gameType === 'GRAND' ? 4 : 11;
}

/** Number of chosen Gewinnstufen. */
export function countLevels(game: GameLevels): number {
  return [
    game.hand,
    game.schneiderAnnounced,
    game.schwarzAnnounced,
    game.offen,
    game.schneider,
    game.schwarz,
  ].filter(Boolean).length;
}

/**
 * Spielwert of a played game:
 *
 * * null games have a fixed value (23 / 35 / 46 / 59)
 * * everything else is `(Spitzen + Gewinnstufen + 1) * Grundwert`
 */
export function calculateGameValue(game: GameValueInput): number {
  if (game.gameType === 'NULL') {
    if (game.hand && game.offen) return NULL_VALUES.handOffen;
    if (game.hand) return NULL_VALUES.hand;
    if (game.offen) return NULL_VALUES.offen;
    return NULL_VALUES.plain;
  }

  if (game.matadorsCount === null) {
    throw new Error(`${game.gameType} needs a number of Spitzen to be scored`);
  }

  return (game.matadorsCount + countLevels(game) + 1) * BASE_VALUES[game.gameType];
}

/**
 * The Geber of a round. Player 1 deals in round 1, then player 2 and so on;
 * after the last player it starts over with player 1.
 */
export function nextDealer(lineup: readonly string[], previousDealer: string | null): string {
  const first = lineup[0];
  if (first === undefined) {
    throw new Error('Cannot determine a dealer for an empty lineup');
  }

  if (previousDealer === null) return first;

  const index = lineup.indexOf(previousDealer);
  return index === -1 ? first : (lineup[(index + 1) % lineup.length] ?? first);
}

/**
 * The players who sit out a game of this round ("Geber-Regel"). Skat is played
 * by three people, so a bigger lineup always leaves players at the side:
 *
 * * 3 players – nobody, everyone plays
 * * 4 players – the Geber
 * * 5 players – the player before and the player after the Geber
 *
 * With five players the Geber **does** play, they are only left out with four
 * players. The README of the repository is explicit about it ("Bei 5 Spielern
 * kann der Spieler vor und der Spieler nach dem Geber nicht ausgewählt
 * werden"), and it is the only way to end up with three players.
 */
export function sittingOutPlayers(lineup: readonly string[], dealer: string): string[] {
  const index = lineup.indexOf(dealer);
  if (index === -1) return [];

  const count = lineup.length;

  if (count === 4) return [dealer];

  if (count === 5) {
    const before = lineup[(index - 1 + count) % count];
    const after = lineup[(index + 1) % count];
    return [before, after].filter((name): name is string => name !== undefined);
  }

  // 3 players (the smallest lineup) – everyone is dealt in.
  return [];
}

/**
 * The players who take part in a game of this round, in seating order. Always
 * exactly three of them, and exactly the ones who may be the Alleinspieler.
 */
export function playingPlayers(lineup: readonly string[], dealer: string): string[] {
  const sittingOut = new Set(sittingOutPlayers(lineup, dealer));
  return lineup.filter((name) => !sittingOut.has(name));
}

export interface MatadorInput {
  suit: Matadors;
  count: number;
}
