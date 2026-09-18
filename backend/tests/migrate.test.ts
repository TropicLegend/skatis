import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn: spawnMock }));

// The suite must not depend on how the developer configured `.env`.
vi.stubEnv('AUTO_MIGRATE', 'true');

const { migrateDatabase, prismaCliPath, schemaPath } = await import('../src/lib/migrate.js');

/** A stand-in for the Prisma CLI child process. */
function fakeChild(options: { code?: number; output?: string; silent?: boolean } = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();

  if (!options.silent) {
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(options.output ?? 'no pending migrations'));
      child.emit('close', options.code ?? 0);
    });
  }

  return child;
}

describe('migration paths', () => {
  it('resolves the bundled Prisma CLI and the schema from the project root', () => {
    expect(prismaCliPath()).toMatch(/node_modules[/\\]\.bin[/\\]prisma(\.cmd)?$/);
    expect(schemaPath()).toMatch(/(^|[/\\])prisma[/\\]schema\.prisma$/);
  });
});

describe('migrateDatabase', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('applies the migrations once when the CLI succeeds', async () => {
    spawnMock.mockReturnValue(fakeChild());

    await expect(migrateDatabase()).resolves.toBeUndefined();

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(spawnMock).toHaveBeenCalledWith(
      prismaCliPath(),
      ['migrate', 'deploy', '--schema', schemaPath()],
      expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] }),
    );
  });

  it('retries while the database is not reachable yet', async () => {
    // A child has to be built when it is spawned – the "close" event it emits
    // would otherwise be gone before the code under test listens for it.
    let attempt = 0;
    spawnMock.mockImplementation(() => {
      attempt += 1;
      return attempt <= 2 ? fakeChild({ code: 1 }) : fakeChild();
    });

    const migration = migrateDatabase();
    const assertion = expect(migration).resolves.toBeUndefined();

    // Two retries, two seconds apart.
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;

    expect(spawnMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after the last attempt instead of serving an outdated schema', async () => {
    spawnMock.mockImplementation(() => fakeChild({ code: 1 }));

    const migration = migrateDatabase();
    const assertion = expect(migration).rejects.toThrow(/exited with code 1/);

    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;

    expect(spawnMock).toHaveBeenCalledTimes(3);
  });

  it('kills a CLI that does not finish and reports the timeout', async () => {
    const children: ReturnType<typeof fakeChild>[] = [];
    spawnMock.mockImplementation(() => {
      const child = fakeChild({ silent: true });
      children.push(child);
      return child;
    });

    const migration = migrateDatabase();
    const assertion = expect(migration).rejects.toThrow(/did not finish within 60000 ms/);

    // Three timeouts of 60 s, plus the two waits in between.
    await vi.advanceTimersByTimeAsync(200_000);
    await assertion;

    expect(children).toHaveLength(3);
    for (const child of children) expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('does nothing at all when AUTO_MIGRATE is switched off', async () => {
    vi.resetModules();
    vi.stubEnv('AUTO_MIGRATE', 'false');

    try {
      const module = await import('../src/lib/migrate.js');
      await expect(module.migrateDatabase()).resolves.toBeUndefined();
      expect(spawnMock).not.toHaveBeenCalled();
    } finally {
      vi.stubEnv('AUTO_MIGRATE', 'true');
    }
  });
});
