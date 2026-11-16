/**
 * JM0: menetenkénti újraküldés-azonosító a `POST /api/games/score` híváshoz. A szerver ugyanazzal a runId-vel és tartalommal
 * érkező második kérést írás nélkül, ugyanazzal a válasszal fogadja. Nem biztonságos környezetben (nincs crypto.randomUUID)
 * a mező elmarad — a régi, runId nélküli út is érvényes.
 */
export function newScoreRunId(): string | undefined {
  try {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : undefined;
  } catch {
    return undefined;
  }
}
