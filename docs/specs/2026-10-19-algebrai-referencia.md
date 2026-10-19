# Algebrai (betűs) végeredmény a típusos pontozóban

Állapot: tulajdonosi hibajelzés 2026-10-19:
> „A tananyagkészítő mindig elbukik az ellenőrzésen, nem tud lefutni. Javítsd a futást, keresd meg a gyökérokokat, és gondoskodj
> róla, hogy a továbbiakban ilyen ne forduljon elő.”

A képen: „Kéttagú kifejezések négyzete” (matematika, 9. osztály), megállt: *lektorálás: experience.tasks[29]: a rubrikák
továbbra sem követelik a teljes eredményt*.

## Mérés (Render-napló, futás `a3ede678`, job `1a59d96a`, 2026-10-19 12:10–12:26 UTC)
- **Mindhárom fejezet bankcsomagja minden kísérletben bukott ugyanazon:** „a(z) a rész referenciaértéke („x² + 10x + 25” /
  „4x^2 - 4x + 1” / „2a² + 20a + 50”) nem értelmezhető”.
- **Gyökérok 1 — a típusos pontozó csak számot ért:** a `shared/answer-value.ts` kifejezésnyelve (`parseReferenceExpression`)
  csak számot, törtet és műveleti jelet ismer, betűt nem.
  - Az algebrai leckében (kifejtés, szorzattá alakítás) minden végeredmény betűs kifejezés, így a `typedAnswers` mindig
    érvénytelen.
- **Gyökérok 2 — a kerülőút nem tud teljes eredményt követelni:**
  - A szerző a végeredményt `required`-csoportokba bontja (pl. `[a],[4]` az „ab + 4b”-hez).
  - A lektor ezt helyesen blokkolja („a rubrikák nem követelik a teljes eredményt”), de a javító kör ugyanoda jut, mert a
    szócsoport-pontozó a polinomot nem tudja kifejezni.
  - A futás így minden algebrai leckén szükségszerűen megáll.
- **Mellékes, nem gyökérok:**
  - egyszeri JSON-hiba a modell válaszában (újrapróbálva);
  - „fordított irány” válaszkulcs-teszt (a rubrika-javítás része).

## Cél
1. **Új típusos fajta: `kind: "polynomial"`.** Betűs (egy- vagy többváltozós) kifejezés, egész, tizedes vagy tört együtthatóval.
   - Jelölések: `²`, `³`, `^n`, implicit szorzás (`2ab`, `3(x+1)`), zárójel, zárójeles kifejezés hatványa (`(x+5)²`).
   - Az egyenlőség a kifejtett, összevont normálalakon dől el (tagsorrend, szóköz, `·` / `*` / `−` jelölés nem számít).
2. **Kért alak (`form`):**
   - `expanded` (alapértelmezés a polinomnál): a válaszban kifejtett, összevont alak kell; a zárójeles (a kérdés másolata)
     nem elég.
   - `factored`: szorzattá alakított (zárójeles) alak kell; a kifejtett nem elég.
   - `any`: értékazonos alak.
3. **Referencia-ellenőrzés:** a `value` legyen érvényes polinom. Ha a kérdésben pontosan annyi zárójeles betűs kifejezés van,
   ahány polinom-rész, azok kifejtése egyezzen a referenciával (a hibás kifejtés csomaghiba).
4. **Pontozási szerződés:** `LESSON_SCORING_VERSION` 3.
   - Polinomot tartalmazó lecke → `scoringVersion` 3.
   - A többi típusos lecke 2-n marad (a régi, már megnyitott kliens nem kap fölöslegesen 409-et).
5. **Utasítások:**
   - Szerző (`experience-builder`, `role-skills`, `lesson-experience-score`, `lesson-experience`): betűs végeredmény →
     `typedAnswers` `kind: "polynomial"`, nem `required`-csoport.
   - Lektor (`role-skills`, `support-skills`): a polinomos típusos mező a teljes eredményt követeli — nem blokkolandó azon,
     hogy a tagok nincsenek `required`-ben.
   - Mindkét séma (`openTaskSchema`, `bank-schema` strict) ismeri az új fajtát és alakot.

## Nem-cél
- Egyenlet / egyenlőtlenség megoldása, gyökös vagy racionális törtkifejezés (osztás csak számmal).
- A futás körlimitjeinek változtatása.
- A megállt draft adatbázisos módosítása: a „Folytatás” gombbal folytatható.

## Elfogadás (EARS)
- **Referencia:** HA a referencia „x² + 10x + 25”, „4x^2 - 4x + 1”, „2a² + 20a + 50” vagy „ab + 4b”, AKKOR értelmezhető, és
  nem kerül csomaghibába.
- **Kifejtett alak:** HA a tanuló „x^2+10x+25”-öt, „25 + 10x + x²”-et vagy „x·x + 10x + 25”-öt ír (`expanded`), AKKOR
  helyes.
  - HA „(x+5)²”-et vagy „x² + 10x + 52”-t ír, AKKOR hibás.
- **Szorzattá alakított alak:** HA `factored`, AKKOR az „(x+5)²” és az „(x+5)(x+5)” helyes, az „x² + 10x + 25” hibás.
- **Hibás kifejtés:** HA a kérdés „(x+5)²”, a referencia pedig „x² + 5x + 25”, AKKOR a referencia-ellenőrzés problémát jelez.
- **Pontozási verzió:** HA a lecke polinomot tartalmaz, AKKOR `scoringVersion` 3; a csak számos típusos lecke 2 marad.
- **Régi lecke:** a meglévő teljes unit-tesztkészlet zöld.
