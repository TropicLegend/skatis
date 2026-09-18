import { z } from 'zod';
import { lineupSchema } from '../players/player.schemas.js';
import { isoDateSchema, tournamentIdSchema } from '../tournaments/tournament.schemas.js';
import { gameSchema } from './game.schemas.js';

export const listParams = z.object({
  tournamentId: tournamentIdSchema,
  matchday: isoDateSchema,
});

export const createListSchema = z.object({
  matchday: isoDateSchema,
  /** The lineup of the matchday in seating order (3, 4 or 5 players). */
  playerIds: lineupSchema.optional(),
  /** Games are appended in order – the API assigns the round numbers. */
  games: z.array(gameSchema).max(200).optional(),
});

/**
 * Replaces the players of a list. Only players of the same tournament are
 * accepted, and only while the list has no games yet – the lineup decides who
 * deals in which round.
 */
export const setListPlayersSchema = z.object({
  playerIds: lineupSchema,
});

export const listListsQuery = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    status: z.enum(['OPEN', 'SUBMITTED']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: '"from" must not be later than "to"',
    path: ['from'],
  });

export type CreateListInput = z.infer<typeof createListSchema>;
export type ListListsQuery = z.infer<typeof listListsQuery>;
