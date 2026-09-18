import { notFound } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import type { TournamentRole } from '../../lib/tokens.js';
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
import { nextDealer } from './game-rules.js';

/** Rounds are appended, so a new game gets the next free position. */
function nextFreePosition(positions: readonly number[]): number {
  return positions.reduce((max, position) => Math.max(max, position), 0) + 1;
}

/** The dealer of the last round, or `null` when no game has been entered yet. */
function lastDealer(list: ListWithGames): string | null {
  const last = list.games.at(-1);
  return last ? last.dealer : null;
}

export async function listGames(tournamentId: string, matchday: string): Promise<GameDto[]> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, matchday);
  return list.games.map(toGameDto);
}

/**
 * Enters a game into a list. Every property of the game is checked: the shape
 * and the rules that depend on the game itself by the schema, the rules that
 * depend on the list here. `position`, `dealer` and `players` come from the
 * list, `gameValue` is calculated.
 */
export async function createGame(
  tournamentId: string,
  matchday: string,
  input: GameInput,
  role: TournamentRole,
): Promise<GameDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, matchday);

  assertMatchdayAllowed(tournament, matchday, role);
  assertListEditable(list.status, role);

  const lineup = lineupNames(list);
  assertLineupComplete(lineup.length);

  // Player 1 deals in round 1, then player 2 and so on.
  const dealer = nextDealer(lineup, lastDealer(list));
  assertDeclarerAllowed(input, lineup, dealer);

  const position = nextFreePosition(list.games.map((game) => game.position));
  const properties = toGameProperties(input, { position, dealer, players: lineup });

  const game = await prisma.game.create({
    data: { ...toGameCreateData(properties), listId: list.id },
  });

  return toGameDto(game);
}

/**
 * Replaces a game. The round keeps its position and its dealer, so the request
 * only carries the properties of the game itself.
 */
export async function replaceGame(
  tournamentId: string,
  matchday: string,
  gameId: string,
  input: GameInput,
  role: TournamentRole,
): Promise<GameDto> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, matchday);

  assertMatchdayAllowed(tournament, matchday, role);
  assertListEditable(list.status, role);

  const game = list.games.find((candidate) => candidate.id === gameId);
  if (!game) {
    throw notFound(`Game ${gameId} does not exist in the list for ${matchday}`);
  }

  const lineup = lineupNames(list);
  assertLineupComplete(lineup.length);
  assertDeclarerAllowed(input, lineup, game.dealer);

  const properties = toGameProperties(input, {
    position: game.position,
    dealer: game.dealer,
    players: lineup,
  });

  const updated = await prisma.game.update({
    where: { id: game.id },
    data: toGameUpdateData(properties),
  });

  return toGameDto(updated);
}

export async function deleteGame(
  tournamentId: string,
  matchday: string,
  gameId: string,
  role: TournamentRole,
): Promise<void> {
  const tournament = await getTournamentRow(tournamentId);
  const list = await findListOrThrow(tournament.id, matchday);

  assertMatchdayAllowed(tournament, matchday, role);
  assertListEditable(list.status, role);

  const result = await prisma.game.deleteMany({ where: { id: gameId, listId: list.id } });
  if (result.count === 0) {
    throw notFound(`Game ${gameId} does not exist in the list for ${matchday}`);
  }
}
