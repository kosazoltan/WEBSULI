/**
 * Client-side logger, mirroring server/lib/logger's API so the same call shape
 * works on both sides. The browser console is the only client sink; debug lines
 * are suppressed in the production build.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

function enabled(level: LogLevel): boolean {
  return level !== "debug" || !import.meta.env.PROD;
}

export const logger = {
  debug: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (enabled("debug")) console.debug(...args);
  },
  info: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (enabled("info")) console.info(...args);
  },
  warn: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (enabled("warn")) console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    // eslint-disable-next-line no-console
    if (enabled("error")) console.error(...args);
  },
};
