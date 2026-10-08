import { describe, expect, it } from 'vitest';
import { lockedKeyCount, withLock, withTournamentLock } from '../src/lib/keyed-lock.js';

/** A promise that is settled from the outside. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Lets everything that is already queued run. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

describe('withLock', () => {
  it('runs the tasks of one key one after the other', async () => {
    const gate = deferred();
    const order: string[] = [];

    const first = withLock('a', async () => {
      order.push('first starts');
      await gate.promise;
      order.push('first ends');
    });
    const second = withLock('a', async () => {
      order.push('second starts');
    });

    await settle();
    // The second task has to wait although it would be done at once.
    expect(order).toEqual(['first starts']);

    gate.resolve();
    await Promise.all([first, second]);

    expect(order).toEqual(['first starts', 'first ends', 'second starts']);
  });

  it('lets the check of the second task see what the first one wrote', async () => {
    // The pattern of the services: "is the place free?" → take it.
    const taken = new Set<string>();
    const take = (slot: string) =>
      withLock('tournament', async () => {
        if (taken.has(slot)) return false;
        await Promise.resolve();
        taken.add(slot);
        return true;
      });

    const results = await Promise.all([take('1/3'), take('1/3'), take('1/3')]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('does not make different keys wait for each other', async () => {
    const gate = deferred();
    const order: string[] = [];

    const blocked = withLock('a', async () => {
      await gate.promise;
      order.push('a');
    });
    await withLock('b', async () => {
      order.push('b');
    });

    expect(order).toEqual(['b']);

    gate.resolve();
    await blocked;
  });

  it('hands the result and the error of a task to its caller', async () => {
    await expect(withLock('a', async () => 42)).resolves.toBe(42);
    await expect(
      withLock('a', async () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
  });

  it('keeps going after a task failed', async () => {
    const failed = withLock('a', async () => {
      throw new Error('nope');
    });
    const next = withLock('a', async () => 'still runs');

    await expect(failed).rejects.toThrow('nope');
    await expect(next).resolves.toBe('still runs');
  });

  it('forgets a key once nothing is queued for it', async () => {
    await Promise.all([
      withTournamentLock('K7M2P4QX', async () => undefined),
      withTournamentLock('K7M2P4QX', async () => undefined),
      withTournamentLock('Z9YXWVTS', async () => undefined),
    ]);

    expect(lockedKeyCount()).toBe(0);
  });
});
