/**
 * J0b — a `play/` egyetlen falióra-forrása.
 *
 * A determinizmus-őr (`T/game-sim-determinism-guard.test.ts`) a `reviewQueue.ts` és a `questionDirector.ts` fájlban tiltja
 * az órát, mert a menet KÖZBENI döntések (sorrend, ütemezés, ismétlés a 3.–6. kérdésben) csak a kérdés-sorszámtól, a
 * kapott sim-időtől és a seedelt RNG-től függhetnek. A menetek KÖZÖTTI térköz (box 0 → 1 nap → 3 → 7 → 21 nap, terv 6.2)
 * viszont valódi naptári idő — azt a hívó adja `now`-ként; ha nem adja, ez az alapérték. Tesztben és szimulációban mindig
 * rögzített `now`-t adj át.
 */
export function wallClockMs(): number {
  return Date.now();
}
