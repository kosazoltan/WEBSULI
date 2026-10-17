/**
 * E2E mode (docs/specs/2026-10-17-e2e-eldobhato-adatbazis.md): the Playwright web server sets WEBSULI_E2E=1. In that mode the
 * server must only ever talk to a disposable loopback database — never the production DATABASE_URL from source/.env.
 * Messages never include the connection string itself.
 */

export function isE2eMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.WEBSULI_E2E === "1";
}

/** Only a literal loopback IP counts: a host name (even `localhost`) is resolved elsewhere and proves nothing. */
export function isLoopbackDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return false;
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "[::1]") return false;
  // pg-connection-string lets ?host= / ?hostaddr= override the authority part of the URL.
  if (parsed.searchParams.has("host") || parsed.searchParams.has("hostaddr")) return false;
  return true;
}

export function assertE2eDatabaseUrl(url: string | undefined): void {
  if (!isLoopbackDatabaseUrl(url)) {
    throw new Error("[E2E] Az e2e szerver csak 127.0.0.1/::1 adatbázishoz kapcsolódhat; az indulás megtagadva.");
  }
}

/** `host:port/database` for the startup log — no user name, no password. */
export function describeE2eDatabase(url: string | undefined): string {
  if (!isLoopbackDatabaseUrl(url)) return "nem loopback (elutasítva)";
  const parsed = new URL(url!);
  return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
}
