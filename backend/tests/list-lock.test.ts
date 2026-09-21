import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/lib/http-error.js';
import { isoWeekday, parseIsoDate, todayIso, toIsoDate } from '../src/lib/dates.js';
import {
  assertDayNotOver,
  assertListEditable,
  assertMatchdayAllowed,
  countsForStanding,
  listLockReasons,
  matchdayWindowsOf,
  playingFromIso,
  takesSlot,
  type ListState,
  type MatchdayWindows,
} from '../src/modules/lists/list-access.js';
import type { TournamentRole } from '../src/lib/tokens.js';

const TODAY = todayIso();
const TODAY_WEEKDAY = isoWeekday(parseIsoDate(TODAY));

function shiftDays(amount: number): string {
  const date = new Date(`${TODAY}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return toIsoDate(date);
}

/**
 * A local moment on an ISO date at "HH:MM". The playing times are compared in
 * the server's timezone, so the tests build their clocks the same way.
 */
function at(isoDate: string, time: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const [hours, minutes] = time.split(':').map(Number) as [number, number];
  return new Date(year, month - 1, day, hours, minutes);
}

/** A day in the past whose weekday differs from today's. */
function dayWithAnotherWeekday(): string {
  let offset = -1;
  while (isoWeekday(parseIsoDate(shiftDays(offset))) === TODAY_WEEKDAY) offset -= 1;
  return shiftDays(offset);
}

const OTHER_DAY = dayWithAnotherWeekday();
const OTHER_WEEKDAY = isoWeekday(parseIsoDate(OTHER_DAY));
const THIRD_WEEKDAY =
  [1, 2, 3, 4, 5, 6, 7].find((day) => day !== TODAY_WEEKDAY && day !== OTHER_WEEKDAY) ?? 1;

/** Today and the other day are both matchdays of the tournament. */
const MATCHDAYS = [TODAY_WEEKDAY, OTHER_WEEKDAY];

function list(status: ListState['status'], matchday: string): ListState {
  return { status, matchday: parseIsoDate(matchday) };
}

describe('listLockReasons', () => {
  it('locks a submitted list for a member', () => {
    expect(listLockReasons(list('SUBMITTED', TODAY), MATCHDAYS, {}, 'MEMBER')).toEqual([
      'SUBMITTED',
    ]);
  });

  it('locks a list of another day for a member', () => {
    expect(listLockReasons(list('OPEN', OTHER_DAY), MATCHDAYS, {}, 'MEMBER')).toEqual([
      'NOT_CURRENT_MATCHDAY',
    ]);
  });

  it('reports both reasons when the list is submitted and of another day', () => {
    expect(listLockReasons(list('SUBMITTED', OTHER_DAY), MATCHDAYS, {}, 'MEMBER')).toEqual([
      'SUBMITTED',
      'NOT_CURRENT_MATCHDAY',
    ]);
  });

  it('locks a list of a day that is not a matchday at all', () => {
    expect(listLockReasons(list('OPEN', OTHER_DAY), [TODAY_WEEKDAY], {}, 'MEMBER')).toEqual([
      'NOT_A_MATCHDAY',
      'NOT_CURRENT_MATCHDAY',
    ]);
  });

  it('leaves the open list of today unlocked for a member', () => {
    expect(listLockReasons(list('OPEN', TODAY), MATCHDAYS, {}, 'MEMBER')).toEqual([]);
  });

  it('never locks a list for an admin', () => {
    expect(listLockReasons(list('SUBMITTED', OTHER_DAY), [TODAY_WEEKDAY], {}, 'ADMIN')).toEqual([]);
  });
});

describe('countsForStanding', () => {
  it('counts a list that was handed in', () => {
    expect(countsForStanding(list('SUBMITTED', TODAY))).toBe(true);
  });

  it('does not count the open list of today', () => {
    expect(countsForStanding(list('OPEN', TODAY))).toBe(false);
  });

  it('counts a list of a past day although its status is still OPEN', () => {
    expect(countsForStanding(list('OPEN', OTHER_DAY))).toBe(true);
  });

  it('counts an old list of a tournament that runs over months', () => {
    expect(countsForStanding(list('OPEN', '2026-01-14'), {}, at('2026-09-18', '12:00'))).toBe(true);
    expect(countsForStanding(list('OPEN', '2026-09-17'), {}, at('2026-09-18', '12:00'))).toBe(true);
  });

  it('does not count a list of a future day', () => {
    expect(countsForStanding(list('OPEN', shiftDays(1)))).toBe(false);
    expect(countsForStanding(list('OPEN', '2027-01-06'), {}, at('2026-09-18', '12:00'))).toBe(
      false,
    );
  });
});

describe('assertDayNotOver', () => {
  it('accepts the day of the list itself', () => {
    expect(() => assertDayNotOver(parseIsoDate(TODAY), 'submitted')).not.toThrow();
    expect(() => assertDayNotOver(parseIsoDate(TODAY), 'reopened')).not.toThrow();
  });

  it('refuses to hand in a list of a past day', () => {
    let error: unknown;
    try {
      assertDayNotOver(parseIsoDate(OTHER_DAY), 'submitted');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(409);
    expect((error as HttpError).message).toContain('counts as submitted');
  });

  it('refuses to reopen a list of a past day', () => {
    expect(() => assertDayNotOver(parseIsoDate(OTHER_DAY), 'reopened')).toThrow(HttpError);
  });

  it('refuses an evening that lies months back just the same', () => {
    expect(() => assertDayNotOver(parseIsoDate('2026-01-14'), 'reopened')).toThrow(HttpError);
  });

  it('leaves a future day alone – an admin may work ahead', () => {
    expect(() => assertDayNotOver(parseIsoDate(shiftDays(1)), 'reopened')).not.toThrow();
  });
});

describe('the lock and the rejection of the API agree', () => {
  const tournament = { id: 'K7M2P4QX', name: 'Mittwochsrunde', matchdays: MATCHDAYS };
  const statuses: ListState['status'][] = ['OPEN', 'SUBMITTED'];
  const roles: TournamentRole[] = ['MEMBER', 'ADMIN'];

  for (const status of statuses) {
    for (const matchday of [TODAY, OTHER_DAY]) {
      for (const role of roles) {
        it(`${role} / ${status} / ${matchday === TODAY ? 'today' : 'another day'}`, () => {
          const reasons = listLockReasons(list(status, matchday), MATCHDAYS, {}, role);

          let rejected = false;
          try {
            assertMatchdayAllowed(tournament, matchday, role);
            assertListEditable(status, role);
          } catch (error) {
            expect(error).toBeInstanceOf(HttpError);
            rejected = true;
          }

          expect(reasons.length > 0).toBe(rejected);
        });
      }
    }
  }

  it('rejects a day that is not a matchday, just like the lock says', () => {
    const matchdays = [THIRD_WEEKDAY];
    const reasons = listLockReasons(list('OPEN', TODAY), matchdays, {}, 'MEMBER');

    expect(reasons).toContain('NOT_A_MATCHDAY');
    expect(() => assertMatchdayAllowed({ ...tournament, matchdays }, TODAY, 'MEMBER')).toThrow(
      HttpError,
    );
  });
});

/** The place of a table ("Serie, Tisch") while its list is still open. */
describe('takesSlot', () => {
  it('is taken by an open list of today', () => {
    expect(takesSlot({ matchday: parseIsoDate(TODAY) })).toBe(true);
  });

  it('is taken by an open list of a future matchday', () => {
    expect(takesSlot({ matchday: parseIsoDate(shiftDays(1)) })).toBe(true);
  });

  it('is free once the day of the open list is over', () => {
    expect(takesSlot({ matchday: parseIsoDate(OTHER_DAY) })).toBe(false);
  });

  it('is free when there is no open list at all', () => {
    expect(takesSlot(null)).toBe(false);
  });

  it('decides against the moment that is given, not against the real now', () => {
    expect(takesSlot({ matchday: parseIsoDate(TODAY) }, {}, at(shiftDays(1), '12:00'))).toBe(false);
    expect(takesSlot({ matchday: parseIsoDate(shiftDays(1)) }, {}, at(TODAY, '12:00'))).toBe(true);
  });
});

/** The optional playing time ("von"-"bis") of a weekday. */
describe('playing times', () => {
  const WINDOW: MatchdayWindows = { [String(TODAY_WEEKDAY)]: { from: '18:00', to: '22:30' } };
  const tournament = {
    id: 'K7M2P4QX',
    name: 'Mittwochsrunde',
    matchdays: MATCHDAYS,
    matchdayWindows: WINDOW,
  };

  it('locks the list before the "von" and unlocks it with the start', () => {
    const before = at(TODAY, '17:30');
    const start = at(TODAY, '18:00');
    const inside = at(TODAY, '19:00');

    expect(listLockReasons(list('OPEN', TODAY), MATCHDAYS, WINDOW, 'MEMBER', before)).toEqual([
      'WINDOW_NOT_STARTED',
    ]);
    expect(listLockReasons(list('OPEN', TODAY), MATCHDAYS, WINDOW, 'MEMBER', start)).toEqual([]);
    expect(listLockReasons(list('OPEN', TODAY), MATCHDAYS, WINDOW, 'MEMBER', inside)).toEqual([]);

    expect(() => assertMatchdayAllowed(tournament, TODAY, 'MEMBER', before)).toThrow(HttpError);
    expect(() => assertMatchdayAllowed(tournament, TODAY, 'MEMBER', start)).not.toThrow();
    expect(() => assertMatchdayAllowed(tournament, TODAY, 'MEMBER', inside)).not.toThrow();
  });

  it('makes the lists count as submitted once the "bis" has passed', () => {
    const inside = at(TODAY, '21:00');
    const after = at(TODAY, '22:30');

    expect(listLockReasons(list('OPEN', TODAY), MATCHDAYS, WINDOW, 'MEMBER', after)).toEqual([
      'WINDOW_OVER',
    ]);
    expect(countsForStanding(list('OPEN', TODAY), WINDOW, after)).toBe(true);
    expect(countsForStanding(list('OPEN', TODAY), WINDOW, inside)).toBe(false);

    expect(takesSlot({ matchday: parseIsoDate(TODAY) }, WINDOW, after)).toBe(false);
    expect(takesSlot({ matchday: parseIsoDate(TODAY) }, WINDOW, inside)).toBe(true);

    expect(() => assertDayNotOver(parseIsoDate(TODAY), 'submitted', WINDOW, after)).toThrow(
      HttpError,
    );
    expect(() => assertDayNotOver(parseIsoDate(TODAY), 'submitted', WINDOW, inside)).not.toThrow();

    expect(() => assertMatchdayAllowed(tournament, TODAY, 'MEMBER', after)).toThrow(HttpError);
  });

  it('only affects the weekday with a playing time and never the admin', () => {
    // Vor dem "von" des heutigen Tages: die Liste eines anderen Tages trägt
    // weiterhin nur ihren eigenen Grund.
    expect(
      listLockReasons(list('OPEN', OTHER_DAY), MATCHDAYS, WINDOW, 'MEMBER', at(TODAY, '17:30')),
    ).toEqual(['NOT_CURRENT_MATCHDAY']);
    expect(
      listLockReasons(list('OPEN', TODAY), MATCHDAYS, WINDOW, 'ADMIN', at(TODAY, '17:30')),
    ).toEqual([]);
    expect(() =>
      assertMatchdayAllowed(tournament, TODAY, 'ADMIN', at(TODAY, '23:59')),
    ).not.toThrow();
  });

  it('knows the boundary the queries use', () => {
    expect(playingFromIso(WINDOW, at(TODAY, '19:00'))).toBe(TODAY);
    expect(playingFromIso(WINDOW, at(TODAY, '17:00'))).toBe(TODAY);
    expect(playingFromIso(WINDOW, at(TODAY, '22:30'))).toBe(shiftDays(1));
    expect(playingFromIso({}, at(TODAY, '23:59'))).toBe(TODAY);
  });

  it('drops stored values that do not fit the shape', () => {
    expect(
      matchdayWindowsOf({
        '3': { from: '18:00', to: '22:30' },
        '8': { from: '18:00', to: '22:30' },
        '5': { from: '22:00', to: '18:00' },
        '4': { from: '8:00', to: '9:00' },
        '2': 'kaputt',
      }),
    ).toEqual({ '3': { from: '18:00', to: '22:30' } });
    expect(matchdayWindowsOf(null)).toEqual({});
    expect(matchdayWindowsOf('18:00')).toEqual({});
  });
});
