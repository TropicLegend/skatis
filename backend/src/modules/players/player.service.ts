import type { Player, PlayerGroup } from '@prisma/client';
import { conflict, notFound } from '../../lib/http-error.js';
import { prisma } from '../../lib/prisma.js';
import type { TournamentRole } from '../../lib/tokens.js';
import { recordAudit } from '../audit/audit-log.js';
import { getTournamentRow } from '../tournaments/tournament.service.js';
import { renameInGame } from './player-names.js';
import type { CreatePlayerInput } from './player.schemas.js';

export interface PlayerGroupDto {
  id: string;
  name: string;
  playerNames: string[];
}

function toPlayerGroupDto(
  group: PlayerGroup & { members: { player: { name: string } }[] },
): PlayerGroupDto {
  return {
    id: group.id,
    name: group.name,
    playerNames: group.members.map((member) => member.player.name).sort((a, b) => a.localeCompare(b)),
  };
}

const playerGroupInclude = {
  members: { select: { player: { select: { name: true } } } },
} as const;

export interface PlayerDto {
  name: string;
  hiddenFromStandings: boolean;
}

export function toPlayerDto(player: Player): PlayerDto {
  return { name: player.name, hiddenFromStandings: player.hiddenFromStandings };
}

export async function listPlayers(tournamentId: string): Promise<PlayerDto[]> {
  const tournament = await getTournamentRow(tournamentId);

  const players = await prisma.player.findMany({
    where: { tournamentId: tournament.id },
    orderBy: { name: 'asc' },
  });

  return players.map(toPlayerDto);
}

export async function listPlayerGroups(tournamentId: string): Promise<PlayerGroupDto[]> {
  const tournament = await getTournamentRow(tournamentId);
  const groups = await prisma.playerGroup.findMany({
    where: { tournamentId: tournament.id },
    include: playerGroupInclude,
    orderBy: { name: 'asc' },
  });

  return groups.map(toPlayerGroupDto);
}

export async function createPlayerGroup(
  tournamentId: string,
  name: string,
  role: TournamentRole,
): Promise<PlayerGroupDto> {
  const tournament = await getTournamentRow(tournamentId);
  const existing = await prisma.playerGroup.findUnique({
    where: { tournamentId_name: { tournamentId: tournament.id, name } },
    select: { id: true },
  });
  if (existing) throw conflict(`A group named "${name}" already exists`);

  const group = await prisma.playerGroup.create({
    data: { tournamentId: tournament.id, name },
    include: playerGroupInclude,
  });
  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'group.created',
    details: { groupId: group.id, name: group.name },
  });

  return toPlayerGroupDto(group);
}

export async function deletePlayerGroup(
  tournamentId: string,
  groupId: string,
  role: TournamentRole,
): Promise<void> {
  const tournament = await getTournamentRow(tournamentId);
  const group = await prisma.playerGroup.findFirst({
    where: { id: groupId, tournamentId: tournament.id },
    select: { id: true, name: true },
  });
  if (!group) throw notFound('Player group does not exist in this tournament');

  await prisma.playerGroup.delete({ where: { id: group.id } });
  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'group.deleted',
    details: { groupId: group.id, name: group.name },
  });
}

export async function setPlayerGroupMembers(
  tournamentId: string,
  groupId: string,
  playerNames: readonly string[],
  role: TournamentRole,
): Promise<PlayerGroupDto> {
  const tournament = await getTournamentRow(tournamentId);
  const group = await prisma.playerGroup.findFirst({
    where: { id: groupId, tournamentId: tournament.id },
    select: { id: true, name: true },
  });
  if (!group) throw notFound('Player group does not exist in this tournament');

  const players = await prisma.player.findMany({
    where: { tournamentId: tournament.id, name: { in: [...playerNames] } },
    select: { id: true, name: true },
  });
  if (players.length !== playerNames.length) {
    const found = new Set(players.map((player) => player.name));
    throw conflict('Every group member has to be part of this tournament', {
      unknownPlayers: playerNames.filter((name) => !found.has(name)),
    });
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.playerGroupMembership.deleteMany({ where: { groupId: group.id } });
    if (players.length > 0) {
      await transaction.playerGroupMembership.createMany({
        data: players.map((player) => ({ groupId: group.id, playerId: player.id })),
      });
    }
  });

  const updated = await prisma.playerGroup.findUniqueOrThrow({
    where: { id: group.id },
    include: playerGroupInclude,
  });
  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'group.members_changed',
    details: { groupId: group.id, name: group.name, playerNames: [...playerNames] },
  });

  return toPlayerGroupDto(updated);
}

export async function createPlayer(
  tournamentId: string,
  input: CreatePlayerInput,
  role: TournamentRole,
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

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'player.added',
    details: { name: player.name },
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
export async function deletePlayer(
  tournamentId: string,
  name: string,
  role: TournamentRole,
): Promise<void> {
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

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'player.removed',
    details: { name: player.name },
  });
}

/** Toggles whether a player is included in the tournament standings. */
export async function setPlayerStandingVisibility(
  tournamentId: string,
  name: string,
  hiddenFromStandings: boolean,
  role: TournamentRole,
): Promise<PlayerDto> {
  const tournament = await getTournamentRow(tournamentId);
  const player = await findPlayerOrThrow(tournament.id, name);

  if (player.hiddenFromStandings === hiddenFromStandings) {
    return toPlayerDto(player);
  }

  const updated = await prisma.player.update({
    where: { id: player.id },
    data: { hiddenFromStandings },
  });

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'player.standing_visibility_changed',
    details: { name: player.name, hiddenFromStandings },
  });

  return toPlayerDto(updated);
}

/**
 * Corrects the name of a player. A name is the identity of a player, so a typo
 * would otherwise be permanent – and a player cannot be removed once they play.
 *
 * Games store the names of the lineup, too, so a rename has to rewrite them.
 * Only an admin gets here (see the route), which is exactly the rule for a list
 * that already counts – neither a rename nor any other change to such a list is
 * a member's business.
 */
export async function renamePlayer(
  tournamentId: string,
  name: string,
  newName: string,
  role: TournamentRole,
): Promise<PlayerDto> {
  const tournament = await getTournamentRow(tournamentId);
  const player = await findPlayerOrThrow(tournament.id, name);

  if (player.name === newName) {
    return toPlayerDto(player);
  }

  const existing = await prisma.player.findUnique({
    where: { tournamentId_name: { tournamentId: tournament.id, name: newName } },
    select: { id: true },
  });
  if (existing) {
    throw conflict(`"${newName}" is already a player of this tournament`);
  }

  // Every name of the tournament's games is a candidate – the Geber of a round
  // sits out with four players and is therefore not necessarily part of the
  // three `players` of that game.
  const games = await prisma.game.findMany({
    where: {
      list: { tournamentId: tournament.id },
      OR: [{ dealer: name }, { declarer: name }, { players: { has: name } }],
    },
    select: { id: true, players: true, dealer: true, declarer: true },
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.player.update({ where: { id: player.id }, data: { name: newName } });

    // The lineup is a relation and follows the new name by itself; the names
    // recorded in the games are denormalised and have to be rewritten.
    for (const game of games) {
      await transaction.game.update({
        where: { id: game.id },
        data: renameInGame(game, name, newName),
      });
    }
  });

  await recordAudit({
    tournamentId: tournament.id,
    role,
    action: 'player.renamed',
    details: { from: name, to: newName },
  });

  return { name: newName, hiddenFromStandings: player.hiddenFromStandings };
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
