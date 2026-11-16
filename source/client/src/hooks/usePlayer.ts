/**
 * JM7a — játékos-fiók a kliensen (docs/specs/2026-11-16-jatekok-jatekelmeny.md 10.4). A játékos-munkamenet KÜLÖN az
 * admin / meglévő felhasználói úttól (useAuth): itt soha nincs admin-jog, és ez a hook nem is ad ilyen mezőt.
 * A `PLAYER_ACCOUNTS` flag (szerver) alapból KI: ilyenkor `enabled === false`, és semmi nem kér a /me-től.
 */
import { useQuery, type QueryClient } from "@tanstack/react-query";

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

/* ===================== JM7b — „kis fiók” ===================== */

export type PlayerAccountView = {
  id: string; nickname: string | null; avatar: string | null; needsProfile: boolean; maskedEmail: string;
  googleLinked: boolean; learnerLinked: boolean; createdAt: string;
};
export const PLAYER_ACCOUNT_KEY = ["/api/player/account"] as const;

/**
 * Review #449: a játékoshoz kötött gyorsítótár-kulcs a játékos azonosítóját is tartalmazza — fiókváltáskor (megosztott eszköz,
 * ugyanaz az SPA-munkamenet) így B soha nem kaphatja A gyorsítótárazott fiókadatait.
 */
export const playerAccountKey = (playerId: string) => [PLAYER_ACCOUNT_KEY[0], playerId] as const;

/**
 * Review #449: MINDEN be- és kilépéskor (kód, link, kijelentkezés, fióktörlés) a játékoshoz kötött ÖSSZES gyorsítótár-bejegyzés
 * törlődik, a `me` pedig újratöltődik — a kulcsban lévő azonosító mellett ez a második védelem.
 */
export async function clearPlayerCache(queryClient: QueryClient): Promise<void> {
  queryClient.removeQueries({ queryKey: PLAYER_ACCOUNT_KEY });
  await queryClient.resetQueries({ queryKey: PLAYER_ME_KEY });
}

