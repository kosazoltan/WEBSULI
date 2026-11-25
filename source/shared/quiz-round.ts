/**
 * Spec 2026-11-17-eredmeny-email-kviz: a helyi kvíz kérdésenként azonnal visszajelez, ezért a tanuló a „Kvíz kiértékelése” gombot sokszor
 * meg sem nyomja — a kör akkor is kész, ha minden kérdésére van válasz. (A feladatoknál a gomb nélkül nincs visszajelzés.) Import nélküli,
 * tiszta függvény: a kliens eredmény-beküldője (`client/src/lesson-runtime/resultReport.ts`) és az egységteszt is ezt hívja.
 */
export function quizRoundComplete(round: { ids: readonly string[]; picks: Readonly<Record<string, number>> }): boolean {
  return round.ids.length > 0 && round.ids.every(id => round.picks[id] !== undefined);
}

/**
 * Eredmény-e-mail B1b (docs/specs/2026-11-22-eredmeny-email-bontas.md; R2): a 7 napnál régebbi, LE NEM ZÁRT kör utólag nem megy el —
 * a levele már nem a mostani tanulást mutatná. A hívó a kör utolsó tevékenységét adja át (`roundActivityAt`). Kezdés nélküli (0) körre
 * nem vonatkozik.
 */
export const STALE_ROUND_DAYS = 7;
export function roundTooOld(activityAt: number, now: number): boolean {
  return activityAt > 0 && now - activityAt > STALE_ROUND_DAYS * 86_400_000;
}

/**
 * A kör utolsó ISMERT tevékenysége: az utolsó kvízválasz ideje. A 7 napos korhatár EHHEZ mér: a régen megnyitott, de ma megválaszolt
 * kör eredménye megy. Ha nincs rögzítve (a régi kliens tárolta a kört, vagy feladatkör), a kor ISMERETLEN → 0: az ilyen kör nem
 * minősül elavultnak, a régi küldési viselkedés marad (1. vak kör L1 — a kezdés ideje nem bizonyítja, hogy a válasz régi).
 */
export function roundActivityAt(round: { lastAnsweredAt?: number }): number {
  return round.lastAnsweredAt ?? 0;
}

/** B5b (docs/specs/2026-11-25-eredmeny-email-b5b.md): a kör megválaszolt kérdései (csak a kör kérdései számítanak). */
export function answeredCount(round: { ids: readonly string[]; picks: Readonly<Record<string, number>> }): number {
  return round.ids.reduce((n, id) => n + (round.picks[id] !== undefined ? 1 : 0), 0);
}

/** A pillanatkép-küldés állapota: a körre legutóbb ELFOGADOTT (2xx) és az éppen úton lévő pillanatkép. */
export type SnapshotState = { sent: { roundId: string; count: number } | null; pending: { roundId: string; count: number } | null };

/**
 * B5b (4. pont): pillanatkép akkor megy, ha van válasz, és több, mint a körre legutóbb elfogadott ÉS az úton lévő (azonos körben) —
 * ugyanaz az állapot nem megy kétszer, másik kör tiszta lappal indul.
 */
export function snapshotDue(state: SnapshotState, roundId: string, count: number): boolean {
  if (count <= 0) return false;
  if (state.sent?.roundId === roundId && state.sent.count >= count) return false;
  if (state.pending?.roundId === roundId && state.pending.count >= count) return false;
  return true;
}
