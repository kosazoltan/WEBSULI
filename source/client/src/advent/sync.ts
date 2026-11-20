/**
 * Adventi naptár — a kliens tiszta adat-segédei (docs/specs/2026-11-18-adventi-naptar.md 22.; a 3/3 PR GPT-vak L2, L4–L6). Vite-függés
 * nélkül, hogy node-tesztből is ellenőrizhető legyen.
 */
import type { QueryClient } from "@tanstack/react-query";

export const ADVENT_STATE_KEY = ["advent-state"] as const;

/**
 * L4 — a következő frissítés késleltetése: a szerver által számolt várakozás („nextOpensInMs”) mínusz a válasz ÓTA eltelt idő (mindkét
 * időpont a kliens órájából, így az eszköz eltérő órája kiesik), plusz 1 mp tartalék. Lekésett határnál 1 mp; nincs nyitás → null.
 */
export function refreshDelayMs(state: { nextOpensInMs?: number | null } | null | undefined, receivedAt: number, now: number): number | null {
  const wait = state?.nextOpensInMs;
  if (typeof wait !== "number" || !Number.isFinite(wait)) return null;
  const delay = Math.max(0, wait - Math.max(0, now - receivedAt)) + 1000;
  return delay > 2_147_000_000 ? null : delay;
}

/** L5 — a státusz HTTP-hibája HIBA (újrapróbálható), nem „kikapcsolt”: csak a sikeres válasz „enabled: false” értéke csukja össze a kártyát. */
export async function statusFromResponse<T>(res: { ok: boolean; status: number; json: () => Promise<unknown> }): Promise<T> {
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
  return (await res.json()) as T;
}

/**
 * L2 — alanyváltáskor (játékos be- / kilépés) az előző gyerek adventi állapota törlődik: előbb a függőben lévő kérés megszakad (a késve
 * érkező régi válasz nem töltheti vissza), utána a bejegyzés eltűnik.
 */
export async function clearAdventCache(queryClient: QueryClient): Promise<void> {
  await queryClient.cancelQueries({ queryKey: ADVENT_STATE_KEY });
  queryClient.removeQueries({ queryKey: ADVENT_STATE_KEY });
}

/** L6 — a válasz alkalmazása: a teljes ablaklista (ha a szerver adja) az összesítéssel együtt cserélődik; régi válasznál a megválaszolt ablak. */
export function applyAnswerResult<D extends { day: number }, T extends { doors: D[]; summary: unknown; closing: unknown }>(
  state: T,
  result: { door: D; doors?: D[]; summary: T["summary"]; closing: T["closing"] },
): T {
  const doors = Array.isArray(result.doors) && result.doors.length > 0 ? result.doors : state.doors.map((d) => (d.day === result.door.day ? result.door : d));
  return { ...state, doors, summary: result.summary, closing: result.closing };
}
