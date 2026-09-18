import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import {
  TOKEN_AUDIENCE,
  TOKEN_ISSUER,
  issueSessionToken,
  verifySessionToken,
} from '../src/lib/tokens.js';

describe('session tokens', () => {
  it('round-trips the claims', () => {
    const { token, expiresAt } = issueSessionToken('Mittwochsrunde', 'ADMIN');

    expect(verifySessionToken(token)).toEqual({
      tournamentName: 'Mittwochsrunde',
      role: 'ADMIN',
    });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects a tampered token', () => {
    const { token } = issueSessionToken('Mittwochsrunde', 'MEMBER');

    expect(() => verifySessionToken(`${token}x`)).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const foreign = jwt.sign({ role: 'ADMIN' }, 'another-secret-that-is-long-enough-123', {
      subject: 'Mittwochsrunde',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    expect(() => verifySessionToken(foreign)).toThrow();
  });

  it('rejects a token with an unknown role', () => {
    const forged = jwt.sign({ role: 'SUPERUSER' }, process.env.JWT_SECRET as string, {
      subject: 'Mittwochsrunde',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    expect(() => verifySessionToken(forged)).toThrow();
  });

  it('rejects a token without a subject', () => {
    const forged = jwt.sign({ role: 'ADMIN' }, process.env.JWT_SECRET as string, {
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    expect(() => verifySessionToken(forged)).toThrow();
  });
});
