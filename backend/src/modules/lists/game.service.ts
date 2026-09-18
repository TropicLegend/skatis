import { badRequest, notFound } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import type { TournamentRole } from '../../lib/tokens.js';
import { getTournamentRow } from '../tournaments/tournament.service.js';
import { assertListEditable, assertMatchdayAllowed } from './list-access.js';
import { findListOrThrow } from './list.service.js';
import { toGameCreateData, toGameDto, toGameUpdateData, type GameDto } from './game.mapper.js';
import type { CreateGameInput, UpdateGameInput } from './game.schemas.js';

function nextFreePosition(positions: readonly number[]): number {
  return positions.reduce((max, position) => Math.max(max, position), 0) + 1;
}

export async function listGames(tournamentName: string, matchday: string): Promise<GameDto[]> {
  const tournament = await getTournamentRow(tournamentName);
  const list = await findListOrThrow(tournament.id, matchday);
  return list.games.map(toGameDto);
}

export async function createGame(
  tournamentName: string,
  matchday: string,
  input: CreateGameInput,
  role: TournamentRole,
): Promise<GameDto> {
  const tournament = await getTournamentRow(tournamentName);
  const list = await findListOrThrow(tournament.id, matchday);

  assertMatchdayAllowed(tournament, matchday, role);
  assertListEditable(list.status);

  // Without an explicit position the game is appended to the end of the list.
  // A concurrent insert may collide; the unique constraint then answers 409.
  const position = input.position ?? nextFreePosition(list.games.map((game) => game.position));

  const game = await prisma.game.create({
    data: { ...toGameCreateData(input, position), listId: list.id },
  });

  return toGameDto(game);
}

export async function updateGame(
  tournamentName: string,
  matchday: string,
  gameId: string,
  input: UpdateGameInput,
  role: TournamentRole,
): Promise<GameDto> {
  const tournament = await getTournamentRow(tournamentName);
  const list = await findListOrThrow(tournament.id, matchday);

  assertMatchdayAllowed(tournament, matchday, role);
  assertListEditable(list.status);

  const game = list.games.find((candidate) => candidate.id === gameId);
  if (!game) {
    throw notFound(`Game ${gameId} does not exist in the list for ${matchday}`);
  }

  // Validate the resulting game, not just the patched fields.
  const players = input.players ?? game.players;
  const declarer = input.declarer === undefined ? game.declarer : input.declarer;
  if (declarer !== null && !players.includes(declarer)) {
    throw badRequest('The declarer must be one of the players');
  }

  const updated = await prisma.game.update({
    where: { id: game.id },
    data: toGameUpdateData(input),
  });

  return toGameDto(updated);
}

export async function deleteGame(
  tournamentName: string,
  matchday: string,
  gameId: string,
  role: TournamentRole,
): Promise<void> {
  const tournament = await getTournamentRow(tournamentName);
  const list = await findListOrThrow(tournament.id, matchday);

  assertMatchdayAllowed(tournament, matchday, role);
  assertListEditable(list.status);

  const result = await prisma.game.deleteMany({ where: { id: gameId, listId: list.id } });
  if (result.count === 0) {
    throw notFound(`Game ${gameId} does not exist in the list for ${matchday}`);
  }
}
