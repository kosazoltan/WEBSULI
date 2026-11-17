/**
 * Spec 2026-11-17-eredmeny-email-kviz: a helyi kvíz kérdésenként azonnal visszajelez, ezért a tanuló a „Kvíz kiértékelése” gombot sokszor
 * meg sem nyomja — a kör akkor is kész, ha minden kérdésére van válasz. (A feladatoknál a gomb nélkül nincs visszajelzés.) Import nélküli,
 * tiszta függvény: a kliens eredmény-beküldője (`client/src/lesson-runtime/resultReport.ts`) és az egységteszt is ezt hívja.
 */
/** S1b: a kör megválaszolt kérdéseinek száma (csak a kör saját kérdései számítanak). */
export function answeredCount(round: { ids: readonly string[]; picks: Readonly<Record<string, number>> }): number {
  return round.ids.filter(id => round.picks[id] !== undefined).length;
}

/**
 * S1b (review K1): a 7 napnál régebben kezdett, LE NEM ZÁRT kör utólag nem megy el — a levele már nem a mostani tanulást mutatná, és a
 * mostani párosítás nevére menne. Kezdés nélküli (0) körre nem vonatkozik: az még el sem indult.
 */
export const STALE_ROUND_DAYS = 7;
export function roundTooOld(startedAt: number, now: number): boolean {
  return startedAt > 0 && now - startedAt > STALE_ROUND_DAYS * 86_400_000;
}

export function quizRoundComplete(round: { ids: readonly string[]; picks: Readonly<Record<string, number>> }): boolean {
  return round.ids.length > 0 && round.ids.every(id => round.picks[id] !== undefined);
}
