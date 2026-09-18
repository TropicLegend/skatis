import { z } from 'zod';
import { isoDateSchema } from '../tournaments/tournament.schemas.js';
import { createGameSchema } from './game.schemas.js';

export const listParams = z.object({
  tournamentName: z.string().trim().min(1).max(64),
  matchday: isoDateSchema,
});

export const createListSchema = z
  .object({
    matchday: isoDateSchema,
    games: z.array(createGameSchema).max(200).optional(),
  })
  .refine(
    (list) => {
      const positions = (list.games ?? [])
        .map((game) => game.position)
        .filter((position): position is number => position !== undefined);
      return new Set(positions).size === positions.length;
    },
    { message: 'Game positions must be unique', path: ['games'] },
  );

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
