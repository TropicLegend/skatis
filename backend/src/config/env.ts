import 'dotenv/config';
import { z } from 'zod';

/**
 * Reads a boolean from the environment. `z.coerce.boolean()` cannot be used for
 * this: it turns every non-empty string – including "false" – into `true`.
 */
const booleanSchema = z
  .enum(['true', 'false', '1', '0'], 'Expected true, false, 1 or 0')
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().min(1).default('12h'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().default('*'),
  /** Requests per window for the endpoints that need no token. `0` disables it. */
  RATE_LIMIT_MAX: z.coerce.number().int().min(0).default(20),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60_000),
  /** Apply pending database migrations before the server starts serving. */
  AUTO_MIGRATE: booleanSchema.default(true),
});

export type Env = z.infer<typeof envSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${formatIssues(parsed.error)}\n\n` +
        'Hint: copy .env.example to .env and adjust the values.',
    );
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
