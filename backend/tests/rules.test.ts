import { describe, expect, it } from 'vitest';

import {
  BASE_VALUES,
  MAX_LINEUP,
  MIN_LINEUP,
  NULL_VALUES,
} from '../src/modules/lists/game-rules.js';
import { buildRules } from '../src/modules/rules/rules.js';

const rules = buildRules();

describe('buildRules', () => {
  it('lists every Spielart once, the null game last', () => {
    expect(rules.gameTypes.map((gameType) => gameType.id)).toEqual([
      'KARO',
      'HERZ',
      'PIK',
      'KREUZ',
      'GRAND',
      'NULL',
    ]);
  });

  it('publishes the Grundwerte of the module that scores the games', () => {
    // The rules endpoint must not keep a second copy of the numbers, otherwise a
    // frontend would show something the service does not calculate.
    expect(
      Object.fromEntries(rules.gameTypes.map((gameType) => [gameType.id, gameType.baseValue])),
    ).toEqual({ ...BASE_VALUES, NULL: NULL_VALUES.plain });
  });

  it('gives every Spielart its limit of Spitzen', () => {
    const limits = Object.fromEntries(
      rules.gameTypes.map((gameType) => [gameType.id, gameType.maxMatadors]),
    );

    expect(limits).toEqual({ KARO: 11, HERZ: 11, PIK: 11, KREUZ: 11, GRAND: 4, NULL: null });
  });

  it('describes the fixed values of the null games', () => {
    expect(rules.nullValues).toEqual({ ...NULL_VALUES });
  });

  it('states how many players a list has', () => {
    expect(rules.lineup).toEqual({ min: MIN_LINEUP, max: MAX_LINEUP });
  });
});
