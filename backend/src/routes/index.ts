import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { tournamentActionsRouter } from '../modules/tournaments/tournament-actions.routes.js';
import { tournamentRouter } from '../modules/tournaments/tournament.routes.js';

export const apiRouter = Router();

/** Small discovery document – handy when opening the API in a browser. */
apiRouter.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'skatis-api',
      version: '0.2.0',
      endpoints: {
        health: '/api/health',
        createTournament: 'POST /api/createTournament',
        loginTournament: 'POST /api/loginTournament',
        tournaments: 'GET /api/tournaments',
        tournament: 'GET /api/tournaments/:tournamentId',
        session: 'GET /api/tournaments/:tournamentId/session',
        lists: '/api/tournaments/:tournamentId/lists',
        games: '/api/tournaments/:tournamentId/lists/:matchday/games',
      },
    },
  });
});

apiRouter.use('/health', healthRouter);
apiRouter.use('/', tournamentActionsRouter);
apiRouter.use('/tournaments', tournamentRouter);
