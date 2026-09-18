import type { ListStatus, Prisma } from '@prisma/client';
import { conflict, notFound } from '../../lib/http-error.js';
import { parseIsoDate, todayIso, toIsoDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { TournamentRole } from '../../lib/tokens.js';
import { getTournamentRow } from '../tournaments/tournament.service.js';
import { resolveTournamentPlayers } from '../players/player.service.js';
import {
  assertDayNotOver,
  assertListEditable,
  assertMatchdayAllowed,
  countsForStanding,
  listLockReasons,
  type ListLockReason,
} from './list-access.js';
import type { CreateListInput, ListListsQuery } from './list.schemas.js';
import { toGameCreateData, toGameDto, toGameProperties, type GameDto } from './game.mapper.js';
import { assertDeclarerAllowed, assertLineupComplete } from './game-entry.js';
import { nextDealer, playingPlayers } from './game-rules.js';
import { scoreList, type ListResultsDto } from './scoring.js';

/** A player of a list together with their seat in the lineup. */
export interface ListPlayerDto {
  name: string;
  /** Seating order – position 1 deals in round 1. */
  position: number;
}

export interface ListDto {
  id: string;
  tournamentId: string;
  matchday: string;
  /** "Serie" from the head of the sheet – which round of games this is. */
  series: number;
  /** "Tisch" from the head of the sheet – which table this sheet belongs to. */
  table: number;
  /** The stored status – `OPEN` until somebody hands the list in. */
  status: ListStatus;
  /**
   * Whether the list counts for the tournament standing: it was handed in, or
   * its matchday is over. A list lives for a single day, so it becomes final by
   * itself – a list can therefore be `OPEN` and `counted` at the same time.
   */
  counted: boolean;
  submittedAt: string | null;
  /**
   * True when the requesting role may not change this list any more. A
   * submitted list is locked for members, and so is a list of another day;
   * an admin is never locked out.
   */
  locked: boolean;
  /** Why it is locked – empty while `locked` is false. */
  lockReasons: ListLockReason[];
  /** The lineup of the table in seating order. */
  players: ListPlayerDto[];
  gameCount: number;
  /** Sum of the Spielwerte of all games of the list. */
  totalGameValue: number;
  createdAt: string;
  updatedAt: string;
  /** Only present on the detail endpoint. */
  games?: GameDto[];
}

/** Who asks for a list – the lock depends on it. */
export interface ListViewContext {
  tournamentId: string;
  matchdays: readonly number[];
  role: TournamentRole;
}

/** Builds the view context for a tournament and the role that asked for it. */
export function listViewContext(
  tournament: { id: string; matchdays: number[] },
  role: TournamentRole,
): ListViewContext {
  return { tournamentId: tournament.id, matchdays: tournament.matchdays, role };
}

export const listWithGamesInclude = {
  games: { orderBy: { position: 'asc' } },
  lineup: { orderBy: { position: 'asc' }, include: { player: true } },
} satisfies Prisma.GameListInclude;

export type ListWithGames = Prisma.GameListGetPayload<{ include: typeof listWithGamesInclude }>;

/** The players of a list in seating order. */
export function lineupNames(list: ListWithGames): string[] {
  return list.lineup.map((entry) => entry.player.name);
}

export function toListDto(
  list: ListWithGames,
  context: ListViewContext,
  withGames = false,
): ListDto {
  const lockReasons = listLockReasons(list, context.matchdays, context.role);

  const dto: ListDto = {
    id: list.id,
    tournamentId: context.tournamentId,
    matchday: toIsoDate(list.matchday),
    series: list.series,
    table: list.table,
    status: list.status,
    counted: countsForStanding(list),
    submittedAt: list.submittedAt ? list.submittedAt.toISOString() : null,
    locked: lockReasons.length > 0,
    lockReasons,
    players: list.lineup.map((entry) => ({
      name: entry.player.name,
      position: entry.position,
    })),
    gameCount: list.games.length,
    totalGameValue: list.games.reduce((sum, game) => sum + game.gameValue, 0),
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };

  if (withGames) {
    dto.games = list.games.map(toGameDto);
  }

  return dto;
}

/** Loads a list by id, including its games. Throws 404 when it does not exist. */
export async function findListOrThrow(
  tournamentId: string,
  listId: string,
): Promise<ListWithGames> {
  const list = await prisma.gameList.findFirst({
    where: { id: listId, tournamentId },
    include: listWithGamesInclude,
  });

  if (!list) {
    throw notFound(`List ${listId} does not exist in this tournament`);
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
  role: TournamentRole,
): Promise<PaginatedLists> {
  const tournament = await getTournamentRow(tournamentId);

  const where: Prisma.GameListWhereInput = { tournamentId: tournament.id };
  if (query.status) {
    where.status = query.status;
  }
  // `counted` asks what the list means now – handed in, or of a day that is
  // over – while `status` asks what is stored.
  if (query.counted !== undefined) {
    const today = parseIsoDate(todayIso());
    where.AND = [
      query.counted
        ? { OR: [{ status: 'SUBMITTED' }, { matchday: { lt: today } }] }
        : { AND: [{ status: 'OPEN' }, { matchday: { gte: today } }] },
    ];
  }
  // `matchday` picks the evening (several tables may share it), `from`/`to`
  // span a range of them.
  if (query.matchday) {
    where.matchday = parseIsoDate(query.matchday);
  } else if (query.from || query.to) {
    where.matchday = {
      ...(query.from ? { gte: parseIsoDate(query.from) } : {}),
      ...(query.to ? { lte: parseIsoDate(query.to) } : {}),
    };
  }

  const [rows, total] = await Promise.all([
    prisma.gameList.findMany({
      where,
      include: listWithGamesInclude,
      orderBy: [{ matchday: 'desc' }, { series: 'asc' }, { table: 'asc' }],
      take: query.limit,
      skip: query.offset,
    }),
    prisma.gameList.count({ where }),
  ]);

  return {
    items: rows.map((row) => toListDto(row, listViewContext(tournament, role))),
    total,
    limit: query.limit,
    offset: query.offset,
  };
}

export async function getList(
  tournamentId: string,
  listId: string,
  role: TournamentRole,
): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);
  return toListDto(list, listViewContext(tournament, role), true);
}

