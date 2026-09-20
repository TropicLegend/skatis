import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { rulesRouter } from '../modules/rules/rules.routes.js';
import { tournamentRouter } from '../modules/tournaments/tournament.routes.js';

export const apiRouter = Router();

/** Small discovery document – handy when opening the API in a browser. */
apiRouter.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'skatis-api',
      version: '0.9.0',
      documentation: 'https://github.com/TropicLegend/skatis/blob/main/backend/README.md',
      endpoints: {
        health: 'GET /api/health',
        rules: 'GET /api/rules',
        createTournament: 'POST /api/tournaments',
        openSession: 'POST /api/tournaments/:tournamentId/session',
        tournaments: 'GET /api/tournaments',
        tournament: 'GET /api/tournaments/:tournamentId',
        session: 'GET /api/tournaments/:tournamentId/session',
        standings: 'GET /api/tournaments/:tournamentId/standings',
        log: 'GET /api/tournaments/:tournamentId/log',
        players: 'GET|POST /api/tournaments/:tournamentId/players',
        player: 'PATCH|DELETE /api/tournaments/:tournamentId/players/:playerName',
        lists: 'GET|POST /api/tournaments/:tournamentId/lists',
        list: 'GET|DELETE /api/tournaments/:tournamentId/lists/:listId',
        lineup: 'PUT /api/tournaments/:tournamentId/lists/:listId/players',
        submit: 'POST /api/tournaments/:tournamentId/lists/:listId/submit',
        reopen: 'POST /api/tournaments/:tournamentId/lists/:listId/reopen',
        results: 'GET /api/tournaments/:tournamentId/lists/:listId/results',
        nextRound: 'GET /api/tournaments/:tournamentId/lists/:listId/next-round',
        games: 'GET|POST /api/tournaments/:tournamentId/lists/:listId/games',
        game: 'GET|PUT|DELETE /api/tournaments/:tournamentId/lists/:listId/games/:gameId',
      },
    },
  });
});

apiRouter.use('/health', healthRouter);
apiRouter.use('/rules', rulesRouter);
apiRouter.use('/tournaments', tournamentRouter);
