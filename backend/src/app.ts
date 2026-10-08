import express, { type Express } from 'express';
import { env } from './config/env.js';
import { cors } from './middleware/cors.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestId, requestLogger } from './middleware/request-context.js';
import { securityHeaders } from './middleware/security-headers.js';
import { apiRouter } from './routes/index.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // Who may report the address of a caller (`X-Forwarded-For`). The rate limits
  // count per address, so behind a proxy this has to name the proxy – see
  // `TRUST_PROXY` in the README.
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(requestLogger);
  app.use(securityHeaders);
  app.use(cors);
  // The API speaks JSON only. Form bodies are not parsed: a form is the one thing
  // another website can post from a visitor's browser without asking first.
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
