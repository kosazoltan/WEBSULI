# S4 — a rubrika-szigorítás mérhetősége és automatikus lazítása

Állapot: tulajdonosi döntés 2026-10-20 (kérdés–javaslat kör):
- **Mérhetőség:** „Jelölés + feladatszintű eredmény”.
- **Ha a szigorítás túl szigorú:** „Automatikus lazítás”.

Előzmény: S3c (#338, `docs/specs/2026-10-20-eroforras-s3c-rubrika-szigoritas.md`).

## Probléma (mért, fájl:sor)
- **A szigorítás nincs nyilvántartva.** `shared/answer-key-calibrate.ts` `tighten()` kötelező csoportot vesz fel, de a leckében nem
  marad nyoma, és a futás telemetriája (`shared/run-telemetry.ts` `RunGates`) sem számolja.
- **Csak körszintű eredmény van.** A tanulói feladateredmény körönként egy százalék (`lesson_result_emails.percent`), feladatonként
  semmi. A `server/lesson-result-email.ts` `/:lessonId/results` a kört a szerveren újrapontozza (`gradeTasks`, a döntőbíró
  gyorsítótárazott ítéletével), de csak a levélhez használja.
- **Következmény:** nem mérhető, hogy egy szigorított csoport elutasít-e helyes tanulói választ, és nincs mód automatikusan
  visszalépni.

## Pontosítás a tulajdonosi döntéshez (lazítási jel)
- **Miért nem a részpont-arány a jel:** a kérdésben javasolt példa („20 kitöltés után 40 % részpont”) elvetendő. A szigorítás pont
  azért van, hogy a fordított irányú (HIBÁS) választ elutasítsa; sok részpont ott helyes működés is lehet.
- **A jel a „téves elutasítás”:** a determinisztikus pontozó nem adott teljes pontot; a hiányzó kötelező csoportok MIND a
  szigorítással felvettek közül valók; és a döntőbíró (Opus) a választ teljes pontra emelte.
- **A küszöb a tulajdonos példája szerint:**
  - legalább 20 megválaszolt kör az adott feladatra;
  - a téves elutasítások aránya legalább 40 %.
  - Konstansok, egy helyen.

## Cél (három szelet)
### S4a — jelölés és számláló
- **A feladat jelölése:** az `openTaskSchema` új, opcionális mezője: `tightened: string[][]` — a szigorítással felvett kötelező
  csoportok. Régi lecke: nincs mező, a viselkedés változatlan.
- **A kalibráció beállítja:** `calibrateRubric` beírja a csoportot a feladatba. Csak a ténylegesen bent maradt csoportot: ha egy
  későbbi lépés bónuszba sorolja, onnan kikerül.
- **Telemetria:** új számláló, `gates.rubricTightened` = a közzétett bank szigorított feladatainak száma. Megjelenik a futás
  nézetében is (`telemetryLines`).
### S4b — feladatszintű tanulói eredmény (névtelen)
- **Új tábla:** `task_results` (migrations/0037 + Drizzle-séma). Oszlopai:
  - `lesson_id` (FK, cascade), `task_id`, `round_key`;
  - `det_state`, `final_state`, `arbiter_raised`, `tightened_only_miss`, `created_at`.
  - Egyedi kulcs: `(lesson_id, task_id, round_key)`.
- **Adatvédelem:** NINCS tanulói szöveg, NINCS felhasználó-azonosító.
- **Rögzítés:** a `/:lessonId/results` (`kind = "tasks"`) a szerveres pontozás soraiból rögzít, a levélküldéstől függetlenül; a hiba
  csak naplózódik, a választ nem rontja.
- **Ismétlés:** az azonos kör (roundKey) újraküldése nem duplikál.
### S4c — automatikus lazítás
- **Mikor fut:** a rögzítés után minden szigorított (`tightened`) feladatra.
- **Feltétel:** `megválaszolt ≥ 20` és `téves elutasítás / megválaszolt ≥ 0,4`.
- **Mit tesz:** tranzakcióban, sorzárral (`for update`):
  - a `tightened` csoportokat a `required`-ből a `bonus`-ba teszi (legalább 1 kötelező csoport marad);
  - törli a `tightened` mezőt, és felveszi a `relaxedTightening: { at, answered, falseRejects }` mezőt;
  - `lessons.version + 1`, naplóbejegyzés.
- **Hatás a tanulóra:** csak emelhet pontot (a csoport bónusz lesz). A folyamatban lévő kör a szerveren a friss leckével pontozódik.
- **Workflow (S7-szabály, `tests/s7-workflow-guard.test.ts`):** élő lecke gépi módosítása csak workflow alatt — új `relax` mód
  (forrás → kapu → alkalmazás → visszaolvasás), `workflowFence` a tranzakcióban.
  - A futás tulajdonosa a lecke gyártója: a tudástár-térkép `createdBy`, különben az anyag `userId`. Ha egyik sincs, nincs lazítás
    (napló).
  - Ha nincs teendő (már lazított), workflow-futás sem indul.

## Nem-cél
- A pontozó (`evaluateOpenAnswer`) és a döntőbíró nem változik.
- Tanulói szöveg vagy felhasználó tárolása.
- A HTML-leckék (nem fúziós) feladatai: a kalibráció ott nem fut.

## Edge case-ek
- **Nincs döntőbírói ítélet** (napi limit vagy hiba): az `arbiter_raised = false`, nem téves elutasítás (konzervatív).
- **Több szigorított csoport:** a téves elutasításhoz az összes hiányzó csoportnak a szigorítottak közül kell lennie.
- **A feladat már nincs a leckében** (újragyártás): a sor nem rögzül.
- **Párhuzamos beküldés:** a lazítás sorzárral fut, és újraolvassa a leckét; ha már lazított (nincs `tightened`), nem tesz semmit.

## Elfogadás (EARS)
- HA a kalibráció szigorít, AKKOR a feladat `tightened` mezője a felvett csoportot tartalmazza, és a futás `rubricTightened` ≥ 1.
- HA egy tanuló beküldi a feladatkört, AKKOR feladatonként egy névtelen `task_results` sor keletkezik; ugyanaz a kör újra
  beküldve nem duplikál.
- HA egy szigorított feladatra ≥ 20 kör jött, és ezek ≥ 40 %-a téves elutasítás, AKKOR a szigorított csoport bónuszba kerül, és
  a lecke verziója nő.
- HA a feltétel nem teljesül, AKKOR a lecke változatlan.

## Kockázat
- **Migráció az éles adatbázison:** új tábla, nincs adatmódosítás. Visszaállítás: a tábla eldobható, a kód nélküle is fut — a
  rögzítési hiba csak napló.
- **Élő lecke automatikus módosítása:** csak bónuszba sorolás, verzióemeléssel, naplóval. A tulajdonos kifejezetten ezt választotta.
