import type { Player } from '@prisma/client';
import { conflict, notFound } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { getTournamentRow } from '../tournaments/tournament.service.js';
import type { CreatePlayerInput } from './player.schemas.js';

export interface PlayerDto {
  id: string;
  name: string;
}

export function toPlayerDto(player: Player): PlayerDto {
  return { id: player.id, name: player.name };
}

export async function listPlayers(tournamentId: string): Promise<PlayerDto[]> {
  const tournament = await getTournamentRow(tournamentId);

  const players = await prisma.player.findMany({
    where: { tournamentId: tournament.id },
    orderBy: { name: 'asc' },
  });

  return players.map(toPlayerDto);
}

export async function createPlayer(
  tournamentId: string,
  input: CreatePlayerInput,
): Promise<PlayerDto> {
  const tournament = await getTournamentRow(tournamentId);

  // Names identify a player inside a tournament – also for the games they play.
  const existing = await prisma.player.findUnique({
    where: { tournamentId_name: { tournamentId: tournament.id, name: input.name } },
    select: { id: true },
  });
  if (existing) {
    throw conflict(`"${input.name}" is already a player of this tournament`);
  }

  const player = await prisma.player.create({
    data: { tournamentId: tournament.id, name: input.name },
  });

  return toPlayerDto(player);
}

export async function findPlayerOrThrow(tournamentId: string, playerId: string): Promise<Player> {
  const player = await prisma.player.findFirst({ where: { id: playerId, tournamentId } });
  if (!player) {
    throw notFound(`Player ${playerId} does not exist in this tournament`);
  }
  return player;
}

/** Removes a player – only while they are not part of any list. */
export async function deletePlayer(tournamentId: string, playerId: string): Promise<void> {
  const tournament = await getTournamentRow(tournamentId);
  const player = await findPlayerOrThrow(tournament.id, playerId);

  const listCount = await prisma.gameList.count({
    where: { lineup: { some: { playerId: player.id } } },
  });
  if (listCount > 0) {
    throw conflict(
      `"${player.name}" plays in ${listCount} list(s) – remove them from these lists first`,
    );
  }

  await prisma.player.deleteMany({ where: { id: player.id } });
}

/**
 * Resolves player ids of a tournament. Rejects ids that belong to another
 * tournament so that a list can only ever contain players of its own
 * tournament. The order of `playerIds` is kept – it is the seating order of the
 * lineup, which decides who deals in which round.
 */
export async function resolveTournamentPlayers(
  tournamentId: string,
  playerIds: readonly string[],
): Promise<Player[]> {
  const uniqueIds = [...new Set(playerIds)];
  if (uniqueIds.length === 0) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: uniqueIds }, tournamentId },
  });

  const byId = new Map(players.map((player) => [player.id, player]));
  const unknownPlayerIds = uniqueIds.filter((id) => !byId.has(id));
  if (unknownPlayerIds.length > 0) {
    throw conflict('Players have to belong to this tournament', { unknownPlayerIds });
  }

  return uniqueIds.flatMap((id) => {
    const player = byId.get(id);
    return player ? [player] : [];
  });
}
