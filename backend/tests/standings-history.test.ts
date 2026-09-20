import { describe, expect, it } from 'vitest';

import { scoreList, type ListResultsDto, type ScorableGame } from '../src/modules/lists/scoring.js';
import { standingsHistory, tournamentStandings } from '../src/modules/tournaments/standings.js';

const TOURNAMENT_ID = 'K7M2P4QX';
const ROSTER = ['Anna', 'Bert', 'Clara', 'Dora', 'Emil'];
const LINEUP = ['Anna', 'Bert', 'Clara', 'Dora'];

/** One list of the tournament, scored as the results endpoint scores it. */
function matchday(matchdayIso: string, games: readonly ScorableGame[]): ListResultsDto {
  return scoreList(LINEUP, games, matchdayIso);
}

/** A game of that list: the Geber sits out, so `players` are the three at the table. */
function game(
  declarer: string | null,
  won: boolean | null,
  gameValue: number,
  dealer = 'Dora',
): ScorableGame {
  return { players: LINEUP.filter((name) => name !== dealer), declarer, won, gameValue };
}

describe('standingsHistory', () => {
  it('uses one bucket per matchday and ends where the standing is', () => {
    const lists = [
      matchday('2026-09-16', [game('Anna', true, 60)]),
      matchday('2026-09-23', [game('Bert', true, 48)]),
    ];

    const history = standingsHistory(TOURNAMENT_ID, ROSTER, lists);
    const standings = tournamentStandings(TOURNAMENT_ID, ROSTER, lists);

    expect(history.tournamentId).toBe(TOURNAMENT_ID);
    expect(history.groupBy).toBe('matchday');
    expect(history.buckets.map((bucket) => bucket.key)).toEqual(['2026-09-16', '2026-09-23']);

    // The last bucket has to be the standing, or the chart would contradict the table.
    const last = history.buckets.at(-1);
    for (const player of standings.players) {
      expect(last?.score[player.name], player.name).toBe(player.score);
      expect(last?.gamesPlayed[player.name], player.name).toBe(player.gamesPlayed);
      expect(last?.averageScore[player.name], player.name).toBe(player.averageScore);
    }
  });

  it('takes the order of its series from the caller', () => {
    // The service hands in the order of the standing, so chart and table agree;
    // the history itself never sorts.
    const history = standingsHistory(
      TOURNAMENT_ID,
      ['Clara', 'Anna', 'Bert'],
      [
        matchday('2026-09-16', [game('Anna', true, 60)]),
        matchday('2026-09-23', [game('Bert', true, 48)]),
      ],
    );

    expect(history.players).toEqual(['Clara', 'Anna', 'Bert']);
    expect(Object.keys(history.buckets[0]?.score ?? {})).toEqual(['Clara', 'Anna', 'Bert']);
  });

  it('shows where the previous matchdays left the standing', () => {
    const buckets = standingsHistory(TOURNAMENT_ID, ROSTER, [
      matchday('2026-09-16', [game('Anna', true, 60)]),
      matchday('2026-09-23', [game('Anna', true, 24)]),
    ]).buckets;

    // 60 + the +50 of a won Alleinspiel over one game, then 74 + 50 over two games.
    expect(buckets[0]?.averageScore['Anna']).toBe(110);
    expect(buckets[1]?.averageScore['Anna']).toBe(92);
    expect(buckets[0]?.score['Anna']).toBe(110);
    expect(buckets[1]?.score['Anna']).toBe(184);
    expect(buckets[0]?.gamesPlayed['Anna']).toBe(1);
    expect(buckets[1]?.gamesPlayed['Anna']).toBe(2);
  });

  it('keeps the average of a player without a game empty', () => {
    const bucket = standingsHistory(TOURNAMENT_ID, ROSTER, [
      matchday('2026-09-16', [game('Anna', true, 60)]),
    ]).buckets[0];

    expect(bucket?.averageScore['Emil']).toBeNull();
    expect(bucket?.score['Emil']).toBe(0);
    expect(bucket?.gamesPlayed['Emil']).toBe(0);
  });

  it('adds up all lists of a day before the bucket is read', () => {
    const buckets = standingsHistory(TOURNAMENT_ID, ROSTER, [
      matchday('2026-09-16', [game('Anna', true, 60)]),
      matchday('2026-09-16', [game('Bert', true, 48)]),
      matchday('2026-09-23', [game('Anna', true, 24)]),
    ]).buckets;

    expect(buckets).toHaveLength(2);
    expect(buckets[0]?.matchdayCount).toBe(1);
    expect(buckets[0]?.from).toBe('2026-09-16');
    expect(buckets[0]?.to).toBe('2026-09-16');
    // Both lists of the day are in the same bucket, and only then is it read.
    expect(buckets[0]?.score['Anna']).toBe(110);
    expect(buckets[0]?.score['Bert']).toBe(98);
    expect(buckets[0]?.gamesPlayed['Anna']).toBe(2);
    expect(buckets[1]?.gamesPlayed['Anna']).toBe(3);
    expect(buckets[1]?.score['Bert']).toBe(98);
  });

  it('sorts the counted lists by matchday, whatever order they arrive in', () => {
    const history = standingsHistory(TOURNAMENT_ID, ROSTER, [
      matchday('2026-09-30', [game('Anna', true, 24)]),
      matchday('2026-09-16', [game('Anna', true, 60)]),
    ]);

    expect(history.buckets.map((bucket) => bucket.from)).toEqual(['2026-09-16', '2026-09-30']);
  });

  it('groups a week into one bucket and counts its matchdays', () => {
    const history = standingsHistory(
      TOURNAMENT_ID,
      ROSTER,
      [
        matchday('2026-09-16', [game('Anna', true, 60)]),
        matchday('2026-09-17', [game('Bert', true, 24)]),
        matchday('2026-09-23', [game('Clara', true, 24)]),
      ],
      'week',
    );

    expect(history.groupBy).toBe('week');
    expect(history.buckets.map((bucket) => bucket.key)).toEqual(['2026-W38', '2026-W39']);
    expect(history.buckets[0]?.from).toBe('2026-09-16');
    expect(history.buckets[0]?.to).toBe('2026-09-17');
    expect(history.buckets[0]?.matchdayCount).toBe(2);
    expect(history.buckets[1]?.matchdayCount).toBe(1);
  });

  it('keeps the turn of the year in the week it belongs to', () => {
    const history = standingsHistory(
      TOURNAMENT_ID,
      ROSTER,
      [matchday('2027-01-01', [game('Anna', true, 24)])],
      'week',
    );

    // The 1st of January 2027 is a Friday, so it still belongs to the 53rd ISO week of 2026.
    expect(history.buckets[0]?.key).toBe('2026-W53');
  });

  it('groups a month into one bucket', () => {
    const history = standingsHistory(
      TOURNAMENT_ID,
      ROSTER,
      [
        matchday('2026-09-16', [game('Anna', true, 60)]),
        matchday('2026-09-30', [game('Anna', true, 24)]),
        matchday('2026-10-07', [game('Anna', true, 24)]),
      ],
      'month',
    );

    expect(history.buckets.map((bucket) => bucket.key)).toEqual(['2026-09', '2026-10']);
    expect(history.buckets.map((bucket) => bucket.matchdayCount)).toEqual([2, 1]);
  });

  it('has no bucket for a tournament without a counted list', () => {
    const history = standingsHistory(TOURNAMENT_ID, ROSTER, []);

    expect(history.buckets).toEqual([]);
    expect(history.players).toEqual(ROSTER);
  });

  it('ignores a player who is not part of the roster', () => {
    // A list of another tournament cannot be read through the API, but a history
    // that invented a player would not match the standing.
    const lists = [
      scoreList(['Anna', 'Bert', 'Clara', 'Zoe'], [game('Zoe', true, 60)], '2026-09-16'),
    ];
    const bucket = standingsHistory(TOURNAMENT_ID, ROSTER, lists).buckets[0];

    expect(Object.keys(bucket?.score ?? {})).toEqual(ROSTER);
    expect(bucket?.averageScore['Anna']).toBe(0);
  });
});
