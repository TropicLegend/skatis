import { Router } from 'express';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/http-error.js';
import { issueSessionToken } from '../../lib/tokens.js';
import { authenticate, currentAuth } from '../../middleware/authenticate.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { listRouter } from '../lists/list.routes.js';
import { playerRouter } from '../players/player.routes.js';
import {
  authenticateTournament,
  createTournament,
  deleteTournament,
  getTournament,
  getTournamentStandings,
  listTournaments,
  updateTournament,
} from './tournament.service.js';
import {
  createTournamentSchema,
  listTournamentsQuery,
  openSessionSchema,
  tournamentIdParams,
  updateTournamentSchema,
} from './tournament.schemas.js';

export const tournamentRouter = Router();

/** The two endpoints a session starts with need no token, so they are limited. */
const createLimiter = rateLimit('create', env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS);
const loginLimiter = rateLimit('login', env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS);

/**
 * Creates a tournament from the name, both passwords and the matchdays.
 *
 * The response contains the generated `id` – show it in the frontend right
 * after creation, because it is required to log in afterwards.
 */
tournamentRouter.post('/', createLimiter, async (req, res) => {
  const body = createTournamentSchema.parse(req.body ?? {});
  const tournament = await createTournament(body);

  res.status(201).json({ data: tournament });
});

/**
 * The tournaments the presented token grants access to. Tokens are bound to a
 * single tournament, so this lists exactly that one – unauthenticated callers
 * cannot discover tournaments they do not have a password for.
 */
tournamentRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentId } = currentAuth(req);
  const query = listTournamentsQuery.parse(req.query);
  const result = await listTournaments(query, tournamentId);

  res.json({
    data: result.items,
    meta: { total: result.total, limit: result.limit, offset: result.offset },
  });
});

/**
 * Opens a session: someone proves with the tournament id and one of the two
 * passwords who they are. Which password was used decides the role inside the
 * returned token.
 */
tournamentRouter.post('/:tournamentId/session', loginLimiter, async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const { password } = openSessionSchema.parse(req.body ?? {});

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

/** Details of the tournament – any of its two roles may read them. */
tournamentRouter.get('/:tournamentId', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const tournament = await getTournament(tournamentId);

  res.json({ data: tournament });
});

/**
 * Returns the identity behind the presented token – useful for a frontend that
 * has a token in local storage and wants to know whether it is still valid.
 */
tournamentRouter.get('/:tournamentId/session', authenticate(), (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const auth = currentAuth(req);

  res.json({ data: { tournamentId, role: auth.role } });
});

/**
 * The standing of the tournament over all matchdays that were submitted,
 * ranked by the average points per game. See `standings.ts`.
 */
tournamentRouter.get('/:tournamentId/standings', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const standings = await getTournamentStandings(tournamentId);

  res.json({ data: standings });
});

/** Admin only: change the name, the matchdays and/or the passwords. */
tournamentRouter.patch('/:tournamentId', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const body = updateTournamentSchema.parse(req.body ?? {});
  const tournament = await updateTournament(tournamentId, body);

  res.json({ data: tournament });
});

/** Admin only: deletes the tournament including all lists and games. */
tournamentRouter.delete('/:tournamentId', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  await deleteTournament(tournamentId);

  res.status(204).end();
});

tournamentRouter.use('/:tournamentId/players', playerRouter);
tournamentRouter.use('/:tournamentId/lists', listRouter);
