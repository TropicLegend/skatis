import type { ListStatus, Prisma } from '@prisma/client';
import { conflict, notFound } from '../../lib/http-error.js';
import { parseIsoDate, toIsoDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { TournamentRole } from '../../lib/tokens.js';
import { getTournamentRow } from '../tournaments/tournament.service.js';
import { assertListEditable, assertMatchdayAllowed } from './list-access.js';
import type { CreateListInput, ListListsQuery } from './list.schemas.js';
import { assignPositions, toGameCreateData, toGameDto, type GameDto } from './game.mapper.js';

export interface ListDto {
  id: string;
  tournamentId: string;
  matchday: string;
  status: ListStatus;
  submittedAt: string | null;
  gameCount: number;
  totalPoints: number;
  createdAt: string;
  updatedAt: string;
  /** Only present on the detail endpoint. */
  games?: GameDto[];
}

export const listWithGamesInclude = {
  games: { orderBy: { position: 'asc' } },
} satisfies Prisma.GameListInclude;

type ListWithGames = Prisma.GameListGetPayload<{ include: typeof listWithGamesInclude }>;

export function toListDto(list: ListWithGames, tournamentId: string, withGames = false): ListDto {
  const dto: ListDto = {
    id: list.id,
    tournamentId,
    matchday: toIsoDate(list.matchday),
    status: list.status,
    submittedAt: list.submittedAt ? list.submittedAt.toISOString() : null,
    gameCount: list.games.length,
    totalPoints: list.games.reduce((sum, game) => sum + game.points, 0),
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };

  if (withGames) {
    dto.games = list.games.map(toGameDto);
  }

  return dto;
}

/** Loads a list by matchday, including its games. Throws 404 when missing. */
export async function findListOrThrow(
  tournamentId: string,
  matchday: string,
): Promise<ListWithGames> {
  const list = await prisma.gameList.findUnique({
    where: { tournamentId_matchday: { tournamentId, matchday: parseIsoDate(matchday) } },
    include: listWithGamesInclude,
  });

  if (!list) {
    throw notFound(`No list exists for ${matchday}`);
  }

  return list;
}

export interface PaginatedLists {
  items: ListDto[];
  total: number;
  limit: number;
  offset: number;
}

export async function listLists(
  tournamentId: string,
  query: ListListsQuery,
): Promise<PaginatedLists> {
  const tournament = await getTournamentRow(tournamentId);

  const where: Prisma.GameListWhereInput = { tournamentId: tournament.id };
  if (query.status) {
    where.status = query.status;
  }
  if (query.from || query.to) {
    where.matchday = {
      ...(query.from ? { gte: parseIsoDate(query.from) } : {}),
      ...(query.to ? { lte: parseIsoDate(query.to) } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.gameList.findMany({
      where,
      include: listWithGamesInclude,
      orderBy: { matchday: 'desc' },
      take: query.limit,
      skip: query.offset,
    }),
    prisma.gameList.count({ where }),
  ]);

  return {
    items: rows.map((row) => toListDto(row, tournament.id)),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getList(tournamentId: string, matchday: string): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, matchday);
  return toListDto(list, tournament.id, true);
}

export async function createList(
  tournamentId: string,
  input: CreateListInput,
  role: TournamentRole,
): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  assertMatchdayAllowed(tournament, input.matchday, role);

  const matchday = parseIsoDate(input.matchday);
  const existing = await prisma.gameList.findUnique({
    where: { tournamentId_matchday: { tournamentId: tournament.id, matchday } },
    select: { id: true },
  });
  if (existing) {
    throw conflict(`A list for ${input.matchday} already exists`);
  }

  const games = input.games ?? [];
  const positions = assignPositions(games);

  const list = await prisma.gameList.create({
    data: {
      tournamentId: tournament.id,
      matchday,
      games: {
        create: games.map((game, index) => toGameCreateData(game, positions[index] ?? index + 1)),
      },
    },
    include: listWithGamesInclude,
  });

  return toListDto(list, tournament.id, true);
}

/** Admin only (enforced by the route). */
export async function deleteList(tournamentId: string, matchday: string): Promise<void> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, matchday);

  await prisma.gameList.deleteMany({ where: { id: list.id } });
}

export async function submitList(
  tournamentId: string,
  matchday: string,
  role: TournamentRole,
): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, matchday);

  assertMatchdayAllowed(tournament, matchday, role);
  assertListEditable(list.status, role);

  const updated = await prisma.gameList.update({
    where: { id: list.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
    include: listWithGamesInclude,
  });

  return toListDto(updated, tournament.id, true);
}

/** Admin only: hands a submitted list back to the members. */
export async function reopenList(tournamentId: string, matchday: string): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, matchday);

  if (list.status !== 'SUBMITTED') {
    throw conflict('This list is not submitted');
  }

  const updated = await prisma.gameList.update({
    where: { id: list.id },
    data: { status: 'OPEN', submittedAt: null },
    include: listWithGamesInclude,
  });

  return toListDto(updated, tournament.id, true);
}
