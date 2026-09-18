import { describe, expect, it } from 'vitest';
import {
  createTournamentSchema,
  listTournamentsQuery,
  loginTournamentSchema,
  tournamentIdSchema,
  updateTournamentSchema,
} from '../src/modules/tournaments/tournament.schemas.js';
import { createListSchema, setListPlayersSchema } from '../src/modules/lists/list.schemas.js';
import { gameSchema, playedGameSchema } from '../src/modules/lists/game.schemas.js';
import { createPlayerSchema, lineupSchema } from '../src/modules/players/player.schemas.js';

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

describe('tournamentIdSchema', () => {
  it('normalises the id so that it is case insensitive', () => {
    expect(tournamentIdSchema.parse('  k7m2p4qx ')).toBe('K7M2P4QX');
  });

  it('rejects empty ids', () => {
    expect(() => tournamentIdSchema.parse('')).toThrow();
  });
});

describe('loginTournamentSchema', () => {
  it('accepts the id and the password', () => {
    expect(loginTournamentSchema.parse({ tournamentId: 'k7m2p4qx', password: 'secret' })).toEqual({
      tournamentId: 'K7M2P4QX',
      password: 'secret',
    });
  });

  it('rejects a missing password', () => {
    expect(() => loginTournamentSchema.parse({ tournamentId: 'K7M2P4QX' })).toThrow();
  });
});

describe('players', () => {
  it('accepts a plain name and trims it', () => {
    expect(createPlayerSchema.parse({ name: '  Anna  ' })).toEqual({ name: 'Anna' });
  });

  it('rejects a blank name', () => {
    expect(() => createPlayerSchema.parse({ name: '   ' })).toThrow();
  });

  it('rejects names longer than 64 characters', () => {
    expect(() => createPlayerSchema.parse({ name: 'a'.repeat(65) })).toThrow();
  });

  it('rejects a lineup that contains a player twice', () => {
    expect(() => lineupSchema.parse(['p1', 'p1', 'p2'])).toThrow();
  });

  it('rejects a lineup of fewer than 3 or more than 5 players', () => {
    expect(() => lineupSchema.parse(['p1', 'p2'])).toThrow();
    expect(() => lineupSchema.parse(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])).toThrow();
  });

  it('accepts a lineup of 3, 4 or 5 players in seating order', () => {
    expect(lineupSchema.parse(['p1', 'p2', 'p3'])).toHaveLength(3);
    expect(lineupSchema.parse(['p1', 'p2', 'p3', 'p4'])).toHaveLength(4);
    expect(lineupSchema.parse(['p1', 'p2', 'p3', 'p4', 'p5'])).toHaveLength(5);
  });

  it('requires a complete lineup when the lineup is replaced', () => {
    expect(() => setListPlayersSchema.parse({ playerIds: [] })).toThrow();
    expect(setListPlayersSchema.parse({ playerIds: ['p1', 'p2', 'p3'] })).toEqual({
      playerIds: ['p1', 'p2', 'p3'],
    });
  });
});

