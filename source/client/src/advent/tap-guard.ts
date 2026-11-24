/**
 * Adventi naptár — a „Tovább” utáni rövid védőidő szabálya (docs/specs/2026-11-18-adventi-naptar.md 16.5; vak ellenőr KICSI-4).
 * A védőidő a dupla koppintás MÁSODIK felét nyeli el: az ugyanarra a pontra érkezik, ahol a „Tovább” volt. A máshová (másik
 * ablakra) irányuló szándékos koppintás átmegy. Billentyűs / Escape-es zárásnál a fókusz a megnyitó ablakra tér vissza, ezért ott
 * csak az arra érkező ismételt Enter nyelődik el.
 */
export const GUARD_RADIUS_PX = 32;

export type GuardPoint = { x: number; y: number };
export type GuardTap = { pointer: boolean; x: number; y: number };

export function guardSwallows(point: GuardPoint | null, tap: GuardTap, isOpener: boolean): boolean {
  if (!tap.pointer) return isOpener;
  if (!point) return false;
  return Math.hypot(tap.x - point.x, tap.y - point.y) <= GUARD_RADIUS_PX;
}
