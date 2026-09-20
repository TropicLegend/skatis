import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { rulesRouter } from '../modules/rules/rules.routes.js';
import { tournamentRouter } from '../modules/tournaments/tournament.routes.js';

/**
 * The version of the package. It is read from `package.json` instead of being
 * written down a second time, so the discovery document can never report a
 * version the deployed code does not have. `src/routes` and `dist/routes` are
 * both two levels below the project root; a missing file is not worth an aborted
 * start, the discovery document then simply has no version.
 */
function packageVersion(): string {
  const fallback = '0.0.0';

  try {
    const path = fileURLToPath(new URL('../../package.json', import.meta.url));
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version?: string };
    return parsed.version ?? fallback;
  } catch {
    return fallback;
  }
}

const API_VERSION = packageVersion();

export const apiRouter = Router();

/** Small discovery document – handy when opening the API in a browser. */
apiRouter.get('/', (_req, res) => {
  res.json({
    data: {
      name: 'skatis-api',
      version: API_VERSION,
      documentation: 'https://github.com/TropicLegend/skatis/blob/main/backend/README.md',
      endpoints: {
        health: 'GET /api/health',
        rules: 'GET /api/rules',
        createTournament: 'POST /api/tournaments',
        openSession: 'POST /api/tournaments/:tournamentId/session',
        endSession: 'POST /api/tournaments/:tournamentId/session/logout',
        tournaments: 'GET /api/tournaments',
        tournament: 'GET /api/tournaments/:tournamentId',
        session: 'GET /api/tournaments/:tournamentId/session',
        standings: 'GET /api/tournaments/:tournamentId/standings',
        standingsHistory: 'GET /api/tournaments/:tournamentId/standings/history',
        playerStats: 'GET /api/tournaments/:tournamentId/standings/players/:playerName',
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
