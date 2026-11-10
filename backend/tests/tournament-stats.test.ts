import type { GameType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { StatGame } from '../src/modules/tournaments/player-stats.js';
import { tournamentGameStats } from '../src/modules/tournaments/tournament-stats.js';

const PLAYERS = ['Anna', 'Bert', 'Clara'] as const;

function game(
  declarer: string | null,
  won: boolean | null,
  gameType: GameType | null,
  extra: Partial<StatGame> = {},
): StatGame {
  return { players: PLAYERS, declarer, won, gameType, hand: false, ...extra };
}

const PASSED_OUT = game(null, null, null);

describe('tournamentGameStats', () => {
  it('counts every round and shows the outcome percentages summing up to 100', () => {
    const stats = tournamentGameStats(
      't1',
      [
        game('Anna', true, 'HERZ'),
        game('Bert', true, 'GRAND'),
        game('Clara', true, 'KARO'),
        game('Anna', true, 'NULL'),
        game('Bert', false, 'PIK'),
        game('Clara', false, 'KREUZ'),
        game('Anna', false, 'HERZ'),
        PASSED_OUT,
      ],
      { listsCounted: 2, matchdaysCounted: 1 },
    );

    expect(stats.totalGames).toBe(8);
    expect(stats.playedGames).toBe(7);
    expect(stats.passedOutGames).toBe(1);
    expect(stats.outcomes).toMatchObject({ won: 4, lost: 3, passedOut: 1 });
    expect(
      (stats.outcomes.wonShare ?? 0) +
        (stats.outcomes.lostShare ?? 0) +
        (stats.outcomes.passedOutShare ?? 0),
    ).toBe(100);
    expect(stats.listsCounted).toBe(2);
    expect(stats.matchdaysCounted).toBe(1);
  });

  it('puts the rounding difference into the largest outcome share', () => {
    const stats = tournamentGameStats(
      't1',
      [game('Anna', true, 'HERZ'), game('Bert', false, 'PIK'), PASSED_OUT],
      { listsCounted: 1, matchdaysCounted: 1 },
    );

    expect(stats.outcomes.wonShare).toBe(33.4);
    expect(stats.outcomes.lostShare).toBe(33.3);
    expect(stats.outcomes.passedOutShare).toBe(33.3);
  });

  it('reports Spielarten and their Gewinnquote without passed-out rounds', () => {
    const stats = tournamentGameStats(
      't1',
      [
        game('Anna', true, 'KARO'),
        game('Anna', true, 'KARO'),
        game('Bert', false, 'KARO'),
        game('Anna', true, 'HERZ'),
        game('Bert', true, 'GRAND'),
        game('Bert', false, 'GRAND'),
        game('Clara', false, 'NULL'),
        PASSED_OUT,
      ],
      { listsCounted: 1, matchdaysCounted: 1 },
    );

    expect(stats.gameTypes).toContainEqual(
      expect.objectContaining({ gameType: 'KARO', played: 3, won: 2, lost: 1, winShare: 66.7 }),
    );
    expect(stats.gameTypes).toContainEqual(
      expect.objectContaining({ gameType: 'HERZ', played: 1, won: 1, lost: 0, winShare: 100 }),
    );
    expect(stats.gameTypes).toContainEqual(
      expect.objectContaining({ gameType: 'GRAND', played: 2, won: 1, lost: 1, winShare: 50 }),
    );
    expect(stats.gameTypes).toContainEqual(
      expect.objectContaining({ gameType: 'NULL', played: 1, won: 0, lost: 1, winShare: 0 }),
    );

    expect(stats.gameTypeGroups).toEqual([
      expect.objectContaining({ group: 'SUIT', played: 4, won: 3, share: 57.1, winShare: 75 }),
      expect.objectContaining({ group: 'GRAND', played: 2, won: 1, share: 28.6, winShare: 50 }),
      expect.objectContaining({ group: 'NULL', played: 1, won: 0, share: 14.3, winShare: 0 }),
    ]);
  });

  it('distributes Hand, Offen and the announced and achieved levels by Spielart', () => {
    const stats = tournamentGameStats(
      't1',
      [
        game('Anna', true, 'HERZ', {
          hand: true,
          schneiderAnnounced: true,
          schneider: true,
        }),
        game('Bert', true, 'GRAND', { hand: true, schwarzAnnounced: true, schwarz: true }),
        game('Clara', false, 'NULL', { offen: true }),
        game(null, null, null, { hand: true }),
      ],
      { listsCounted: 1, matchdaysCounted: 1 },
    );

    const byKey = new Map(stats.features.map((feature) => [feature.key, feature]));
    expect(byKey.get('hand')?.total).toBe(2);
    expect(byKey.get('hand')?.byGameType).toContainEqual(
      expect.objectContaining({ gameType: 'HERZ', count: 1, share: 50 }),
    );
    expect(byKey.get('offen')?.total).toBe(1);
    expect(byKey.get('schneiderAnnounced')?.total).toBe(1);
    expect(byKey.get('schwarzAnnounced')?.total).toBe(1);
    expect(byKey.get('schneider')?.total).toBe(1);
    expect(byKey.get('schwarz')?.total).toBe(1);
  });

  it('returns null shares when no game was entered', () => {
    const stats = tournamentGameStats('t1', [], { listsCounted: 0, matchdaysCounted: 0 });

    expect(stats.totalGames).toBe(0);
    expect(stats.outcomes.wonShare).toBeNull();
    expect(stats.gameTypes.every((gameType) => gameType.winShare === null)).toBe(true);
    expect(stats.features.every((feature) => feature.total === 0)).toBe(true);
  });
});
