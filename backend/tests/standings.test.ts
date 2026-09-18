import { describe, expect, it } from 'vitest';
import { scoreList, type ListResultsDto, type ScorableGame } from '../src/modules/lists/scoring.js';
import { tournamentStandings } from '../src/modules/tournaments/standings.js';

const ROSTER = ['Anna', 'Bert', 'Clara', 'Dora'];

/** A whole evening of a bigger tournament: nine players at three tables. */
const NINE_PLAYERS = ['Anna', 'Bert', 'Clara', 'Dora', 'Emil', 'Frida', 'Gustav', 'Hanna', 'Ida'];

/**
 * One matchday as the standing sees it: the result table of a 4 player list,
 * built with the very same function the results endpoint uses.
 */
function matchday(matchdayIso: string, games: readonly ScorableGame[]): ListResultsDto {
  return scoreList(['Anna', 'Bert', 'Clara', 'Dora'], games, matchdayIso);
}

/** A game of a 4 player list: the first player deals and sits out. */
function game(
  declarer: string | null,
  won: boolean | null,
  gameValue: number,
  players: readonly string[] = ['Bert', 'Clara', 'Dora'],
): ScorableGame {
  return { players, declarer, won, gameValue };
}

function row(standings: ReturnType<typeof tournamentStandings>, name: string) {
  const entry = standings.players.find((player) => player.name === name);
  if (!entry) throw new Error(`${name} is not part of the standing`);
  return entry;
}

