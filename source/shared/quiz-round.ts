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
 * A kör utolsó tevékenysége: az utolsó kvízválasz ideje; ennek hiányában (régebbi tárolt kör, feladatkör) a kezdés. A 7 napos korhatár
 * EHHEZ mér: a régen megnyitott, de ma megválaszolt kör eredménye megy.
 */
export function roundActivityAt(round: { startedAt: number; lastAnsweredAt?: number }): number {
  return round.lastAnsweredAt ?? round.startedAt;
}
