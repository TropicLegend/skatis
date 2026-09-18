import { Router } from 'express';
import { unauthorized } from '../../lib/http-error.js';
import { issueSessionToken } from '../../lib/tokens.js';
import { authenticate } from '../../middleware/authenticate.js';
import { listRouter } from '../lists/list.routes.js';
import {
  authenticateTournament,
  createTournament,
  deleteTournament,
  getTournament,
  listTournaments,
  updateTournament,
} from './tournament.service.js';
import {
  createSessionSchema,
  createTournamentSchema,
  listTournamentsQuery,
  tournamentNameParams,
  updateTournamentSchema,
} from './tournament.schemas.js';

export const tournamentRouter = Router();

/** Creates a tournament. The name has to be unique. */
tournamentRouter.post('/', async (req, res) => {
  const body = createTournamentSchema.parse(req.body ?? {});
  const tournament = await createTournament(body);
  res.status(201).json({ data: tournament });
});

tournamentRouter.get('/', async (req, res) => {
  const query = listTournamentsQuery.parse(req.query);
  const result = await listTournaments(query);
  res.json({
    data: result.items,
    meta: { total: result.total, limit: result.limit, offset: result.offset },
  });
});

/** Exchanges one of the two tournament passwords for a session token. */
tournamentRouter.post('/:tournamentName/sessions', async (req, res) => {
  const { tournamentName } = tournamentNameParams.parse(req.params);
  const { password } = createSessionSchema.parse(req.body ?? {});

  const authentication = await authenticateTournament(tournamentName, password);
  if (!authentication) {
    throw unauthorized('Invalid password');
  }

  const { token, expiresAt } = issueSessionToken(tournamentName, authentication.role);
  const tournament = await getTournament(tournamentName);

  res.json({
    data: {
      token,
      role: authentication.role,
      expiresAt: expiresAt.toISOString(),
      tournament,
    },
  });
});

tournamentRouter.get('/:tournamentName', async (req, res) => {
  const { tournamentName } = tournamentNameParams.parse(req.params);
  const tournament = await getTournament(tournamentName);
  res.json({ data: tournament });
});

/** Admin only: change the matchdays and/or the passwords. */
tournamentRouter.patch('/:tournamentName', authenticate('ADMIN'), async (req, res) => {
  const { tournamentName } = tournamentNameParams.parse(req.params);
  const body = updateTournamentSchema.parse(req.body ?? {});
  const tournament = await updateTournament(tournamentName, body);
  res.json({ data: tournament });
});

/** Admin only: deletes the tournament including all lists and games. */
tournamentRouter.delete('/:tournamentName', authenticate('ADMIN'), async (req, res) => {
  const { tournamentName } = tournamentNameParams.parse(req.params);
  await deleteTournament(tournamentName);
  res.status(204).end();
});

tournamentRouter.use('/:tournamentName/lists', listRouter);
