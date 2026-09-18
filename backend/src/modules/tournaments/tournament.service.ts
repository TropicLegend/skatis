import type { Prisma, Tournament } from '@prisma/client';
import { conflict, notFound } from '../../lib/http-error.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import type { TournamentRole } from '../../lib/tokens.js';
import type {
  CreateTournamentInput,
  ListTournamentsQuery,
  UpdateTournamentInput,
} from './tournament.schemas.js';

/** Never select the password hashes for responses. */
export const tournamentPublicSelect = {
  name: true,
  matchdays: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { lists: true } },
} satisfies Prisma.TournamentSelect;

type TournamentRow = Prisma.TournamentGetPayload<{ select: typeof tournamentPublicSelect }>;

export interface TournamentDto {
  name: string;
  matchdays: number[];
  listCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toTournamentDto(tournament: TournamentRow): TournamentDto {
  return {
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

export async function createTournament(input: CreateTournamentInput): Promise<TournamentDto> {
  const existing = await prisma.tournament.findUnique({
    where: { name: input.name },
    select: { name: true },
  });
  if (existing) {
    throw conflict(`A tournament named "${input.name}" already exists`);
  }

  const [adminPasswordHash, passwordHash] = await Promise.all([
    hashPassword(input.adminPassword),
    hashPassword(input.password),
  ]);

  const tournament = await prisma.tournament.create({
    data: {
      name: input.name,
      matchdays: sortedDays(input.matchdays),
      adminPasswordHash,
      passwordHash,
    },
    select: tournamentPublicSelect,
  });

  return toTournamentDto(tournament);
}

export interface PaginatedTournaments {
  items: TournamentDto[];
  total: number;
  limit: number;
  offset: number;
}

export async function listTournaments(query: ListTournamentsQuery): Promise<PaginatedTournaments> {
  const where: Prisma.TournamentWhereInput = query.search
    ? { name: { contains: query.search, mode: 'insensitive' } }
    : {};

  const [rows, total] = await Promise.all([
    prisma.tournament.findMany({
      where,
      select: tournamentPublicSelect,
      orderBy: { name: 'asc' },
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

export async function getTournament(name: string): Promise<TournamentDto> {
  const tournament = await prisma.tournament.findUnique({
    where: { name },
    select: tournamentPublicSelect,
  });
  if (!tournament) {
    throw notFound(`Tournament "${name}" does not exist`);
  }
  return toTournamentDto(tournament);
}

/**
 * Internal helper that includes the password hashes. Never expose the returned
 * object directly – use {@link toTournamentDto} instead.
 */
export async function getTournamentRow(name: string): Promise<Tournament> {
  const tournament = await prisma.tournament.findUnique({ where: { name } });
  if (!tournament) {
    throw notFound(`Tournament "${name}" does not exist`);
  }
  return tournament;
}

export async function updateTournament(
  name: string,
  input: UpdateTournamentInput,
): Promise<TournamentDto> {
  const tournament = await getTournamentRow(name);

  const data: Prisma.TournamentUpdateInput = {};
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
    where: { id: tournament.id },
    data,
    select: tournamentPublicSelect,
  });

  return toTournamentDto(updated);
}

export async function deleteTournament(name: string): Promise<void> {
  const result = await prisma.tournament.deleteMany({ where: { name } });
  if (result.count === 0) {
    throw notFound(`Tournament "${name}" does not exist`);
  }
}

export interface TournamentAuthentication {
  role: TournamentRole;
}

/**
 * Resolves the role granted by a password. Verifies both passwords before
 * answering so that the response time does not reveal which one matched.
 */
export async function authenticateTournament(
  name: string,
  password: string,
): Promise<TournamentAuthentication | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { name },
    select: { adminPasswordHash: true, passwordHash: true },
  });

  if (!tournament) {
    // Hash anyway so that unknown tournaments take a similar amount of time.
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
