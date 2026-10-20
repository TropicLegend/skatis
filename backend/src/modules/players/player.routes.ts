import { Router } from 'express';
import { withTournamentLock } from '../../lib/keyed-lock.js';
import { authenticate, currentAuth } from '../../middleware/authenticate.js';
import { tournamentIdParams } from '../tournaments/tournament.schemas.js';
import {
  createPlayerGroupSchema,
  createPlayerSchema,
  playerGroupParams,
  playerParams,
  playerStandingVisibilitySchema,
  renamePlayerSchema,
  setPlayerGroupMembersSchema,
} from './player.schemas.js';
import {
  createPlayer,
  createPlayerGroup,
  deletePlayer,
  deletePlayerGroup,
  listPlayerGroups,
  listPlayers,
  renamePlayer,
  setPlayerGroupMembers,
  setPlayerStandingVisibility,
} from './player.service.js';

/** Mounted below `/api/tournaments/:tournamentId/players`. */
export const playerRouter = Router({ mergeParams: true });

/** All players of the tournament, sorted by name. */
playerRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const players = await listPlayers(tournamentId);

  res.json({ data: players });
});

playerRouter.get('/groups', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const groups = await listPlayerGroups(tournamentId);
  res.json({ data: groups });
});

playerRouter.post('/groups', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const { name } = createPlayerGroupSchema.parse(req.body ?? {});
  const group = await withTournamentLock(tournamentId, () =>
    createPlayerGroup(tournamentId, name, currentAuth(req).role),
  );
  res.status(201).json({ data: group });
});

playerRouter.put('/groups/:groupId/players', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, groupId } = playerGroupParams.parse(req.params);
  const { playerNames } = setPlayerGroupMembersSchema.parse(req.body ?? {});
  const group = await withTournamentLock(tournamentId, () =>
    setPlayerGroupMembers(tournamentId, groupId, playerNames, currentAuth(req).role),
  );
  res.json({ data: group });
});

playerRouter.delete('/groups/:groupId', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, groupId } = playerGroupParams.parse(req.params);
  await withTournamentLock(tournamentId, () =>
    deletePlayerGroup(tournamentId, groupId, currentAuth(req).role),
  );
  res.status(204).end();
});

/**
 * Admin only: adds a player (a name) to the tournament. The roster decides who
 * may be put on a list, so it is grown by the admin – reading it stays open to
 * both roles.
 */
playerRouter.post('/', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const body = createPlayerSchema.parse(req.body ?? {});
  const player = await withTournamentLock(tournamentId, () =>
    createPlayer(tournamentId, body, currentAuth(req).role),
  );

  res.status(201).json({ data: player });
});

/** Admin only: includes or excludes a player from standings and their history. */
playerRouter.patch('/:playerName/standing-visibility', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, playerName } = playerParams.parse(req.params);
  const { hiddenFromStandings } = playerStandingVisibilitySchema.parse(req.body ?? {});
  const player = await withTournamentLock(tournamentId, () =>
    setPlayerStandingVisibility(
      tournamentId,
      playerName,
      hiddenFromStandings,
      currentAuth(req).role,
    ),
  );

  res.json({ data: player });
});

/**
 * Admin only: corrects the name of a player. The name identifies a player, so
 * this is the only way to fix a typo – a player who plays cannot be deleted.
 */
playerRouter.patch('/:playerName', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, playerName } = playerParams.parse(req.params);
  const { name } = renamePlayerSchema.parse(req.body ?? {});
  const player = await withTournamentLock(tournamentId, () =>
    renamePlayer(tournamentId, playerName, name, currentAuth(req).role),
  );

  res.json({ data: player });
});

/** Admin only: removes a player – only while they are not part of any list. */
playerRouter.delete('/:playerName', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, playerName } = playerParams.parse(req.params);
  await withTournamentLock(tournamentId, () =>
    deletePlayer(tournamentId, playerName, currentAuth(req).role),
  );

  res.status(204).end();
});
