import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The configuration is read once, when the module is loaded – so every case
 * loads it again with its own environment.
 */
async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) vi.stubEnv(name, undefined as unknown as string);
    else vi.stubEnv(name, value);
  }
  return (await import('../src/config/env.js')).env;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('JWT_SECRET', () => {
  it('refuses the placeholder of .env.example although it is long enough', async () => {
    await expect(
      loadEnv({ JWT_SECRET: 'replace-me-with-a-random-secret-of-at-least-32-characters' }),
    ).rejects.toThrow(/placeholder/);
  });

  it('refuses a short secret', async () => {
    await expect(loadEnv({ JWT_SECRET: 'too-short' })).rejects.toThrow(/at least 32/);
  });

  it('accepts a random secret', async () => {
    const env = await loadEnv({ JWT_SECRET: 'q9B2rXv7mK4tZ1sW8eY3uP6aD0fG5hJcLnMoQiRb' });
    expect(env.JWT_SECRET).toHaveLength(40);
  });
});

describe('TRUST_PROXY', () => {
  it('trusts the loopback interface by default', async () => {
    expect((await loadEnv({ TRUST_PROXY: undefined })).TRUST_PROXY).toBe('loopback');
  });

  it('reads a number as the count of proxies in front of the API', async () => {
    expect((await loadEnv({ TRUST_PROXY: '2' })).TRUST_PROXY).toBe(2);
  });

  it('reads false as "trust nobody"', async () => {
    expect((await loadEnv({ TRUST_PROXY: 'false' })).TRUST_PROXY).toBe(false);
  });

  it('keeps a list of proxies as it is', async () => {
    expect((await loadEnv({ TRUST_PROXY: 'loopback, 172.16.0.0/12' })).TRUST_PROXY).toBe(
      'loopback, 172.16.0.0/12',
    );
  });

  it('refuses to trust every caller', async () => {
    await expect(loadEnv({ TRUST_PROXY: 'true' })).rejects.toThrow(/TRUST_PROXY/);
  });
});

describe('LOGIN_FAILURE_MAX', () => {
  it('defaults to 100 and can be switched off', async () => {
    expect((await loadEnv({ LOGIN_FAILURE_MAX: undefined })).LOGIN_FAILURE_MAX).toBe(100);
    expect((await loadEnv({ LOGIN_FAILURE_MAX: '0' })).LOGIN_FAILURE_MAX).toBe(0);
  });
});
