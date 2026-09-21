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
 * Admin correction of the head of the sheet: a member may have written the
 * wrong table or series. Both numbers keep their range, and at least one of
 * them has to be sent – an empty change would only create a log entry.
 *
 * The matchday is deliberately not part of this: it decides whether the list
 * counts for the standing, so it must not move under its games.
 */
export const updateListSchema = z
  .strictObject({
    series: seriesSchema.optional(),
    table: tableSchema.optional(),
  })
  .refine((value) => value.series !== undefined || value.table !== undefined, {
    message: 'Provide a serie and/or a table',
  });

/**
 * Replaces the players of a list. Only players of the same tournament are
 * accepted, and only while the list has no games yet – the lineup decides who
 * deals in which round.
 */
export const setListPlayersSchema = z.object({
  playerNames: lineupSchema,
});

/** A query string never contains a boolean – `false` would be truthy. */
const booleanQuery = z.enum(['true', 'false']).transform((value) => value === 'true');

export const listListsQuery = z
  .object({
    /** Exactly this matchday – the evening with all its tables. */
    matchday: isoDateSchema.optional(),
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    /** Only this "Serie" – to find the sheets of one series of an evening. */
    series: seriesSchema.optional(),
    status: z.enum(['OPEN', 'SUBMITTED']).optional(),
    /**
     * Whether the list counts for the standing: handed in, or of a day that is
     * over. Unlike `status` this asks what the list means now, not what is
     * stored – a list of a past day counts while its status is still `OPEN`.
     */
    counted: booleanQuery.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: '"from" must not be later than "to"',
    path: ['from'],
  });

export type CreateListInput = z.infer<typeof createListSchema>;
export type UpdateListInput = z.infer<typeof updateListSchema>;
export type ListListsQuery = z.infer<typeof listListsQuery>;
