import type { Request, RequestHandler } from 'express';
import { forbidden, unauthorized } from '../lib/http-error.js';
import { isSessionRevoked } from '../lib/revoked-sessions.js';
import { currentSessionVersion } from '../lib/session-version.js';
import { normalizeTournamentId } from '../lib/tournament-id.js';
import { verifySessionToken, type TournamentRole } from '../lib/tokens.js';

export interface RequestAuth {
  tournamentId: string;
  role: TournamentRole;
  /** Id of the token this request came with (`jti`) – `null` for very old tokens. */
  tokenId: string | null;
  /** When that token expires – needed to remember a logout for the right length. */
  tokenExpiresAt: Date;
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

    // Erst nach den Checks ohne Datenbank: Sitzungs-Version und Denylist stehen in
    // der Datenbank. Ein neues Spielerpasswort erhöht die Version, ein Logout trägt
    // das Token in die Denylist ein – beides macht dieses Token wertlos.
    const [version, revoked] = await Promise.all([
      currentSessionVersion(claims.tournamentId),
      isSessionRevoked(claims.tokenId),
    ]);
    if (version === null || version !== claims.version || revoked) {
      next(unauthorized('The session is no longer valid – please sign in again'));
      return;
    }

    req.auth = {
      tournamentId: claims.tournamentId,
      role: claims.role,
      tokenId: claims.tokenId,
      tokenExpiresAt: claims.expiresAt,
    };
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
