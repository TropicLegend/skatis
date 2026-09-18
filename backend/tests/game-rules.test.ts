import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/lib/http-error.js';
import { assertDeclarerAllowed, assertLineupComplete } from '../src/modules/lists/game-entry.js';
import {
  BASE_VALUES,
  NULL_VALUES,
  calculateGameValue,
  countLevels,
  eligibleDeclarers,
  excludedDeclarers,
  maxMatadors,
  nextDealer,
} from '../src/modules/lists/game-rules.js';
import { playedGameSchema, type PlayedGameInput } from '../src/modules/lists/game.schemas.js';

const LINEUP_3 = ['Anna', 'Bert', 'Clara'];
const LINEUP_4 = ['Anna', 'Bert', 'Clara', 'Dora'];
const LINEUP_5 = ['Anna', 'Bert', 'Clara', 'Dora', 'Emil'];

/** A valid played game, straight through the schema. */
function game(overrides: Record<string, unknown> = {}): PlayedGameInput {
  return playedGameSchema.parse({
    passedOut: false,
    declarer: 'Bert',
    gameType: 'GRAND',
    matadors: { suit: 'WITH', count: 2 },
    won: true,
    ...overrides,
  });
}

describe('nextDealer', () => {
  it('starts with the first player of the lineup', () => {
    expect(nextDealer(LINEUP_3, null)).toBe('Anna');
    expect(nextDealer(LINEUP_5, null)).toBe('Anna');
  });

  it('moves on to the next player of the seating order', () => {
    expect(nextDealer(LINEUP_4, 'Anna')).toBe('Bert');
    expect(nextDealer(LINEUP_4, 'Bert')).toBe('Clara');
    expect(nextDealer(LINEUP_4, 'Clara')).toBe('Dora');
  });

  it('starts over with player 1 after the last player', () => {
    expect(nextDealer(LINEUP_3, 'Clara')).toBe('Anna');
    expect(nextDealer(LINEUP_4, 'Dora')).toBe('Anna');
  });

  it('falls back to the first player when the previous dealer is unknown', () => {
    expect(nextDealer(LINEUP_3, 'Unbekannt')).toBe('Anna');
  });

  it('refuses an empty lineup', () => {
    expect(() => nextDealer([], null)).toThrow();
  });
});

describe('who may play a round', () => {
  it('restricts nobody when 3 players are on the list', () => {
    expect(excludedDeclarers(LINEUP_3, 'Anna')).toEqual([]);
    expect(eligibleDeclarers(LINEUP_3, 'Anna')).toEqual(LINEUP_3);
  });

  it('excludes the dealer when 4 players are on the list', () => {
    expect(excludedDeclarers(LINEUP_4, 'Bert')).toEqual(['Bert']);
    expect(eligibleDeclarers(LINEUP_4, 'Bert')).toEqual(['Anna', 'Clara', 'Dora']);
  });

  it('excludes the dealer and both neighbours when 5 players are on the list', () => {
    expect(excludedDeclarers(LINEUP_5, 'Bert')).toEqual(['Bert', 'Anna', 'Clara']);
    expect(eligibleDeclarers(LINEUP_5, 'Bert')).toEqual(['Dora', 'Emil']);
  });

  it('wraps around at the ends of the seating order', () => {
    expect(excludedDeclarers(LINEUP_5, 'Anna')).toEqual(['Anna', 'Emil', 'Bert']);
    expect(eligibleDeclarers(LINEUP_5, 'Anna')).toEqual(['Clara', 'Dora']);
  });
});

describe('assertLineupComplete', () => {
  it('rejects a list without a lineup', () => {
    expect(() => assertLineupComplete(0)).toThrow(/no players/);
  });

  it('rejects a lineup that is too small or too large', () => {
    expect(() => assertLineupComplete(2)).toThrow(HttpError);
    expect(() => assertLineupComplete(6)).toThrow(HttpError);
  });

  it('accepts 3, 4 and 5 players', () => {
    expect(() => assertLineupComplete(3)).not.toThrow();
    expect(() => assertLineupComplete(4)).not.toThrow();
    expect(() => assertLineupComplete(5)).not.toThrow();
  });
});

