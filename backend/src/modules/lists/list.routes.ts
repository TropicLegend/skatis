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
import {
  createListSchema,
  listListsQuery,
  listParams,
  setListPlayersSchema,
} from './list.schemas.js';
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

listRouter.get('/:matchday', authenticate(), async (req, res) => {
  const { tournamentId, matchday } = listParams.parse(req.params);
  const list = await getList(tournamentId, matchday, currentAuth(req).role);

  res.json({ data: list });
});

/**
 * The result table of the list, derived from its games. Readable by both
 * roles, also after the list was submitted.
 */
listRouter.get('/:matchday/results', authenticate(), async (req, res) => {
  const { tournamentId, matchday } = listParams.parse(req.params);
  const results = await getListResults(tournamentId, matchday);

  res.json({ data: results });
});

/** Admin only: deletes the list including all its games. */
listRouter.delete('/:matchday', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, matchday } = listParams.parse(req.params);
  await deleteList(tournamentId, matchday);

  res.status(204).end();
});

/** Freezes the list – afterwards members can no longer change it. */
listRouter.post('/:matchday/submit', authenticate(), async (req, res) => {
  const { tournamentId, matchday } = listParams.parse(req.params);
  const list = await submitList(tournamentId, matchday, currentAuth(req).role);

  res.json({ data: list });
});

/** Admin only: reopens a submitted list so members can edit it again. */
listRouter.post('/:matchday/reopen', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, matchday } = listParams.parse(req.params);
  const list = await reopenList(tournamentId, matchday, currentAuth(req).role);

  res.json({ data: list });
});

/**
 * Replaces the players of the list – they have to belong to the tournament.
 * They are the lineup of the matchday, so they play every game of the list.
 */
listRouter.put('/:matchday/players', authenticate(), async (req, res) => {
  const { tournamentId, matchday } = listParams.parse(req.params);
  const { playerNames } = setListPlayersSchema.parse(req.body ?? {});
  const list = await setListPlayers(tournamentId, matchday, playerNames, currentAuth(req).role);

  res.json({ data: list });
});

listRouter.use('/:matchday/games', gameRouter);
