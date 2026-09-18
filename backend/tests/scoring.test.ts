import type { Game } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { toGameDto } from '../src/modules/lists/game.mapper.js';
import {
  LOSS_PENALTY,
  WIN_BONUS,
  opponentBonusPerGame,
  scoreList,
  type ScorableGame,
} from '../src/modules/lists/scoring.js';

/** A game as the table sees it. */
function game(declarer: string | null, won: boolean | null, gameValue: number): ScorableGame {
  return { declarer, won, gameValue };
}

const PASSED_OUT = game(null, null, 0);

function byName(results: ReturnType<typeof scoreList>, name: string) {
  const player = results.players.find((entry) => entry.name === name);
  if (!player) throw new Error(`${name} is not part of the result`);
  return player;
}

describe('opponentBonusPerGame', () => {
  it('pays +40 with 3, +30 with 4 and +24 with 5 players', () => {
    expect(opponentBonusPerGame(3)).toBe(40);
    expect(opponentBonusPerGame(4)).toBe(30);
    expect(opponentBonusPerGame(5)).toBe(24);
  });

  it('refuses a lineup the rules do not know', () => {
    expect(() => opponentBonusPerGame(2)).toThrow(/cannot be scored/);
    expect(() => opponentBonusPerGame(6)).toThrow(/cannot be scored/);
  });
});

describe('scoreList', () => {
  const LINEUP = ['Anna', 'Bert', 'Clara', 'Dora'];

  it('credits a won Alleinspiel with the Spielwert and counts it as Gew', () => {
    const results = scoreList(LINEUP, [game('Bert', true, 120)], '2026-09-16');
    const bert = byName(results, 'Bert');

    expect(bert.won).toBe(1);
    expect(bert.lost).toBe(0);
    expect(bert.wonGameValue).toBe(120);
    expect(bert.lostGameValue).toBe(0);
    expect(bert.points).toBe(120);
    expect(bert.wonBonus).toBe(WIN_BONUS);
    expect(bert.lossPenalty).toBe(0);
  });

  it('debits a lost Alleinspiel with twice the Spielwert and counts it as Verl', () => {
    const results = scoreList(LINEUP, [game('Clara', false, 23)], '2026-09-16');
    const clara = byName(results, 'Clara');

    expect(clara.won).toBe(0);
    expect(clara.lost).toBe(1);
    expect(clara.wonGameValue).toBe(0);
    expect(clara.lostGameValue).toBe(46);
    expect(clara.points).toBe(-46);
    expect(clara.wonBonus).toBe(0);
    expect(clara.lossPenalty).toBe(-LOSS_PENALTY);
  });

  it('pays the opponent bonus only for the losses of the other players', () => {
    const results = scoreList(
      LINEUP,
      [game('Bert', true, 120), game('Clara', false, 23), PASSED_OUT],
      '2026-09-16',
    );

    // Bert won, Clara lost – so everyone but Clara gets the bonus for her loss.
    expect(byName(results, 'Bert').opponentBonus).toBe(30);
    expect(byName(results, 'Anna').opponentBonus).toBe(30);
    expect(byName(results, 'Dora').opponentBonus).toBe(30);
    expect(byName(results, 'Clara').opponentBonus).toBe(0);
  });

  it('adds the flat bonuses to the account for the final result', () => {
    const results = scoreList(
      LINEUP,
      [game('Bert', true, 120), game('Clara', false, 23), PASSED_OUT],
      '2026-09-16',
    );

    // Bert: 120 won + 50 bonus for the win + 30 for Clara's loss.
    expect(byName(results, 'Bert')).toMatchObject({
      points: 120,
      wonBonus: 50,
      lossPenalty: 0,
      opponentBonus: 30,
      total: 200,
    });

    // Clara: -46 for the lost game - 50 for losing it.
    expect(byName(results, 'Clara')).toMatchObject({
      points: -46,
      wonBonus: 0,
      lossPenalty: -50,
      opponentBonus: 0,
      total: -96,
    });

    // Anna played nothing, but profits from Clara's loss.
    expect(byName(results, 'Anna')).toMatchObject({
      won: 0,
      lost: 0,
      points: 0,
      opponentBonus: 30,
      total: 30,
    });
  });

  it('counts every loss of every other player', () => {
    const results = scoreList(
      ['Anna', 'Bert', 'Clara'],
      [game('Bert', false, 9), game('Clara', false, 9), PASSED_OUT],
      '2026-09-16',
    );

    // Three players, so a foreign loss is worth 40. Anna sees both losses.
    expect(results.opponentBonusPerGame).toBe(40);
    expect(byName(results, 'Anna').opponentBonus).toBe(80);
    expect(byName(results, 'Anna').total).toBe(80);
    expect(byName(results, 'Bert').opponentBonus).toBe(40);
    expect(byName(results, 'Clara').opponentBonus).toBe(40);
  });

  it('uses the bonus of the size of the lineup', () => {
    expect(scoreList(LINEUP, [], '2026-09-16').opponentBonusPerGame).toBe(30);
    expect(scoreList(['A', 'B', 'C', 'D', 'E'], [], '2026-09-16').opponentBonusPerGame).toBe(24);
    expect(scoreList(['A', 'B', 'C'], [], '2026-09-16').opponentBonusPerGame).toBe(40);
  });

  it('summarises the list itself', () => {
    const results = scoreList(
      LINEUP,
      [game('Bert', true, 120), game('Clara', false, 23), PASSED_OUT, PASSED_OUT],
      '2026-09-16',
    );

    expect(results).toMatchObject({
      matchday: '2026-09-16',
      playerCount: 4,
      gameCount: 4,
      playedCount: 2,
      passedOutCount: 2,
      totalGameValue: 143,
      opponentBonusPerGame: 30,
    });
  });

  it('gives every player of the lineup a row, in seating order', () => {
    const results = scoreList(LINEUP, [], '2026-09-16');

    expect(results.players.map((player) => player.name)).toEqual(LINEUP);
    expect(results.players.map((player) => player.position)).toEqual([1, 2, 3, 4]);
    for (const player of results.players) {
      expect(player).toMatchObject({
        won: 0,
        lost: 0,
        points: 0,
        wonBonus: 0,
        lossPenalty: 0,
        opponentBonus: 0,
        total: 0,
      });
    }
  });

  it('ignores a declarer who is not in the lineup', () => {
    const results = scoreList(LINEUP, [game('Emil', true, 100)], '2026-09-16');

    expect(results.playedCount).toBe(1);
    for (const player of results.players) expect(player.points).toBe(0);
  });
});

