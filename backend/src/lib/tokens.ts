import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export const TOKEN_ISSUER = 'skatis-api';
export const TOKEN_AUDIENCE = 'skatis-client';

/** Role granted by a tournament password. */
export type TournamentRole = 'ADMIN' | 'MEMBER';

export interface SessionClaims {
  /** Name of the tournament the token grants access to. */
  tournamentName: string;
  role: TournamentRole;
}

export interface IssuedSessionToken {
  token: string;
  expiresAt: Date;
}

export function issueSessionToken(
  tournamentName: string,
  role: TournamentRole,
): IssuedSessionToken {
  const token = jwt.sign({ role }, env.JWT_SECRET, {
    subject: tournamentName,
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
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  });

  if (typeof decoded === 'string' || !decoded.sub) {
    throw new Error('Malformed session token');
  }

  const { role } = decoded as JwtPayload & { role?: unknown };
  if (role !== 'ADMIN' && role !== 'MEMBER') {
    throw new Error('Malformed session token');
  }

  return { tournamentName: decoded.sub, role };
}
