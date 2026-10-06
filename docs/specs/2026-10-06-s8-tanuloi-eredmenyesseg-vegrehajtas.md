# Végrehajtás — S8 tanulói eredményesség

Spec: `2026-10-06-s8-tanuloi-eredmenyesseg.md`. Munkakönyvtár: `source/`. Modellhívás nincs. Éles DB-re migrációt NEM futtatunk.

1. **Migráció** — `source/migrations/0023_catalog_item_outcomes.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS catalog_item_outcomes (
     fingerprint varchar(32) PRIMARY KEY,
     attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
     correct integer NOT NULL DEFAULT 0 CHECK (correct >= 0 AND correct <= attempts),
     independent_correct integer NOT NULL DEFAULT 0 CHECK (independent_correct >= 0 AND independent_correct <= correct),
     rate real GENERATED ALWAYS AS (CASE WHEN attempts > 0 THEN correct::real / attempts END) STORED,
     updated_at timestamptz NOT NULL DEFAULT now()
   );
   ```
   Ellenőrzés: 7. lépés tesztje.
2. **Drizzle-séma** — `source/shared/schema.ts`, a `catalogItems` után: `catalogItemOutcomes` (azonos oszlopok; `rate`
   `.generatedAlwaysAs(sql\`…\`)`), típus `CatalogItemOutcomeRow`.
3. **Tiszta függvények** — `source/server/catalog/outcomes.ts`:
   - `attemptQuestionFingerprint(q: Pick<AttemptQuestion, "prompt"|"options"|"correctIndex">): string` = `itemFingerprint({ kind: "quiz", prompt, options, correctIndex })`.
   - `roundOutcomes(row: { questions; answers; hints }): Map<string, Outcome>` — csak megválaszolt kérdés; `Outcome = { attempts, correct, independentCorrect }`.
   - `addOutcomes(into, from)`; `outcomeRecords(map)` → `[{ fingerprint, attempts, correct, independent_correct }]` (lenyomat szerint rendezve).
   - `recordRoundOutcomes(tx, row)` — `INSERT … SELECT FROM jsonb_to_recordset($1) ON CONFLICT (fingerprint) DO UPDATE SET attempts = catalog_item_outcomes.attempts + EXCLUDED.attempts, … , updated_at = now()`; üres körnél nem ír.
4. **Bekötés** — `source/server/rewards/lesson-attempts.ts` `finishPractice`: a `completed` update ELŐTT
   `await tx.transaction(sp => recordRoundOutcomes(sp, { ...row, ... }))` try/catch-ben; hiba → `logger.warn("[PRACTICE] …")`, a kör
   lezárása folytatódik (savepoint-visszagörgetés).
5. **Job** — `source/scripts/catalog/refresh-outcomes.mts`: `--write` nélkül `withReadOnlyDb`; a `completed` körök kulcs-lapozással
   (`WHERE status='completed' AND id > $1 ORDER BY id LIMIT 1000`) → `roundOutcomes` + `addOutcomes`; összesítő (körök, válaszok,
   lenyomatok, katalógus-egyezés) → konzol + `docs/measurements/<nap>-catalog-outcomes.json`. `--write`: `withWriteTransaction`:
   `LOCK TABLE catalog_item_outcomes IN EXCLUSIVE MODE` → ugyanaz az olvasás a zár UTÁN → `DELETE FROM catalog_item_outcomes` →
   kötegelt INSERT → `SELECT sum(attempts), sum(correct)` = a számolt összeg, különben throw (ROLLBACK).
6. **Admin-olvasó** — `source/server/catalog/admin-routes.ts`: `GET /outcomes` (`subject`, `minAttempts` 1–1000, alap 1;
   `innerJoin(catalogItemOutcomes, eq(fingerprint))`, rendezés `rate ASC, attempts DESC`, limit 200); `/summary`-ban bankonként
   `withOutcome`. Csak `db.select`.
7. **Tesztek** — `source/tests/catalog-outcomes.test.ts` (új):
   - valódi lecke-fixture-ből `canonicalLessonQuiz` → `attemptQuestionFingerprint` halmaza = `extractFusionLesson` kvíz-lenyomatai;
   - `roundOutcomes`: megválaszolatlan kimarad; segítség (usedHint / hints[]) → `correct` igen, `independentCorrect` nem; azonos tartalmú két kérdés → 2 kísérlet;
   - migráció-szöveg: csak `CREATE … IF NOT EXISTS`, nincs romboló utasítás, nincs `user_id`/`lesson_id` oszlop, a PK a `fingerprint`;
   - forrás-szerződés: `finishPractice` savepointban hívja a `recordRoundOutcomes`-t és elkapja a hibát; a job alapból nem ír, zárol, ellenőriz a tranzakción belül; az admin `/outcomes` bekötve.
   Futtatás: `npm.cmd test`, `npm.cmd run check`, `npx.cmd tsc --noEmit -p tsconfig.test.json`, `npm.cmd run lint`.
   Ha Docker elérhető: `npm.cmd run test:learning-db` (a `drizzle-kit export` a sémából létrehozza az új táblát; a meglévő
   integrációs teszt mellé új teszt: lezárt kör után a számlálók).
8. **Mérés** — `npx.cmd tsx scripts/catalog/refresh-outcomes.mts` (dry-run, csak olvas) az éles DB-n: a kiinduló darabszámok a
   spec mellé (`docs/measurements/2026-10-06-catalog-outcomes.json`).

Nem változik: a leckelejátszó UI (`SavedLessonQuiz.tsx`) — ezért Playwright-futás nem kell.
