import { Router } from 'express';
import { authenticate, currentAuth } from '../../middleware/authenticate.js';
import { createGame, deleteGame, listGames, updateGame } from './game.service.js';
import { createGameSchema, gameParams, updateGameSchema } from './game.schemas.js';

export const gameRouter = Router({ mergeParams: true });

gameRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentName, matchday } = gameParams.parse(req.params);
  const games = await listGames(tournamentName, matchday);

  res.json({ data: games });
});

gameRouter.post('/', authenticate(), async (req, res) => {
  const { tournamentName, matchday } = gameParams.parse(req.params);
  const body = createGameSchema.parse(req.body ?? {});
  const game = await createGame(tournamentName, matchday, body, currentAuth(req).role);

  res.status(201).json({ data: game });
});

gameRouter.patch('/:gameId', authenticate(), async (req, res) => {
  const { tournamentName, matchday, gameId } = gameParams.parse(req.params);
  const body = updateGameSchema.parse(req.body ?? {});
  const game = await updateGame(tournamentName, matchday, gameId, body, currentAuth(req).role);

  res.json({ data: game });
});

gameRouter.delete('/:gameId', authenticate(), async (req, res) => {
  const { tournamentName, matchday, gameId } = gameParams.parse(req.params);
  await deleteGame(tournamentName, matchday, gameId, currentAuth(req).role);

  res.status(204).end();
});
