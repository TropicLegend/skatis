import { Prisma, type Tournament } from '@prisma/client';
import { notFound } from '../../lib/http-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { generateTournamentId } from '../../lib/tournament-id.js';
import type { TournamentRole } from '../../lib/tokens.js';
import type {
  CreateTournamentInput,
  ListTournamentsQuery,
  UpdateTournamentInput,
} from './tournament.schemas.js';
import { tournamentStandings, type TournamentStandingsDto } from './standings.js';

/** Number of attempts to find a free tournament id. */
const MAX_ID_ATTEMPTS = 5;

/** Never select the password hashes for responses. */
export const tournamentPublicSelect = {
  id: true,
  name: true,
  matchdays: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { lists: true } },
} satisfies Prisma.TournamentSelect;

type TournamentRow = Prisma.TournamentGetPayload<{ select: typeof tournamentPublicSelect }>;

export interface TournamentDto {
  id: string;
  name: string;
  matchdays: number[];
  listCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toTournamentDto(tournament: TournamentRow): TournamentDto {
  return {
    id: tournament.id,
    name: tournament.name,
    matchdays: sortedDays(tournament.matchdays),
    listCount: tournament._count.lists,
    createdAt: tournament.createdAt.toISOString(),
    updatedAt: tournament.updatedAt.toISOString(),
  };
}

function sortedDays(matchdays: readonly number[]): number[] {
  return [...matchdays].sort((a, b) => a - b);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Creates a tournament and returns it – including the generated `id` that has
 * to be shown in the frontend so that users can log in afterwards.
 */
export async function createTournament(input: CreateTournamentInput): Promise<TournamentDto> {
  const [adminPasswordHash, passwordHash] = await Promise.all([
    hashPassword(input.adminPassword),
    hashPassword(input.password),
  ]);

  const tournament = {
    name: input.name,
    matchdays: sortedDays(input.matchdays),
    adminPasswordHash,
    passwordHash,
  };

  let lastError: unknown;

  // The id is random – retry in the (very unlikely) case of a collision.
  for (let attempt = 1; attempt <= MAX_ID_ATTEMPTS; attempt += 1) {
    try {
      const created = await prisma.tournament.create({
        data: { ...tournament, id: generateTournamentId() },
        select: tournamentPublicSelect,
      });
      return toTournamentDto(created);
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      lastError = error;
    }
  }

  throw lastError ?? new Error('Could not generate a unique tournament id');
}

export interface PaginatedTournaments {
  items: TournamentDto[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Lists the tournaments a session grants access to. Sessions are bound to a
 * single tournament, so `tournamentId` is always given – it keeps the endpoint
 * from leaking tournaments the caller has no password for.
 */
export async function listTournaments(
  query: ListTournamentsQuery,
  tournamentId: string,
): Promise<PaginatedTournaments> {
  const where: Prisma.TournamentWhereInput = { id: tournamentId };
  if (query.search) {
    where.name = { contains: query.search, mode: 'insensitive' };
  }

  const [rows, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      select: tournamentPublicSelect,
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
      take: query.limit,
      skip: query.offset,
    }),
    prisma.tournament.count({ where }),
  ]);

  return {
    items: rows.map(toTournamentDto),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getTournament(tournamentId: string): Promise<TournamentDto> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: tournamentPublicSelect,
  });
  if (!tournament) {
    throw notFound(`Tournament "${tournamentId}" does not exist`);
  }
  return toTournamentDto(tournament);
}

/**
 * Internal helper that includes the password hashes. Never expose the returned
 * object directly – use {@link toTournamentDto} instead.
 */
export async function getTournamentRow(tournamentId: string): Promise<Tournament> {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) {
    throw notFound(`Tournament "${tournamentId}" does not exist`);
  }
  return tournament;
}

/**
 * The standing of the tournament, built from the **submitted** matchdays only.
 * A list that is still open is not part of the tournament result yet, and one
 * that was reopened drops out of it again – so the standing always describes
 * what has actually been handed in.
 */
export async function getTournamentStandings(
  tournamentId: string,
): Promise<TournamentStandingsDto> {
  const tournament = await getTournamentRow(tournamentId);

  const [roster, lists] = await Promise.all([
    prisma.player.findMany({
      where: { tournamentId: tournament.id },
      select: { name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.gameList.findMany({
      where: { tournamentId: tournament.id, status: 'SUBMITTED' },
      select: {
        games: { select: { players: true, declarer: true, won: true, gameValue: true } },
      },
    }),
  ]);

  const games = lists.flatMap((list) => list.games);

  return tournamentStandings(
    tournament.id,
    roster.map((player) => player.name),
    games,
    lists.length,
  );
}

export async function updateTournament(
  tournamentId: string,
  input: UpdateTournamentInput,
): Promise<TournamentDto> {
  await getTournamentRow(tournamentId);

  const data: Prisma.TournamentUpdateInput = {};
  if (input.name !== undefined) {
    data.name = input.name;
  }
  if (input.matchdays !== undefined) {
    data.matchdays = sortedDays(input.matchdays);
  }
  if (input.password !== undefined) {
    data.passwordHash = await hashPassword(input.password);
  }
  if (input.adminPassword !== undefined) {
    data.adminPasswordHash = await hashPassword(input.adminPassword);
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data,
    select: tournamentPublicSelect,
  });

  return toTournamentDto(updated);
}

export async function deleteTournament(tournamentId: string): Promise<void> {
  const result = await prisma.tournament.deleteMany({ where: { id: tournamentId } });
  if (result.count === 0) {
    throw notFound(`Tournament "${tournamentId}" does not exist`);
  }
}

export interface TournamentAuthentication {
  role: TournamentRole;
}

/**
 * Resolves the role granted by a password. Verifies both passwords before
 * answering so that the response time does not reveal which one matched.
 * Returns `null` for an unknown id as well, so the caller can answer with the
 * same 401 – that way the endpoint does not disclose which ids exist.
 */
export async function authenticateTournament(
  tournamentId: string,
  password: string,
): Promise<TournamentAuthentication | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { adminPasswordHash: true, passwordHash: true },
  });

  if (!tournament) {
    // Hash anyway so that unknown ids take a similar amount of time.
    await hashPassword(password);
    return null;
  }

  const [isAdmin, isMember] = await Promise.all([
    verifyPassword(password, tournament.adminPasswordHash),
    verifyPassword(password, tournament.passwordHash),
  ]);

  if (isAdmin) return { role: 'ADMIN' };
  if (isMember) return { role: 'MEMBER' };
  return null;
}
