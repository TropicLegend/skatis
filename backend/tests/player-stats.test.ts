import type { GameType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { playerGameStats, type StatGame } from '../src/modules/tournaments/player-stats.js';

const LINEUP = ['Anna', 'Bert', 'Clara', 'Dora'];

/** One round of a list: the three at the table, the fourth one deals. */
function game(
  declarer: string | null,
  won: boolean | null,
  gameType: GameType | null,
  hand = false,
  players: readonly string[] = ['Anna', 'Bert', 'Clara'],
): StatGame {
  return { players, declarer, won, gameType, hand };
}

const PASSED_OUT = game(null, null, null, false, ['Anna', 'Bert', 'Clara']);

describe('playerGameStats', () => {
  it('splits the games played into the three roles', () => {
    const stats = playerGameStats('Anna', [
      game('Anna', true, 'GRAND'),
      game('Bert', false, 'HERZ'),
      PASSED_OUT,
    ]);

    // Anna was at the table in all three rounds: one own Alleinspiel, one
    // Gegenspiel and one round that was passed out.
    expect(stats.roles).toMatchObject({ played: 3, declarer: 1, defender: 1, passedOut: 1 });
  });

  it('counts only the rounds the player was at the table in', () => {
    const stats = playerGameStats('Dora', [
      game('Anna', true, 'GRAND'),
      game('Bert', false, 'HERZ', false, ['Bert', 'Clara', 'Dora']),
    ]);

    // Dora deals in round 1, so she only took part in round 2 – as a Gegenspieler.
    expect(stats.roles).toMatchObject({ played: 1, declarer: 0, defender: 1, passedOut: 0 });
    expect(stats.declarer.played).toBe(0);
  });

  it('reports the role shares in percent, rounded to one decimal', () => {
    const stats = playerGameStats('Anna', [
      game('Anna', true, 'GRAND'),
      game('Bert', false, 'HERZ'),
      PASSED_OUT,
    ]);

    expect(stats.roles.declarerShare).toBe(33.3);
    expect(stats.roles.defenderShare).toBe(33.3);
  });

  it('counts the own Alleinspiele and their Erfolgsquote', () => {
    const stats = playerGameStats('Anna', [
      game('Anna', true, 'GRAND'),
      game('Anna', true, 'PIK'),
      game('Anna', false, 'KARO'),
      game('Bert', true, 'HERZ'),
    ]);

    expect(stats.declarer).toEqual({ played: 3, won: 2, lost: 1, winShare: 66.7 });
    expect(stats.roles).toMatchObject({ played: 4, declarer: 3, defender: 1 });
  });

  it('counts the Hand games and how many of them were won', () => {
    const stats = playerGameStats('Anna', [
      game('Anna', true, 'GRAND', true),
      game('Anna', false, 'HERZ', true),
      game('Anna', true, 'PIK'),
      game('Anna', true, 'KREUZ'),
    ]);

    expect(stats.hand).toEqual({ played: 2, won: 1, share: 50, winShare: 50 });
  });

  it('counts a won Gegenspiel only for the rounds he was at the table in', () => {
    const stats = playerGameStats('Dora', [
      // Bert loses while Dora deals – she collects the bonus but did not defend.
      game('Bert', false, 'HERZ'),
      // Dora defends and wins: the Alleinspieler loses.
      game('Clara', false, 'KARO', false, ['Anna', 'Clara', 'Dora']),
    ]);

    expect(stats.defender).toEqual({ played: 1, won: 1, winShare: 100 });
    expect(stats.roles).toMatchObject({ played: 1, declarer: 0, defender: 1 });
  });

  it('lists the Spielarten he played, in the order of the enum', () => {
    const stats = playerGameStats('Anna', [
      game('Anna', true, 'HERZ'),
      game('Anna', false, 'HERZ'),
      game('Anna', true, 'GRAND'),
      game('Bert', true, 'NULL'),
    ]);

    expect(stats.gameTypes).toEqual([
      { gameType: 'HERZ', played: 2, won: 1, share: 66.7, winShare: 50 },
      { gameType: 'GRAND', played: 1, won: 1, share: 33.3, winShare: 100 },
    ]);
  });

  it('groups his Alleinspiele as Farbspiel, Grand and Null', () => {
    const stats = playerGameStats('Anna', [
      game('Anna', true, 'HERZ'),
      game('Anna', false, 'PIK'),
      game('Anna', true, 'GRAND'),
      game('Anna', true, 'NULL'),
      game('Bert', true, 'KREUZ'),
    ]);

    expect(stats.gameTypeGroups).toEqual([
      { group: 'SUIT', played: 2, won: 1, share: 50, winShare: 50 },
      { group: 'GRAND', played: 1, won: 1, share: 25, winShare: 100 },
      { group: 'NULL', played: 1, won: 1, share: 25, winShare: 100 },
    ]);
  });

  it('reports the three groups also while the player has none of them', () => {
    const stats = playerGameStats('Anna', [game('Bert', true, 'GRAND')]);

    expect(stats.gameTypeGroups.map((entry) => entry.group)).toEqual(['SUIT', 'GRAND', 'NULL']);
    for (const entry of stats.gameTypeGroups) {
      expect(entry).toMatchObject({ played: 0, won: 0, share: null, winShare: null });
    }
  });

  it('has no shares while the player has no game', () => {
    const stats = playerGameStats('Anna', []);

    expect(stats.roles).toEqual({
      played: 0,
      declarer: 0,
      defender: 0,
      passedOut: 0,
      declarerShare: null,
      defenderShare: null,
    });
    expect(stats.declarer).toEqual({ played: 0, won: 0, lost: 0, winShare: null });
    expect(stats.hand).toEqual({ played: 0, won: 0, share: null, winShare: null });
    expect(stats.defender).toEqual({ played: 0, won: 0, winShare: null });
    expect(stats.gameTypes).toEqual([]);
  });

  it('ignores games of other lists the player was not part of', () => {
    const stats = playerGameStats('Anna', [
      game('Bert', true, 'GRAND', false, ['Bert', 'Clara', 'Dora']),
      game('Clara', false, 'HERZ', false, ['Bert', 'Clara', 'Dora']),
    ]);

    expect(stats.roles.played).toBe(0);
  });

  it('knows the six Spielarten of the rules module', () => {
    const stats = playerGameStats(
      'Anna',
      (['KARO', 'HERZ', 'PIK', 'KREUZ', 'GRAND', 'NULL'] as GameType[]).map((gameType) =>
        game('Anna', true, gameType),
      ),
    );

    expect(stats.gameTypes.map((entry) => entry.gameType)).toEqual([
      'KARO',
      'HERZ',
      'PIK',
      'KREUZ',
      'GRAND',
      'NULL',
    ]);
    expect(stats.gameTypes.every((entry) => entry.share === 16.7)).toBe(true);
    expect(LINEUP).toHaveLength(4);
  });
});
