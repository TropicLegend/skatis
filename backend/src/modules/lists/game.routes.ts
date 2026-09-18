import { Router } from 'express';
import { authenticate, currentAuth } from '../../middleware/authenticate.js';
import { createGame, deleteGame, getGame, listGames, replaceGame } from './game.service.js';
import { gameParams, gameSchema, gamesParams } from './game.schemas.js';

export const gameRouter = Router({ mergeParams: true });

gameRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentId, matchday } = gamesParams.parse(req.params);
  const games = await listGames(tournamentId, matchday);

  res.json({ data: games });
});

gameRouter.get('/:gameId', authenticate(), async (req, res) => {
  const { tournamentId, matchday, gameId } = gameParams.parse(req.params);
  const game = await getGame(tournamentId, matchday, gameId);

  res.json({ data: game });
});

gameRouter.post('/', authenticate(), async (req, res) => {
  const { tournamentId, matchday } = gamesParams.parse(req.params);
  const body = gameSchema.parse(req.body ?? {});
  const game = await createGame(tournamentId, matchday, body, currentAuth(req).role);

  res.status(201).json({ data: game });
});

/** Replaces a game completely – position and dealer of the round stay. */
gameRouter.put('/:gameId', authenticate(), async (req, res) => {
  const { tournamentId, matchday, gameId } = gameParams.parse(req.params);
  const body = gameSchema.parse(req.body ?? {});
  const game = await replaceGame(tournamentId, matchday, gameId, body, currentAuth(req).role);

  res.json({ data: game });
});

gameRouter.delete('/:gameId', authenticate(), async (req, res) => {
  const { tournamentId, matchday, gameId } = gameParams.parse(req.params);
  await deleteGame(tournamentId, matchday, gameId, currentAuth(req).role);

  res.status(204).end();
});
