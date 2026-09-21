import type { ListStatus, Prisma, Tournament } from '@prisma/client';
import { conflict, notFound } from '../../lib/http-error.js';
import { parseIsoDate, toIsoDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { TournamentRole } from '../../lib/tokens.js';
import { recordAudit, type AuditDetails } from '../audit/audit-log.js';
import { getTournamentRow } from '../tournaments/tournament.service.js';
import { resolveTournamentPlayers } from '../players/player.service.js';
import {
  assertDayNotOver,
  assertListEditable,
  assertMatchdayAllowed,
  countsForStanding,
  listLockReasons,
  matchdayWindowsOf,
  playingFromIso,
  takesSlot,
  type ListLockReason,
  type MatchdayWindows,
} from './list-access.js';
import type { CreateListInput, ListListsQuery, UpdateListInput } from './list.schemas.js';
import { toGameCreateData, toGameDto, toGameProperties, type GameDto } from './game.mapper.js';
import { assertDeclarerAllowed, assertLineupComplete } from './game-entry.js';
import { nextDealer, playingPlayers } from './game-rules.js';
import {
  accountProgression,
  scoreList,
  type AccountProgressionDto,
  type ListResultsDto,
} from './scoring.js';

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
  /** Playing times per weekday, normalised – see `matchdayWindowsOf`. */
  windows: MatchdayWindows;
  role: TournamentRole;
}

