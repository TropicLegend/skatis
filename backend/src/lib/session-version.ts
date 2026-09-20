import { prisma } from './prisma.js';

/**
 * The session version of a tournament: it counts how often the player password was
 * replaced. Every token carries the version it was issued with, and the middleware
 * compares it with this value – so setting a new password ends all running sessions
 * at once, no matter who holds them.
 *
 * `null` means the tournament does not exist (any more); the caller answers `401`
 * as well, because a token for a deleted tournament is worthless either way.
 */
export async function currentSessionVersion(tournamentId: string): Promise<number | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { sessionVersion: true },
  });

  return tournament?.sessionVersion ?? null;
}
