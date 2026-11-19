/**
 * Szökőár — a kérdés-sáv miatti kép-eltolás közös állandói és a „nyugalomban” döntés (terv:
 * docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md 7.7, „A nyugalom-jelző oka”).
 *
 * Tiszta modul (nincs DOM, React, óra): a jelenet (a kirajzolt eltolás csillapítása) és a lap (a `data-layout="settled"` jelző)
 * UGYANEZT használja, így a kettő nem válhat szét (vak visszanézés KICSI 2). A jelző a KIRAJZOLT eltoláshoz kötött, nem
 * időzítőhöz: terhelt gépen a hosszú képkockák miatt egy rögzített idő előbb lejárt, mint ahogy a kép megnyugodott (KICSI 1).
 */

/** Az eltolás csillapítási rátája (1/s): ~300 ms alatt < 1 % marad hátra. */
export const SHIFT_DAMPING = 16;
/** Ennél kisebb eltérésnél (px) a kirajzolt eltolás „megérkezett”. */
export const SHIFT_SETTLED_PX = 1;
/**
 * A csillapítás lépésköze legfeljebb ennyi (s). A játékmenet `dt`-je 50 ms-ra vágott; az eltolás a valós eltelt idővel lép, hogy
 * lassú képkockáknál is ~300 ms falióra alatt beálljon — egy hosszú megakadás (pl. háttérbe tett lap) után sem ugrik túl.
 */
export const SHIFT_MAX_STEP_S = 0.25;

/** Exponenciális közelítés: `current` → `target`, `dt` másodperc alatt. */
export function dampShift(current: number, target: number, dt: number): number {
  const step = Math.min(SHIFT_MAX_STEP_S, Math.max(0, dt));
  return target + (current - target) * Math.exp(-SHIFT_DAMPING * step);
}

/**
 * A kirajzolt eltolás megérkezett-e a kívánthoz. Ha nincs kirajzolt érték (WebGL nélküli tartalék: nincs jelenet, amely
 * visszaírná), az eltolás azonnalinak számít.
 */
export function isShiftSettled(shownPx: number | null | undefined, targetPx: number): boolean {
  if (shownPx === null || shownPx === undefined || !Number.isFinite(shownPx)) return true;
  return Math.abs(shownPx - targetPx) < SHIFT_SETTLED_PX;
}
