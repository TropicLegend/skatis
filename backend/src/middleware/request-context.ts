import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { logger } from '../lib/logger.js';

const REQUEST_ID_PATTERN = /^[\w.:-]{1,128}$/;

/** Ensures every request carries an id and echoes it back to the caller. */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();

  res.locals.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

/** Logs one line per finished request. */
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info(
      {
        requestId: res.locals.requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
      },
      'request completed',
    );
  });

  next();
};
