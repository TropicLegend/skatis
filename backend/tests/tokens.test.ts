import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import {
  TOKEN_AUDIENCE,
  TOKEN_ISSUER,
  issueSessionToken,
  verifySessionToken,
} from '../src/lib/tokens.js';

const TOURNAMENT_ID = 'K7M2P4QX';

describe('session tokens', () => {
  it('round-trips the claims', () => {
    const { token, expiresAt } = issueSessionToken(TOURNAMENT_ID, 'ADMIN');

    expect(verifySessionToken(token)).toEqual({
      tournamentId: TOURNAMENT_ID,
      role: 'ADMIN',
      version: 0,
    });
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('carries the session version it was issued with', () => {
    const { token } = issueSessionToken(TOURNAMENT_ID, 'MEMBER', 5);

    expect(verifySessionToken(token)).toEqual({
      tournamentId: TOURNAMENT_ID,
      role: 'MEMBER',
      version: 5,
    });
  });

  it('treats a token without a version claim as version 0', () => {
    const older = jwt.sign({ role: 'MEMBER' }, process.env.JWT_SECRET as string, {
      subject: TOURNAMENT_ID,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    expect(verifySessionToken(older).version).toBe(0);
  });

  it('rejects a tampered token', () => {
    const { token } = issueSessionToken(TOURNAMENT_ID, 'MEMBER');

    expect(() => verifySessionToken(`${token}x`)).toThrow();
  });

  it('rejects a token signed with a different secret', () => {
    const foreign = jwt.sign({ role: 'ADMIN' }, 'another-secret-that-is-long-enough-123', {
      subject: TOURNAMENT_ID,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    expect(() => verifySessionToken(foreign)).toThrow();
  });

  it('rejects a token with an unknown role', () => {
    const forged = jwt.sign({ role: 'SUPERUSER' }, process.env.JWT_SECRET as string, {
      subject: TOURNAMENT_ID,
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

  it('rejects an unsigned token', () => {
    const encode = (value: unknown): string =>
      Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: TOURNAMENT_ID,
      role: 'ADMIN',
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
    })}.`;

    expect(() => verifySessionToken(unsigned)).toThrow();
  });

  it('rejects a token signed with another algorithm', () => {
    const foreign = jwt.sign({ role: 'ADMIN' }, process.env.JWT_SECRET as string, {
      subject: TOURNAMENT_ID,
      algorithm: 'HS512',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    });

    expect(() => verifySessionToken(foreign)).toThrow();
  });
});
