import { Prisma, type Tournament } from '@prisma/client';
import { notFound } from '../../lib/http-error.js';
import { parseIsoDate, toIsoDate } from '../../lib/dates.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { prisma } from '../../lib/prisma.js';
import { generateTournamentId } from '../../lib/tournament-id.js';
import type { TournamentRole } from '../../lib/tokens.js';
import { recordAudit } from '../audit/audit-log.js';
import { matchdayWindowsOf, playingFromIso, type MatchdayWindows } from '../lists/list-access.js';
import { scoreList, type ListResultsDto } from '../lists/scoring.js';
import type {
  CreateTournamentInput,
  ListTournamentsQuery,
  UpdateTournamentInput,
} from './tournament.schemas.js';
import {
  standingsHistory,
  tournamentStandings,
  type StandingRow,
  type StandingsGroupBy,
  type StandingsHistoryDto,
  type TournamentStandingsDto,
} from './standings.js';
import { playerGameStats, type PlayerGameStatsDto, type StatGame } from './player-stats.js';

/** Number of attempts to find a free tournament id. */
const MAX_ID_ATTEMPTS = 5;

/** Never select the password hashes for responses. */
export const tournamentPublicSelect = {
  id: true,
  name: true,
  matchdays: true,
  matchdayWindows: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { lists: true } },
} satisfies Prisma.TournamentSelect;

type TournamentRow = Prisma.TournamentGetPayload<{ select: typeof tournamentPublicSelect }>;

