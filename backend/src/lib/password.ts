import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as unknown as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const ALGORITHM = 'scrypt';
const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// Bounds checked when reading a stored hash so that a tampered database row
// cannot make us allocate absurd amounts of memory.
const MIN_N = 1024;
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

/** scrypt needs roughly `128 * N * r` bytes – give it some headroom. */
function maxmemFor(n: number, r: number): number {
  return 128 * n * r * 2;
}

/**
 * Hashes a plaintext password with scrypt.
 *
 * Format: `scrypt$N$r$p$<salt base64>$<derived key base64>`
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await scryptAsync(plainPassword.normalize('NFKC'), salt, KEY_LENGTH, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
    maxmem: maxmemFor(DEFAULT_N, DEFAULT_R),
  });

  return [
    ALGORITHM,
    DEFAULT_N,
    DEFAULT_R,
    DEFAULT_P,
    salt.toString('base64'),
    derivedKey.toString('base64'),
  ].join('$');
}

interface ParsedHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parseHash(storedHash: string): ParsedHash | null {
  const parts = storedHash.split('$');
  if (parts.length !== 6) return null;

  const [algorithm, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;
  if (algorithm !== ALGORITHM) return null;
  if (!nRaw || !rRaw || !pRaw || !saltRaw || !keyRaw) return null;

  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (n < MIN_N || n > MAX_N || (n & (n - 1)) !== 0) return null;
  if (r < 1 || r > MAX_R || p < 1 || p > MAX_P) return null;

  const salt = Buffer.from(saltRaw, 'base64');
  const key = Buffer.from(keyRaw, 'base64');
  if (salt.length === 0 || key.length === 0) return null;

  return { n, r, p, salt, key };
}

/** Constant-time comparison of a plaintext password against a stored hash. */
export async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  const parsed = parseHash(storedHash);
  if (!parsed) return false;

  const derivedKey = await scryptAsync(
    plainPassword.normalize('NFKC'),
    parsed.salt,
    parsed.key.length,
    {
      N: parsed.n,
      r: parsed.r,
      p: parsed.p,
      maxmem: maxmemFor(parsed.n, parsed.r),
    },
  );

  if (derivedKey.length !== parsed.key.length) return false;
  return timingSafeEqual(derivedKey, parsed.key);
}
