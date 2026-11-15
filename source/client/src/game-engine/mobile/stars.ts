/**
 * S2 / terv 4.5 — az eredményképernyő 1–3 csillaga.
 *
 * Arány = jó válaszok / összes. 3 csillag csak győzelemmel és ≥ 90 %-kal jár; ≥ 70 % → 2; különben 1.
 * Nulla csillag nincs: a gyerek a próbálkozásért is kap egyet.
 */
export function computeStars(i: { correct: number; total: number; won: boolean }): 1 | 2 | 3 {
  const ratio = i.total > 0 ? i.correct / i.total : 0;
  if (i.won && ratio >= 0.9) return 3;
  if (ratio >= 0.7) return 2;
  return 1;
}
