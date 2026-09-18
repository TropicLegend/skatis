import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password.js';

describe('password hashing', () => {
  it('produces a salted scrypt hash that verifies', async () => {
    const hash = await hashPassword('correct horse battery staple');

    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash.split('$')).toHaveLength(6);
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
  });

  it('uses a random salt for every hash', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);

    expect(first).not.toBe(second);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('right-password');

    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('returns false for malformed hashes instead of throwing', async () => {
    const malformed = [
      '',
      'not-a-hash',
      'scrypt$16384$8$1$only-five-parts',
      'bcrypt$16384$8$1$c2FsdA==$a2V5',
      'scrypt$notanumber$8$1$c2FsdA==$a2V5',
      'scrypt$999999999$8$1$c2FsdA==$a2V5',
    ];

    for (const stored of malformed) {
      await expect(verifyPassword('anything', stored)).resolves.toBe(false);
    }
  });

  it('handles unicode passwords', async () => {
    const hash = await hashPassword('Käsebrötchen-mit-Ümlauten-🔒');

    await expect(verifyPassword('Käsebrötchen-mit-Ümlauten-🔒', hash)).resolves.toBe(true);
  });
});