describe('gameSchema – played games', () => {
  const validGame = {
    passedOut: false,
    declarer: 'Anna',
    gameType: 'GRAND',
    matadors: { suit: 'WITH', count: 2 },
    won: true,
  };

  it('accepts a grand game and fills in the levels', () => {
    expect(playedGameSchema.parse(validGame)).toEqual({
      ...validGame,
      hand: false,
      schneiderAnnounced: false,
      schwarzAnnounced: false,
      offen: false,
      schneider: false,
      schwarz: false,
    });
  });

  it('requires the result of the game', () => {
    expect(() =>
      playedGameSchema.parse({ passedOut: false, declarer: 'Anna', gameType: 'NULL' }),
    ).toThrow();
  });

  it('requires the announced levels to build on each other', () => {
    expect(() => playedGameSchema.parse({ ...validGame, schneiderAnnounced: true })).toThrow();
    expect(() =>
      playedGameSchema.parse({ ...validGame, hand: true, schwarzAnnounced: true }),
    ).toThrow();
    expect(() =>
      playedGameSchema.parse({ ...validGame, hand: true, schneiderAnnounced: true, offen: true }),
    ).toThrow();
  });

  it('accepts Hand, Schneider Ang., Schwarz Ang. and Offen together', () => {
    const parsed = playedGameSchema.parse({
      ...validGame,
      hand: true,
      schneiderAnnounced: true,
      schwarzAnnounced: true,
      offen: true,
    });

    expect(parsed.offen).toBe(true);
  });

  it('requires Spitzen for a suit or grand game', () => {
    expect(() => playedGameSchema.parse({ ...validGame, matadors: null })).toThrow();
  });

  it('limits the Spitzen to 4 for grand and 11 for the suits', () => {
    expect(() =>
      playedGameSchema.parse({ ...validGame, matadors: { suit: 'WITH', count: 5 } }),
    ).toThrow();
    expect(() =>
      playedGameSchema.parse({
        ...validGame,
        gameType: 'PIK',
        matadors: { suit: 'WITH', count: 12 },
      }),
    ).toThrow();
    expect(
      playedGameSchema.parse({
        ...validGame,
        gameType: 'PIK',
        matadors: { suit: 'WITHOUT', count: 11 },
      }).matadors,
    ).toEqual({ suit: 'WITHOUT', count: 11 });
  });

  it('rejects Spitzen for a null game', () => {
    expect(() =>
      playedGameSchema.parse({
        passedOut: false,
        declarer: 'Anna',
        gameType: 'NULL',
        won: true,
        matadors: { suit: 'WITH', count: 1 },
      }),
    ).toThrow();
  });

  it('rejects Schneider Ang. and Schwarz Ang. for a null game', () => {
    expect(() =>
      playedGameSchema.parse({
        passedOut: false,
        declarer: 'Anna',
        gameType: 'NULL',
        won: true,
        hand: true,
        schneiderAnnounced: true,
      }),
    ).toThrow();
  });

  it('accepts a null game with Hand and Offen', () => {
    const parsed = playedGameSchema.parse({
      passedOut: false,
      declarer: 'Anna',
      gameType: 'NULL',
      won: true,
      hand: true,
      offen: true,
    });

    expect(parsed.hand).toBe(true);
    expect(parsed.offen).toBe(true);
  });

  it('rejects Schneider and Schwarz for a null game', () => {
    expect(() =>
      playedGameSchema.parse({
        passedOut: false,
        declarer: 'Anna',
        gameType: 'NULL',
        won: true,
        schneider: true,
      }),
    ).toThrow();
    expect(() =>
      playedGameSchema.parse({
        passedOut: false,
        declarer: 'Anna',
        gameType: 'NULL',
        won: true,
        schwarz: true,
      }),
    ).toThrow();
  });

  it('requires Schwarz to be combined with Schneider', () => {
    expect(() => playedGameSchema.parse({ ...validGame, schwarz: true })).toThrow();
    expect(playedGameSchema.parse({ ...validGame, schneider: true, schwarz: true })).toBeTruthy();
  });

  it('ignores the properties the API derives itself', () => {
    const parsed = playedGameSchema.parse({
      ...validGame,
      position: 7,
      dealer: 'Bert',
      players: ['Anna', 'Bert', 'Clara', 'Dora'],
      gameValue: 999,
    });

    expect(parsed).not.toHaveProperty('position');
    expect(parsed).not.toHaveProperty('gameValue');
  });
});

describe('gameSchema – passed out games', () => {
  it('accepts a game that was passed out', () => {
    expect(gameSchema.parse({ passedOut: true })).toEqual({ passedOut: true });
  });

  it('requires the Alleinspieler when the game was played', () => {
    expect(() => gameSchema.parse({ passedOut: false, gameType: 'GRAND', won: true })).toThrow();
  });

  it('requires the decision between Alleinspieler and Eingepasst', () => {
    expect(() => gameSchema.parse({ declarer: 'Anna', gameType: 'NULL', won: true })).toThrow();
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

  it('accepts a list with a lineup and games in one request', () => {
    const parsed = createListSchema.parse({
      matchday: '2026-09-16',
      playerIds: ['p1', 'p2', 'p3'],
      games: [
        { passedOut: true },
        { passedOut: false, declarer: 'Anna', gameType: 'NULL', won: true },
      ],
    });

    expect(parsed.games).toHaveLength(2);
    expect(parsed.playerIds).toHaveLength(3);
  });

  it('rejects an incomplete lineup', () => {
    expect(() =>
      createListSchema.parse({ matchday: '2026-09-16', playerIds: ['p1', 'p2'] }),
    ).toThrow();
  });
});