describe('tournamentStandings', () => {
  it('counts the games of the matchday a player took part in', () => {
    const standings = tournamentStandings('K7M2P4QX', ROSTER, [
      matchday('2026-09-16', [
        game('Bert', true, 24, ['Bert', 'Clara', 'Dora']),
        game('Anna', true, 24, ['Anna', 'Clara', 'Dora']),
        game(null, null, 0, ['Anna', 'Bert', 'Clara']),
      ]),
    ]);

    // Anna sat out round 1, Clara was at the table every round.
    expect(row(standings, 'Anna').gamesPlayed).toBe(2);
    expect(row(standings, 'Bert').gamesPlayed).toBe(2);
    expect(row(standings, 'Clara').gamesPlayed).toBe(3);
    expect(row(standings, 'Dora').gamesPlayed).toBe(2);
  });

  it('credits the Spielwerte of the own Alleinspiele and debits a loss twice', () => {
    const standings = tournamentStandings('K7M2P4QX', ROSTER, [
      matchday('2026-09-16', [game('Bert', true, 120), game('Bert', false, 20)]),
    ]);

    expect(row(standings, 'Bert').points).toBe(120 - 40);
    expect(row(standings, 'Bert').gamesPlayed).toBe(2);
  });

  it('adds the opponent bonus for the Alleinspiele the others lost', () => {
    // Bert loses one Alleinspiel of 20, so every other player of the list gets
    // the bonus of a 4 player lineup, 30.
    const standings = tournamentStandings('K7M2P4QX', ROSTER, [
      matchday('2026-09-16', [game('Bert', false, 20), game(null, null, 0)]),
    ]);

    expect(row(standings, 'Bert').opponentBonus).toBe(0);
    expect(row(standings, 'Anna').opponentBonus).toBe(30);
    expect(row(standings, 'Clara').opponentBonus).toBe(30);
    expect(row(standings, 'Dora').opponentBonus).toBe(30);
  });

  it('pays the bonus even for a game the player did not take part in', () => {
    // Anna deals in round 1, so she is not at the table – the bonus is paid out
    // to the whole lineup of the matchday nevertheless.
    const standings = tournamentStandings('K7M2P4QX', ROSTER, [
      matchday('2026-09-16', [game('Bert', false, 20, ['Bert', 'Clara', 'Dora'])]),
    ]);

    expect(row(standings, 'Anna').gamesPlayed).toBe(0);
    expect(row(standings, 'Anna').opponentBonus).toBe(30);
    expect(row(standings, 'Anna').score).toBe(30);
    expect(row(standings, 'Anna').averageScore).toBeNull();
  });

  it('adds the score of the matchdays up and ranks by the score per game', () => {
    const standings = tournamentStandings('K7M2P4QX', ROSTER, [
      // Round 1: Anna deals, Bert wins 120. Round 2: Bert deals, Anna wins 23.
      matchday('2026-09-16', [
        game('Bert', true, 120, ['Bert', 'Clara', 'Dora']),
        game('Anna', true, 23, ['Anna', 'Clara', 'Dora']),
      ]),
      // Anna deals again, Dora loses a Null of 23.
      matchday('2026-09-23', [game('Dora', false, 23, ['Bert', 'Clara', 'Dora'])]),
    ]);

    expect(standings.matchdaysCounted).toBe(2);
    expect(standings.tournamentId).toBe('K7M2P4QX');

    // Bert: 120 from matchday 1 and the bonus of matchday 2, over two games.
    expect(row(standings, 'Bert')).toMatchObject({
      gamesPlayed: 2,
      points: 120,
      opponentBonus: 30,
      score: 150,
      averageScore: 75,
      rank: 1,
    });

    // Anna: 23 from her win, plus the bonus of matchday 2, over one game.
    expect(row(standings, 'Anna')).toMatchObject({
      gamesPlayed: 1,
      points: 23,
      opponentBonus: 30,
      score: 53,
      averageScore: 53,
      rank: 2,
    });

    // Clara played every round but only ever collected the bonus of matchday 2.
    expect(row(standings, 'Clara')).toMatchObject({
      gamesPlayed: 3,
      points: 0,
      opponentBonus: 30,
      score: 30,
      averageScore: 10,
      rank: 3,
    });

    // Dora lost her Null, so she is debited twice.
    expect(row(standings, 'Dora')).toMatchObject({
      gamesPlayed: 3,
      points: -46,
      opponentBonus: 0,
      score: -46,
      averageScore: -15.33,
      rank: 4,
    });
  });

  it('ignores the flat bonuses of the matchday table', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ['Anna'],
      [matchday('2026-09-16', [game('Anna', true, 24, ['Anna', 'Bert', 'Clara'])])],
    );

    // 24 points and a +50 won bonus in the matchday table, but only the 24
    // belong to the tournament standing.
    const table = matchday('2026-09-16', [game('Anna', true, 24, ['Anna', 'Bert', 'Clara'])]);
    expect(table.players[0]?.wonBonus).toBe(50);

    expect(row(standings, 'Anna').points).toBe(24);
    expect(row(standings, 'Anna').score).toBe(24);
  });

  it('lists the players without a game last and without a rank', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ['Anna', 'Bert'],
      [matchday('2026-09-16', [game('Bert', true, 50)])],
    );

    expect(standings.players.map((player) => player.name)).toEqual(['Bert', 'Anna']);
    expect(row(standings, 'Bert').rank).toBe(1);
    expect(row(standings, 'Anna')).toMatchObject({
      rank: null,
      gamesPlayed: 0,
      points: 0,
      opponentBonus: 0,
      score: 0,
      averageScore: null,
    });
  });

  it('gives players with the same average the same rank and skips the next', () => {
    const standings = tournamentStandings('K7M2P4QX', ROSTER, [
      matchday('2026-09-16', [
        game('Anna', true, 40, ['Anna', 'Bert', 'Clara']),
        game('Bert', true, 40, ['Bert', 'Clara', 'Dora']),
        game('Clara', true, 40, ['Clara', 'Dora', 'Anna']),
      ]),
    ]);

    // Anna and Bert played two rounds each and won 40 in one of them, so both
    // average 20. Clara played three rounds with the same 40, so she is behind.
    expect(row(standings, 'Anna')).toMatchObject({ gamesPlayed: 2, averageScore: 20, rank: 1 });
    expect(row(standings, 'Bert')).toMatchObject({ gamesPlayed: 2, averageScore: 20, rank: 1 });
    expect(row(standings, 'Clara')).toMatchObject({ gamesPlayed: 3, averageScore: 13.33, rank: 3 });
  });

  it('never reports a negative zero', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ['Anna'],
      [matchday('2026-09-16', [game('Anna', true, 0, ['Anna', 'Bert', 'Clara'])])],
    );

    expect(Object.is(row(standings, 'Anna').points, 0)).toBe(true);
    expect(Object.is(row(standings, 'Anna').opponentBonus, 0)).toBe(true);
    expect(Object.is(row(standings, 'Anna').averageScore, 0)).toBe(true);
  });

  it('counts the lists and the dates separately', () => {
    // 90 players on one evening means many tables of three, so one date carries
    // many lists – and they do not even share the players.
    const table = (lineup: readonly string[], matchdayIso: string, declarer: string) =>
      scoreList(lineup, [game(declarer, true, 24, lineup)], matchdayIso);

    const standings = tournamentStandings('K7M2P4QX', NINE_PLAYERS, [
      table(['Anna', 'Bert', 'Clara'], '2026-09-16', 'Bert'),
      table(['Dora', 'Emil', 'Frida'], '2026-09-16', 'Dora'),
      table(['Gustav', 'Hanna', 'Ida'], '2026-09-16', 'Gustav'),
      table(['Anna', 'Bert', 'Clara'], '2026-09-23', 'Anna'),
    ]);

    expect(standings.listsCounted).toBe(4);
    expect(standings.matchdaysCounted).toBe(2);

    // The three of the first table played both of its lists, the rest only one.
    expect(row(standings, 'Bert')).toMatchObject({ gamesPlayed: 2, points: 24, score: 24 });
    expect(row(standings, 'Dora')).toMatchObject({ gamesPlayed: 1, points: 24, score: 24 });
    expect(row(standings, 'Ida')).toMatchObject({ gamesPlayed: 1, points: 0, score: 0 });
  });

  it('handles a tournament without a single submitted matchday', () => {
    const standings = tournamentStandings('K7M2P4QX', ROSTER, []);

    expect(standings.matchdaysCounted).toBe(0);
    expect(standings.players).toHaveLength(4);
    for (const player of standings.players) {
      expect(player.rank).toBeNull();
      expect(player.averageScore).toBeNull();
    }
  });

  it('ignores rows of players who are not in the roster', () => {
    const standings = tournamentStandings(
      'K7M2P4QX',
      ['Anna'],
      [matchday('2026-09-16', [game('Bert', true, 100)])],
    );

    expect(standings.players).toHaveLength(1);
    expect(row(standings, 'Anna').gamesPlayed).toBe(0);
  });
});
