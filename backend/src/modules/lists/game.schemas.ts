import { z } from 'zod';
import { playerNameSchema } from '../players/player.schemas.js';
import { maxMatadors } from './game-rules.js';

export const gameTypeSchema = z.enum(['KARO', 'HERZ', 'PIK', 'KREUZ', 'GRAND', 'NULL']);
export const matadorsSchema = z.enum(['WITH', 'WITHOUT']);

const noteSchema = z.string().trim().max(500).nullable().optional();
const levelSchema = z.boolean().default(false);

/**
 * A game that was played. It follows steps 1 to 4 of the entry flow described
 * in README.md; everything that can be checked without knowing the list is
 * checked here.
 *
 * * step 1 – `passedOut: false` plus `declarer` (the Alleinspieler); the service
 *   additionally rejects players that may not play this round because of the
 *   dealer
 * * step 2 – `gameType` plus the announced levels `hand`, `schneiderAnnounced`,
 *   `schwarzAnnounced`, `offen`
 * * step 3 – `matadors` (Mit/Ohne plus the number of Spitzen), skipped for null
 * * step 4 – `schneider`, `schwarz` and `won`
 *
 * `dealer`, `position`, `players` and `gameValue` are not part of the request:
 * the API derives them from the list and the game properties.
 */
export const playedGameSchema = z
  .object({
    passedOut: z.literal(false),
    declarer: playerNameSchema,
    gameType: gameTypeSchema,
    hand: levelSchema,
    schneiderAnnounced: levelSchema,
    schwarzAnnounced: levelSchema,
    offen: levelSchema,
    matadors: z
      .object({
        suit: matadorsSchema,
        count: z.number().int().min(1, 'At least one Spitze').max(11),
      })
      .nullish(),
    schneider: levelSchema,
    schwarz: levelSchema,
    won: z.boolean(),
    note: noteSchema,
  })
  // Step 2 – the announced levels build on each other, from Hand downwards.
  // These rules are the "1. Fall" of the README and apply to suit and grand
  // games; a null game only knows Hand and Offen ("2. Fall").
  .refine((game) => !game.schneiderAnnounced || game.hand, {
    message: 'Schneider Ang. can only be announced together with Hand',
    path: ['schneiderAnnounced'],
  })
  .refine((game) => !game.schwarzAnnounced || game.schneiderAnnounced, {
    message: 'Schwarz Ang. can only be announced together with Schneider Ang.',
    path: ['schwarzAnnounced'],
  })
  .refine((game) => game.gameType === 'NULL' || !game.offen || game.schwarzAnnounced, {
    message: 'Offen can only be announced together with Schwarz Ang.',
    path: ['offen'],
  })
  // Step 2 – a null game cannot be announced as Schneider or Schwarz.
  .refine(
    (game) => game.gameType !== 'NULL' || (!game.schneiderAnnounced && !game.schwarzAnnounced),
    {
      message: 'A null game cannot be played with Schneider Ang. or Schwarz Ang.',
      path: ['gameType'],
    },
  )
  // Step 3 – Spitzen are required, except for null games.
  .refine((game) => game.gameType === 'NULL' || game.matadors != null, {
    message: 'Choose "Mit" or "Ohne" and the number of Spitzen',
    path: ['matadors'],
  })
  .refine((game) => game.gameType !== 'NULL' || game.matadors == null, {
    message: 'A null game has no Spitzen',
    path: ['matadors'],
  })
  .refine(
    (game) => {
      const maximum = maxMatadors(game.gameType);
      return maximum === null || game.matadors == null || game.matadors.count <= maximum;
    },
    {
      message: 'A grand game has at most 4 Spitzen, a suit game at most 11',
      path: ['matadors', 'count'],
    },
  )
  // Step 4 – the result.
  .refine((game) => game.gameType !== 'NULL' || (!game.schneider && !game.schwarz), {
    message: 'A null game cannot be Schneider or Schwarz',
    path: ['gameType'],
  })
  .refine((game) => !game.schwarz || game.schneider, {
    message: 'Schwarz requires Schneider',
    path: ['schwarz'],
  });

/**
 * A game that was passed out ("eingepasst"). Step 1 is the end of the flow, so
 * no other property may be sent.
 */
export const passedOutGameSchema = z.object({
  passedOut: z.literal(true),
  note: noteSchema,
});

/**
 * Both kinds of a game – the request has to say which one it is (step 1 of the
 * entry flow). Unknown properties, for example the derived ones, are ignored,
 * so a frontend may send back what it received from a GET.
 */
export const gameSchema = z.discriminatedUnion('passedOut', [
  passedOutGameSchema,
  playedGameSchema,
]);

export type GameInput = z.infer<typeof gameSchema>;
export type PlayedGameInput = z.infer<typeof playedGameSchema>;
export type PassedOutGameInput = z.infer<typeof passedOutGameSchema>;
