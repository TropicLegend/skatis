import type { Player } from '@prisma/client';
import { conflict, notFound } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import { getTournamentRow } from '../tournaments/tournament.service.js';
import type { CreatePlayerInput } from './player.schemas.js';

export interface PlayerDto {
  name: string;
}

export function toPlayerDto(player: Player): PlayerDto {
  return { name: player.name };
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

export async function findPlayerOrThrow(tournamentId: string, name: string): Promise<Player> {
  const player = await prisma.player.findUnique({
    where: { tournamentId_name: { tournamentId, name } },
  });
  if (!player) {
    throw notFound(`"${name}" is not a player of this tournament`);
  }
  return player;
}

/** Removes a player – only while they are not part of any list. */
export async function deletePlayer(tournamentId: string, name: string): Promise<void> {
  const tournament = await getTournamentRow(tournamentId);
  const player = await findPlayerOrThrow(tournament.id, name);

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
 * Resolves the names of a lineup to players of the tournament. Names that do
 * not belong to it are rejected, so a list can only ever contain players of its
 * own tournament. The order of `names` is kept – it is the seating order of the
 * lineup, which decides who deals in which round.
 */
export async function resolveTournamentPlayers(
  tournamentId: string,
  names: readonly string[],
): Promise<Player[]> {
  const uniqueNames = [...new Set(names)];
  if (uniqueNames.length === 0) return [];

  const players = await prisma.player.findMany({
    where: { tournamentId, name: { in: uniqueNames } },
  });

  const byName = new Map(players.map((player) => [player.name, player]));
  const unknownPlayers = uniqueNames.filter((name) => !byName.has(name));
  if (unknownPlayers.length > 0) {
    throw conflict('Every player of a list has to be part of the tournament', {
      unknownPlayers,
    });
  }

  return uniqueNames.flatMap((name) => {
    const player = byName.get(name);
    return player ? [player] : [];
  });
}