/**
 * The result table of a list: one row per player with the account, the number
 * of won and lost Alleinspiele and the final result. It is derived from the
 * games, so it is always up to date – also while the list is being filled.
 *
 * Reading is allowed for both roles, like every other read.
 */
export async function getListResults(
  tournamentId: string,
  listId: string,
): Promise<ListResultsDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  return scoreList(lineupNames(list), list.games, toIsoDate(list.matchday));
}

export async function createList(
  tournamentId: string,
  input: CreateListInput,
  role: TournamentRole,
): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  assertMatchdayAllowed(tournament, input.matchday, role);

  const matchday = parseIsoDate(input.matchday);

  // A table of a series can only have one sheet per evening. The unique index
  // backs this up; the check is here to answer with a helpful message.
  const existing = await prisma.gameList.findUnique({
    where: {
      tournamentId_matchday_series_table: {
        tournamentId: tournament.id,
        matchday,
        series: input.series,
        table: input.table,
      },
    },
    select: { id: true },
  });
  if (existing) {
    throw conflict(
      `Serie ${input.series}, Tisch ${input.table} already has a list for ${input.matchday}`,
      { listId: existing.id },
    );
  }

  const games = input.games ?? [];
  const players = await resolveTournamentPlayers(tournament.id, input.playerNames ?? []);
  if (games.length > 0) {
    assertLineupComplete(players.length);
  }

  // The lineup is the seating order, so the dealer of the first game is the
  // first player and every following game is dealt by the next one.
  const lineup = players.map((player) => player.name);
  let previousDealer: string | null = null;

  const gameData = games.map((game, index) => {
    const dealer = nextDealer(lineup, previousDealer);
    previousDealer = dealer;
    assertDeclarerAllowed(game, lineup, dealer);

    return toGameCreateData(
      toGameProperties(game, {
        position: index + 1,
        dealer,
        players: playingPlayers(lineup, dealer),
      }),
    );
  });

  const list = await prisma.gameList.create({
    data: {
      tournamentId: tournament.id,
      matchday,
      series: input.series,
      table: input.table,
      lineup: {
        create: players.map((player, index) => ({
          position: index + 1,
          player: { connect: { id: player.id } },
        })),
      },
      games: { create: gameData },
    },
    include: listWithGamesInclude,
  });

  return toListDto(list, listViewContext(tournament, role), true);
}

/**
 * Replaces the players of a list. The lineup is the seating order and therefore
 * decides who deals in which round, so it can only be changed while the list
 * has no games yet.
 */
export async function setListPlayers(
  tournamentId: string,
  listId: string,
  playerNames: readonly string[],
  role: TournamentRole,
): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  assertMatchdayAllowed(tournament, toIsoDate(list.matchday), role);
  assertListEditable(list.status, role);

  if (list.games.length > 0) {
    throw conflict(
      'The players of this list cannot be changed any more – it already contains games',
      { gameCount: list.games.length },
    );
  }

  const players = await resolveTournamentPlayers(tournament.id, playerNames);

  await prisma.$transaction(async (transaction) => {
    await transaction.gameListPlayer.deleteMany({ where: { listId: list.id } });
    await transaction.gameListPlayer.createMany({
      data: players.map((player, index) => ({
        listId: list.id,
        playerId: player.id,
        position: index + 1,
      })),
    });
  });

  const updated = await findListOrThrow(tournament.id, list.id);
  return toListDto(updated, listViewContext(tournament, role), true);
}

/** Admin only (enforced by the route). */
export async function deleteList(tournamentId: string, listId: string): Promise<void> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  await prisma.gameList.deleteMany({ where: { id: list.id } });
}

export async function submitList(
  tournamentId: string,
  listId: string,
  role: TournamentRole,
): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  // A list of a past day is final by itself, so there is nothing to hand in –
  // and it counts for the standing either way.
  assertDayNotOver(list.matchday, 'submitted');
  assertMatchdayAllowed(tournament, toIsoDate(list.matchday), role);

  // Submitting twice is always a mistake – an admin who wants a new timestamp
  // reopens the list first.
  if (list.status === 'SUBMITTED') {
    throw conflict('This list has already been submitted', {
      submittedAt: list.submittedAt ? list.submittedAt.toISOString() : null,
    });
  }

  const updated = await prisma.gameList.update({
    where: { id: list.id },
    data: { status: 'SUBMITTED', submittedAt: new Date() },
    include: listWithGamesInclude,
  });

  return toListDto(updated, listViewContext(tournament, role), true);
}

/**
 * Admin only: hands a submitted list back to the members so that the lock of
 * the submission is lifted for them.
 */
export async function reopenList(
  tournamentId: string,
  listId: string,
  role: TournamentRole,
): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  assertDayNotOver(list.matchday, 'reopened');

  if (list.status !== 'SUBMITTED') {
    throw conflict('This list is not submitted');
  }

  const updated = await prisma.gameList.update({
    where: { id: list.id },
    data: { status: 'OPEN', submittedAt: null },
    include: listWithGamesInclude,
  });

  return toListDto(updated, listViewContext(tournament, role), true);
}
