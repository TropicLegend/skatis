import type { Request, RequestHandler } from 'express';
import { tooManyRequests } from '../lib/http-error.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/** Cleanup kicks in when the map grows beyond this size. */
const CLEANUP_THRESHOLD = 10_000;

/**
 * Small fixed window rate limiter, kept in memory.
 *
 * It protects the endpoints that need no token – logging in tries passwords and
 * creating tournaments is open to anyone – against brute force and spam. The
 * state is per process, so with several instances the effective limit is
 * multiplied by their number; put a shared limiter in the reverse proxy if that
 * matters.
 *
 * `max <= 0` disables the limiter.
 */
export function rateLimit(name: string, max: number, windowMs: number): RequestHandler {
  const buckets = new Map<string, Bucket>();

  return (req, res, next) => {
    if (max <= 0) {
      next();
      return;
    }

    const now = Date.now();
    const key = `${name}:${clientKey(req)}`;
    const bucket = buckets.get(key);

    if (bucket === undefined || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });

      if (buckets.size > CLEANUP_THRESHOLD) {
        for (const [entryKey, entry] of buckets) {
          if (entry.resetAt <= now) buckets.delete(entryKey);
        }
      }

      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      next(tooManyRequests(`Too many requests – try again in ${retryAfterSeconds} seconds`));
      return;
    }

    next();
  };
}

/** Identifies the caller. Behind a proxy `req.ip` needs `trust proxy` to be set. */
function clientKey(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
