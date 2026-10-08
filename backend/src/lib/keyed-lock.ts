/**
 * Runs tasks that share a key one after the other.
 *
 * The services check a rule and then write ("is that table still free?" →
 * create the list). Two requests that arrive together would both pass the check
 * before either of them has written, and both writes would go through – two open
 * lists for one table, a game on a list whose lineup is being replaced, a list
 * that is deleted as "empty" while its first game is entered. Changes of one
 * tournament are therefore queued: the second one sees what the first one did.
 *
 * The queue lives in the process. That covers the usual deployment of a single
 * instance; with several instances the checks of the services still apply, they
 * are only not serialised across them.
 */
const tails = new Map<string, Promise<void>>();

export async function withLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve();

  // The next task waits for this one no matter how it ends – a failed change
  // must not block the ones behind it.
  const run = previous.then(task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  tails.set(key, tail);

  try {
    return await run;
  } finally {
    // Nobody queued up behind this task: forget the key, so the map only holds
    // tournaments that are being changed right now.
    if (tails.get(key) === tail) tails.delete(key);
  }
}

/** Queues a change of a tournament behind the changes that are already running. */
export function withTournamentLock<T>(tournamentId: string, task: () => Promise<T>): Promise<T> {
  return withLock(`tournament:${tournamentId}`, task);
}

/** How many keys are queued right now – only the tests look at it. */
export function lockedKeyCount(): number {
  return tails.size;
}
