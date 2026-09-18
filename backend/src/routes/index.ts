import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { tournamentRouter } from '../modules/tournaments/tournament.routes.js';

export const apiRouter = Router();

/** Small discovery document – handy when opening the API in a browser. */
apiRouter.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'skatis-api',
      version: '0.5.0',
      documentation: 'https://github.com/TropicLegend/skatis/blob/main/backend/README.md',
      endpoints: {
        health: 'GET /api/health',
        createTournament: 'POST /api/tournaments',
        openSession: 'POST /api/tournaments/:tournamentId/session',
        tournaments: 'GET /api/tournaments',
        tournament: 'GET /api/tournaments/:tournamentId',
        session: 'GET /api/tournaments/:tournamentId/session',
        standings: 'GET /api/tournaments/:tournamentId/standings',
        players: 'GET|POST /api/tournaments/:tournamentId/players',
        player: 'PATCH|DELETE /api/tournaments/:tournamentId/players/:playerName',
        lists: 'GET|POST /api/tournaments/:tournamentId/lists',
        list: 'GET|DELETE /api/tournaments/:tournamentId/lists/:matchday',
        lineup: 'PUT /api/tournaments/:tournamentId/lists/:matchday/players',
        submit: 'POST /api/tournaments/:tournamentId/lists/:matchday/submit',
        reopen: 'POST /api/tournaments/:tournamentId/lists/:matchday/reopen',
        results: 'GET /api/tournaments/:tournamentId/lists/:matchday/results',
        games: 'GET|POST /api/tournaments/:tournamentId/lists/:matchday/games',
        game: 'GET|PUT|DELETE /api/tournaments/:tournamentId/lists/:matchday/games/:gameId',
      },
    },
  });
});

apiRouter.use('/health', healthRouter);
apiRouter.use('/tournaments', tournamentRouter);
