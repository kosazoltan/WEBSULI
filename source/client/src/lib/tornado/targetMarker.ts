/**
 * G-9b — céljelző a tornádóhoz.
 *
 * Élesben mérve (2026-09-07, Pixel 7): a HUD azt írja ki, hogy „Menj közelebb a
 * tornádóhoz!", a cél 3,25 km-re van, az álló telefon vízszintes látószöge
 * viszont csak ~33°. Ha a cél nem pont előre esik, a gyerek nem látja, és azt
 * sem tudja, merre forduljon — húsz másodperc vezetés után 3,47-ről 3,25 km-re
 * jutott, félig véletlenül. Ez nem ügyességi kihívás, hanem hiányzó információ.
 *
 * A megoldás az, amit az üldözős játékok is használnak: nyíl a képernyő szélén,
 * ami a képen kívüli cél felé mutat, és eltűnik, amint a cél úgyis látszik.
 *
 * A szögtan külön modulban él, mert ez az a fajta kód, ami elsőre mindig
 * elfordul 90 vagy 180 fokkal, és a képernyőn nézve nehéz eldönteni, melyik.
 */

/**
 * A cél iránya a jármű orrához képest, fokban.
 *
 * −180..180: a pozitív jobbra, a negatív balra. A kör átfordulását kezeli, hogy
 * 350°-ról 10°-ra ne „340 fok balra" jöjjön ki.
 */
export function relativeBearingDeg(headingDeg: number, targetBearingDeg: number): number {
  const diff = ((targetBearingDeg - headingDeg + 540) % 360) - 180;
  // A −180 és a 180 ugyanaz az irány; a pozitívat adjuk vissza, hogy a
  // „pontosan hátul" eset determinisztikus legyen.
  return diff === -180 ? 180 : diff;
}

export type TargetMarker = {
  /** Kell-e nyilat rajzolni. */
  visible: boolean;
  /** Melyik képernyőszélre. */
  side: "left" | "right";
  /** A cél iránya a jármű orrához képest (−180..180). */
  angleDeg: number;
};

export function targetMarker(input: {
  /** A jármű iránya fokban (0 = észak). */
  heading: number;
  /** A cél iránya fokban (0 = észak). */
  targetBearing: number;
  /** A kamera vízszintes látószögének FELE, fokban. */
  halfFovDeg: number;
}): TargetMarker {
  const angleDeg = relativeBearingDeg(input.heading, input.targetBearing);

  return {
    // Ha a cél a látómezőben van, a nyíl csak zavarna: ott a tornádó maga.
    visible: Math.abs(angleDeg) > input.halfFovDeg,
    side: angleDeg >= 0 ? "right" : "left",
    angleDeg,
  };
}
