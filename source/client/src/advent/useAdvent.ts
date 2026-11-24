/**
 * Adventi naptár — kliensoldali adatkapcsolat (docs/specs/2026-11-18-adventi-naptar.md R6, R8, 16.5).
 * Az állapot a SZERVERTŐL jön (a kliens órája nem dönt). A tanulói token és az eszközazonosító olvasásnál fejlécben, írásnál a
 * kérés törzsében megy — URL-be soha. Az írás a közös `apiRequest`-en át megy (CSRF-token).
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEARNER_TOKEN_CHANGED_EVENT, LEARNER_TOKEN_KEY, LEARNER_TOKEN_REJECTED_KEY, clearLearnerToken, getLearnerToken } from "@/lib/learnerProfile";
import type { AdventAnswerResult, AdventOpenResult, AdventState } from "@shared/advent/contract";

export const ADVENT_DEVICE_KEY = "websuli.advent.device";
import {
  ADVENT_STATE_KEY, adventStateError, adventStateKey, adventSubjectGeneration, nextRefreshAnchor, refreshDelayMs, statusFromResponse,
  subscribeAdventSubject, watchAdventSubject, type RefreshAnchor,
} from "@/advent/sync";
export { ADVENT_STATE_KEY };

// A tanulói token változása (másik lap, elutasítás, „Folytatom vendégként”, új link) új alany-generáció — akkor is, ha épp nincs
// adventi nézet a lapon (PR-C vak L3). Egyszer, a modul betöltésekor.
if (typeof window !== "undefined") watchAdventSubject(window, LEARNER_TOKEN_KEY, LEARNER_TOKEN_CHANGED_EVENT);

/** Az aktuális alany-generáció, reaktívan (változáskor a komponens újrarajzol, a lekérdezés új kulcsra vált). */
export function useAdventSubjectGeneration(): number {
  return useSyncExternalStore(subscribeAdventSubject, adventSubjectGeneration, adventSubjectGeneration);
}
export const ADVENT_STATUS_KEY = ["advent-status"] as const;

let memoryDevice: string | null = null;

function newDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Régi böngésző: UUID v4 alak a `getRandomValues`-ból.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Az eszköz véletlen azonosítója; ha nincs tárhely (privát mód), csak erre az oldalbetöltésre él (`volatile`). */
export function adventDevice(): { id: string; volatile: boolean } {
  try {
    const stored = window.localStorage.getItem(ADVENT_DEVICE_KEY);
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) return { id: stored, volatile: false };
    const fresh = newDeviceId();
    window.localStorage.setItem(ADVENT_DEVICE_KEY, fresh);
    return { id: fresh, volatile: false };
  } catch {
    memoryDevice ??= newDeviceId();
    return { id: memoryDevice, volatile: true };
  }
}

/** A MÁR LÉTEZŐ eszközazonosító — nem hoz létre újat (a főoldali kártya ezt használja: aki nem játszik, annak nincs azonosítója). */
export function peekAdventDevice(): string | null {
  try {
    const stored = window.localStorage.getItem(ADVENT_DEVICE_KEY);
    return stored && /^[0-9a-f-]{36}$/i.test(stored) ? stored : memoryDevice;
  } catch {
    return memoryDevice;
  }
}

/** Van-e már bármi, amihez a szerver állapotot tudna adni (eszközazonosító vagy tanulói link) — azonosító létrehozása nélkül. */
export function hasAdventIdentity(): boolean {
  return peekAdventDevice() !== null || getLearnerToken() !== null;
}

/** Az írások időkorlátja: lassú hálózaton a gyerek ~15 mp után barátságos újrapróba-ajánlatot kap (nem 60 mp néma várakozást). */
export const ADVENT_TIMEOUT_MS = 15_000;

const identity = () => {
  const learner = getLearnerToken();
  return { device: adventDevice().id, ...(learner ? { learner } : {}) };
};

export type AdventStatus = { enabled: boolean; phase?: AdventState["phase"]; season?: number; openDay?: number; daysUntilStart?: number };

export async function fetchAdventStatus(): Promise<AdventStatus> {
  const res = await fetch("/api/advent/status", { credentials: "same-origin", headers: { accept: "application/json" } });
  // A HTTP-hiba nem „kikapcsolt” (élesítés előtti L5): hibát dob, a lekérdezés újrapróbálja, a kártya a helyén marad.
  return statusFromResponse<AdventStatus>(res);
}

/** Az állapot; `null`, ha a naptár nem érhető el (kikapcsolt flag → 404). Hálózati / szerverhiba esetén dob. */
export async function fetchAdventState(createDevice = true, signal?: AbortSignal): Promise<AdventState | null> {
  // A naptároldal létrehozza az eszközazonosítót (ott a gyerek játszani jött); a főoldali kártya csak a meglévőt küldi.
  const device = createDevice ? adventDevice().id : peekAdventDevice();
  const learner = getLearnerToken();
  const headers: Record<string, string> = { accept: "application/json" };
  if (device) headers["X-Advent-Device"] = device;
  if (learner) headers["X-Learner-Token"] = learner;
  const res = await fetch("/api/advent/state", { credentials: "same-origin", headers, signal });
  if (res.status === 404) return null;
  // A státuszkód és a gépi jelző a hibán marad (429: betelt olvasási keret → csak sáv; 409 corrupt → célzott, gondozóhoz irányító
  // üzenet — PR-C vak L7).
  if (!res.ok) throw await adventStateError(res);
  return (await res.json()) as AdventState;
}

