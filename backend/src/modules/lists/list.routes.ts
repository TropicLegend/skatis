import { Router } from 'express';
import { authenticate, currentAuth } from '../../middleware/authenticate.js';
import { gameRouter } from './game.routes.js';
import {
  createList,
  deleteList,
  getList,
  getListResults,
  listLists,
  reopenList,
  setListPlayers,
  submitList,
} from './list.service.js';
import { createListSchema, listListsQuery, setListPlayersSchema } from './list.schemas.js';
import { listParams } from './params.js';
import { tournamentIdParams } from '../tournaments/tournament.schemas.js';

export const listRouter = Router({ mergeParams: true });

listRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const query = listListsQuery.parse(req.query);
  const result = await listLists(tournamentId, query, currentAuth(req).role);

  res.json({
    data: result.items,
    meta: { total: result.total, limit: result.limit, offset: result.offset },
  });
});

listRouter.post('/', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const body = createListSchema.parse(req.body ?? {});
  const list = await createList(tournamentId, body, currentAuth(req).role);

  res.status(201).json({ data: list });
});

listRouter.get('/:listId', authenticate(), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const list = await getList(tournamentId, listId, currentAuth(req).role);

  res.json({ data: list });
});

/**
 * The result table of the list, derived from its games. Readable by both
 * roles, also after the list was submitted.
 */
listRouter.get('/:listId/results', authenticate(), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const results = await getListResults(tournamentId, listId);

  res.json({ data: results });
});

/** Admin only: deletes the list including all its games. */
listRouter.delete('/:listId', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  await deleteList(tournamentId, listId);

  res.status(204).end();
});

/** Freezes the list – afterwards members can no longer change it. */
listRouter.post('/:listId/submit', authenticate(), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const list = await submitList(tournamentId, listId, currentAuth(req).role);

  res.json({ data: list });
});

/** Admin only: reopens a submitted list so members can edit it again. */
listRouter.post('/:listId/reopen', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const list = await reopenList(tournamentId, listId, currentAuth(req).role);

  res.json({ data: list });
});

/**
 * Replaces the players of the list – they have to belong to the tournament.
 * They are the lineup of the list, so they play every game of it.
 */
listRouter.put('/:listId/players', authenticate(), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const { playerNames } = setListPlayersSchema.parse(req.body ?? {});
  const list = await setListPlayers(tournamentId, listId, playerNames, currentAuth(req).role);

  res.json({ data: list });
});

listRouter.use('/:listId/games', gameRouter);
