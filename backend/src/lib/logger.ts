import pino from 'pino';
import { env, isProduction, isTest } from '../config/env.js';

/**
 * Application logger. Emits plain JSON in production and pretty printed
 * (colorized, human readable) lines during local development.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: null,
  ...(isProduction || isTest
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }),
});
