import { z } from 'zod';
import { lineupSchema } from '../players/player.schemas.js';
import { isoDateSchema } from '../tournaments/tournament.schemas.js';
import { gameSchema } from './game.schemas.js';

/**
 * "Serie" and "Tisch" of the sheet – both are numbers from the head of the
 * printed table and both are required, because a tournament without several
 * series or tables still names the one it has.
 */
export const seriesSchema = z.coerce
  .number()
  .int()
  .min(1, 'Serie must be at least 1')
  .max(999, 'Serie must be at most 999');

export const tableSchema = z.coerce
  .number()
  .int()
  .min(1, 'Tisch must be at least 1')
  .max(999, 'Tisch must be at most 999');

export const createListSchema = z.object({
  matchday: isoDateSchema,
  series: seriesSchema,
  table: tableSchema,
  /** The lineup of the table in seating order (3, 4 or 5 names). */
  playerNames: lineupSchema.optional(),
  /** Games are appended in order – the API assigns the round numbers. */
  games: z.array(gameSchema).max(200).optional(),
});

/**
 * Replaces the players of a list. Only players of the same tournament are
 * accepted, and only while the list has no games yet – the lineup decides who
 * deals in which round.
 */
export const setListPlayersSchema = z.object({
  playerNames: lineupSchema,
});

export const listListsQuery = z
  .object({
    /** Exactly this matchday – the evening with all its tables. */
    matchday: isoDateSchema.optional(),
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
