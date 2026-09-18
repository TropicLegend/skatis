import { z } from 'zod';
import { MAX_LINEUP, MIN_LINEUP } from '../lists/game-rules.js';
import { tournamentIdSchema } from '../tournaments/tournament.schemas.js';

/**
 * A player is a name inside a tournament – players have no id. The name is
 * unique per tournament, which makes it the handle for everything: the lineup,
 * the declarer and the players recorded in a game.
 */
export const playerNameSchema = z
  .string()
  .trim()
  .min(1, 'A player name is required')
  .max(64, 'A player name must be at most 64 characters long');

export const createPlayerSchema = z.object({
  name: playerNameSchema,
});

export const playerParams = z.object({
  tournamentId: tournamentIdSchema,
  playerName: playerNameSchema,
});

const LINEUP_SIZE_MESSAGE = `A list consists of ${MIN_LINEUP}, ${MIN_LINEUP + 1} or ${MAX_LINEUP} players`;

/**
 * The lineup of a matchday: the names of the players of the tournament in
 * seating order. Player 1 deals in round 1, then player 2 and so on
 * (see README.md).
 */
export const lineupSchema = z
  .array(playerNameSchema)
  .min(MIN_LINEUP, LINEUP_SIZE_MESSAGE)
  .max(MAX_LINEUP, LINEUP_SIZE_MESSAGE)
  .refine(
    (names) => new Set(names).size === names.length,
    'A player can only be in the lineup once',
  );

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
