# S8 — Tanulói eredményesség: tételenkénti helyes-arány a katalógusban (2026-10-06)

Terv: `2026-10-05-tantargyi-tudasbank-terv.md` §5, **S8** sor: „a `lesson_attempts`/`concept_results` bekötése a leckelejátszóba →
tételenkénti eredmény visszaírása a katalógusba (`outcome`) | 0 modell | elfogadás: tételenkénti helyes-arány a katalógusban”.
Előzmény: S1 (`itemFingerprint`), S3 (`catalog_items`, migráció 0022).

## Mért kiindulópont (kódból ellenőrizve)

| Tény | Hely |
|---|---|
| A leckelejátszó a kvíz minden válaszát MÁR szerveroldalon menti: `POST /api/lessons/practice/:id/answer` → `lesson_attempts.answers[questionId] = { pickedIndex, usedHint, correct, answeredAt }` | `source/client/src/lesson-runtime/SavedLessonQuiz.tsx:87`, `source/server/rewards/practice-router.ts:19-24`, `source/server/rewards/lesson-attempts.ts:88-104` |
| A kör lezárása (`finish`) tranzakcióban `completed` státuszt ír, és fogalmankénti (`concept_results`) sort — tételenkéntit NEM | `source/server/rewards/lesson-attempts.ts:114-141` (a `concept_results` insert: `:136-137`) |
| A kör kérdése a publikált lecke kvízének szó szerinti másolata: `prompt = q.question`, `options = q.options`, `correctIndex = q.correctIndex` | `source/server/studio/canonical-quiz-bank.ts:31-41`, `lesson-attempts.ts:62-65`, típus: `source/shared/lesson-attempt.ts:2-6` |
| A katalógus fúziós kvíz-tétele ugyanebből a három mezőből kap lenyomatot (`kind: "quiz"`; a `shape` és a `conceptIds` nem része a kvíz lenyomatának) | `source/server/catalog/fusion-extract.ts:30`, `source/server/catalog/catalog-item.ts:44-51` |
| A katalógus kulcsa `(subject, fingerprint)`; az eredményességnek nincs helye | `source/migrations/0022_subject_catalog.sql`, `source/shared/schema.ts:953-987` |
| A meglévő tételes riport leckén belüli, a kör-kérdés `id`-jére kulcsolt (nem katalógus-kulcs), legfeljebb 1000 kör | `lesson-attempts.ts:142-151` |
| Régi HTML-lecke: az egyetlen eredmény-csatorna a `POST /api/material-result`, amely szabad szöveget (tárgy + törzs) e-mailben továbbít, NEM tárol, és nincs benne tételazonosító | `source/server/routes.ts:904-935`, `source/server/lib/material-result.ts:35-52` |
| A katalógus admin-API-ja szerződés szerint csak olvasó (a teszt tiltja a `post/put/patch/delete`-et és a DB-írást az `admin-routes.ts`-ben) | `source/server/catalog/admin-routes.ts:12-47`, `source/tests/catalog-bank.test.ts:68-74` |
| A katalógus a publikált leckék MINDEN verzióját kinyeri (`lesson:<lessons.id>` provenance) | `source/scripts/catalog/extract-all.mts:18,40` |

Következmény: új tanulói végpont NEM kell; a nyers adat (tételenkénti első válasz) már megvan a `lesson_attempts`-ben. Hiányzik:
(1) a kör-kérdés → katalógus-lenyomat leképezés, (2) a tételenkénti összesítés tárolása, (3) az admin-olvasó mező.

## Cél

1. **Migráció `0023_catalog_item_outcomes.sql`** (additív, idempotens, mint a 0022): új tábla `catalog_item_outcomes`
   `(fingerprint varchar(32) PK, attempts int, correct int, independent_correct int, rate real GENERATED (correct/attempts), updated_at)`.
   Kulcs: a katalógus-tétel tartalmi lenyomata (`catalog_items.fingerprint`) — azonos függvény (S1 `itemFingerprint`), így a kulcsok
   egyeznek.
