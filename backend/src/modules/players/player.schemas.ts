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

/**
 * Names nobody can be given. A name is part of the address of a player
 * (`…/players/:playerName`), and `.` and `..` are path segments a browser
 * resolves before it sends the request: renaming a player called `..` would
 * reach `PATCH /tournaments/:tournamentId` and rename the tournament instead.
 * `__proto__` is no usable key of the result tables a frontend receives.
 */
const RESERVED_PLAYER_NAMES = new Set(['.', '..', '__proto__']);

// Control characters (Unicode category Cc) – line breaks, tabs, escape sequences.
const CONTROL_CHARACTERS = /\p{Cc}/u;

/**
 * A name a player may be **given** – when they are added or renamed. Looking a
 * player up stays as lenient as {@link playerNameSchema}, so a name that was
 * stored before these rules existed can still be addressed and corrected.
 */
export const newPlayerNameSchema = playerNameSchema
  .refine((name) => !CONTROL_CHARACTERS.test(name), {
    message: 'A player name must not contain control characters',
  })
  .refine((name) => !RESERVED_PLAYER_NAMES.has(name), {
    message: 'This name is reserved – choose another one',
  });

export const createPlayerSchema = z.object({
  name: newPlayerNameSchema,
});

/** Corrects the name of an existing player. */
export const renamePlayerSchema = z.object({
  name: newPlayerNameSchema,
});

export const playerStandingVisibilitySchema = z.object({
  hiddenFromStandings: z.boolean(),
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
