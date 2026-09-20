import { randomUUID } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export const TOKEN_ISSUER = 'skatis-api';
export const TOKEN_AUDIENCE = 'skatis-client';

/** Role granted by a tournament password. */
export type TournamentRole = 'ADMIN' | 'MEMBER';

export interface SessionClaims {
  /** Public id of the tournament the token grants access to. */
  tournamentId: string;
  role: TournamentRole;
  /**
   * Session version of the tournament when the token was issued. It rises as soon as
   * the player password is replaced, which makes every older token worthless.
   */
  version: number;
  /**
   * Id of this single token (`jti`). Ending a session means writing it into the
   * denylist – `null` for tokens from before the denylist existed.
   */
  tokenId: string | null;
  /** When the token stops being valid – the note in the denylist lives that long. */
  expiresAt: Date;
}

export interface IssuedSessionToken {
  token: string;
  expiresAt: Date;
}

export function issueSessionToken(
  tournamentId: string,
  role: TournamentRole,
  version = 0,
): IssuedSessionToken {
  const token = jwt.sign({ role, version }, env.JWT_SECRET, {
    subject: tournamentId,
    jwtid: randomUUID(),
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });

  const decoded = jwt.decode(token) as JwtPayload | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date();

  return { token, expiresAt };
}

/** Verifies a session token and returns its claims. Throws when invalid or expired. */
export function verifySessionToken(token: string): SessionClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    // Pinned so that a token can never be accepted with another algorithm.
    algorithms: ['HS256'],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });

  if (typeof decoded === 'string' || !decoded.sub) {
    throw new Error('Malformed session token');
  }

  const { role, version, jti } = decoded as JwtPayload & {
    role?: unknown;
    version?: unknown;
    jti?: unknown;
  };
  if (role !== 'ADMIN' && role !== 'MEMBER') {
    throw new Error('Malformed session token');
  }

  // Tokens from before the session version existed count as version 0 – that is
  // exactly the version a tournament without a password change has. The same goes
  // for the token id: without one the token cannot be ended early.
  return {
    tournamentId: decoded.sub,
    role,
    version: typeof version === 'number' ? version : 0,
    tokenId: typeof jti === 'string' && jti.length > 0 ? jti : null,
    expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : new Date(),
  };
}