2. **Determinisztikus leképezés** `server/catalog/outcomes.ts`: `attemptQuestionFingerprint({prompt, options, correctIndex})` =
   `itemFingerprint({ kind: "quiz", prompt, options, correctIndex })`. A kör kérdéséből tehát ugyanaz a lenyomat jön ki, mint a
   fúziós kinyerésből (`fusion-extract.ts:30`) — ezt teszt rögzíti valódi `canonicalLessonQuiz` + `extractFusionLesson` páron.
3. **Rögzítés a lejátszóból (meglévő út)**: a `finishPractice` ugyanabban a tranzakcióban, egy SAVEPOINT-ban növeli a kör
   megválaszolt kérdéseinek számlálóit (`INSERT … ON CONFLICT (fingerprint) DO UPDATE SET attempts = attempts + EXCLUDED.attempts …`).
   A számláló-írás hibája (pl. a migráció még nem futott) a kör lezárását NEM buktatja el: a savepoint visszagörgetődik, a hiba
   naplózódik. A kör csak egyszer zárul (`if (row.result) return` — `lesson-attempts.ts:118`), ezért nincs kettős számolás.
4. **Összesítő job** `scripts/catalog/refresh-outcomes.mts`: a `completed` körökből (kulcs-lapozással) TELJESEN újraszámolja a
   táblát ugyanazzal a tiszta függvénnyel (`roundOutcomes`). Alapból `--dry-run` (csak olvas, összesít: körök, válaszok, lenyomatok,
   ebből hány van a katalógusban); `--write`: egy tranzakcióban `LOCK TABLE catalog_item_outcomes IN EXCLUSIVE MODE` → olvasás →
   `DELETE` → `INSERT` → számellenőrzés a COMMIT előtt. A zár miatt a párhuzamos `finishPractice` számlálása vagy benne van az
   újraszámolásban, vagy utána adódik hozzá — sosem kétszer, sosem vész el.
5. **Admin-olvasó mező**: `GET /api/admin/catalog/outcomes?subject=&minAttempts=` (csak olvasó, `isAuthenticatedAdmin`, a meglévő
   routerben): katalógus-tételek `attempts`, `correct`, `independentCorrect`, `rate` mezővel, helyes-arány szerint növekvő
   sorrendben (a legnehezebb elöl), legfeljebb 200; a `/summary` bankonként `withOutcome` darabot is ad.

## Nem-cél

- Régi (statikus HTML) leckék tételenkénti eredménye: nincs tételazonosítós csatorna (a `material-result` szabad szöveges e-mail,
  nem tárol) — a HTML-ek átírása / új beküldő protokoll külön szelet. **S8 = Studio (fúziós) leckék kvíze.**
- Játékok (`coupon_quiz_answers`, játék-kvíz) és a nyílt feladatok / módszer-tételek eredménye (a lejátszó ezeket nem szerver-
  oldalon értékeli tételenként).
- Tanulónkénti nézet a katalógusban; a katalógus felhasználása a gyártásban (S6); admin-UI.
- Modellhívás: nincs.

## Adatfolyam

```
SavedLessonQuiz.tsx:87  ──POST /api/lessons/practice/:id/answer──▶ answerPractice (lesson-attempts.ts:88)
                                                                    lesson_attempts.answers[q.id] (első válasz, végleges)
SavedLessonQuiz.tsx:94  ──POST /api/lessons/practice/:id/finish──▶ finishPractice (lesson-attempts.ts:114)
        ├─ status = completed, result, concept_results (meglévő)
        └─ SAVEPOINT: roundOutcomes(row) → fingerprint → +attempts/+correct/+independent_correct ─▶ catalog_item_outcomes
scripts/catalog/refresh-outcomes.mts (--write) ── teljes újraszámolás a completed körökből ─▶ catalog_item_outcomes
GET /api/admin/catalog/outcomes ── catalog_items ⋈ catalog_item_outcomes ON fingerprint ─▶ admin (rate, attempts)
```