export interface TournamentDto {
  id: string;
  name: string;
  matchdays: number[];
  /** Optional playing time per weekday – `{}` when the admin set none. */
  matchdayWindows: MatchdayWindows;
  listCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toTournamentDto(tournament: TournamentRow): TournamentDto {
  return {
    id: tournament.id,
    name: tournament.name,
    matchdays: sortedDays(tournament.matchdays),
    matchdayWindows: matchdayWindowsOf(tournament.matchdayWindows),
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
    // Ohne Angabe bleibt die Map leer – „kein Tag hat eine Spielzeit“.
    matchdayWindows: input.matchdayWindows ?? {},
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
 * The standing of the tournament, built from the lists that **count**: the ones
 * that were handed in and the ones whose day is over – a list of a past
 * matchday is final even when nobody submitted it. A list that is still open on
 * its own day is not part of the tournament result yet, and reopening one drops
 * it out again, so the standing always describes what is final.
 *
 * Every list is scored with the rules of `GET …/lists/:listId/results`, and the
 * standing sums up the whole final result of a player: the Spielwerte of their
 * Alleinspiele, the flat +50 per won and -50 per lost Alleinspiel and the bonus
 * for the Alleinspiele the other players lost.
 *
 * `loadCountedResults` reads that input once for the standing and for its history
 * (`getStandingsHistory`), so the two views can never describe different data.
 */
async function loadCountedResults(tournamentId: string): Promise<CountedResults> {
  const tournament = await getTournamentRow(tournamentId);

  const [roster, lists] = await Promise.all([
    prisma.player.findMany({
      where: { tournamentId: tournament.id },
      select: { name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.gameList.findMany({
      where: {
        tournamentId: tournament.id,
        // A list counts once it was handed in – or once its day is over, which
        // with a playing time is the moment its "bis" has passed.
        OR: [
          { status: 'SUBMITTED' },
          {
            matchday: {
              lt: parseIsoDate(playingFromIso(matchdayWindowsOf(tournament.matchdayWindows))),
            },
          },
        ],
      },
      orderBy: { matchday: 'asc' },
      select: {
        matchday: true,
        lineup: {
          orderBy: { position: 'asc' },
          select: { player: { select: { name: true } } },
        },
        games: {
          select: {
            players: true,
            declarer: true,
            won: true,
            gameValue: true,
            gameType: true,
            hand: true,
          },
        },
      },
    }),
  ]);

  const matchdays = lists.map((list) =>
    scoreList(
      list.lineup.map((entry) => entry.player.name),
      list.games,
      toIsoDate(list.matchday),
    ),
  );

  return {
    tournamentId: tournament.id,
    roster: roster.map((player) => player.name),
    results: matchdays,
    games: lists.flatMap((list) => list.games),
  };
}

/** The input of the standing, of its history and of the per-game statistics. */
interface CountedResults {
  tournamentId: string;
  roster: string[];
  /** One result table per counted list, oldest matchday first. */
  results: ListResultsDto[];
  /** Every game of the counted lists, in the same order. */
  games: StatGame[];
}

/** The standing of the tournament over all counted lists, best player first. */
export async function getTournamentStandings(
  tournamentId: string,
): Promise<TournamentStandingsDto> {
  const { tournamentId: id, roster, results } = await loadCountedResults(tournamentId);

  return tournamentStandings(id, roster, results);
}

/**
 * The standing at the end of every matchday – or ISO week or month – as the
 * average score per game. The series follow the standing, so a chart drawn from
 * it and the table show the same order.
 */
export async function getStandingsHistory(
  tournamentId: string,
  groupBy: StandingsGroupBy,
): Promise<StandingsHistoryDto> {
  const { tournamentId: id, roster, results } = await loadCountedResults(tournamentId);
  const standings = tournamentStandings(id, roster, results);

  return standingsHistory(
    id,
    standings.players.map((player) => player.name),
    results,
    groupBy,
  );
}

/** The statistics of one player: his ranking row plus the numbers of his games. */
export interface PlayerStatsDto extends PlayerGameStatsDto {
  tournamentId: string;
  /** How many counted lists the numbers are built from. */
  listsCounted: number;
  /** The ranking row of the player – the same numbers `GET …/standings` reports. */
  player: StandingRow;
}

/**
 * How one player took part in the rounds of the tournament and how he did there:
 * the roles he had (Alleinspieler, Gegenspieler, Eingepasst), his Erfolgsquote,
 * his Hand games and his Spielarten. The ranking row comes with it, so the page
 * gets the standing numbers from the very same request.
 */
export async function getPlayerStats(
  tournamentId: string,
  playerName: string,
): Promise<PlayerStatsDto> {
  const { tournamentId: id, roster, results, games } = await loadCountedResults(tournamentId);
  const standings = tournamentStandings(id, roster, results);

  const player = standings.players.find((entry) => entry.name === playerName);
  if (!player) {
    throw notFound(`Player ${playerName} does not exist in the tournament ${id}`);
  }

  return {
    tournamentId: id,
    listsCounted: standings.listsCounted,
    player,
    ...playerGameStats(player.name, games),
  };
}

export async function updateTournament(
  tournamentId: string,
  input: UpdateTournamentInput,
  role: TournamentRole,
): Promise<TournamentDto> {
  await getTournamentRow(tournamentId);

  const data: Prisma.TournamentUpdateInput = {};
  const changed: string[] = [];

  if (input.name !== undefined) {
    data.name = input.name;
    changed.push('name');
  }
  if (input.matchdays !== undefined) {
    data.matchdays = sortedDays(input.matchdays);
    changed.push('matchdays');
  }
  if (input.matchdayWindows !== undefined) {
    data.matchdayWindows = input.matchdayWindows;
    changed.push('matchdayWindows');
  }
  if (input.password !== undefined) {
    data.passwordHash = await hashPassword(input.password);
    // Ein neues Spielerpasswort beendet alle laufenden Sitzungen: jedes ausgestellte
    // Token trägt die alte Version und wird von der Middleware abgelehnt.
    data.sessionVersion = { increment: 1 };
    changed.push('password');
  }

  const updated = await prisma.tournament.update({
    where: { id: tournamentId },
    data,
    select: tournamentPublicSelect,
  });

  await recordAudit({
    tournamentId,
    role,
    action: 'tournament.updated',
    // Only *which* fields changed – never the password itself. The playing
    // times are logged as weekday -> "von-bis", the wording lives in the frontend.
    details: {
      changed,
      name: updated.name,
      matchdays: updated.matchdays,
      ...(input.matchdayWindows === undefined
        ? {}
        : { matchdayWindows: auditWindows(input.matchdayWindows) }),
    },
  });

  return toTournamentDto(updated);
}

/** The playing times as the log can store them: weekday -> `"18:00-22:30"`. */
function auditWindows(windows: MatchdayWindows): Record<string, string> {
  return Object.fromEntries(
    Object.entries(windows).map(([weekday, window]) => [weekday, `${window.from}-${window.to}`]),
  );
}

export async function deleteTournament(tournamentId: string): Promise<void> {
  const result = await prisma.tournament.deleteMany({ where: { id: tournamentId } });
  if (result.count === 0) {
    throw notFound(`Tournament "${tournamentId}" does not exist`);
  }
}

export interface TournamentAuthentication {
  role: TournamentRole;
  /** Sitzungs-Version, mit der das Token ausgestellt wird (siehe `lib/session-version.ts`). */
  sessionVersion: number;
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
    select: { adminPasswordHash: true, passwordHash: true, sessionVersion: true },
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

  if (isAdmin) return { role: 'ADMIN', sessionVersion: tournament.sessionVersion };
  if (isMember) return { role: 'MEMBER', sessionVersion: tournament.sessionVersion };
  return null;
}
