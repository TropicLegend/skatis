import { describe, expect, it } from 'vitest';

import {
  accountProgression,
  scoreList,
  type ProgressableGame,
} from '../src/modules/lists/scoring.js';

const LINEUP = ['Anna', 'Bert', 'Clara', 'Dora'];

/**
 * One round of the list: the Geber changes round by round, so with four players
 * everybody sits out once – `players` therefore is the lineup without the Geber.
 */
function round(
  position: number,
  declarer: string | null,
  won: boolean | null,
  gameValue: number,
): ProgressableGame {
  const dealer = LINEUP[(position - 1) % LINEUP.length] ?? 'Anna';

  return {
    position,
    dealer,
    players: LINEUP.filter((name) => name !== dealer),
    declarer,
    won,
    gameValue,
  };
}

function progression(games: readonly ProgressableGame[]) {
  return accountProgression(LINEUP, games, '2026-09-16');
}

describe('accountProgression', () => {
  it('echoes the evening and reports one round per game', () => {
    const result = progression([round(1, 'Bert', true, 24)]);

    expect(result.matchday).toBe('2026-09-16');
    expect(result.lineup).toEqual(LINEUP);
    expect(result.playerCount).toBe(4);
    expect(result.rounds).toHaveLength(1);
    expect(result.rounds[0]).toMatchObject({
      position: 1,
      dealer: 'Anna',
      declarer: 'Bert',
      gameValue: 24,
    });
  });

  it('credits the Spielwert and the flat +50 to the Alleinspieler', () => {
    const [first] = progression([round(1, 'Clara', true, 48)]).rounds;

    // A won Alleinspiel pays the Spielwert plus 50 – and nothing to the others.
    expect(first?.deltas).toEqual({ Anna: 0, Bert: 0, Clara: 98, Dora: 0 });
    expect(first?.accounts).toEqual({ Anna: 0, Bert: 0, Clara: 98, Dora: 0 });
  });

  it('debits twice the Spielwert and the flat -50 for a lost Alleinspiel', () => {
    const [first] = progression([round(1, 'Bert', false, 23)]).rounds;

    expect(first?.gameValue).toBe(23);
    expect(first?.deltas['Bert']).toBe(-46 - 50);
  });

  it('pays the opponent bonus for every Alleinspiel a teammate lost', () => {
    const [lost, passedOut] = progression([
      round(1, 'Bert', false, 20),
      round(2, null, null, 0),
    ]).rounds;

    // Four players read a lost Alleinspiel of somebody else as 30 points each.
    expect(lost?.deltas).toEqual({ Anna: 30, Bert: -40 - 50, Clara: 30, Dora: 30 });
    expect(passedOut?.deltas).toEqual({ Anna: 0, Bert: 0, Clara: 0, Dora: 0 });
  });

  it('pays that bonus to the whole lineup, also to a player who sits out', () => {
    // Round 1 is dealt by Anna, so she is not at the table – she collects the
    // opponent bonus of the lost Alleinspiel all the same.
    const [first] = progression([round(1, 'Bert', false, 24)]).rounds;

    expect(first?.dealer).toBe('Anna');
    expect(first?.deltas['Anna']).toBe(30);
  });

  it('keeps the flat bonuses out of the Spielpunkte of a round', () => {
    const [first, second] = progression([
      round(1, 'Bert', true, 60),
      round(2, 'Anna', false, 30),
    ]).rounds;

    // Round 1: Bert's own Spielwert, without the +50 and without the bonus of
    // round 2 – the account tells a different story.
    expect(first?.points).toEqual({ Anna: 0, Bert: 60, Clara: 0, Dora: 0 });
    expect(first?.accounts).toEqual({ Anna: 0, Bert: 110, Clara: 0, Dora: 0 });

    // Round 2: Anna loses 30, so she is debited twice of it – nothing else, and
    // the others stay where they were in their Spielpunkte.
    expect(second?.points).toEqual({ Anna: -60, Bert: 60, Clara: 0, Dora: 0 });
    expect(second?.accounts).toEqual({ Anna: -110, Bert: 140, Clara: 30, Dora: 30 });
  });

  it('counts the won and lost Alleinspiele round by round', () => {
    const rounds = progression([
      round(1, 'Bert', true, 60),
      round(2, 'Anna', true, 24),
      round(3, 'Bert', false, 20),
      round(4, null, null, 0),
    ]).rounds;

    expect(rounds.map((entry) => entry.won['Bert'])).toEqual([1, 1, 1, 1]);
    expect(rounds.map((entry) => entry.lost['Bert'])).toEqual([0, 0, 1, 1]);
    expect(rounds.map((entry) => entry.won['Anna'])).toEqual([0, 1, 1, 1]);
    expect(rounds.at(-1)?.lost).toEqual({ Anna: 0, Bert: 1, Clara: 0, Dora: 0 });
  });

  it('carries the account from round to round', () => {
    const result = progression([
      round(1, 'Bert', true, 60),
      round(2, 'Anna', true, 30),
      round(3, null, null, 0),
    ]);

    expect(result.rounds.map((entry) => entry.accounts['Bert'])).toEqual([110, 110, 110]);
    expect(result.rounds.at(-1)?.accounts).toEqual({ Anna: 80, Bert: 110, Clara: 0, Dora: 0 });
    expect(result.accounts).toEqual(result.rounds.at(-1)?.accounts);
  });

  it('changes nothing for a game that was passed out', () => {
    const result = progression([round(1, 'Bert', true, 60), round(2, null, null, 0)]);

    expect(result.rounds[1]?.declarer).toBeNull();
    expect(result.rounds[1]?.deltas).toEqual({ Anna: 0, Bert: 0, Clara: 0, Dora: 0 });
    expect(result.rounds[1]?.accounts).toEqual(result.rounds[0]?.accounts);
  });

  it('ends where the result table ends', () => {
    const games = [
      round(1, 'Bert', true, 60),
      round(2, 'Anna', false, 30),
      round(3, 'Dora', true, 48),
      round(4, null, null, 0),
    ];

    const last = progression(games).rounds.at(-1);
    for (const player of scoreList(LINEUP, games, '2026-09-16').players) {
      // The Spielprotokoll and the Ergebnistabelle must not drift apart: the last
      // round reports exactly the row of the table.
      expect(last?.accounts[player.name], player.name).toBe(player.total);
      expect(last?.points[player.name], player.name).toBe(player.points);
      expect(last?.won[player.name], player.name).toBe(player.won);
      expect(last?.lost[player.name], player.name).toBe(player.lost);
    }
  });
});