Számlálási szabály (`roundOutcomes`): csak a lezárt kör **megválaszolt** kérdései számítanak (a kihagyott kérdés nem bizonyíték a
tétel nehézségére; a „befejezés” megválaszolatlan kérdéssel is engedett — `SavedLessonQuiz.tsx:90`). `correct` = az első válasz
helyes; `independent_correct` = helyes ÉS nem kért segítséget (sem `usedHint`, sem `hints[]`). `rate = correct / attempts`.

## Adatvédelem

A katalógusba (az új táblába) csak tartalmi lenyomat + darabszámok + időbélyeg kerül: nincs `user_id`, lecke-azonosító, kör-
azonosító, időpont-sorozat vagy válasz-index. A tanulói sorok (`lesson_attempts`) a helyükön maradnak, a meglévő jogosultsággal.
Az admin-API csak összesített számot ad vissza.

## Edge case-ek

- **Újrapublikált lecke** (új `lessons.id`, új verzió): a kulcs a TARTALOM lenyomata, nem a lecke-azonosító → változatlan kérdés
  ugyanarra a katalógus-tételre gyűlik; megváltozott kérdés (szöveg/opció/kulcs) új lenyomat = új tétel (a régi eredménye nem keveredik
  az újba). Ha a katalógus még nem importálta az új verziót, a számláló már gyűlik, és a következő import után azonnal látszik.
- **Ugyanaz a tartalom több bankban** (`(subject, fingerprint)` két sor): mindkét sor ugyanazt a tartalmi eredményt mutatja (a tanuló
  ugyanarra a szövegre válaszolt).
- **Egy körön belül két azonos tartalmú kérdés**: mindkét válasz számít (két kísérlet).
- **Kör kétszeri lezárása / párhuzamos `finish`**: a `withAttempt` zár + `if (row.result)` miatt egyszer számol.
- **Migráció még nem futott**: a `finish` sikeres, a számláló kimarad (naplózva); a `refresh-outcomes --write` a migráció után
  visszapótolja a teljes múltat.
- **Régi lecke** (`legacy_html:`): nincs eredmény → `attempts` hiányzik az admin-listában (nem 0%).
- **Opció-sorrend**: a kör a lecke sorrendjét használja (nincs keverés, `lesson-attempts.ts:62-65`), így a `correctIndex` egyezik.

## Elfogadás (EARS)

- A `0023_catalog_item_outcomes.sql` minden utasítása `CREATE … IF NOT EXISTS`, nincs `DROP/ALTER/DELETE/TRUNCATE`; kétszer futtatható.
- AMIKOR egy publikált fúziós lecke kvíz-kérdése körbe kerül, a `attemptQuestionFingerprint` értéke MEGEGYEZIK a
  `extractFusionLesson` ugyanazon kérdésre adott katalógus-lenyomatával (teszt).
- AMIKOR egy kör lezárul, a megválaszolt kérdések lenyomatán az `attempts` a megválaszoltak számával, a `correct` a helyesekkel, az
  `independent_correct` a segítség nélkül helyesekkel nő; a megválaszolatlan kérdés nem számít (unit: `roundOutcomes`).
- HA a számláló-írás hibázik, AKKOR a kör lezárása sikeres marad (savepoint, naplózott hiba).
- A `refresh-outcomes` alapból nem ír; `--write` után a tábla összege = a dry-run összege (ellenőrzés a COMMIT előtt).
- Az admin `GET /api/admin/catalog/outcomes` tételenként `rate`-et ad; az `admin-routes.ts` továbbra is csak olvasó (meglévő teszt).
- Az új tábla oszlopai közt nincs felhasználó- vagy lecke-azonosító (teszt a migráció szövegén).
- `npm run check`, `tsc -p tsconfig.test.json`, `npm run lint`, `npm test` zöld.
