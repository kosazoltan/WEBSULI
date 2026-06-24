/**
 * E3: Client-side logger.
 * Suppresses debug/info logs in production builds (import.meta.env.PROD),
 * keeps warn/error. Replaces scattered console.* calls in client code.
 *
 * Migration: console.log -> logger.info, console.error -> logger.error, etc.
 * Incremental; CI eslint baseline prevents regressions.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProd = typeof import.meta !== 'undefined' && import.meta.env?.PROD === true;

function shouldLog(level: LogLevel): boolean {
  if (!isProd) return true;
  // In production, only warn + error
  return level === 'warn' || level === 'error';
}

export const logger = {
  debug: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (shouldLog('debug')) console.debug(...args);
  },
  info: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (shouldLog('info')) console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (shouldLog('warn')) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (shouldLog('error')) console.error(...args);
  },
};

export type { LogLevel };
