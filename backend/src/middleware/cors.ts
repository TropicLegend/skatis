import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

const ALLOWED_ORIGINS = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const ALLOW_ANY_ORIGIN = ALLOWED_ORIGINS.includes('*');

/**
 * Minimal CORS handling – authentication uses bearer tokens (no cookies),
 * therefore no credentials negotiation is required.
 */
export const cors: RequestHandler = (req, res, next) => {
  const origin = req.header('origin');

  if (origin && (ALLOW_ANY_ORIGIN || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', ALLOW_ANY_ORIGIN ? '*' : origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Request-Id');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
};
