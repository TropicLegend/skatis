import 'dotenv/config';
import { isIP } from 'node:net';
import { z } from 'zod';
import { CLOUDFLARE_PROXY_RANGES } from './cloudflare-ips.js';

/**
 * Reads a boolean from the environment. `z.coerce.boolean()` cannot be used for
 * this: it turns every non-empty string – including "false" – into `true`.
 */
const booleanSchema = z
  .enum(['true', 'false', '1', '0'], 'Expected true, false, 1 or 0')
  .transform((value) => value === 'true' || value === '1');

/**
 * `JWT_SECRET` signs every session token, so whoever knows it can mint an admin
 * token for any tournament. The placeholder of `.env.example` is long enough to
 * pass a length check – it is refused by name instead, so a copied example file
 * can never go live with a secret that is published in the repository.
 */
const PLACEHOLDER_SECRET = /^replace-me/i;

/**
 * Which hops in front of the API may say who the caller is (`X-Forwarded-For`).
 * The value is handed to Express as its `trust proxy` setting:
 *
 * * `false` – nobody; `req.ip` is the address of the socket
 * * a number – that many hops in front of the API (`1` = one reverse proxy,
 *   `2` = a CDN in front of a reverse proxy)
 * * a list of addresses and subnets (`192.168.0.0/16`, `2001:db8::/32`) and of
 *   the names `loopback`, `linklocal`, `uniquelocal` and `cloudflare` – only
 *   those proxies are trusted. `cloudflare` stands for the published ranges of
 *   Cloudflare's proxies (`cloudflare-ips.ts`).
 *
 * `true` (trust everything) is refused: every caller could then pick its own
 * address and walk around the rate limit.
 */
const PROXY_NAMES = new Set(['loopback', 'linklocal', 'uniquelocal']);
const CLOUDFLARE_NAME = 'cloudflare';

/**
 * The default covers the usual chain without any setting: Cloudflare in front,
 * a reverse proxy on the same host or in the private `192.168.*` network behind
 * it. Express walks `X-Forwarded-For` from the API outwards and stops at the
 * first address that is none of these – that one is the caller.
 */
export const DEFAULT_TRUST_PROXY = 'loopback, 192.168.0.0/16, cloudflare';

/** An address or a subnet in CIDR notation, IPv4 or IPv6. */
function isAddressOrSubnet(entry: string): boolean {
  const [address = '', prefix, ...rest] = entry.split('/');
  if (rest.length > 0) return false;

  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;

  return /^\d{1,3}$/.test(prefix) && Number(prefix) <= (family === 4 ? 32 : 128);
}

/** The entries of a proxy list, `cloudflare` replaced by its ranges. */
function proxyList(value: string): string[] {
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const name = entry.toLowerCase();
      if (name === CLOUDFLARE_NAME) return [...CLOUDFLARE_PROXY_RANGES];
      return PROXY_NAMES.has(name) ? [name] : [entry];
    });

  return [...new Set(entries)];
}

const trustProxySchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.toLowerCase() !== 'true', {
    message:
      'TRUST_PROXY=true would let every caller choose its own address – use a hop count or a list of proxies',
  })
  .transform((value, context): false | number | string[] => {
    if (value.toLowerCase() === 'false') return false;
    if (/^\d+$/.test(value)) return Number(value);

    const entries = proxyList(value);
    for (const entry of entries) {
      if (PROXY_NAMES.has(entry) || isAddressOrSubnet(entry)) continue;

      context.addIssue({
        code: 'custom',
        message:
          `"${entry}" is no address, subnet or known name ` +
          '(loopback, linklocal, uniquelocal, cloudflare)',
      });
      return z.NEVER;
    }
    return entries;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long')
    .refine((value) => !PLACEHOLDER_SECRET.test(value), {
      message: 'JWT_SECRET still is the placeholder of .env.example – generate a random one',
    }),
  JWT_EXPIRES_IN: z.string().min(1).default('12h'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  /** Requests per window for the endpoints that need no token. `0` disables it. */
  RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(20),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  /**
   * Wrong passwords per window for one tournament, no matter where they come
   * from – what the limit per address cannot see. `0` disables it.
   */
  LOGIN_FAILURE_MAX: z.coerce.number().int().min(0).default(100),
  /** Who may report the address of a caller – see `trustProxySchema`. */
  TRUST_PROXY: trustProxySchema.prefault(DEFAULT_TRUST_PROXY),
  /** Apply pending database migrations before the server starts serving. */
  AUTO_MIGRATE: booleanSchema.default(true),
});

export type Env = z.infer<typeof envSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${formatIssues(parsed.error)}\n\n` +
        'Hint: copy .env.example to .env and adjust the values.',
    );
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
