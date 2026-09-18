import type { RequestHandler } from 'express';
import { notFound } from '../lib/http-error.js';

/** Rejects unknown routes with the shared error envelope. */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(notFound(`Route ${req.method} ${req.originalUrl} does not exist`));
};
