import type { Request, RequestHandler } from 'express';
import { tooManyRequests } from '../lib/http-error.js';

interface Bucket {
  count: number;
  resetAt: number;
}

/** Cleanup kicks in when the map grows beyond this size. */
const CLEANUP_THRESHOLD = 10_000;

/** Drops the buckets whose window is over – only once the map got big. */
function sweep(buckets: Map<string, Bucket>, now: number): void {
  if (buckets.size <= CLEANUP_THRESHOLD) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function retryAfterSeconds(bucket: Bucket, now: number): number {
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

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
      sweep(buckets, now);

      next();
      return;
    }

    bucket.count += 1;

    if (bucket.count > max) {
      const seconds = retryAfterSeconds(bucket, now);
      res.setHeader('Retry-After', String(seconds));
      next(tooManyRequests(`Too many requests – try again in ${seconds} seconds`));
      return;
    }

    next();
  };
}

/**
 * Identifies the caller. Behind a proxy `req.ip` needs `trust proxy` to be set
 * (`TRUST_PROXY`), otherwise every caller looks like the proxy.
 */
function clientKey(req: Request): string {
  return clientAddressKey(req.ip ?? req.socket.remoteAddress ?? 'unknown');
}

/**
 * The address a caller is counted under.
 *
 * An IPv4 address stands for itself. An IPv6 caller usually owns a whole `/64`
 * and can pick a fresh address out of it for every request, so the limit is
 * counted per `/64` – otherwise it would not limit anything. An IPv4 address
 * that arrives mapped into IPv6 (`::ffff:203.0.113.7`) is counted as that IPv4
 * address.
 */
export function clientAddressKey(address: string): string {
  const withoutZone = address.split('%')[0] ?? address;
  if (!withoutZone.includes(':')) return withoutZone;

  const groups = expandIpv6(withoutZone);
  if (groups === null) return withoutZone;

  if (groups.slice(0, 5).every((group) => group === '0') && groups[5] === 'ffff') {
    const high = parseInt(groups[6] ?? '0', 16);
    const low = parseInt(groups[7] ?? '0', 16);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }

  return `${groups.slice(0, 4).join(':')}::/64`;
}

/** The eight groups of an IPv6 address without leading zeros – `null` if it is none. */
function expandIpv6(address: string): string[] | null {
  const halves = address.split('::');
  if (halves.length > 2) return null;

  const parse = (part: string | undefined): string[] | null => {
    if (!part) return [];
    const groups: string[] = [];
    for (const group of part.split(':')) {
      if (group.includes('.')) {
        // A dotted IPv4 tail fills the last two groups.
        const bytes = group.split('.').map(Number);
        if (bytes.length !== 4 || bytes.some((byte) => !Number.isInteger(byte) || byte > 255)) {
          return null;
        }
        const [a = 0, b = 0, c = 0, d = 0] = bytes;
        groups.push(((a << 8) | b).toString(16), ((c << 8) | d).toString(16));
      } else if (/^[0-9a-f]{1,4}$/i.test(group)) {
        groups.push(parseInt(group, 16).toString(16));
      } else {
        return null;
      }
    }
    return groups;
  };

  const head = parse(halves[0]);
  const tail = parse(halves[1]);
  if (head === null || tail === null) return null;

  if (halves.length === 1) return head.length === 8 ? head : null;

  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;

  return [...head, ...Array.from({ length: missing }, () => '0'), ...tail];
}

/** One attempt that was let through – see {@link AttemptLimiter}. */
export interface Attempt {
  /** The attempt was fine after all, so it does not count. */
  release(): void;
}

/**
 * Counts attempts per key and refuses further ones once `max` of them failed
 * within the window.
 *
 * The limit per caller address cannot see a guessing run that is spread over
 * many addresses; this one counts per **target** – the tournament whose password
 * is being tried – and so caps the number of guesses no matter where they come
 * from. Every attempt is counted when it starts and given back when it turns
 * out to be right: a burst of parallel guesses cannot slip through before the
 * first of them is counted, and people who know the password never use the
 * limit up.
 *
 * `max <= 0` disables it. Like {@link rateLimit} the state is per process.
 */
export interface AttemptLimiter {
  /** Counts an attempt for `key`. Throws `429` when the key is used up. */
  begin(key: string, now?: number): Attempt;
}

export function attemptLimiter(max: number, windowMs: number): AttemptLimiter {
  const buckets = new Map<string, Bucket>();
  const unlimited: Attempt = { release: () => undefined };

  return {
    begin(key, now = Date.now()) {
      if (max <= 0) return unlimited;

      let bucket = buckets.get(key);
      if (bucket === undefined || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
        sweep(buckets, now);
      }

      if (bucket.count >= max) {
        const seconds = retryAfterSeconds(bucket, now);
        throw tooManyRequests(
          `Too many failed attempts – try again in ${seconds} seconds`,
          seconds,
        );
      }

      bucket.count += 1;
      const counted = bucket;
      let released = false;

      return {
        release() {
          if (released) return;
          released = true;
          counted.count = Math.max(0, counted.count - 1);
        },
      };
    },
  };
}
