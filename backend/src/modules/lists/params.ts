import { z } from 'zod';
import { tournamentIdSchema } from '../tournaments/tournament.schemas.js';

/**
 * Route parameters of the lists and their games.
 *
 * They live in their own module because a list and a game schema would
 * otherwise import each other: `list.schemas.ts` needs the game payload for
 * `POST /lists` and `game.schemas.ts` needs the id of a list.
 */

/**
 * Public id of a list. It is not validated any further, so an id that does not
 * exist is answered with 404 and not with 422.
 */
export const listIdSchema = z.string().trim().min(1).max(64);

/** Route parameters of a single list. */
export const listParams = z.object({
  tournamentId: tournamentIdSchema,
  listId: listIdSchema,
});

/** Route parameters of the games of a list. */
export const gamesParams = z.object({
  tournamentId: tournamentIdSchema,
  listId: listIdSchema,
});

/** Route parameters of a single game. */
export const gameParams = gamesParams.extend({
  gameId: z.string().trim().min(1).max(64),
});
