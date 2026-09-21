import { z } from 'zod';
import { isIsoDate } from '../../lib/dates.js';
import { normalizeTournamentId } from '../../lib/tournament-id.js';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must be at most 128 characters long');

export const tournamentNameSchema = z
  .string()
  .trim()
  .min(3, 'Tournament name must be at least 3 characters long')
  .max(64, 'Tournament name must be at most 64 characters long')
  .regex(
    /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u,
    'Tournament name may only contain letters, digits, spaces and the characters . _ -',
  );

/**
 * Public tournament id. Input is normalised (trimmed, upper case) so that ids
 * are case insensitive. The exact shape is enforced by the service, which
 * answers 404 for unknown ids.
 */
export const tournamentIdSchema = z
  .string()
  .trim()
  .min(1, 'Tournament id is required')
  .max(32)
  .transform(normalizeTournamentId);

/** ISO-8601 weekday numbers: 1 = Monday … 7 = Sunday. */
export const matchdaysSchema = z
  .array(z.number().int().min(1).max(7))
  .min(1, 'At least one matchday is required')
  .max(7, 'A week only has 7 days')
  .refine((days) => new Set(days).size === days.length, 'Matchdays must be unique');

/** "HH:MM" – zero-padded, so two playing-time boundaries can be compared as strings. */
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time in the format HH:MM');

/** The optional playing time of one weekday – it has to end after it starts. */
export const matchdayWindowSchema = z
  .object({
    from: timeSchema,
    to: timeSchema,
  })
  .strict()
  .refine((window) => window.from < window.to, {
    message: 'The end time must be after the start time',
    path: ['to'],
  });

/**
 * Playing times by weekday (`"1"` = Monday … `"7"` = Sunday), e.g.
 * `{ "3": { "from": "18:00", "to": "22:30" } }`. An empty object clears all of
 * them; a weekday without an entry is played "all day".
 */
export const matchdayWindowsSchema = z.record(
  z.string().regex(/^[1-7]$/, 'Expected a weekday from 1 to 7 as the key'),
  matchdayWindowSchema,
);

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, 'Expected a date in the format YYYY-MM-DD');

/**
 * Route parameters are validated leniently: an unknown tournament simply does
 * not exist, which is answered with 404 instead of 422.
 */
export const tournamentIdParams = z.object({
  tournamentId: tournamentIdSchema,
});

export const createTournamentSchema = z.object({
  name: tournamentNameSchema,
  adminPassword: passwordSchema,
  password: passwordSchema,
  matchdays: matchdaysSchema,
  /** Optional: the playing times can also be set later via PATCH. */
  matchdayWindows: matchdayWindowsSchema.optional(),
});

/**
 * Opens a session. The tournament is identified by the path, so the body only
 * carries the password – the same body works for both roles.
 */
export const openSessionSchema = z.object({
  password: z.string().min(1, 'Password is required').max(128),
});

/**
 * Admin changes of the tournament settings.
 *
 * Only the normal ("Spieler-") password can be changed here: the admin password
 * is the one that grants these changes, so it is fixed for the lifetime of a
 * tournament. Sending `adminPassword` is therefore rejected instead of being
 * ignored silently – the schema is strict.
 *
 * `matchdayWindows` replaces the whole map: a weekday that is missing from it
 * has no playing time (the day then lasts until midnight).
 */
export const updateTournamentSchema = z
  .strictObject({
    name: tournamentNameSchema.optional(),
    matchdays: matchdaysSchema.optional(),
    matchdayWindows: matchdayWindowsSchema.optional(),
    password: passwordSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one of name, matchdays, matchdayWindows or password',
  });

export const listTournamentsQuery = z.object({
  search: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Grouping of the standing history: the standing at the end of every matchday,
 * of every ISO week or of every month.
 */
export const standingsHistoryQuery = z.object({
  groupBy: z.enum(['matchday', 'week', 'month']).default('matchday'),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
export type ListTournamentsQuery = z.infer<typeof listTournamentsQuery>;
