import type { Request, RequestHandler } from 'express';
import { forbidden, unauthorized } from '../lib/http-error.js';
import { currentSessionVersion } from '../lib/session-version.js';
import { normalizeTournamentId } from '../lib/tournament-id.js';
import { verifySessionToken, type TournamentRole } from '../lib/tokens.js';

export interface RequestAuth {
  tournamentId: string;
  role: TournamentRole;
}

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 *
 * When the route contains a `:tournamentId` parameter the token must have been
 * issued for exactly that tournament. Passing roles restricts the endpoint to
 * those roles (no roles = any authenticated role).
 */
export function authenticate(...allowedRoles: readonly TournamentRole[]): RequestHandler {
  return async (req, _res, next) => {
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

    const requestedId = req.params.tournamentId;
    if (
      typeof requestedId === 'string' &&
      claims.tournamentId !== normalizeTournamentId(requestedId)
    ) {
      next(forbidden('The session token does not grant access to this tournament'));
      return;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(claims.role)) {
      next(forbidden(`This action requires the ${allowedRoles.join(' or ')} role`));
      return;
    }

    // Erst nach den Checks ohne Datenbank: die Sitzungs-Version steht im Turnier.
    // Ein neues Spielerpasswort erhöht sie, damit sind alle älteren Tokens ungültig –
    // auch das, mit dem die Änderung gemacht wurde.
    const version = await currentSessionVersion(claims.tournamentId);
    if (version === null || version !== claims.version) {
      next(unauthorized('The session is no longer valid – please sign in again'));
      return;
    }

    req.auth = { tournamentId: claims.tournamentId, role: claims.role };
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