describe('assertDeclarerAllowed', () => {
  it('does not check the declarer of a passed out game', () => {
    expect(() => assertDeclarerAllowed({ passedOut: true }, LINEUP_4, 'Bert')).not.toThrow();
  });

  it('rejects a declarer that is not on the list', () => {
    expect(() => assertDeclarerAllowed(game({ declarer: 'Emil' }), LINEUP_4, 'Anna')).toThrow(
      /one of the players of the list/,
    );
  });

  it('rejects the dealer of a 4 player list', () => {
    expect(() => assertDeclarerAllowed(game({ declarer: 'Bert' }), LINEUP_4, 'Bert')).toThrow(
      /does not play this round/,
    );
  });

  it('rejects the neighbours of the dealer of a 5 player list', () => {
    expect(() => assertDeclarerAllowed(game({ declarer: 'Anna' }), LINEUP_5, 'Bert')).toThrow(
      HttpError,
    );
    expect(() => assertDeclarerAllowed(game({ declarer: 'Clara' }), LINEUP_5, 'Bert')).toThrow(
      HttpError,
    );
  });

  it('accepts a player that is allowed to play', () => {
    expect(() => assertDeclarerAllowed(game({ declarer: 'Dora' }), LINEUP_5, 'Bert')).not.toThrow();
    expect(() => assertDeclarerAllowed(game({ declarer: 'Bert' }), LINEUP_4, 'Anna')).not.toThrow();
    expect(() => assertDeclarerAllowed(game({ declarer: 'Bert' }), LINEUP_3, 'Anna')).not.toThrow();
  });
});

describe('maxMatadors', () => {
  it('allows 4 Spitzen for grand and 11 for the suits', () => {
    expect(maxMatadors('GRAND')).toBe(4);
    expect(maxMatadors('KARO')).toBe(11);
    expect(maxMatadors('HERZ')).toBe(11);
    expect(maxMatadors('PIK')).toBe(11);
    expect(maxMatadors('KREUZ')).toBe(11);
  });

  it('has no Spitzen for a null game', () => {
    expect(maxMatadors('NULL')).toBeNull();
  });
});

describe('countLevels', () => {
  it('counts the announced levels and the results', () => {
    expect(countLevels(game())).toBe(0);
    expect(countLevels(game({ hand: true, schneider: true }))).toBe(2);
    expect(
      countLevels(
        game({
          hand: true,
          schneiderAnnounced: true,
          schwarzAnnounced: true,
          offen: true,
          schneider: true,
          schwarz: true,
        }),
      ),
    ).toBe(6);
  });
});

describe('calculateGameValue', () => {
  const levels = (overrides: Record<string, boolean> = {}) => ({
    hand: false,
    schneiderAnnounced: false,
    schwarzAnnounced: false,
    offen: false,
    schneider: false,
    schwarz: false,
    ...overrides,
  });

  it('uses the fixed values of the null games', () => {
    expect(NULL_VALUES).toEqual({ plain: 23, hand: 35, offen: 46, handOffen: 59 });

    const nullGame = { gameType: 'NULL', matadorsCount: null } as const;
    expect(calculateGameValue({ ...nullGame, ...levels() })).toBe(23);
    expect(calculateGameValue({ ...nullGame, ...levels({ hand: true }) })).toBe(35);
    expect(calculateGameValue({ ...nullGame, ...levels({ offen: true }) })).toBe(46);
    expect(calculateGameValue({ ...nullGame, ...levels({ hand: true, offen: true }) })).toBe(59);
  });

  it('uses the Grundwerte of the suit and grand games', () => {
    expect(BASE_VALUES).toEqual({ KARO: 9, HERZ: 10, PIK: 11, KREUZ: 12, GRAND: 24 });
  });

  it('calculates (Spitzen + Gewinnstufen + 1) * Grundwert', () => {
    expect(calculateGameValue({ gameType: 'GRAND', matadorsCount: 2, ...levels() })).toBe(72);
    expect(
      calculateGameValue({
        gameType: 'GRAND',
        matadorsCount: 2,
        ...levels({ hand: true, schneiderAnnounced: true }),
      }),
    ).toBe(120);
    expect(
      calculateGameValue({ gameType: 'KARO', matadorsCount: 1, ...levels({ hand: true }) }),
    ).toBe(27);
  });

  it('counts a maximal game correctly', () => {
    const value = calculateGameValue({
      gameType: 'KREUZ',
      matadorsCount: 4,
      ...levels({
        hand: true,
        schneiderAnnounced: true,
        schwarzAnnounced: true,
        offen: true,
        schneider: true,
        schwarz: true,
      }),
    });

    expect(value).toBe((4 + 6 + 1) * 12);
  });

  it('refuses to score a suit game without Spitzen', () => {
    expect(() => calculateGameValue({ gameType: 'PIK', matadorsCount: null, ...levels() })).toThrow(
      /Spitzen/,
    );
  });
});
