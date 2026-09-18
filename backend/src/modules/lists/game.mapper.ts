import type { Game, GameType, Matadors, Prisma } from '@prisma/client';
import type { GameInput } from './game.schemas.js';
import { calculateGameValue } from './game-rules.js';

export interface GameDto {
  id: string;
  /** Round within the list, starts at 1. */
  position: number;
  /** The lineup of the list at the time the game was entered. */
  players: string[];
  /** Geber of the round. */
  dealer: string;
  passedOut: boolean;
  declarer: string | null;
  gameType: GameType | null;
  hand: boolean;
  schneiderAnnounced: boolean;
  schwarzAnnounced: boolean;
  offen: boolean;
  matadors: { suit: Matadors; count: number } | null;
  schneider: boolean;
  schwarz: boolean;
  won: boolean | null;
  /** Spielwert, computed from the properties above. */
  gameValue: number;
  /**
   * Spielwert credited to the Alleinspieler – the "Positiver Spielwert"
   * column of the result table. `0` unless the game was won.
   */
  positiveGameValue: number;
  /**
   * Spielwert debited to the Alleinspieler, always **doubled** – the
   * "Negativer Spielwert" column of the result table. `0` unless the game was
   * lost.
   */
  negativeGameValue: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toGameDto(game: Game): GameDto {
  return {
    id: game.id,
    position: game.position,
    players: [...game.players],
    dealer: game.dealer,
    passedOut: game.declarer === null,
    declarer: game.declarer,
    gameType: game.gameType,
    hand: game.hand,
    schneiderAnnounced: game.schneiderAnnounced,
    schwarzAnnounced: game.schwarzAnnounced,
    offen: game.offen,
    matadors:
      game.matadors !== null && game.matadorsCount !== null
        ? { suit: game.matadors, count: game.matadorsCount }
        : null,
    schneider: game.schneider,
    schwarz: game.schwarz,
    won: game.won,
    gameValue: game.gameValue,
    positiveGameValue: game.won === true ? game.gameValue : 0,
    negativeGameValue: game.won === false ? game.gameValue * 2 : 0,
    note: game.note,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

/** Everything that is stored for a game, independent of the request. */
export interface GameProperties {
  position: number;
  dealer: string;
  players: string[];
  declarer: string | null;
  gameType: GameType | null;
  hand: boolean;
  schneiderAnnounced: boolean;
  schwarzAnnounced: boolean;
  offen: boolean;
  matadors: Matadors | null;
  matadorsCount: number | null;
  schneider: boolean;
  schwarz: boolean;
  won: boolean | null;
  gameValue: number;
  note: string | null;
}

/**
 * Turns a validated request into the properties that are stored. `position`,
 * `dealer` and `players` are given by the list, `gameValue` is calculated.
 */
export function toGameProperties(
  input: GameInput,
  context: { position: number; dealer: string; players: readonly string[] },
): GameProperties {
  const base = {
    position: context.position,
    dealer: context.dealer,
    players: [...context.players],
  };

  if (input.passedOut) {
    // A passed out game has no other properties at all.
    return {
      ...base,
      declarer: null,
      gameType: null,
      hand: false,
      schneiderAnnounced: false,
      schwarzAnnounced: false,
      offen: false,
      matadors: null,
      matadorsCount: null,
      schneider: false,
      schwarz: false,
      won: null,
      gameValue: 0,
      note: input.note ?? null,
    };
  }

  return {
    ...base,
    declarer: input.declarer,
    gameType: input.gameType,
    hand: input.hand,
    schneiderAnnounced: input.schneiderAnnounced,
    schwarzAnnounced: input.schwarzAnnounced,
    offen: input.offen,
    matadors: input.matadors?.suit ?? null,
    matadorsCount: input.matadors?.count ?? null,
    schneider: input.schneider,
    schwarz: input.schwarz,
    won: input.won,
    gameValue: calculateGameValue({
      gameType: input.gameType,
      matadorsCount: input.matadors?.count ?? null,
      hand: input.hand,
      schneiderAnnounced: input.schneiderAnnounced,
      schwarzAnnounced: input.schwarzAnnounced,
      offen: input.offen,
      schneider: input.schneider,
      schwarz: input.schwarz,
    }),
    note: input.note ?? null,
  };
}

export function toGameCreateData(properties: GameProperties): Prisma.GameCreateWithoutListInput {
  return { ...properties };
}

/** Position and dealer belong to the round and never change. */
export function toGameUpdateData(properties: GameProperties): Prisma.GameUpdateInput {
  return {
    players: [...properties.players],
    declarer: properties.declarer,
    gameType: properties.gameType,
    hand: properties.hand,
    schneiderAnnounced: properties.schneiderAnnounced,
    schwarzAnnounced: properties.schwarzAnnounced,
    offen: properties.offen,
    matadors: properties.matadors,
    matadorsCount: properties.matadorsCount,
    schneider: properties.schneider,
    schwarz: properties.schwarz,
    won: properties.won,
    gameValue: properties.gameValue,
    note: properties.note,
  };
}
