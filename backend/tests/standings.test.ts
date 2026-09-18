import { describe, expect, it } from 'vitest';
import {
  gamePoints,
  tournamentStandings,
  type StandingGame,
} from '../src/modules/tournaments/standings.js';

/** A game of a 4 player list: the Geber sits out, so three players are at the table. */
function game(
  players: readonly string[],
  declarer: string | null,
  won: boolean | null,
  gameValue: number,
): StandingGame {
  return { players, declarer, won, gameValue };
}

const TABLE_ABCD = ['Anna', 'Bert', 'Clara'];
const ROSTER = ['Anna', 'Bert', 'Clara', 'Dora'];

function row(standings: ReturnType<typeof tournamentStandings>, name: string) {
  const entry = standings.players.find((player) => player.name === name);
  if (!entry) throw new Error(`${name} is not part of the standing`);
  return entry;
}

describe('gamePoints', () => {
  it('credits the Spielwert of a won game', () => {
    expect(gamePoints(game(TABLE_ABCD, 'Anna', true, 120))).toBe(120);
  });

  it('debits twice the Spielwert of a lost game', () => {
    expect(gamePoints(game(TABLE_ABCD, 'Anna', false, 20))).toBe(-40);
  });

  it('is worth nothing for a game that was passed out', () => {
    expect(gamePoints(game(TABLE_ABCD, null, null, 0))).toBe(0);
  });
});

describe('tournamentStandings', () => {
  it('counts the games a player took part in', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ROSTER,
      [
        game(['Anna', 'Bert', 'Clara'], 'Anna', true, 9),
        game(['Bert', 'Clara', 'Dora'], 'Bert', true, 9),
        game(['Anna', 'Clara', 'Dora'], null, null, 0),
      ],
      1,
    );

    expect(row(standings, 'Anna').gamesPlayed).toBe(2);
    expect(row(standings, 'Bert').gamesPlayed).toBe(2);
    expect(row(standings, 'Clara').gamesPlayed).toBe(3);
    expect(row(standings, 'Dora').gamesPlayed).toBe(2);
  });

  it('counts an Eingepasst game as played – the round took place', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ROSTER,
      [game(['Anna', 'Bert', 'Clara'], null, null, 0)],
      1,
    );

    expect(row(standings, 'Anna').gamesPlayed).toBe(1);
    expect(row(standings, 'Anna').points).toBe(0);
  });

  it('adds the points of the matchdays up', () => {
    // Matchday 1: Anna wins 120, loses 20. Matchday 2: Anna wins 23.
    const standings = tournamentStandings(
      'K7M2P4QX',
      ROSTER,
      [
        game(TABLE_ABCD, 'Anna', true, 120),
        game(TABLE_ABCD, 'Anna', false, 20),
        game(TABLE_ABCD, 'Anna', true, 23),
      ],
      2,
    );

    expect(row(standings, 'Anna')).toMatchObject({
      gamesPlayed: 3,
      points: 120 - 40 + 23,
      averagePoints: 34.33,
    });
    expect(standings.matchdaysCounted).toBe(2);
  });

  it('ranks by the average points per game, not by the total', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ROSTER,
      [
        // Bert plays two games and wins both, Anna plays three and wins one.
        game(['Anna', 'Bert', 'Clara'], 'Bert', true, 100),
        game(['Anna', 'Bert', 'Clara'], 'Bert', true, 100),
        game(['Anna', 'Clara', 'Dora'], 'Anna', true, 60),
      ],
      1,
    );

    // Bert: 200 / 2 = 100, Anna: 60 / 3 = 20.
    expect(row(standings, 'Bert')).toMatchObject({
      rank: 1,
      gamesPlayed: 2,
      points: 200,
      averagePoints: 100,
    });
    expect(row(standings, 'Anna')).toMatchObject({
      rank: 2,
      gamesPlayed: 3,
      points: 60,
      averagePoints: 20,
    });
    expect(standings.players[0]?.name).toBe('Bert');
  });

  it('lists the players without a game last and without a rank', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ['Anna', 'Bert'],
      [game(['Bert', 'Clara', 'Dora'], 'Bert', true, 50)],
      1,
    );

    // Clara and Dora are not in the roster, so only Anna and Bert have rows.
    expect(standings.players.map((player) => player.name)).toEqual(['Bert', 'Anna']);
    expect(row(standings, 'Bert')).toMatchObject({ rank: 1, gamesPlayed: 1 });
    expect(row(standings, 'Anna')).toMatchObject({
      rank: null,
      gamesPlayed: 0,
      points: 0,
      averagePoints: null,
    });
  });

  it('gives players with the same average the same rank and skips the next', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ROSTER,
      [
        game(['Anna', 'Bert', 'Clara'], 'Anna', true, 40),
        game(['Anna', 'Bert', 'Clara'], 'Bert', true, 40),
        game(['Anna', 'Bert', 'Clara'], 'Clara', true, 40),
        game(['Anna', 'Bert', 'Clara'], 'Anna', false, 20),
      ],
      1,
    );

    // Anna: (40 - 40) / 2 = 0, Bert 40, Clara 40.
    expect(row(standings, 'Bert').rank).toBe(1);
    expect(row(standings, 'Clara').rank).toBe(1);
    expect(row(standings, 'Anna').rank).toBe(3);
  });

  it('does not let rounding decide an order that is not equal', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ['Anna', 'Bert'],
      [
        // Anna 100 / 3 = 33.333…, Bert 100 / 3 + 1 = 34.333… – both round up.
        game(['Anna', 'Bert', 'Clara'], 'Anna', true, 100),
        game(['Anna', 'Clara', 'Dora'], 'Anna', true, 0),
        game(['Anna', 'Clara', 'Dora'], 'Anna', true, 0),
        game(['Anna', 'Bert', 'Clara'], 'Bert', true, 103),
      ],
      1,
    );

    expect(row(standings, 'Bert').rank).toBe(1);
    expect(row(standings, 'Anna').rank).toBe(2);
  });

  it('never reports a negative zero', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ['Anna'],
      [game(TABLE_ABCD, 'Anna', true, 0)],
      1,
    );

    expect(Object.is(row(standings, 'Anna').points, 0)).toBe(true);
    expect(Object.is(row(standings, 'Anna').averagePoints, 0)).toBe(true);
  });

  it('carries the tournament id and ignores games of unknown players', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ['Anna'],
      [game(['Emil', 'Frida', 'Gustav'], 'Emil', true, 100)],
      0,
    );

    expect(standings.tournamentId).toBe('K7M2P4QX');
    expect(standings.matchdaysCounted).toBe(0);
    expect(standings.players).toHaveLength(1);
    expect(row(standings, 'Anna').averagePoints).toBeNull();
  });
});
