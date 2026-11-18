/**
 * Adventi naptár — kliensoldali adatkapcsolat (docs/specs/2026-11-18-adventi-naptar.md R6, R8, 16.5).
 * Az állapot a SZERVERTŐL jön (a kliens órája nem dönt). A tanulói token és az eszközazonosító olvasásnál fejlécben, írásnál a
 * kérés törzsében megy — URL-be soha. Az írás a közös `apiRequest`-en át megy (CSRF-token).
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LEARNER_TOKEN_REJECTED_KEY, clearLearnerToken, getLearnerToken } from "@/lib/learnerProfile";
import type { AdventAnswerResult, AdventOpenResult, AdventState } from "@shared/advent/contract";

export const ADVENT_DEVICE_KEY = "websuli.advent.device";
export const ADVENT_STATE_KEY = ["advent-state"] as const;
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

const identity = () => {
  const learner = getLearnerToken();
  return { device: adventDevice().id, ...(learner ? { learner } : {}) };
};

export type AdventStatus = { enabled: boolean; phase?: AdventState["phase"]; season?: number; openDay?: number; daysUntilStart?: number };

export async function fetchAdventStatus(): Promise<AdventStatus> {
  const res = await fetch("/api/advent/status", { credentials: "same-origin", headers: { accept: "application/json" } });
  if (!res.ok) return { enabled: false };
  return (await res.json()) as AdventStatus;
}

/** Az állapot; `null`, ha a naptár nem érhető el (kikapcsolt flag → 404). Hálózati / szerverhiba esetén dob. */
export async function fetchAdventState(): Promise<AdventState | null> {
  const id = identity();
  const headers: Record<string, string> = { accept: "application/json", "X-Advent-Device": id.device };
  if (id.learner) headers["X-Learner-Token"] = id.learner;
  const res = await fetch("/api/advent/state", { credentials: "same-origin", headers });
  if (res.status === 404) return null;
  // A státuszkód a hibán marad (429: betelt olvasási keret) — a felület megtartott állapot mellett csak sávot mutat.
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return (await res.json()) as AdventState;
}

export const adventApi = {
  grade: (grade: number) => apiRequest<AdventState>("POST", "/api/advent/grade", { ...identity(), grade }),
  open: (day: number) => apiRequest<AdventOpenResult>("POST", `/api/advent/doors/${day}/open`, identity()),
  answer: (day: number, questionId: string, pick: number) =>
    // Az újraküldés biztonságos: ugyanarra a kérdésre a szerver a tárolt eredményt adja.
    apiRequest<AdventAnswerResult>("POST", `/api/advent/doors/${day}/answer`, { ...identity(), questionId, pick }, { retries: 2 }),
  round: () => apiRequest<AdventState>("POST", "/api/advent/round", identity()),
};

/** Az állapot lekérdezése: frissül fókuszra, és magától a következő ablak nyitásának pillanatában. */
export function useAdventState(enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery<AdventState | null>({
    queryKey: ADVENT_STATE_KEY,
    queryFn: fetchAdventState,
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // Betelt olvasási keretnél (429) nincs azonnali újrapróba — az csak tovább fogyasztaná a keretet.
    retry: (failures, error) => failures < 1 && (error as { status?: unknown } | null)?.status !== 429,
  });
  const nextOpensAt = query.data?.nextOpensAt ?? null;
  useEffect(() => {
    if (!nextOpensAt) return;
    const delay = new Date(nextOpensAt).getTime() - Date.now();
    if (!Number.isFinite(delay) || delay <= 0 || delay > 2_147_000_000) return;
    const timer = window.setTimeout(() => { void queryClient.invalidateQueries({ queryKey: ADVENT_STATE_KEY }); }, delay + 1000);
    return () => window.clearTimeout(timer);
  }, [nextOpensAt, queryClient]);
  return query;
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
