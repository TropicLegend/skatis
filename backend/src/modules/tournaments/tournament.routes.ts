import { Router } from 'express';
import { authenticate, currentAuth } from '../../middleware/authenticate.js';
import { listRouter } from '../lists/list.routes.js';
import { playerRouter } from '../players/player.routes.js';
import {
  deleteTournament,
  getTournament,
  listTournaments,
  updateTournament,
} from './tournament.service.js';
import {
  listTournamentsQuery,
  tournamentIdParams,
  updateTournamentSchema,
} from './tournament.schemas.js';

export const tournamentRouter = Router();

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