/** Builds the view context for a tournament and the role that asked for it. */
export function listViewContext(
  tournament: { id: string; matchdays: number[]; matchdayWindows?: unknown },
  role: TournamentRole,
): ListViewContext {
  return {
    tournamentId: tournament.id,
    matchdays: tournament.matchdays,
    windows: matchdayWindowsOf(tournament.matchdayWindows),
    role,
  };
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

/** The place of a list – what a log entry about it has to repeat. */
function listDetails(
  list: Pick<ListWithGames, 'id' | 'matchday' | 'series' | 'table'>,
): AuditDetails {
  return {
    listId: list.id,
    matchday: toIsoDate(list.matchday),
    series: list.series,
    table: list.table,
  };
}

export function toListDto(
  list: ListWithGames,
  context: ListViewContext,
  withGames = false,
): ListDto {
  const lockReasons = listLockReasons(list, context.matchdays, context.windows, context.role);

  const dto: ListDto = {
    id: list.id,
    tournamentId: context.tournamentId,
    matchday: toIsoDate(list.matchday),
    series: list.series,
    table: list.table,
    status: list.status,
    counted: countsForStanding(list, context.windows),
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
    dto.games = list.games.map((game) => toGameDto(game, lineupNames(list)));
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
  /**
   * Which days and series exist in this tournament – exactly what the overview
   * needs for its two selection fields. Independent of the filters, so the
   * choices do not shrink while searching.
   */
  facets: ListFacets;
}

/** The days and series that occur in the lists of a tournament. */
export interface ListFacets {
  days: string[];
  series: number[];
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
  // Eine Serie des Abends: Die Listen sind nach Serie und Tisch sortiert, die
  // Auswahl liefert also die Blätter in der Reihenfolge, in der sie gespielt werden.
  if (query.series !== undefined) {
    where.series = query.series;
  }
  // `counted` asks what the list means now – handed in, or of a day that is
  // over – while `status` asks what is stored. A day with a playing time is
  // over at its "bis", so the boundary is today or already tomorrow.
  if (query.counted !== undefined) {
    const playingFrom = parseIsoDate(playingFromIso(matchdayWindowsOf(tournament.matchdayWindows)));
    where.AND = [
      query.counted
        ? { OR: [{ status: 'SUBMITTED' }, { matchday: { lt: playingFrom } }] }
        : { AND: [{ status: 'OPEN' }, { matchday: { gte: playingFrom } }] },
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

  const [rows, total, dayRows, seriesRows] = await Promise.all([
    prisma.gameList.findMany({
      where,
      include: listWithGamesInclude,
      // Neueste Listen zuerst: der jüngste Spieltag oben, darin Serie und Tisch wie
      // im Raum. `createdAt` bricht Gleichstand – ein Platz kann nach dem Abgeben
      // erneut belegt werden, und dann gehört das jüngere Blatt nach oben (und die
      // Seiten bleiben eindeutig sortiert).
      orderBy: [{ matchday: 'desc' }, { series: 'asc' }, { table: 'asc' }, { createdAt: 'desc' }],
      take: query.limit,
      skip: query.offset,
    }),
    prisma.gameList.count({ where }),
    // Nur die Werte, die es wirklich gibt: So kann die Übersicht Spieltage und
    // Serien anbieten, die jenseits der geladenen Seite liegen.
    prisma.gameList.groupBy({
      by: ['matchday'],
      where: { tournamentId: tournament.id },
      orderBy: { matchday: 'desc' },
    }),
    prisma.gameList.groupBy({
      by: ['series'],
      where: { tournamentId: tournament.id },
      orderBy: { series: 'asc' },
    }),
  ]);

  return {
    items: rows.map((row) => toListDto(row, listViewContext(tournament, role))),
    total,
    limit: query.limit,
    offset: query.offset,
    facets: {
      days: dayRows.map((row) => toIsoDate(row.matchday)),
      series: seriesRows.map((row) => row.series),
    },
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

/**
 * The account ("Punktekonto") of every player after every round of the list –
 * the result table as it develops, round by round. Always derived from the
 * current games; readable by both roles, also after the list was submitted.
 */
export async function getListProgression(
  tournamentId: string,
  listId: string,
): Promise<AccountProgressionDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  return accountProgression(lineupNames(list), list.games, toIsoDate(list.matchday));
}

/**
 * A table of a series is taken while its list is still open: a second sheet for
 * "Serie 1, Tisch 3" can only be created once the first one was handed in (or
 * its day is over – then it no longer needs to be handed in). The check is here
 * instead of a unique index, because a constraint could not tell an open list of
 * a past evening from an open list that is still being played.
 *
 * `exceptListId` is the list that is being moved onto that place itself – it
 * does not block its own table.
 */
async function assertSlotFree(
  tournament: Pick<Tournament, 'id' | 'matchdayWindows'>,
  matchday: Date,
  series: number,
  table: number,
  exceptListId?: string,
): Promise<void> {
  const blocking = await prisma.gameList.findFirst({
    where: {
      tournamentId: tournament.id,
      matchday,
      series,
      table,
      status: 'OPEN',
      ...(exceptListId ? { id: { not: exceptListId } } : {}),
    },
    select: { matchday: true, id: true },
  });

  if (!takesSlot(blocking, matchdayWindowsOf(tournament.matchdayWindows))) return;

  throw conflict(
    `Serie ${series}, Tisch ${table} is still playing on ${toIsoDate(matchday)} – ` +
      'hand that list in first, or use another table or series',
    { listId: blocking?.id },
  );
}

export async function createList(
  tournamentId: string,
  input: CreateListInput,
  role: TournamentRole,
): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  assertMatchdayAllowed(tournament, input.matchday, role);

  const matchday = parseIsoDate(input.matchday);

  await assertSlotFree(tournament, matchday, input.series, input.table);

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

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'list.created',
    details: {
      listId: list.id,
      matchday: input.matchday,
      series: input.series,
      table: input.table,
      playerNames: lineup,
    },
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

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'list.lineup_changed',
    details: { ...listDetails(list), playerNames: [...playerNames] },
  });

  return toListDto(updated, listViewContext(tournament, role), true);
}

/** Admin only (enforced by the route): corrects the head of the sheet – a member
 * may have written the wrong table or series. The lineup, the games and the
 * matchday stay as they are, so the list keeps its result; only the place
 * changes. A move onto a place that another open list of the same evening still
 * occupies is refused with the same 409 as the creation.
 */
export async function updateList(
  tournamentId: string,
  listId: string,
  input: UpdateListInput,
  role: TournamentRole,
): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  const series = input.series ?? list.series;
  const table = input.table ?? list.table;
  if (series === list.series && table === list.table) {
    return toListDto(list, listViewContext(tournament, role), true);
  }

  await assertSlotFree(tournament, list.matchday, series, table, list.id);

  const updated = await prisma.gameList.update({
    where: { id: list.id },
    data: { series, table },
    include: listWithGamesInclude,
  });

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'list.moved',
    details: {
      listId: list.id,
      matchday: toIsoDate(list.matchday),
      fromSeries: list.series,
      fromTable: list.table,
      series,
      table,
    },
  });

  return toListDto(updated, listViewContext(tournament, role), true);
}

/** Admin only (enforced by the route). */
export async function deleteList(
  tournamentId: string,
  listId: string,
  role: TournamentRole,
): Promise<void> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  const details = { ...listDetails(list), gameCount: list.games.length };

  await prisma.gameList.deleteMany({ where: { id: list.id } });

  await recordAudit({ tournamentId: tournament.id, role, action: 'list.deleted', details });
}

export async function submitList(
  tournamentId: string,
  listId: string,
  role: TournamentRole,
): Promise<ListDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  // A list of a past day is final by itself, so there is nothing to hand in –
  // and it counts for the standing either way. With a playing time the same is
  // true for a list whose "bis" has passed.
  assertDayNotOver(list.matchday, 'submitted', matchdayWindowsOf(tournament.matchdayWindows));
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

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'list.submitted',
    details: listDetails(list),
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

  assertDayNotOver(list.matchday, 'reopened', matchdayWindowsOf(tournament.matchdayWindows));

  if (list.status !== 'SUBMITTED') {
    throw conflict('This list is not submitted');
  }

  const updated = await prisma.gameList.update({
    where: { id: list.id },
    data: { status: 'OPEN', submittedAt: null },
    include: listWithGamesInclude,
  });

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'list.reopened',
    details: listDetails(list),
  });

  return toListDto(updated, listViewContext(tournament, role), true);
}
