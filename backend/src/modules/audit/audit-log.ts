import type { AuditLog as AuditLogRow, Prisma } from '@prisma/client';
import { notFound } from '../../lib/http-error.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import type { TournamentRole } from '../../lib/tokens.js';

/**
 * The change log ("Protokoll") of a tournament.
 *
 * Every change that goes through the API is recorded here together with the
 * role that made it. That way a member can look up what an admin changed (or
 * deleted) after the fact, and an admin can see who entered which game.
 *
 * The entries are deliberately *not* sentences: `action` is a stable, machine
 * readable key and `details` carries the numbers of the change, so the wording
 * lives in the frontend and can change without touching stored data. Passwords
 * and password hashes never appear here – only the fact that one was changed.
 */

/** Every action that is recorded. Stable keys – they are stored in the log. */
export const AUDIT_ACTIONS = [
  'tournament.updated',
  'list.created',
  'list.deleted',
  'list.submitted',
  'list.reopened',
  'list.lineup_changed',
  'game.created',
  'game.updated',
  'game.deleted',
  'player.added',
  'player.renamed',
  'player.removed',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** The numbers behind a change – plain JSON, no secrets. */
export type AuditDetails = Record<
  string,
  string | number | boolean | string[] | number[] | null | Record<string, string | number>
>;

export interface AuditLogInput {
  tournamentId: string;
  /** Role of the session that made the change. */
  role: TournamentRole;
  action: AuditAction;
  details?: AuditDetails;
}

export interface AuditLogEntryDto {
  id: string;
  /** ISO-8601 timestamp of the change. */
  createdAt: string;
  role: TournamentRole;
  action: AuditAction | string;
  details: Record<string, unknown> | null;
}

export interface AuditLogQuery {
  limit: number;
  offset: number;
}

export interface AuditLogPage {
  total: number;
  entries: AuditLogEntryDto[];
}

export function toAuditLogEntryDto(entry: AuditLogRow): AuditLogEntryDto {
  return {
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    role: entry.role,
    action: entry.action,
    details: (entry.details ?? null) as Record<string, unknown> | null,
  };
}

/**
 * Writes one entry.
 *
 * Recording must never take the whole request down: at this point the change
 * itself is already stored, so a failing log would only replace a successful
 * answer with an error – and a client that repeats the call would repeat the
 * change. A missing entry is therefore logged and swallowed.
 */
export async function recordAudit(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tournamentId: input.tournamentId,
        role: input.role,
        action: input.action,
        details: input.details === undefined ? undefined : (input.details as Prisma.InputJsonValue),
      },
    });
  } catch (error) {
    logger.warn(
      { err: error, action: input.action, tournamentId: input.tournamentId },
      'audit log entry could not be recorded',
    );
  }
}

/** The log of a tournament, newest first. Readable by both roles. */
export async function listAuditLog(
  tournamentId: string,
  query: AuditLogQuery,
): Promise<AuditLogPage> {
  // Deliberately without `getTournamentRow`: the audit module is used by the
  // tournament module, so importing it back would close a cycle.
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true },
  });
  if (!tournament) {
    throw notFound(`Tournament "${tournamentId}" does not exist`);
  }

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where: { tournamentId: tournament.id } }),
    prisma.auditLog.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset,
    }),
  ]);

  return { total, entries: entries.map(toAuditLogEntryDto) };
}
