Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` (P3 — gyakorlatiasabb tanítás és feladatminták)

# Végrehajtás — TG-P3

Tulajdonosi döntés (2026-11-26): a kész lecke kvízbankjában és nyílt feladatbankjában KÜLÖN-KÜLÖN 60–75% igazolt alkalmazás, célérték
kétharmad; meta-kérdés (a feladatlap / felvételi pontozása, feladattípusai, szerkezete) nem kerülhet a leckébe. A P3 a GYÁRTÁS
utasításait igazítja ehhez (a mérőkapu a P4).

1. Közös szöveg: `source/shared/practice-rules.ts` — `PRACTICE_TEACHING_RULE` (tanítás: konkrét példa → a szükséges fogalom röviden →
   a tanuló a következő példán dönt / kiegészít / javít / számol; indoklást csak ott, ahol az ok felismerése a tanulási cél) és
   `PRACTICE_BANK_RULE` (bank: kb. kétharmad alkalmazó tétel konkrét példán, a maradék a szükséges fogalmi tudás; meta tilos;
   tantárgyfüggetlen mintapéldák: szólás-kiegészítés / helyzethez illesztés, helyes elválasztás, „csak A / csak B / mindkettő”
   döntés, konkrét adatos számolás, kísérleti változó, forrásrészlet és állítás).
2. Bekötés: a szerző (`buildAuthorPrompt` CÉL-TANANYAG MINTA; az „Ellenőrzés” fejezet önellenőrzése „miért ez következik?”
   kérdéssor helyett új példán végzett lépéssor), a tervező (`buildPedagoguePrompt`), a bankcsomag-szerződés (`bankPacketContract`
   11. pont), a közös tananyagmódszer (`LESSON_METHOD_CONTRACT` kvíz-pontja), a játékos kérdezés (`selfCheck` = új példán végzett
   önellenőrzés; „Magyarázd el, miért…” csak ahol az ok a tananyag), a HTML-specifikáció (Tananyag panel: „a szükséges fogalmi tudás
   és annak alkalmazása” a „Részletes lexikális tudás” helyett).
3. Bukó teszt: `source/tests/practice-rules.test.ts` — a ténylegesen összeállított promptok (szerző, tervező, bankcsomag, közös
   módszer, HTML-specifikáció) tartalmazzák a gyakorlatiassági szabályt és a meta-tilalmat; a szerzői prompt nem kér „miért ez
   következik?” önellenőrző kérdéssort; a játékos szerződés `selfCheck`-je nem „magyarázd el, miért”.
4. A `tananyag-keszito` és a `tananyag-javito` skill (mindhárom tükör) a szabályt követi (TANANYAG-SKILL).

Állapot: TG-P3 3/3 egység kész — következő: kapulánc, PR
