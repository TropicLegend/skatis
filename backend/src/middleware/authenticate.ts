import type { Request, RequestHandler } from 'express';
import { forbidden, unauthorized } from '../lib/http-error.js';
import { verifySessionToken, type TournamentRole } from '../lib/tokens.js';

export interface RequestAuth {
  tournamentName: string;
  role: TournamentRole;
}

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 *
 * When the route contains a `:tournamentName` parameter the token must have
 * been issued for exactly that tournament. Passing roles restricts the
 * endpoint to those roles (no roles = any authenticated role).
 */
export function authenticate(...allowedRoles: readonly TournamentRole[]): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      next(unauthorized('Missing bearer token'));
      return;
    }

    const token = header.slice('bearer '.length).trim();
    if (!token) {
      next(unauthorized('Missing bearer token'));
      return;
    }

    let claims;
    try {
      claims = verifySessionToken(token);
    } catch {
      next(unauthorized('Invalid or expired session token'));
      return;
    }

    const { tournamentName } = req.params;
    if (tournamentName && claims.tournamentName !== tournamentName) {
      next(forbidden('The session token does not grant access to this tournament'));
      return;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(claims.role)) {
      next(forbidden(`This action requires the ${allowedRoles.join(' or ')} role`));
      return;
    }

    req.auth = { tournamentName: claims.tournamentName, role: claims.role };
    next();
  };
}

/** Reads the identity established by {@link authenticate}. */
export function currentAuth(req: Request): RequestAuth {
  if (!req.auth) {
    throw unauthorized('Authentication required');
  }
  return req.auth;
}
