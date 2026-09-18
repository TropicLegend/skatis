import { Router } from 'express';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/http-error.js';
import { issueSessionToken } from '../../lib/tokens.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { createTournamentSchema, loginTournamentSchema } from './tournament.schemas.js';
import { authenticateTournament, createTournament, getTournament } from './tournament.service.js';

/**
 * The two endpoints a frontend needs before anyone is logged in. They are
 * mounted at the API root and therefore addressed as
 * `POST /api/createTournament` and `POST /api/loginTournament`.
 *
 * Both need no token, so both are rate limited per caller address.
 */
export const tournamentActionsRouter = Router();

const createLimiter = rateLimit('create', env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS);
const loginLimiter = rateLimit('login', env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS);

/**
 * Creates a tournament from the name, both passwords and the matchdays.
 *
 * The response contains the generated `id` – show it in the frontend right
 * after creation, because it is required to log in afterwards.
 */
tournamentActionsRouter.post('/createTournament', createLimiter, async (req, res) => {
  const body = createTournamentSchema.parse(req.body ?? {});
  const tournament = await createTournament(body);

  res.status(201).json({ data: tournament });
});

/**
 * Logs in with the tournament id and one of the two passwords. Which password
 * was used decides the role inside the returned session token.
 */
tournamentActionsRouter.post('/loginTournament', loginLimiter, async (req, res) => {
  const { tournamentId, password } = loginTournamentSchema.parse(req.body ?? {});

  const authentication = await authenticateTournament(tournamentId, password);
  if (!authentication) {
    throw unauthorized('Invalid tournament id or password');
  }

  const { token, expiresAt } = issueSessionToken(tournamentId, authentication.role);
  const tournament = await getTournament(tournamentId);

  res.json({
    data: {
      tournamentId: tournament.id,
      role: authentication.role,
      token,
      expiresAt: expiresAt.toISOString(),
      tournament,
    },
  });
});
