import type { Game } from '@prisma/client';
import { notFound } from '../../lib/http-error.js';
import { toIsoDate } from '../../lib/dates.js';
import { prisma } from '../../lib/prisma.js';
import type { TournamentRole } from '../../lib/tokens.js';
import { recordAudit, type AuditDetails } from '../audit/audit-log.js';
import { getTournamentRow } from '../tournaments/tournament.service.js';
import { assertListEditable, assertMatchdayAllowed } from './list-access.js';
import { findListOrThrow, lineupNames, type ListWithGames } from './list.service.js';
import { assertDeclarerAllowed, assertLineupComplete } from './game-entry.js';
import {
  toGameCreateData,
  toGameDto,
  toGameProperties,
  toGameUpdateData,
  type GameDto,
} from './game.mapper.js';
import type { GameInput } from './game.schemas.js';
import { nextDealer, playingPlayers } from './game-rules.js';
import { buildRoundPreview, type RoundPreviewDto } from './round-preview.js';

/** Rounds are appended, so a new game gets the next free position. */
function nextFreePosition(positions: readonly number[]): number {
  return positions.reduce((max, position) => Math.max(max, position), 0) + 1;
}

/** The dealer of the last round, or `null` when no game has been entered yet. */
function lastDealer(list: ListWithGames): string | null {
  const last = list.games.at(-1);
  return last ? last.dealer : null;
}

/** The place of a game – what a log entry about it has to repeat. */
function gameDetails(
  list: ListWithGames,
  game: Pick<Game, 'id' | 'position' | 'declarer' | 'gameType' | 'gameValue' | 'won'>,
): AuditDetails {
  return {
    listId: list.id,
    gameId: game.id,
    position: game.position,
    declarer: game.declarer,
    gameType: game.gameType,
    gameValue: game.gameValue,
    won: game.won,
  };
}

export async function listGames(tournamentId: string, listId: string): Promise<GameDto[]> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);
  const lineup = lineupNames(list);
  return list.games.map((game) => toGameDto(game, lineup));
}

/** One game of a list – reading needs no role, like the other reads. */
export async function getGame(
  tournamentId: string,
  listId: string,
  gameId: string,
): Promise<GameDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  const game = list.games.find((candidate) => candidate.id === gameId);
  if (!game) {
    throw notFound(`Game ${gameId} does not exist in the list ${listId}`);
  }

  return toGameDto(game, lineupNames(list));
}

/**
 * The round a `POST …/games` would create: who deals and which three players may
 * be the Alleinspieler. A frontend asks this instead of re-deriving the
 * Geber-Regel, which is what `createGame` enforces.
 *
 * This is a read like the other GETs, so it needs no role and no matchday check
 * – whether a game may actually be entered is decided when it is entered.
 */
export async function previewNextRound(
  tournamentId: string,
  listId: string,
): Promise<RoundPreviewDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  const lineup = lineupNames(list);
  // Without a complete lineup no round can be played – the same answer the
  // entry of a game would give.
  assertLineupComplete(lineup.length);

  return buildRoundPreview(
    list.id,
    lineup,
    list.games.map((game) => game.dealer),
  );
}

/**
 * Enters a game into a list. Every property of the game is checked: the shape
 * and the rules that depend on the game itself by the schema, the rules that
 * depend on the list here. `position`, `dealer` and `players` come from the
 * list, `gameValue` is calculated.
 */
export async function createGame(
  tournamentId: string,
  listId: string,
  input: GameInput,
  role: TournamentRole,
): Promise<GameDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  assertMatchdayAllowed(tournament, toIsoDate(list.matchday), role);
  assertListEditable(list.status, role);

  const lineup = lineupNames(list);
  assertLineupComplete(lineup.length);

  // Player 1 deals in round 1, then player 2 and so on.
  const dealer = nextDealer(lineup, lastDealer(list));
  assertDeclarerAllowed(input, lineup, dealer);

  const position = nextFreePosition(list.games.map((game) => game.position));
  const properties = toGameProperties(input, {
    position,
    dealer,
    players: playingPlayers(lineup, dealer),
  });

  const game = await prisma.game.create({
    data: { ...toGameCreateData(properties), listId: list.id },
  });

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'game.created',
    details: gameDetails(list, game),
  });

  return toGameDto(game, lineup);
}

/**
 * Replaces a game. The round keeps its position and its dealer, so the request
 * only carries the properties of the game itself.
 */
export async function replaceGame(
  tournamentId: string,
  listId: string,
  gameId: string,
  input: GameInput,
  role: TournamentRole,
): Promise<GameDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  assertMatchdayAllowed(tournament, toIsoDate(list.matchday), role);
  assertListEditable(list.status, role);

  const game = list.games.find((candidate) => candidate.id === gameId);
  if (!game) {
    throw notFound(`Game ${gameId} does not exist in the list ${listId}`);
  }

  const lineup = lineupNames(list);
  assertLineupComplete(lineup.length);
  assertDeclarerAllowed(input, lineup, game.dealer);

  const properties = toGameProperties(input, {
    position: game.position,
    dealer: game.dealer,
    players: playingPlayers(lineup, game.dealer),
  });

  const updated = await prisma.game.update({
    where: { id: game.id },
    data: toGameUpdateData(properties),
  });

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'game.updated',
    details: gameDetails(list, updated),
  });

  return toGameDto(updated, lineup);
}

export async function deleteGame(
  tournamentId: string,
  listId: string,
  gameId: string,
  role: TournamentRole,
): Promise<void> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, listId);

  assertMatchdayAllowed(tournament, toIsoDate(list.matchday), role);
  assertListEditable(list.status, role);

  const result = await prisma.game.deleteMany({ where: { id: gameId, listId: list.id } });
  if (result.count === 0) {
    throw notFound(`Game ${gameId} does not exist in the list ${listId}`);
  }

  // The row is gone now, so the details come from the copy the list carried.
  const deleted = list.games.find((candidate) => candidate.id === gameId);
  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'game.deleted',
    details: deleted ? gameDetails(list, deleted) : { listId: list.id, gameId },
  });
}
