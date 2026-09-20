import type { GameType } from '@prisma/client';
import {
  BASE_VALUES,
  MAX_LINEUP,
  MIN_LINEUP,
  NULL_VALUES,
  maxMatadors,
} from '../lists/game-rules.js';

/**
 * The rules of the game as data.
 *
 * Grundwerte, the fixed values of the null games and the limits of a lineup are
 * constants of the game, not of a tournament. A frontend needs them to *show*
 * what the API would calculate – and it must not keep its own copy, because
 * that copy would drift. So it asks here once and caches the answer.
 *
 * The values come straight from `lists/game-rules.ts`, the module that also
 * scores the games: there is only one place where they are written down.
 */

export interface GameTypeRulesDto {
  id: GameType;
  /** Grundwert of a suit or grand game, for a null game the value of "Null Einfach". */
  baseValue: number;
  /** Highest number of Spitzen: 4 for grand, 11 for the suits, none for null. */
  maxMatadors: number | null;
}

export interface RulesDto {
  /** Every Spielart with its Grundwert and its Spitzen limit, in the order of the enum. */
  gameTypes: GameTypeRulesDto[];
  /** The fixed Spielwerte of the null games. */
  nullValues: {
    plain: number;
    hand: number;
    offen: number;
    handOffen: number;
  };
  /** How many players a list has to have. */
  lineup: {
    min: number;
    max: number;
  };
}

export function buildRules(): RulesDto {
  const suitAndGrand = Object.entries(BASE_VALUES).map(([id, baseValue]) => ({
    id: id as GameType,
    baseValue,
    maxMatadors: maxMatadors(id as GameType),
  }));

  return {
    gameTypes: [
      ...suitAndGrand,
      { id: 'NULL', baseValue: NULL_VALUES.plain, maxMatadors: maxMatadors('NULL') },
    ],
    nullValues: { ...NULL_VALUES },
    lineup: { min: MIN_LINEUP, max: MAX_LINEUP },
  };
}