/** A saját fiók (csak bejelentkezett játékosnál kér); a kulcs a játékos azonosítóját tartalmazza. */
export function usePlayerAccount(playerId: string | null) {
  return useQuery<PlayerAccountView | null>({
    queryKey: playerAccountKey(playerId ?? ""),
    queryFn: async () => {
      const res = await fetch(PLAYER_ACCOUNT_KEY[0], { credentials: "include", headers: { accept: "application/json" } });
      if (res.status === 401 || res.status === 403 || res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as PlayerAccountView;
    },
    enabled: !!playerId,
    retry: false,
  });
}

type WriteResult = { status: number; data: Record<string, unknown> | null };

/** Friss CSRF-token (GET, a munkamenethez kötött). */
async function freshCsrfToken(): Promise<string> {
  const res = await fetch("/api/csrf-token", { credentials: "include", signal: AbortSignal.timeout(PLAYER_REQUEST_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return ((await res.json()) as { csrfToken: string }).csrfToken;
}

/**
 * A /api/player/* írásai CSRF-tokenesek. A tokent minden íráskor frissen kérjük: a játékos-belépés újragenerálja a
 * munkamenetet, így egy korábban gyorsítótárazott token érvénytelen lenne. Hálózati hiba → status 0 (nem dob).
 */
async function playerWrite(url: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<WriteResult> {
  try {
    const csrfToken = await freshCsrfToken();
    const res = await fetch(url, {
      headers: { ...JSON_HEADERS, "x-csrf-token": csrfToken, ...extraHeaders },
      method: "POST", credentials: "include", body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(PLAYER_REQUEST_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  }
}

export type ProfileSaveResult =
  | { ok: true }
  | { ok: false; code: "BAD_NICKNAME"; messages: string[] }
  | { ok: false; code: "NICKNAME_TAKEN"; suggestion: string | null }
  | { ok: false; code: "RATE_LIMITED" | "NETWORK" | "SERVER_ERROR" | "BANNED" | "UNAUTHORIZED" | "BAD_AVATAR" };

function commonFailure(status: number): "RATE_LIMITED" | "NETWORK" | "SERVER_ERROR" | "BANNED" | "UNAUTHORIZED" {
  if (status === 0) return "NETWORK";
  if (status === 429) return "RATE_LIMITED";
  if (status === 403) return "BANNED";
  if (status === 401 || status === 404) return "UNAUTHORIZED";
  return "SERVER_ERROR";
}

export async function savePlayerProfile(input: { nickname?: string; avatar?: string }): Promise<ProfileSaveResult> {
  const { status, data } = await playerWrite("/api/player/profile", input);
  if (status === 200) return { ok: true };
  if (status === 400 && data?.code === "BAD_NICKNAME") return { ok: false, code: "BAD_NICKNAME", messages: (data.messages as string[]) ?? [] };
  if (status === 400 && data?.code === "BAD_AVATAR") return { ok: false, code: "BAD_AVATAR" };
  if (status === 409) return { ok: false, code: "NICKNAME_TAKEN", suggestion: (data?.suggestion as string | null) ?? null };
  return { ok: false, code: commonFailure(status) };
}

export async function fetchNicknameSuggestions(): Promise<string[]> {
  try {
    const res = await fetch("/api/player/nickname-suggestions", { credentials: "include", headers: { accept: "application/json" } });
    if (!res.ok) return [];
    return ((await res.json()) as { suggestions: string[] }).suggestions ?? [];
  } catch {
    return [];
  }
}

export type LinkLearnerResult = { ok: true } | { ok: false; code: "LEARNER_TOKEN_INVALID" | "LEARNER_ALREADY_LINKED" | "RATE_LIMITED" | "NETWORK" | "SERVER_ERROR" | "BANNED" | "UNAUTHORIZED" };

/** A tanulói token a fejlécben megy (nem URL-ben, nem naplózott törzsben); a szerver ellenőrzi az aláírását. */
export async function linkLearnerProfile(learnerToken: string): Promise<LinkLearnerResult> {
  const { status, data } = await playerWrite("/api/player/link-learner", { confirm: true }, { "x-learner-token": learnerToken });
  if (status === 200) return { ok: true };
  if (status === 400) return { ok: false, code: "LEARNER_TOKEN_INVALID" };
  if (status === 409 && data?.code === "LEARNER_ALREADY_LINKED") return { ok: false, code: "LEARNER_ALREADY_LINKED" };
  return { ok: false, code: commonFailure(status) };
}

export async function unlinkLearnerProfile(): Promise<boolean> {
  return (await playerWrite("/api/player/unlink-learner", {})).status === 200;
}

export async function exportPlayerData(): Promise<Record<string, unknown> | null> {
  const { status, data } = await playerWrite("/api/player/export", {});
  return status === 200 ? data : null;
}

export type DeleteAccountResult = { ok: true } | { ok: false; code: "REAUTH_REQUIRED" | "CONFIRM_REQUIRED" | "RATE_LIMITED" | "NETWORK" | "SERVER_ERROR" | "BANNED" | "UNAUTHORIZED" };

export async function deletePlayerAccount(confirm: string): Promise<DeleteAccountResult> {
  const { status, data } = await playerWrite("/api/player/account/delete", { confirm });
  if (status === 200) return { ok: true };
  if (status === 401 && data?.code === "REAUTH_REQUIRED") return { ok: false, code: "REAUTH_REQUIRED" };
  if (status === 400) return { ok: false, code: "CONFIRM_REQUIRED" };
  return { ok: false, code: commonFailure(status) };
}

export async function logoutPlayer(): Promise<boolean> {
  try {
    const res = await fetch("/api/player/auth/logout", { method: "POST", credentials: "include", headers: JSON_HEADERS, signal: AbortSignal.timeout(PLAYER_REQUEST_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}