export const adventApi = {
  grade: (grade: number) => apiRequest<AdventState>("POST", "/api/advent/grade", { ...identity(), grade }, { timeout: ADVENT_TIMEOUT_MS }),
  open: (day: number) => apiRequest<AdventOpenResult>("POST", `/api/advent/doors/${day}/open`, identity(), { timeout: ADVENT_TIMEOUT_MS }),
  answer: (day: number, questionId: string, pick: number) =>
    // Az újraküldés biztonságos: ugyanarra a kérdésre a szerver a tárolt eredményt adja.
    apiRequest<AdventAnswerResult>("POST", `/api/advent/doors/${day}/answer`, { ...identity(), questionId, pick }, { retries: 1, timeout: ADVENT_TIMEOUT_MS }),
  round: () => apiRequest<AdventState>("POST", "/api/advent/round", identity(), { timeout: ADVENT_TIMEOUT_MS }),
  /** A függő (előnézetként mutatott) átvétel kifejezett mentése a megtekintési útról — idempotens (PR-C vak L2). */
  adopt: () => apiRequest<AdventState>("POST", "/api/advent/adopt", identity(), { timeout: ADVENT_TIMEOUT_MS }),
};

/** Az állapot lekérdezése: frissül fókuszra, és magától a következő ablak nyitásának pillanatában. */
export function useAdventState(enabled = true, createDevice = true) {
  const queryClient = useQueryClient();
  const generation = useAdventSubjectGeneration();
  const query = useQuery<AdventState | null>({
    queryKey: adventStateKey(generation),
    queryFn: ({ signal }) => fetchAdventState(createDevice, signal),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // Betelt olvasási keretnél (429) nincs azonnali újrapróba — az csak tovább fogyasztaná a keretet; sérült mentésnél (409 corrupt)
    // sem, mert ugyanarra a sorra ugyanaz jönne (PR-C vak L7).
    retry: (failures, error) => failures < 1 && (error as { status?: unknown } | null)?.status !== 429 && (error as { corrupt?: unknown } | null)?.corrupt !== true,
  });
  // A következő nyitás frissítése a szerver által adott várakozásból, a MINTA érkezésétől (élesítés előtti L4): eltérő eszközórával is.
  // A horgony csak új szervermintánál mozdul — a válasz helyi állapotírása nem tolja el az éjféli nyitást (PR-C vak L4).
  // A következő állapotváltás (ablaknyitás VAGY fázisváltás, pl. január 7-i zárás) — régi szervernél a következő nyitás (PR-C 2. vak L3).
  const nextOpensInMs = query.data?.refreshInMs ?? query.data?.nextOpensInMs ?? null;
  const anchorRef = useRef<RefreshAnchor | null>(null);
  anchorRef.current = nextRefreshAnchor(anchorRef.current, nextOpensInMs, query.dataUpdatedAt);
  const { wait, at } = anchorRef.current;
  useEffect(() => {
    const delay = refreshDelayMs({ nextOpensInMs: wait }, at, Date.now());
    if (delay === null) return;
    const timer = window.setTimeout(() => { void queryClient.invalidateQueries({ queryKey: ADVENT_STATE_KEY }); }, delay);
    return () => window.clearTimeout(timer);
  }, [wait, at, queryClient]);
  return { ...query, generation };
}

// Ugyanaz a jelző, amelyet az alkalmazás profil-lekérdezése állít be, ha a szerver elutasítja a tokent (és törli azt).
const PAIRING_LOST_KEY = LEARNER_TOKEN_REJECTED_KEY;
/**
 * „A személyes link lejárt” jelző a lap munkamenetére (A53): a naptár megjegyzi, hogy érvénytelen párosítással indult, és amíg a
 * gyerek nem választ, nem ír — akkor sem, ha a tokent időközben az alkalmazás profil-lekérdezése már törölte.
 */
export function isPairingLost(): boolean {
  try { return window.sessionStorage.getItem(PAIRING_LOST_KEY) === "1"; } catch { return false; }
}
export function markPairingLost(): void {
  try { window.sessionStorage.setItem(PAIRING_LOST_KEY, "1"); } catch { /* tárhely nélkül a komponens állapota őrzi */ }
}
export function clearPairingLost(): void {
  try { window.sessionStorage.removeItem(PAIRING_LOST_KEY); } catch { /* nincs mit törölni */ }
}

/** Érvénytelen tanulói link elfelejtése („Folytatom vendégként”): a naptár az eszköz azonosítójával megy tovább. */
export function forgetLearnerPairing(): void {
  clearLearnerToken();
}
