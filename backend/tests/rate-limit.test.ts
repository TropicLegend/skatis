import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/lib/http-error.js';
import { rateLimit } from '../src/middleware/rate-limit.js';

interface Call {
  error?: unknown;
  headers: Record<string, string>;
}

/** Runs one request through the middleware. */
function call(handler: ReturnType<typeof rateLimit>, ip: string): Call {
  const headers: Record<string, string> = {};
  const request = { ip, socket: { remoteAddress: ip } } as unknown as Request;
  const response = {
    setHeader: (name: string, value: unknown) => {
      headers[name] = String(value);
    },
  } as unknown as Response;

  let error: unknown;
  handler(request, response, ((raised?: unknown) => {
    error = raised;
  }) as NextFunction);

  return { error, headers };
}

describe('rateLimit', () => {
  it('lets requests through until the limit is reached', () => {
    const limiter = rateLimit('test', 2, 60_000);

    expect(call(limiter, '10.0.0.1').error).toBeUndefined();
    expect(call(limiter, '10.0.0.1').error).toBeUndefined();
  });

  it('answers the request over the limit with 429 and Retry-After', () => {
    const limiter = rateLimit('test', 2, 60_000);
    call(limiter, '10.0.0.2');
    call(limiter, '10.0.0.2');

    const blocked = call(limiter, '10.0.0.2');

    expect(blocked.error).toBeInstanceOf(HttpError);
    expect((blocked.error as HttpError).status).toBe(429);
    expect((blocked.error as HttpError).code).toBe('TOO_MANY_REQUESTS');
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('counts every caller separately', () => {
    const limiter = rateLimit('test', 1, 60_000);

    expect(call(limiter, '10.0.0.3').error).toBeUndefined();
    expect(call(limiter, '10.0.0.3').error).toBeInstanceOf(HttpError);
    expect(call(limiter, '10.0.0.4').error).toBeUndefined();
  });

  it('starts over once the window has passed', () => {
    vi.useFakeTimers();

    try {
      const limiter = rateLimit('window', 1, 1_000);

      expect(call(limiter, '10.0.0.5').error).toBeUndefined();
      expect(call(limiter, '10.0.0.5').error).toBeInstanceOf(HttpError);

      vi.advanceTimersByTime(1_001);

      expect(call(limiter, '10.0.0.5').error).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not limit at all when it is disabled', () => {
    const limiter = rateLimit('off', 0, 60_000);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(call(limiter, '10.0.0.6').error).toBeUndefined();
    }
  });
});
