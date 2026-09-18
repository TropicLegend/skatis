import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { tournamentRouter } from '../modules/tournaments/tournament.routes.js';

export const apiRouter = Router();

/** Small discovery document – handy when opening the API in a browser. */
apiRouter.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'skatis-api',
      version: '0.1.0',
      endpoints: {
        health: '/api/health',
        tournaments: '/api/tournaments',
        sessions: 'POST /api/tournaments/:tournamentName/sessions',
        lists: '/api/tournaments/:tournamentName/lists',
        games: '/api/tournaments/:tournamentName/lists/:matchday/games',
      },
    },
  });
});

apiRouter.use('/health', healthRouter);
apiRouter.use('/tournaments', tournamentRouter);
