import { prisma } from './prisma.js';
import { logger } from './logger.js';

/**
 * Ended sessions ("Abmelden").
 *
 * Tokens are stateless: the signature is the only thing a request is checked
 * against, so a token stays valid until it expires – no matter who signs out. A
 * logout is therefore remembered here by the `jti` claim of the token, and the
 * middleware refuses a token that appears in this list.
 *
 * The row is kept only until the token would have expired: after that the token is
 * rejected by its own `exp` claim, and the note is worthless. Expired notes are
 * dropped whenever a session is ended.
 */

/**
 * Remembers a token as ended. Does nothing without a token id (tokens issued before
 * the denylist existed), because such a token cannot be identified.
 */
export async function revokeSession(
  tournamentId: string,
  tokenId: string | null,
  expiresAt: Date,
): Promise<void> {
  if (!tokenId) return;

  try {
    await prisma.revokedSession.createMany({
      data: [{ id: tokenId, tournamentId, expiresAt }],
      skipDuplicates: true,
    });
    await dropExpiredSessions();
  } catch (error) {
    // Das Token läuft von selbst ab – ein fehlgeschlagener Eintrag darf das
    // Abmelden nicht verhindern.
    logger.error({ err: error, tournamentId }, 'could not record a revoked session');
  }
}

/** Was this token ended on purpose? */
export async function isSessionRevoked(tokenId: string | null): Promise<boolean> {
  if (!tokenId) return false;

  const note = await prisma.revokedSession.findUnique({
    where: { id: tokenId },
    select: { id: true },
  });

  return note !== null;
}

/** Drops notes whose token has expired anyway. */
async function dropExpiredSessions(): Promise<void> {
  await prisma.revokedSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
