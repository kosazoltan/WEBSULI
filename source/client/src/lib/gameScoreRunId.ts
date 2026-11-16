import { apiRequest } from "./queryClient";

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

/** Az első kísérlet után ennyit várunk az egyszeri újrapróbával: 429-nél a korlát-ablak oldódásához, hálózati / szerverhibánál rövidebben. */
const RETRY_AFTER_429_MS = 20_000;
const RETRY_AFTER_OTHER_MS = 3_000;

/**
 * A pontbeküldés egyszeri, késleltetett újrapróbával: csak 429-re, 5xx-re és hálózati hibára (nincs `status`), ugyanazzal a
 * tartalommal (azonos runId → a szerver idempotens, nem ír kétszer). 4xx-re (403 nem jogosult, 400, 409) nincs újrapróba.
 * Ha az újrapróba is elbukik, a hiba a hívóhoz kerül (a lapok eddigi `.catch`-e változatlan).
 */
export async function postGameScore(payload: Record<string, unknown>): Promise<unknown> {
  try {
    return await apiRequest("POST", "/api/games/score", payload);
  } catch (error) {
    const status = (error as { status?: number } | null)?.status;
    if (status !== undefined && status !== 429 && status < 500) throw error;
    await new Promise((resolve) => setTimeout(resolve, status === 429 ? RETRY_AFTER_429_MS : RETRY_AFTER_OTHER_MS));
    return apiRequest("POST", "/api/games/score", payload);
  }
}
