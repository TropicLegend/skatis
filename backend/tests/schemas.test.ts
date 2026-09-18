import { describe, expect, it } from 'vitest';
import {
  createTournamentSchema,
  listTournamentsQuery,
  updateTournamentSchema,
} from '../src/modules/tournaments/tournament.schemas.js';
import { createListSchema } from '../src/modules/lists/list.schemas.js';
import { createGameSchema, updateGameSchema } from '../src/modules/lists/game.schemas.js';

const validTournament = {
  name: 'Mittwochsrunde',
  adminPassword: 'admin-secret',
  password: 'member-secret',
  matchdays: [3],
};

describe('createTournamentSchema', () => {
  it('accepts a valid payload', () => {
    expect(createTournamentSchema.parse(validTournament)).toEqual(validTournament);
  });

  it('trims the name', () => {
    const parsed = createTournamentSchema.parse({ ...validTournament, name: '  Skatabend  ' });
    expect(parsed.name).toBe('Skatabend');
  });

  it('rejects unknown or missing fields', () => {
    expect(() => createTournamentSchema.parse({ ...validTournament, name: undefined })).toThrow();
    expect(() => createTournamentSchema.parse({ ...validTournament, name: 'x' })).toThrow();
  });

  it('rejects duplicate weekdays', () => {
    expect(() => createTournamentSchema.parse({ ...validTournament, matchdays: [3, 3] })).toThrow();
  });

  it('rejects weekdays outside of 1..7', () => {
    expect(() => createTournamentSchema.parse({ ...validTournament, matchdays: [0] })).toThrow();
    expect(() => createTournamentSchema.parse({ ...validTournament, matchdays: [8] })).toThrow();
  });

  it('rejects empty matchdays', () => {
    expect(() => createTournamentSchema.parse({ ...validTournament, matchdays: [] })).toThrow();
  });

  it('rejects short passwords', () => {
    expect(() => createTournamentSchema.parse({ ...validTournament, password: 'short' })).toThrow();
  });

  it('rejects names with slashes', () => {
    expect(() => createTournamentSchema.parse({ ...validTournament, name: 'a/b' })).toThrow();
  });
});

describe('updateTournamentSchema', () => {
  it('accepts a partial update', () => {
    expect(updateTournamentSchema.parse({ matchdays: [1, 4] })).toEqual({ matchdays: [1, 4] });
  });

  it('rejects an empty update', () => {
    expect(() => updateTournamentSchema.parse({})).toThrow();
  });
});

describe('listTournamentsQuery', () => {
  it('applies pagination defaults', () => {
    expect(listTournamentsQuery.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  it('coerces query strings', () => {
    expect(listTournamentsQuery.parse({ limit: '5', offset: '10' })).toEqual({
      limit: 5,
      offset: 10,
    });
  });

  it('rejects out of range pagination', () => {
    expect(() => listTournamentsQuery.parse({ limit: '1000' })).toThrow();
    expect(() => listTournamentsQuery.parse({ offset: '-1' })).toThrow();
  });
});

describe('createGameSchema', () => {
  const validGame = { players: ['Anna', 'Bert', 'Clara'], points: 48 };

  it('accepts a minimal game', () => {
    expect(createGameSchema.parse(validGame)).toEqual(validGame);
  });

  it('accepts a declarer that plays the game', () => {
    const parsed = createGameSchema.parse({ ...validGame, declarer: 'Anna', gameType: 'Grand' });
    expect(parsed.declarer).toBe('Anna');
  });

  it('rejects a declarer that is not among the players', () => {
    expect(() => createGameSchema.parse({ ...validGame, declarer: 'Dora' })).toThrow();
  });

  it('rejects negative game values below the limit', () => {
    expect(() => createGameSchema.parse({ ...validGame, points: -1001 })).toThrow();
  });

  it('rejects an empty list of players', () => {
    expect(() => createGameSchema.parse({ players: [], points: 10 })).toThrow();
  });
});

describe('updateGameSchema', () => {
  it('accepts a single field', () => {
    expect(updateGameSchema.parse({ points: 24 })).toEqual({ points: 24 });
  });

  it('allows clearing optional fields', () => {
    const parsed = updateGameSchema.parse({ declarer: null, note: null, gameType: null });
    expect(parsed.declarer).toBeNull();
    expect(parsed.note).toBeNull();
  });

  it('rejects an empty update', () => {
    expect(() => updateGameSchema.parse({})).toThrow();
  });
});

describe('createListSchema', () => {
  it('accepts a list without games', () => {
    expect(createListSchema.parse({ matchday: '2026-09-16' })).toEqual({ matchday: '2026-09-16' });
  });

  it('rejects an impossible date', () => {
    expect(() => createListSchema.parse({ matchday: '2026-02-30' })).toThrow();
    expect(() => createListSchema.parse({ matchday: '16.09.2026' })).toThrow();
  });

  it('rejects duplicate game positions', () => {
    expect(() =>
      createListSchema.parse({
        matchday: '2026-09-16',
        games: [
          { players: ['Anna'], points: 10, position: 1 },
          { players: ['Bert'], points: 20, position: 1 },
        ],
      }),
    ).toThrow();
  });

  it('accepts games without explicit positions', () => {
    const parsed = createListSchema.parse({
      matchday: '2026-09-16',
      games: [
        { players: ['Anna'], points: 10 },
        { players: ['Bert'], points: 20, position: 1 },
      ],
    });

    expect(parsed.games).toHaveLength(2);
  });
});