describe('toGameDto result columns', () => {
  function dto(overrides: Partial<Game> = {}) {
    return toGameDto({
      id: 'game-1',
      listId: 'list-1',
      position: 1,
      players: ['Anna', 'Bert', 'Clara'],
      dealer: 'Anna',
      declarer: 'Bert',
      gameType: 'GRAND',
      hand: true,
      schneiderAnnounced: false,
      schwarzAnnounced: false,
      offen: false,
      matadors: 'WITH',
      matadorsCount: 2,
      schneider: true,
      schwarz: false,
      won: true,
      gameValue: 120,
      note: null,
      createdAt: new Date('2026-09-16T18:00:00.000Z'),
      updatedAt: new Date('2026-09-16T18:00:00.000Z'),
      ...overrides,
    } as Game);
  }

  it('fills the positive column for a game that was won', () => {
    expect(dto()).toMatchObject({ positiveGameValue: 120, negativeGameValue: 0 });
  });

  it('fills the doubled negative column for a game that was lost', () => {
    expect(dto({ won: false, gameValue: 48 })).toMatchObject({
      positiveGameValue: 0,
      negativeGameValue: 96,
    });
  });

  it('leaves both columns at zero for a passed out game', () => {
    expect(
      dto({ declarer: null, won: null, gameValue: 0, gameType: null, matadors: null }),
    ).toMatchObject({
      passedOut: true,
      positiveGameValue: 0,
      negativeGameValue: 0,
    });
  });
});
