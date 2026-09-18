import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/** How long a single `prisma migrate deploy` may take before it is killed. */
const MIGRATION_TIMEOUT_MS = 60_000;
/** How often the database is given another chance when it is not up yet. */
const MIGRATION_ATTEMPTS = 3;
const MIGRATION_RETRY_MS = 2_000;

// `src/lib/migrate.ts` and `dist/lib/migrate.js` are both two levels below the
// project root, so this works in development and in the build.
const projectRoot = new URL('../../', import.meta.url);

/** Path of the Prisma CLI that ships with the project. */
export function prismaCliPath(): string {
  const binary = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
  return fileURLToPath(new URL(`node_modules/.bin/${binary}`, projectRoot));
}

/** Path of the schema the CLI works on. */
export function schemaPath(): string {
  return fileURLToPath(new URL('prisma/schema.prisma', projectRoot));
}

/** Runs `prisma migrate deploy` and resolves with its output. */
function applyMigrations(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(prismaCliPath(), ['migrate', 'deploy', '--schema', schemaPath()], {
      // The API already knows the configuration, so the CLI inherits it instead
      // of reading `.env` on its own.
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });

    // Also not unref'd: the timeout has to fire even if the CLI stops producing
    // output. It is always cleared once the promise settles.
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`prisma migrate deploy did not finish within ${MIGRATION_TIMEOUT_MS} ms`));
    }, MIGRATION_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(output.trim());
        return;
      }
      reject(new Error(`prisma migrate deploy exited with code ${code}\n${output.trim()}`));
    });
  });
}

/**
 * Waits between two attempts. The timer is deliberately **not** unref'd: before
 * the server listens this is the only thing that keeps the process alive, and
 * an unref'd timer would make Node exit with "unsettled top-level await"
 * instead of running the remaining attempts.
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Brings the database schema up to date before the API starts serving, so that
 * a deployment only has to install and start the server.
 *
 * Pending migrations are applied by `prisma migrate deploy`, which is safe to
 * run repeatedly and also takes care of a database that is completely empty.
 * Because the database may still be starting up, it is retried a few times;
 * when it stays unreachable, startup is aborted instead of serving requests
 * against an outdated schema.
 *
 * Set `AUTO_MIGRATE=false` to skip this – useful when migrations are applied
 * elsewhere (a DBA, a job or a setup with several instances).
 */
export async function migrateDatabase(): Promise<void> {
  if (!env.AUTO_MIGRATE) {
    logger.info('skipping automatic migrations (AUTO_MIGRATE=false)');
    return;
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MIGRATION_ATTEMPTS; attempt += 1) {
    try {
      const output = await applyMigrations();
      // `prisma migrate deploy` is silent about finished migrations, so the
      // output is what tells whether this run had something to do.
      if (/no pending migrations/i.test(output)) {
        logger.info({ attempt }, 'database schema is up to date');
      } else {
        logger.info({ attempt }, 'database migrations applied');
      }
      if (output) logger.debug(output);
      return;
    } catch (error) {
      lastError = error;
      logger.error(
        { attempt, attempts: MIGRATION_ATTEMPTS, err: error },
        'applying the database migrations failed',
      );
      if (attempt < MIGRATION_ATTEMPTS) await delay(MIGRATION_RETRY_MS);
    }
  }

  throw lastError ?? new Error('Applying the database migrations failed');
}
