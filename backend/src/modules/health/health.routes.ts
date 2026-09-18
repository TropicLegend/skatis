import { Router } from 'express';
import { serviceUnavailable } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';

export const healthRouter = Router();

/** Liveness – the process is up and serving requests. */
healthRouter.get('/', (_req, res) => {
  res.json({
    data: {
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  });
});

/** Readiness – the process is up *and* the database is reachable. */
healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    logger.error({ err: error }, 'readiness check failed');
    throw serviceUnavailable('Database is not reachable');
  }

  res.json({ data: { status: 'ready', database: 'up' } });
});
