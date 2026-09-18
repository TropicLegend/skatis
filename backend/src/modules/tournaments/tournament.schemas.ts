import { z } from 'zod';
import { isIsoDate } from '../../lib/dates.js';

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

/** ISO-8601 weekday numbers: 1 = Monday … 7 = Sunday. */
export const matchdaysSchema = z
  .array(z.number().int().min(1).max(7))
  .min(1, 'At least one matchday is required')
  .max(7, 'A week only has 7 days')
  .refine((days) => new Set(days).size === days.length, 'Matchdays must be unique');

export const isoDateSchema = z
  .string()
  .refine(isIsoDate, 'Expected a date in the format YYYY-MM-DD');

/**
 * Route parameters are validated leniently: an unknown tournament simply does
 * not exist, which is answered with 404 instead of 422.
 */
export const tournamentNameParams = z.object({
  tournamentName: z.string().trim().min(1).max(64),
});

export const createTournamentSchema = z.object({
  name: tournamentNameSchema,
  adminPassword: passwordSchema,
  password: passwordSchema,
  matchdays: matchdaysSchema,
});

export const updateTournamentSchema = z
  .object({
    matchdays: matchdaysSchema.optional(),
    password: passwordSchema.optional(),
    adminPassword: passwordSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Provide at least one of matchdays, password or adminPassword',
  });

export const createSessionSchema = z.object({
  password: z.string().min(1, 'Password is required').max(128),
});

export const listTournamentsQuery = z.object({
  search: z.string().trim().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
export type ListTournamentsQuery = z.infer<typeof listTournamentsQuery>;
