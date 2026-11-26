/**
 * TANANYAG-GYAKORLATI P3 (docs/specs/2026-11-26-tananyag-gyakorlati-p3-vegrehajtas.md): a gyártás minden útjának (tervező, szerző,
 * bankcsomag, közös tananyagmódszer, HTML-specifikáció) közös gyakorlatiassági szabálya. Tulajdonosi döntés (2026-11-26): a kész
 * lecke kvízbankjában és nyílt feladatbankjában külön-külön 60–75% igazolt alkalmazás, célérték kétharmad; a feladatlapra (pontozás,
 * feladattípus, szerkezet) vonatkozó kérdés tilos. A mérés: shared/practice-policy.ts (P1), a kapu: P4.
 */

/** Tanítás: példa → a szükséges fogalom röviden → a tanuló a következő példán cselekszik. */
export const PRACTICE_TEACHING_RULE =
  "GYAKORLATIASSÁG (tanítás): mutass egy konkrét példát, nevezd meg röviden azt a fogalmat vagy szabályt, amely a megoldáshoz kell, " +
  "majd a következő példán a tanuló válasszon, egészítsen ki, javítson, számoljon vagy döntsön. A fogalmi tudás annyi legyen, " +
  "amennyi az alkalmazáshoz kell — besorolás, felsorolás és definíció-magolás önmagáért ne legyen cél. Indoklást akkor kérj a " +
  "tanulótól, ha az ok felismerése maga a tanulási cél; a legtöbb zárt feladat után elég a helyes megoldáshoz adott rövid magyarázat.";

/** Bank (kvíz + nyílt feladat): kétharmad alkalmazó tétel, meta-tilalom, tantárgyfüggetlen mintapéldák. */
/** TG-P2a: a forrásállomás hatóköre — a pontozási / adminisztratív szöveg nem fogalom (a program `adminConceptProblem`-mel méri). */
export const SOURCE_SCOPE_RULE =
  "FORRÁS-HATÓKÖR: a példamondatot, adatot, műveletet és tanított szabályt emeld ki fogalomként; a javítókulcs helyes alakja a megoldás ellenőrzésére szolgál. A pontérték, sorszám, időkeret és a lap felépítése NEM tanítandó fogalom (a program elutasítja). A vegyes sor (pl. „Elfogadható: osz-tály — 1 pont”) érdemi részét (osz-tály) őrizd meg.";

export const PRACTICE_BANK_RULE =
  "GYAKORLATIASSÁG (bank): a kvízbank és a nyílt feladatbank külön-külön kb. kétharmada (60–75%) ALKALMAZÓ tétel legyen — a tanuló " +
  "konkrét mondaton, adaton, helyzeten vagy példányon dönt, kiegészít, javít, számol vagy a tanultat egy leírt helyzetre alkalmazza; " +
  "a többi a szükséges fogalmi tudás (jelentés, szabály, név) felidézése. Mintapéldák: a helyzethez illő szólás / közmondás " +
  "kiválasztása, vagy egy mondatba illesztett mondás hiányzó szavának pótlása a mondat értelméből (a szólás és a közmondás " +
  "megkülönböztetése helyett; a puszta, emlékezetből való szópótlás fogalmi tétel); a helyes elválasztás " +
  "kiválasztása vagy javítása (a „miért így” helyett); „Csak A / Csak B / Mindkettő helyes” döntés két alakról; konkrét adatos számolás; " +
  "kísérletben az állandó változó kiválasztása; két forrásrészletből az állítást alátámasztó kiválasztása. TILOS a feladatlapra vagy a " +
  "felvételire vonatkozó kérdés: pontozás, pontszám, feladattípus, a feladatsor felépítése vagy sorrendje, „a feladatban X és Y van” — " +
  "a kérdés mindig a tanított tartalomra vonatkozik.";
