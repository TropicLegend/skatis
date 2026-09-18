import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const app = createApp();

const server = app.listen(env.PORT, env.HOST, () => {
  logger.info(
    { host: env.HOST, port: env.PORT, environment: env.NODE_ENV },
    'skatis-api listening',
  );
});

// Report a missing database on startup but keep serving (see /api/health/ready).
prisma
  .$connect()
  .then(() => logger.info('database connection established'))
  .catch((error: unknown) => {
    logger.error({ err: error }, 'could not connect to the database on startup');
  });

let shuttingDown = false;

function shutdown(reason: string): void {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ reason }, 'shutting down');

  const forceExit = setTimeout(() => {
    logger.error('graceful shutdown timed out – forcing exit');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close((closeError) => {
    if (closeError) {
      logger.error({ err: closeError }, 'error while closing the http server');
    }

    prisma
      .$disconnect()
      .catch((error: unknown) =>
        logger.error({ err: error }, 'failed to disconnect from the database'),
      )
      .finally(() => {
        clearTimeout(forceExit);
        process.exit(closeError ? 1 : 0);
      });
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  shutdown('uncaughtException');
});
