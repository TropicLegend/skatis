import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../src/lib/http-error.js';
import { attemptLimiter, clientAddressKey, rateLimit } from '../src/middleware/rate-limit.js';

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

  it('counts the addresses of one IPv6 network together', () => {
    // A caller owns its whole /64 and could use a new address for every request.
    const limiter = rateLimit('v6', 2, 60_000);

    expect(call(limiter, '2001:db8:1:2::1').error).toBeUndefined();
    expect(call(limiter, '2001:db8:1:2:aaaa:bbbb:cccc:dddd').error).toBeUndefined();
    expect(call(limiter, '2001:db8:1:2::ffff').error).toBeInstanceOf(HttpError);
    // The neighbouring network has its own count.
    expect(call(limiter, '2001:db8:1:3::1').error).toBeUndefined();
  });
});

describe('clientAddressKey', () => {
  it('keeps an IPv4 address as it is', () => {
    expect(clientAddressKey('203.0.113.7')).toBe('203.0.113.7');
  });

  it('reduces an IPv6 address to its /64', () => {
    expect(clientAddressKey('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
    expect(clientAddressKey('2001:0db8:0001:0002::1')).toBe('2001:db8:1:2::/64');
    expect(clientAddressKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(clientAddressKey('::1')).toBe('0:0:0:0::/64');
    expect(clientAddressKey('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('counts an IPv4 address that is mapped into IPv6 as that IPv4 address', () => {
    expect(clientAddressKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(clientAddressKey('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(clientAddressKey('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('leaves anything that is no address alone', () => {
    expect(clientAddressKey('unknown')).toBe('unknown');
    expect(clientAddressKey('not:an:address')).toBe('not:an:address');
    expect(clientAddressKey('1::2::3')).toBe('1::2::3');
  });
});

describe('attemptLimiter', () => {
  it('lets attempts through until the limit of failed ones is reached', () => {
    const limiter = attemptLimiter(3, 60_000);

    limiter.begin('K7M2P4QX');
    limiter.begin('K7M2P4QX');
    limiter.begin('K7M2P4QX');

    try {
      limiter.begin('K7M2P4QX');
      throw new Error('Expected the fourth attempt to be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(429);
      expect((error as HttpError).details).toEqual({ retryAfterSeconds: 60 });
    }
  });

  it('does not count an attempt that turned out to be right', () => {
    const limiter = attemptLimiter(2, 60_000);

    for (let login = 0; login < 20; login += 1) {
      limiter.begin('K7M2P4QX').release();
    }

    expect(() => limiter.begin('K7M2P4QX')).not.toThrow();
  });

  it('gives an attempt back only once', () => {
    const limiter = attemptLimiter(2, 60_000);
    const first = limiter.begin('K7M2P4QX');
    limiter.begin('K7M2P4QX');

    first.release();
    first.release();

    expect(() => limiter.begin('K7M2P4QX')).not.toThrow();
    expect(() => limiter.begin('K7M2P4QX')).toThrow(HttpError);
  });

  it('counts every key separately', () => {
    const limiter = attemptLimiter(1, 60_000);

    limiter.begin('K7M2P4QX');

    expect(() => limiter.begin('K7M2P4QX')).toThrow(HttpError);
    expect(() => limiter.begin('Z9YXWVTS')).not.toThrow();
  });

  it('starts over once the window has passed', () => {
    const limiter = attemptLimiter(1, 1_000);
    const start = 1_000_000;

    limiter.begin('K7M2P4QX', start);

    expect(() => limiter.begin('K7M2P4QX', start + 999)).toThrow(HttpError);
    expect(() => limiter.begin('K7M2P4QX', start + 1_000)).not.toThrow();
  });

  it('does not limit at all when it is disabled', () => {
    const limiter = attemptLimiter(0, 60_000);

    for (let attempt = 0; attempt < 50; attempt += 1) {
      expect(() => limiter.begin('K7M2P4QX')).not.toThrow();
    }
  });
});
