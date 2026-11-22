/**
 * Sütött blokk-árnyék a Kockavadász telefonos grafikai szintjeire (terv: docs/specs/2026-11-17-kockavadasz-telefon-gyors.md, 3/a).
 *
 * Az árnyéktérkép képpontonként több mintavételbe kerül; telefonon ehelyett a világ építésekor kockánként egyszer eldől, hogy a
 * nap felől takarja-e valami, és a kocka példányszíne ennek megfelelően sötétebb. A nap a jelenetben ≈ 45° magasan, a −z irány
 * felől süt (`sunDir = (0.06, 0.72, −0.7)`), ezért a bejárás a rácson átlósan lépked: (x, y + k, z − k).
 */

/** Mi áll egy cellában a fény útjában: 0 = semmi, 1 = lomb (átszűri a fényt), 2 = tömör blokk. */
export type SunOccluder = 0 | 1 | 2;

/** 0 = napos, 1 = lombszűrte félárnyék, 2 = árnyék. */
export type SunShade = 0 | 1 | 2;

/** A példányszín szorzója árnyalatonként (a hűvösebb árnyék az égbolt szórt fényét idézi). */
export const SUN_SHADE_TINT: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [0.58, 0.62, 0.72],
  [0.46, 0.5, 0.62],
];

/**
 * A (x, y, z) kocka árnyalata. `occluderAt` a rácson kívül 0-t adjon; `maxY` a világ magassága (a bejárás felső határa).
 * Legfeljebb `maxY − y − 1` lépés, foglalás nélkül.
 */
export function sunShadeAt(
  occluderAt: (x: number, y: number, z: number) => SunOccluder,
  x: number,
  y: number,
  z: number,
  maxY: number,
): SunShade {
  let shade: SunShade = 0;
  for (let k = 1; y + k < maxY; k++) {
    const o = occluderAt(x, y + k, z - k);
    if (o === 2) return 2;
    if (o === 1) shade = 1;
  }
  return shade;
}
