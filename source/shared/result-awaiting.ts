/**
 * U4d — az összevont eredménylevél „várakozó rész” állapota (docs/specs/2026-11-24-osszevont-eredmenylevel-vegrehajtas.md, 4. pont).
 * Leckénkénti tár: a szerver `awaiting` válasza ide íródik, a hiányzó rész sikeres beküldése törli. Írhatatlan tárolónál memóriában.
 */
export type AwaitingPart = "tasks" | "quiz";
type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

const keyOf = (lessonId: string) => `websuli:result-awaiting:${lessonId}`;
const valid = (v: unknown): v is AwaitingPart => v === "tasks" || v === "quiz";

export function createAwaitingStore(storage: () => StorageLike | null) {
  const memory = new Map<string, AwaitingPart | null>();
  const listeners = new Map<string, Set<(v: AwaitingPart | null) => void>>();
  const notify = (lessonId: string, v: AwaitingPart | null) => { for (const fn of listeners.get(lessonId) ?? []) fn(v); };
  const get = (lessonId: string): AwaitingPart | null => {
    if (memory.has(lessonId)) return memory.get(lessonId) ?? null;
    try { const v = storage()?.getItem(keyOf(lessonId)); return valid(v) ? v : null; } catch { return null; }
  };
  const write = (lessonId: string, v: AwaitingPart | null) => {
    memory.set(lessonId, v);
    try { const s = storage(); if (s) { if (v) s.setItem(keyOf(lessonId), v); else s.removeItem(keyOf(lessonId)); } } catch { /* memóriában marad */ }
    notify(lessonId, v);
  };
  return {
    get,
    set: (lessonId: string, v: AwaitingPart) => write(lessonId, v),
    clear: (lessonId: string) => { if (get(lessonId) !== null || memory.has(lessonId)) write(lessonId, null); },
    subscribe(lessonId: string, fn: (v: AwaitingPart | null) => void) {
      const set = listeners.get(lessonId) ?? new Set(); set.add(fn); listeners.set(lessonId, set);
      return () => { set.delete(fn); };
    },
  };
}

/** A szerver legfeljebb `ms`-ig vár a párosítás eredményére; időtúllépés vagy hiba → `null` (a válasz nem késik, nincs mező). */
export async function raceAwaiting(p: Promise<AwaitingPart | null>, ms: number): Promise<AwaitingPart | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p.catch(() => null), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); })]);
  } finally { if (timer) clearTimeout(timer); }
}
