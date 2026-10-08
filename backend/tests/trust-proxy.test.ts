import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { env } from '../src/config/env.js';

/**
 * Who Express takes for the caller with the default `TRUST_PROXY`. The suite sets
 * no `TRUST_PROXY`, so this is the list a deployment gets without any setting:
 * loopback, 192.168.0.0/16 and the ranges of Cloudflare.
 *
 * supertest connects from loopback – the reverse proxy on the same host. Every
 * proxy on the way appends the address it got the request from, so the header
 * reads from the caller (left) to the hop next to the API (right).
 */
const app = express();
app.set('trust proxy', env.TRUST_PROXY);
app.get('/ip', (req, res) => {
  res.json({ ip: req.ip });
});

async function callerOf(forwardedFor?: string): Promise<string> {
  const pending = request(app).get('/ip');
  if (forwardedFor !== undefined) pending.set('X-Forwarded-For', forwardedFor);
  return ((await pending).body as { ip: string }).ip;
}

describe('the caller behind the default proxies', () => {
  it('is the address Cloudflare reports', async () => {
    // caller -> Cloudflare (173.245.48.10) -> reverse proxy on loopback -> API
    expect(await callerOf('203.0.113.7, 173.245.48.10')).toBe('203.0.113.7');
  });

  it('is found behind a reverse proxy in the 192.168 network as well', async () => {
    // caller -> Cloudflare -> proxy at 192.168.1.20 -> proxy on loopback -> API
    expect(await callerOf('203.0.113.7, 162.158.90.4, 192.168.1.20')).toBe('203.0.113.7');
  });

  it('is found behind an IPv6 address of Cloudflare', async () => {
    expect(await callerOf('2001:db8::7, 2606:4700:10::6814:1')).toBe('2001:db8::7');
  });

  it('cannot be chosen by the caller', async () => {
    // The caller sent its own `X-Forwarded-For: 198.51.100.99`; Cloudflare
    // appended the address the request really came from.
    expect(await callerOf('198.51.100.99, 203.0.113.7, 104.16.1.1')).toBe('203.0.113.7');
  });

  it('is the last hop when that hop is no trusted proxy', async () => {
    // 10.0.0.5 is neither loopback, 192.168.* nor Cloudflare: what it claims
    // about the caller is not believed.
    expect(await callerOf('203.0.113.7, 10.0.0.5')).toBe('10.0.0.5');
  });

  it('is the peer itself without a forwarded address', async () => {
    expect(await callerOf()).toMatch(/127\.0\.0\.1|::1/);
  });
});
