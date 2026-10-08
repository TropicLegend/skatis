import pino from 'pino';
import { env, isProduction, isTest } from '../config/env.js';

/**
 * `pino-pretty` is a development dependency. An installation without them (the
 * Docker image) must still start when `NODE_ENV` is not `production`, so the
 * pretty printer is only used where it is installed.
 */
function prettyPrinterInstalled(): boolean {
  try {
    import.meta.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/**
 * Application logger. Emits plain JSON in production and pretty printed
 * (colorized, human readable) lines during local development.
 */
export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  base: null,
  ...(isProduction || isTest || !prettyPrinterInstalled()
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
