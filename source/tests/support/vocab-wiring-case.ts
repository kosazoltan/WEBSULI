/**
 * A szóbank-bekötés őr-tesztjének esetleírása (végrehajtás S1/12. lépés; `vocab-game-wiring.test.ts`).
 * Minden játékszelet (S6, S8–S12) a SAJÁT esetfájljában állítja `wired: true`-ra, amikor beköti a szóbankot.
 *
 * - `page`: a lap fájlneve a `client/src/pages/` alatt.
 * - `manualBank`: a kézi angol bank azonosítója — mindig meg kell maradnia (terv 2. szakasz).
 * - `materialFirstFile`: ha a tananyag-ág nem a lapon van, a fájl útvonala a `client/src/` alatt (Tornado).
 *   A sorrend-ellenőrzés (tananyag-ág a szóbank-hívás előtt) ebben a fájlban fut; alapértelmezés a lap.
 * - `materialFirst`: a tananyag-ág mintája; alapértelmezés `/pickUnseenMaterial\(/`.
 */
export type VocabWiringCase = {
  page: string;
  wired: boolean;
  manualBank: RegExp;
  materialFirstFile?: string;
  materialFirst?: RegExp;
};
