import { Router } from 'express';
import { authenticate, currentAuth } from '../../middleware/authenticate.js';
import { tournamentIdParams } from '../tournaments/tournament.schemas.js';
import { createPlayerSchema, playerParams, renamePlayerSchema } from './player.schemas.js';
import { createPlayer, deletePlayer, listPlayers, renamePlayer } from './player.service.js';

/** Mounted below `/api/tournaments/:tournamentId/players`. */
export const playerRouter = Router({ mergeParams: true });

/** All players of the tournament, sorted by name. */
playerRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const players = await listPlayers(tournamentId);

  res.json({ data: players });
});

/**
 * Admin only: adds a player (a name) to the tournament. The roster decides who
 * may be put on a list, so it is grown by the admin – reading it stays open to
 * both roles.
 */
playerRouter.post('/', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const body = createPlayerSchema.parse(req.body ?? {});
  const player = await createPlayer(tournamentId, body, currentAuth(req).role);

  res.status(201).json({ data: player });
});

/**
 * Admin only: corrects the name of a player. The name identifies a player, so
 * this is the only way to fix a typo – a player who plays cannot be deleted.
 */
playerRouter.patch('/:playerName', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, playerName } = playerParams.parse(req.params);
  const { name } = renamePlayerSchema.parse(req.body ?? {});
  const player = await renamePlayer(tournamentId, playerName, name, currentAuth(req).role);

  res.json({ data: player });
});

/** Admin only: removes a player – only while they are not part of any list. */
playerRouter.delete('/:playerName', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, playerName } = playerParams.parse(req.params);
  await deletePlayer(tournamentId, playerName, currentAuth(req).role);

  res.status(204).end();
});
