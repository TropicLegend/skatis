import { z } from 'zod';
import { MAX_LINEUP, MIN_LINEUP } from '../lists/game-rules.js';
import { tournamentIdSchema } from '../tournaments/tournament.schemas.js';

/** A player is just a name inside a tournament. */
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
  playerId: z.string().trim().min(1).max(64),
});

const playerIdSchema = z.string().trim().min(1).max(64);

const LINEUP_SIZE_MESSAGE = `A list consists of ${MIN_LINEUP}, ${MIN_LINEUP + 1} or ${MAX_LINEUP} players`;

/**
 * The lineup of a matchday: the players of the tournament in seating order.
 * Player 1 deals in round 1, then player 2 and so on (see README.md).
 */
export const lineupSchema = z
  .array(playerIdSchema)
  .min(MIN_LINEUP, LINEUP_SIZE_MESSAGE)
  .max(MAX_LINEUP, LINEUP_SIZE_MESSAGE)
  .refine((ids) => new Set(ids).size === ids.length, 'A player can only be in the lineup once');

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
