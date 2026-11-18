import { addDistance, completeLevel, type TornadoProgress } from "./progress";

/** A `completeLevel` bemenete (a futás eredménye). */
export type RunLevelResult = Parameters<typeof completeLevel>[1];

/**
 * S12 / review #433 (Vercel): a futás végi mentés tiszta függvénye, a LEGFRISSEBB haladásra alkalmazva
 * (funkcionális állapotfrissítésben hívandó). A győzelem a horgonyzás után 2,6 s-mal, játékórán érkezik; ha közben a
 * játékos a szünet menüben grafikát / balkezes módot váltott, vagy egy válasz statisztikája bekerült, azt egy korábbi
 * pillanatképből számolt mentés visszaírná. Itt csak a távolság és (győzelemnél) a szint eredménye adódik hozzá.
 */
export function applyRunResult(
  latest: TornadoProgress,
  distanceKm: number,
  won: RunLevelResult | null,
): TornadoProgress {
  const withDistance = addDistance(latest, distanceKm);
  return won ? completeLevel(withDistance, won) : withDistance;
}
