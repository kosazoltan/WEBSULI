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
 * S1b (review K1): a 7 napnál régebbi, LE NEM ZÁRT kör utólag nem megy el — a levele már nem a mostani tanulást mutatná, és a mostani
 * párosítás nevére menne. A hívó a kör utolsó tevékenységét adja át (`roundActivityAt`). Kezdés nélküli (0) körre nem vonatkozik.
 */
export const STALE_ROUND_DAYS = 7;
export function roundTooOld(startedAt: number, now: number): boolean {
  return startedAt > 0 && now - startedAt > STALE_ROUND_DAYS * 86_400_000;
}

/**
 * R2 (vak ellenőrzés K2): a kör utolsó tevékenysége — az utolsó kvízválasz ideje; ennek hiányában (régebbi tárolt kör) a kezdés. A
 * 7 napos korhatár EHHEZ mér: a régen megnyitott, de ma megválaszolt kör eredménye megy.
 */
export function roundActivityAt(round: { startedAt: number; lastAnsweredAt?: number }): number {
  return round.lastAnsweredAt ?? round.startedAt;
}

/**
 * PR #510: a pillanatkép küldésének állapota — KÖRHÖZ kötve (új kör tiszta lappal indul). `sent`: a szerver által elfogadott legutóbbi
 * állapot; `pending`: az éppen úton lévő kérés. Küldendő, ha van válasz, és ugyanarra a körre sem az elfogadott, sem az úton lévő
 * állapot nem fedi (a sikertelen küldés után a `pending` törlődik, így az állapot újrapróbálható).
 */
export type SnapshotMark = { roundId: string; count: number };
export type SnapshotState = { sent: SnapshotMark | null; pending: SnapshotMark | null };
export function snapshotDue(state: SnapshotState, roundId: string, count: number): boolean {
  if (count <= 0) return false;
  const covered = (mark: SnapshotMark | null) => mark !== null && mark.roundId === roundId && mark.count >= count;
  return !covered(state.sent) && !covered(state.pending);
}

export function quizRoundComplete(round: { ids: readonly string[]; picks: Readonly<Record<string, number>> }): boolean {
  return round.ids.length > 0 && round.ids.every(id => round.picks[id] !== undefined);
}

/**
 * Terv R24 (gépi vak ellenőrzés, 2. célzott kör L1 / L2): a végleges beküldések tartós kimenő sora. A sor kulcsa a böngésző tárolójában;
 * laponként (oldalbetöltésenként) körönként legfeljebb ennyi kísérlet; a kísérletek közti késleltetés a 429-es válasz `Retry-After`
 * ideje (legalább 1 s), ennek hiányában növekvő: 30 s, 60 s, … legfeljebb 5 perc — azonnali ismétlés nincs.
 */
export const RESULT_OUTBOX_KEY = "websuli:result-outbox:v1";
export const OUTBOX_MAX_ATTEMPTS = 3;
export function outboxRetryDelayMs(attempts: number, retryAfterSec?: number): number {
  if (retryAfterSec !== undefined && Number.isFinite(retryAfterSec)) return Math.max(1000, Math.round(retryAfterSec * 1000));
  return Math.min(300_000, 30_000 * 2 ** Math.max(0, attempts - 1));
}
