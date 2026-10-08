import { Router } from 'express';
import { withTournamentLock } from '../../lib/keyed-lock.js';
import { authenticate, currentAuth } from '../../middleware/authenticate.js';
import { gameRouter } from './game.routes.js';
import { previewNextRound } from './game.service.js';
import {
  createList,
  deleteList,
  getList,
  getListProgression,
  getListResults,
  listLists,
  reopenList,
  setListPlayers,
  submitList,
  updateList,
} from './list.service.js';
import {
  createListSchema,
  listListsQuery,
  setListPlayersSchema,
  updateListSchema,
} from './list.schemas.js';
import { listParams } from './params.js';
import { tournamentIdParams } from '../tournaments/tournament.schemas.js';

// Every change below runs under the lock of its tournament: the services check
// a rule and then write, and two changes that arrive together must not both
// pass the check (see `lib/keyed-lock.ts`).
export const listRouter = Router({ mergeParams: true });

listRouter.get('/', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const query = listListsQuery.parse(req.query);
  const result = await listLists(tournamentId, query, currentAuth(req).role);

  res.json({
    data: result.items,
    meta: {
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      // Auswahlwerte für die Oberfläche: welche Spieltage und Serien es gibt.
      facets: result.facets,
    },
  });
});

listRouter.post('/', authenticate(), async (req, res) => {
  const { tournamentId } = tournamentIdParams.parse(req.params);
  const body = createListSchema.parse(req.body ?? {});
  const list = await withTournamentLock(tournamentId, () =>
    createList(tournamentId, body, currentAuth(req).role),
  );

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

/**
 * The round a new game would create: the Geber and the three players who may be
 * the Alleinspieler ("Geber-Regel"). Readable by both roles – the rule lives in
 * the API, so a frontend does not have to reproduce it.
 */
listRouter.get('/:listId/next-round', authenticate(), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const preview = await previewNextRound(tournamentId, listId);

  res.json({ data: preview });
});

/**
 * The account of every player after every round – the data behind the
 * progression chart and the "Spielstand" of a single game. Readable by both
 * roles, also after the list was submitted.
 */
listRouter.get('/:listId/progression', authenticate(), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const progression = await getListProgression(tournamentId, listId);

  res.json({ data: progression });
});

/** Members may delete an empty open list; deleting games with a list is admin-only. */
listRouter.delete('/:listId', authenticate(), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  await withTournamentLock(tournamentId, () =>
    deleteList(tournamentId, listId, currentAuth(req).role),
  );

  res.status(204).end();
});

/**
 * Admin only: corrects "Serie" and "Tisch" of a list – a member may have picked
 * the wrong table. The lineup, the games and the matchday stay untouched.
 */
listRouter.patch('/:listId', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const body = updateListSchema.parse(req.body ?? {});
  const list = await withTournamentLock(tournamentId, () =>
    updateList(tournamentId, listId, body, currentAuth(req).role),
  );

  res.json({ data: list });
});

/** Freezes the list – afterwards members can no longer change it. */
listRouter.post('/:listId/submit', authenticate(), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const list = await withTournamentLock(tournamentId, () =>
    submitList(tournamentId, listId, currentAuth(req).role),
  );

  res.json({ data: list });
});

/** Admin only: reopens a submitted list so members can edit it again. */
listRouter.post('/:listId/reopen', authenticate('ADMIN'), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const list = await withTournamentLock(tournamentId, () =>
    reopenList(tournamentId, listId, currentAuth(req).role),
  );

  res.json({ data: list });
});

/**
 * Replaces the players of the list – they have to belong to the tournament.
 * They are the lineup of the list, so they play every game of it.
 */
listRouter.put('/:listId/players', authenticate(), async (req, res) => {
  const { tournamentId, listId } = listParams.parse(req.params);
  const { playerNames } = setListPlayersSchema.parse(req.body ?? {});
  const list = await withTournamentLock(tournamentId, () =>
    setListPlayers(tournamentId, listId, playerNames, currentAuth(req).role),
  );

  res.json({ data: list });
});

listRouter.use('/:listId/games', gameRouter);
