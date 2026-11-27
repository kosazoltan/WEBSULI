/**
 * FLAKE-BC-K1-CI: a Kockavadász zárjában a rúnakövek sávjának kiválasztása (tiszta függvény, tesztelhető).
 * A zár alatt a sáv FAJTÁJA (kártya alatti „main” / rúnagombok alatti „below”) nem vált, amíg a korábban választott
 * használható — különben a kártya késői méretváltozása a köveket a tanuló szeme előtt máshová ugrasztja, és a már célzott
 * koppintás üres helyre esik (CI #631: az alsó sávból a kártya alatti sávba ugrottak).
 */
export type StoneBand = { top: number; bottom: number; left: number; right: number; landscape: boolean };
export type StoneBandKind = "main" | "below";

/** A sávba férő kőméret (px) — ugyanaz a képlet, mint a kőelhelyezésé. */
export function stoneBoxOf(b: StoneBand): number {
  return Math.min(84, (b.bottom - b.top - 12) / 2, (b.right - b.left - 16) / 4);
}

/** Legalább ekkora kőméret kell a sávhoz (alatta a kövek nem koppinthatók biztosan). */
export const MIN_STONE_BOX = 26;

export function pickStoneBand(
  cands: { kind: StoneBandKind; band: StoneBand }[],
  prevKind: StoneBandKind | null,
): { kind: StoneBandKind; band: StoneBand } | null {
  const usable = cands.filter((c) => stoneBoxOf(c.band) >= MIN_STONE_BOX);
  const kept = usable.find((c) => c.kind === prevKind);
  if (kept) return kept;
  let best: { kind: StoneBandKind; band: StoneBand } | null = null;
  for (const c of usable) if (!best || stoneBoxOf(c.band) > stoneBoxOf(best.band)) best = c;
  return best;
}
