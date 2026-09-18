import { Router } from 'express';
import { authenticate, currentAuth } from '../../middleware/authenticate.js';
import { gameSchema } from './game.schemas.js';
import { createGame, deleteGame, getGame, listGames, replaceGame } from './game.service.js';
import { gameParams, gamesParams } from './params.js';

/** Mounted below `/api/tournaments/:tournamentId/lists/:listId/games`. */
export const gameRouter = Router({ mergeParams: true });

gameRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentId, listId } = gamesParams.parse(req.params);
  const games = await listGames(tournamentId, listId);

  res.json({ data: games });
});

gameRouter.post('/', authenticate(), async (req, res) => {
  const { tournamentId, listId } = gamesParams.parse(req.params);
  const body = gameSchema.parse(req.body ?? {});
  const game = await createGame(tournamentId, listId, body, currentAuth(req).role);

  res.status(201).json({ data: game });
});

gameRouter.get('/:gameId', authenticate(), async (req, res) => {
  const { tournamentId, listId, gameId } = gameParams.parse(req.params);
  const game = await getGame(tournamentId, listId, gameId);

  res.json({ data: game });
});

/** Replaces a game completely – position and dealer of the round stay. */
gameRouter.put('/:gameId', authenticate(), async (req, res) => {
  const { tournamentId, listId, gameId } = gameParams.parse(req.params);
  const body = gameSchema.parse(req.body ?? {});
  const game = await replaceGame(tournamentId, listId, gameId, body, currentAuth(req).role);

  res.json({ data: game });
});

gameRouter.delete('/:gameId', authenticate(), async (req, res) => {
  const { tournamentId, listId, gameId } = gameParams.parse(req.params);
  await deleteGame(tournamentId, listId, gameId, currentAuth(req).role);

  res.status(204).end();
});
