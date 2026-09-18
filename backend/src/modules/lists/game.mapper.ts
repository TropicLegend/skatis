import type { Game, Prisma } from '@prisma/client';
import type { CreateGameInput, UpdateGameInput } from './game.schemas.js';

export interface GameDto {
  id: string;
  position: number;
  players: string[];
  declarer: string | null;
  gameType: string | null;
  points: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toGameDto(game: Game): GameDto {
  return {
    id: game.id,
    position: game.position,
    players: [...game.players],
    declarer: game.declarer,
    gameType: game.gameType,
    points: game.points,
    note: game.note,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
  };
}

/**
 * Fills in missing positions: explicitly given positions are kept, the
 * remaining games are appended to the first free slots.
 */
export function assignPositions(games: readonly { position?: number }[]): number[] {
  const used = new Set(
    games
      .map((game) => game.position)
      .filter((position): position is number => position !== undefined),
  );

  let candidate = 1;

  return games.map((game) => {
    if (game.position !== undefined) return game.position;
    while (used.has(candidate)) candidate += 1;
    used.add(candidate);
    return candidate;
  });
}

export function toGameCreateData(
  game: CreateGameInput,
  position: number,
): Prisma.GameCreateWithoutListInput {
  return {
    position,
    players: game.players,
    declarer: game.declarer ?? null,
    gameType: game.gameType ?? null,
    points: game.points,
    note: game.note ?? null,
  };
}

export function toGameUpdateData(game: UpdateGameInput): Prisma.GameUpdateInput {
  const data: Prisma.GameUpdateInput = {};
  if (game.position !== undefined) data.position = game.position;
  if (game.players !== undefined) data.players = game.players;
  if (game.declarer !== undefined) data.declarer = game.declarer;
  if (game.gameType !== undefined) data.gameType = game.gameType;
  if (game.points !== undefined) data.points = game.points;
  if (game.note !== undefined) data.note = game.note;
  return data;
}
