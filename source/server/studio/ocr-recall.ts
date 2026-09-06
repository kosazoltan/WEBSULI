/**
 * #190 — kulcs-token recall mérése OCR-átiratokon.
 *
 * Miért él ez a repóban, és nem egy eldobható szkriptben: az OCR-modell
 * választását egy MÉRT szám indokolja (96,3% vs 88,2%). Ha a mérő kódja kívül
 * marad, a szám egy commit-üzenetbeli állítás, amit senki nem tud újrafuttatni.
 *
 * MÉRVE (2026-09-06): az első változatom 76%-ot mutatott, miközben az átiratban
 * ott volt az `a·ma / 2` és a `T₁` — a `·` szorzásjelet és az Unicode alsó
 * indexeket nem kezelte, így a modell HELYES válaszát számolta hibának. Egy
 * hazug mérő rosszabb, mint a mérés hiánya: ez a modellválasztást döntötte
 * volna el rossz irányba.
 */

/** Magyar matek-kézíráshoz igazított normalizálás a token-egyezéshez. */
export function normalizeForRecall(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD") // NFKD: a `T₁` -> `T1`, `²` -> `2` bontáshoz is kell
    .replace(/[\u0300-\u036f]/g, "") // ékezetek: az OCR ingadozik rajtuk
    .replace(/π/g, "pi")
    .replace(/[·⋅×*]/g, "") // szorzásjel: `a·ma` és `a ma` ugyanaz a tartalom
    .replace(/[,](?=\d)/g, ".") // magyar tizedesvessző -> pont
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

/**
 * A referencia kulcs-tokenjeinek visszanyerési aránya (recall).
 *
 * Szándékosan recall, nem szó szerinti egyezés: kézírásnál a sortörés és a
 * tördelés ingadozik, de a tartalmi kulcselemnek (képlet, szám, szakszó) meg
 * kell jelennie. A precision itt félrevezetne — a modell jogosan ír le olyat is,
 * amit a referencia-listába nem vettünk fel.
 *
 * A `|` a tokenben ALTERNATÍVÁKAT jelöl (`"2r|2*r|2 r"`): bármelyik találat
 * elég. MÉRVE (2026-09-06): egy alternáció-kezelés NÉLKÜLI változat 52%-ot
 * mutatott a valós 93% helyett, mert a `"2r|2*r|2 r"`-t szó szerinti szövegként
 * kereste — és ezzel a modell-rangsort is felcserélte volna.
 */
export function keyTokenRecall(
  transcript: string,
  keyTokens: readonly string[],
): { recall: number; missing: string[] } {
  if (keyTokens.length === 0) return { recall: 1, missing: [] };
  const haystack = normalizeForRecall(transcript);
  const missing = keyTokens.filter(
    (token) =>
      !token
        .split("|")
        .map(normalizeForRecall)
        .some((alt) => alt.length > 0 && haystack.includes(alt)),
  );
  return { recall: (keyTokens.length - missing.length) / keyTokens.length, missing };
}
