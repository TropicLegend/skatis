import { Router } from 'express';
import { authenticate, currentAuth } from '../../middleware/authenticate.js';
import { gameRouter } from './game.routes.js';
import {
  createList,
  deleteList,
  getList,
  listLists,
  reopenList,
  submitList,
} from './list.service.js';
import { createListSchema, listListsQuery, listParams } from './list.schemas.js';
import { tournamentNameParams } from '../tournaments/tournament.schemas.js';

export const listRouter = Router({ mergeParams: true });

listRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentName } = tournamentNameParams.parse(req.params);
  const query = listListsQuery.parse(req.query);
  const result = await listLists(tournamentName, query);

  res.json({
    data: result.items,
    meta: { total: result.total, limit: result.limit, offset: result.offset },
  });
});

listRouter.post('/', authenticate(), async (req, res) => {
  const { tournamentName } = tournamentNameParams.parse(req.params);
  const body = createListSchema.parse(req.body ?? {});
  const list = await createList(tournamentName, body, currentAuth(req).role);

  res.status(201).json({ data: list });
});

listRouter.get('/:matchday', authenticate(), async (req, res) => {
  const { tournamentName, matchday } = listParams.parse(req.params);
  const list = await getList(tournamentName, matchday);

  res.json({ data: list });
});

/** Admin only: deletes the list including all its games. */
listRouter.delete('/:matchday', authenticate('ADMIN'), async (req, res) => {
  const { tournamentName, matchday } = listParams.parse(req.params);
  await deleteList(tournamentName, matchday);

  res.status(204).end();
});

/** Freezes the list – afterwards only an admin can change it. */
listRouter.post('/:matchday/submit', authenticate(), async (req, res) => {
  const { tournamentName, matchday } = listParams.parse(req.params);
  const list = await submitList(tournamentName, matchday, currentAuth(req).role);

  res.json({ data: list });
});

/** Admin only: reopens a submitted list for corrections. */
listRouter.post('/:matchday/reopen', authenticate('ADMIN'), async (req, res) => {
  const { tournamentName, matchday } = listParams.parse(req.params);
  const list = await reopenList(tournamentName, matchday);

  res.json({ data: list });
});

listRouter.use('/:matchday/games', gameRouter);
