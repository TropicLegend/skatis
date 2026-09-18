import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { tournamentIdParams } from '../tournaments/tournament.schemas.js';
import { createPlayerSchema, playerParams } from './player.schemas.js';
import { createPlayer, deletePlayer, listPlayers } from './player.service.js';

/** Mounted below `/api/tournaments/:tournamentId/players`. */
export const playerRouter = Router({ mergeParams: true });

/** All players of the tournament, sorted by name. */
playerRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const players = await listPlayers(tournamentId);

  res.json({ data: players });
});

/** Adds a player (a name) to the tournament. */
playerRouter.post('/', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const body = createPlayerSchema.parse(req.body ?? {});
  const player = await createPlayer(tournamentId, body);

  res.status(201).json({ data: player });
});

/** Removes a player – only while they are not part of any list. */
playerRouter.delete('/:playerName', authenticate(), async (req, res) => {
  const { tournamentId, playerName } = playerParams.parse(req.params);
  await deletePlayer(tournamentId, playerName);

  res.status(204).end();
});
