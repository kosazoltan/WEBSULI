/**
 * U4d — az összevont eredménylevél „várakozó rész” állapota (docs/specs/2026-11-24-osszevont-eredmenylevel-vegrehajtas.md, 4. pont).
 * Review #591: az állapot forrása a SZERVER (`POST /api/lessons/:id/results/status`, a beküldéssel azonos tulajdonoskulccsal) — nincs
 * helyi, kilét nélküli tár. A kliens minden lekérdezést sorszámoz; csak a legutolsó válasza érvényes (a korábbi, később érkező elvész).
 */
export type AwaitingPart = "tasks" | "quiz";

export const asAwaiting = (v: unknown): AwaitingPart | null => (v === "tasks" || v === "quiz" ? v : null);

/** Kulcsonkénti sorszámozás: `next` új jegyet ad, `isLatest` csak a legutolsóra igaz. */
export function createLatest() {
  const seq = new Map<string, number>();
  return {
    next(key: string) { const n = (seq.get(key) ?? 0) + 1; seq.set(key, n); return n; },
    isLatest(key: string, ticket: number) { return seq.get(key) === ticket; },
  };
}

/** A szerver legfeljebb `ms`-ig vár a párosítás eredményére; időtúllépés vagy hiba → `null` (a válasz nem késik, nincs mező). */
export async function raceAwaiting(p: Promise<AwaitingPart | null>, ms: number): Promise<AwaitingPart | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p.catch(() => null), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), ms); })]);
  } finally { if (timer) clearTimeout(timer); }
}
