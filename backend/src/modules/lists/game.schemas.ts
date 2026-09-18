import { z } from 'zod';
import { isoDateSchema, tournamentIdSchema } from '../tournaments/tournament.schemas.js';

export const playerNameSchema = z.string().trim().min(1).max(64);

/**
 * Fields of a game ("Spiel"). `position` is optional – when it is omitted the
 * next free position inside the list is used.
 */
const gameFields = {
  position: z.number().int().min(1).max(10_000).optional(),
  players: z.array(playerNameSchema).min(1).max(8),
  declarer: playerNameSchema.nullable().optional(),
  gameType: z.string().trim().min(1).max(64).nullable().optional(),
  /** Game value – negative for a lost game. */
  points: z.number().int().min(-1000).max(1000),
  note: z.string().trim().max(500).nullable().optional(),
};

const declarerIsPlayer = (game: { players?: string[]; declarer?: string | null }): boolean =>
  game.declarer == null || game.players === undefined || game.players.includes(game.declarer);

export const createGameSchema = z.object(gameFields).refine(declarerIsPlayer, {
  message: 'The declarer must be one of the players',
  path: ['declarer'],
});

export const updateGameSchema = z
  .object(gameFields)
  .partial()
  .refine((game) => Object.values(game).some((field) => field !== undefined), {
    message: 'Provide at least one field to update',
  })
  .refine(declarerIsPlayer, {
    message: 'The declarer must be one of the players',
    path: ['declarer'],
  });

export const gameParams = z.object({
  tournamentId: tournamentIdSchema,
  matchday: isoDateSchema,
  gameId: z.string().trim().min(1).max(64),
});

export type CreateGameInput = z.infer<typeof createGameSchema>;
export type UpdateGameInput = z.infer<typeof updateGameSchema>;
