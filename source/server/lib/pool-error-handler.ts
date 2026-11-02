// docs/specs/2026-11-01-db-pool-error-crash.md: node-postgres emits an idle client's failure (server closed the
// connection, e.g. Neon suspending/restarting the compute) as an "error" event on the Pool. Without a listener the
// EventEmitter throws it as an uncaught exception and the whole process exits with status 1. The pool already
// discards the broken client, so logging is all that is needed; the next query opens a fresh connection.
export function attachPoolErrorHandler(
  pool: { on(event: "error", listener: (err: unknown) => void): unknown },
  log: (msg: string) => void,
): void {
  pool.on("error", (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "n/a";
    log(`[DB] Idle pool client error (connection dropped; the pool replaces it): ${message} (code=${code})`);
  });
}
