/**
 * E3: Structured server-side logger.
 * Replaces scattered console.* calls. Honors LOG_LEVEL and suppresses
 * debug/info noise in production.
 *
 * Migration: replace `console.log(...)` -> `logger.info(...)`,
 * `console.error(...)` -> `logger.error(...)`, etc. Incremental; the CI
 * eslint --max-warnings baseline prevents regressions.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function activeLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? '').toLowerCase();
  if (env === 'debug' || env === 'info' || env === 'warn' || env === 'error') return env;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[activeLevel()];
}

function fmt(level: LogLevel, args: unknown[]): unknown[] {
  const ts = new Date().toISOString();
  return [`[${ts}] [${level.toUpperCase()}]`, ...args];
}

export const logger = {
  debug: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (shouldLog('debug')) console.debug(...fmt('debug', args));
  },
  info: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (shouldLog('info')) console.info(...fmt('info', args));
  },
  warn: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (shouldLog('warn')) console.warn(...fmt('warn', args));
  },
  error: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (shouldLog('error')) console.error(...fmt('error', args));
  },
};

export type { LogLevel };
