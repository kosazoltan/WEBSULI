/**
 * JM7a — játékos-fiók a kliensen (docs/specs/2026-11-16-jatekok-jatekelmeny.md 10.4). A játékos-munkamenet KÜLÖN az
 * admin / meglévő felhasználói úttól (useAuth): itt soha nincs admin-jog, és ez a hook nem is ad ilyen mezőt.
 * A `PLAYER_ACCOUNTS` flag (szerver) alapból KI: ilyenkor `enabled === false`, és semmi nem kér a /me-től.
 */
import { useQuery } from "@tanstack/react-query";

export type PlayerMe = { id: string; nickname: string | null; needsProfile: boolean };
export type VerifyRequest = { kind: "code"; email: string; code: string } | { kind: "link"; linkToken: string };
export type VerifyResult =
  | { ok: true; player: PlayerMe }
  | { ok: false; code: "INVALID_OR_EXPIRED" | "BANNED" | "RATE_LIMITED" | "UNAVAILABLE" | "SERVER_ERROR" | "NETWORK" | "ACCOUNT_SESSION" };
export type LinkInfo =
  | { ok: true; maskedEmail: string; current: "none" | "same" | "other"; accountSession: boolean }
  | { ok: false; code: "INVALID_OR_EXPIRED" | "RATE_LIMITED" | "UNAVAILABLE" | "SERVER_ERROR" | "NETWORK" };

/** A belépő kérések időkorlátja: lassú / megszakadt hálózaton se ragadjon „folyamatban” állapotban a felület. */
export const PLAYER_REQUEST_TIMEOUT_MS = 15_000;

export const PLAYER_STATUS_KEY = ["/api/player/status"] as const;
export const PLAYER_ME_KEY = ["/api/player/me"] as const;

async function getJson<T>(url: string, fallback: T): Promise<T> {
  const res = await fetch(url, { credentials: "include", headers: { accept: "application/json" } });
  if (res.status === 404) return fallback;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export function usePlayerStatus() {
  const { data, isLoading } = useQuery<{ enabled: boolean }>({
    queryKey: PLAYER_STATUS_KEY,
    queryFn: () => getJson(PLAYER_STATUS_KEY[0], { enabled: false }),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { enabled: data?.enabled === true, isLoading };
}

export function usePlayer() {
  const status = usePlayerStatus();
  const { data, isLoading } = useQuery<PlayerMe | null>({
    queryKey: PLAYER_ME_KEY,
    queryFn: () => getJson<PlayerMe | null>(PLAYER_ME_KEY[0], null),
    enabled: status.enabled,
    retry: false,
  });
  return {
    enabled: status.enabled,
    player: status.enabled ? data ?? null : null,
    isLoading: status.isLoading || (status.enabled && isLoading),
  };
}

// A /api/player/auth/* útvonalakat a szerver Origin-allowlisttel őrzi (CSRF-token helyett, mint a /api/login) —
// ezért nyers fetch, literális URL-lel (tests/client-csrf-guard.test.ts tükrözi a kivételt).
const JSON_HEADERS = { "Content-Type": "application/json", accept: "application/json" };

/**
 * Kódkérés. A szerver mindig 202-t ad (a cím léte nem derül ki); hibás cím → "INVALID_EMAIL". Hálózati hiba / időtúllépés
 * nem dob: "NETWORK" (review #445) — a hívó megjeleníthető hibát kap, és újrapróbálhat.
 */
export async function startPlayerLogin(email: string): Promise<"SENT" | "INVALID_EMAIL" | "RATE_LIMITED" | "UNAVAILABLE" | "NETWORK" | "SERVER_ERROR"> {
  let res: Response;
  try {
    res = await fetch("/api/player/auth/start", { method: "POST", credentials: "include", headers: JSON_HEADERS, body: JSON.stringify({ email }), signal: AbortSignal.timeout(PLAYER_REQUEST_TIMEOUT_MS) });
  } catch {
    return "NETWORK";
  }
  if (res.status === 202) return "SENT";
  if (res.status === 400) return "INVALID_EMAIL";
  if (res.status === 429) return "RATE_LIMITED";
  if (res.status >= 500) return "SERVER_ERROR";
  return "UNAVAILABLE";
}

export async function verifyPlayerLogin(body: VerifyRequest): Promise<VerifyResult> {
  let res: Response;
  try {
    res = await fetch("/api/player/auth/verify", { method: "POST", credentials: "include", headers: JSON_HEADERS, body: JSON.stringify(body), signal: AbortSignal.timeout(PLAYER_REQUEST_TIMEOUT_MS) });
  } catch {
    return { ok: false, code: "NETWORK" };
  }
  if (res.status === 429) return { ok: false, code: "RATE_LIMITED" };
  if (res.status === 404) return { ok: false, code: "UNAVAILABLE" };
  const data = (await res.json().catch(() => null)) as VerifyResult | null;
  if (!data) return { ok: false, code: "SERVER_ERROR" };
  return data;
}

/** Kijelentkezés; hálózati hibánál `false` (a felület jelezheti), nem dob. */
/** A link megerősítő képernyőjéhez (beváltás NÉLKÜL): maszkolt cím, és él-e már munkamenet. Nem dob. */
export async function checkPlayerLink(linkToken: string): Promise<LinkInfo> {
  let res: Response;
  try {
    res = await fetch("/api/player/auth/link-info", { method: "POST", credentials: "include", headers: JSON_HEADERS, body: JSON.stringify({ linkToken }), signal: AbortSignal.timeout(PLAYER_REQUEST_TIMEOUT_MS) });
  } catch {
    return { ok: false, code: "NETWORK" };
  }
  if (res.status === 429) return { ok: false, code: "RATE_LIMITED" };
  if (res.status === 404) return { ok: false, code: "UNAVAILABLE" };
  const data = (await res.json().catch(() => null)) as LinkInfo | null;
  return data ?? { ok: false, code: "SERVER_ERROR" };
}

export async function logoutPlayer(): Promise<boolean> {
  try {
    const res = await fetch("/api/player/auth/logout", { method: "POST", credentials: "include", headers: JSON_HEADERS, signal: AbortSignal.timeout(PLAYER_REQUEST_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}
