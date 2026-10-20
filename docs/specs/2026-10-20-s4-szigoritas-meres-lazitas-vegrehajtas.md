# S4 — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-s4-szigoritas-meres-lazitas.md`. Munkakönyvtár: `source/`.

Két PR:
- **PR1:** S4a — ág `feat/s4-szigoritas-meres`.
- **PR2:** S4b + S4c — ág `feat/s4-feladat-eredmeny-lazitas`, a PR1 összevonása után a main-ről.

## PR1 — S4a jelölés és számláló
1. **`shared/lesson-experience.ts`:** `openTaskSchema` + `tightened: z.array(z.array(text(160)).min(1)).max(4).optional()` és
   `relaxedTightening: z.object({ at: z.string(), answered: z.number().int(), falseRejects: z.number().int() }).optional()`.
2. **`shared/answer-key-calibrate.ts` `calibrateRubric`:**
   - a szigorítással felvett csoportok listáját a végén a feladatba írja (`tightened`);
   - csak azokat, amelyek a végső `required`-ben benne vannak (referencia-egyezés: a bónuszba sorolt csoport kimarad);
   - üres lista esetén nem ír mezőt.
3. **`shared/run-telemetry.ts`:** `RunGates.rubricTightened: number`; `telemetryLines` sor: „Gépi rubrika-szigorítás (feladat): N”.
   - A régi telemetria olvasása: hiányzó mező = 0.
4. **`server/studio/single-run/telemetry.ts`:** `emptyGates` + `rubricTightened: 0`.
5. **`server/studio/single-run/engine.ts`:** a bank elkészülte után (`buildBank` eredménye) a
   `experience.tasks.filter(t => t.tightened?.length).length` értéket állítja (nem halmoz: újraépítésnél felülír).
6. **Teszt:**
   - `tests/s3c-rubrika-szigoritas.test.ts`: a szigorított feladat `tightened` mezője;
   - bónuszba sorolt csoport nincs benne;
   - szigorítás nélkül nincs mező;
   - telemetria-sor.
7. **Ellenőrzés:** `check`, `check:test`, `eslint` (érintett fájlok), `npm test`, `build`.

## PR2 — S4b feladatszintű eredmény + S4c automatikus lazítás
1. **Migráció és séma:**
   - `migrations/0037_task_results.sql` + `shared/schema.ts` `taskResults` (oszlopok a terv szerint);
   - egyedi index `(lesson_id, task_id, round_key)`, index `(lesson_id, task_id)`;
   - `migrations/meta` a repó szokása szerint (a `drizzle-kit` kimenetét követve, ha a repó azt használja; különben kézi SQL, mint a
     0036).
2. **`shared/lesson-result-email.ts` `gradeTasks`:** a sorok új mezői: `taskId`, `detState`, `arbiterRaised`, `tightenedOnlyMiss`.
   - `tightenedOnlyMiss` = a determinisztikus állapot nem `ok`, a feladatnak van `tightened` mezője, a hiányzó csoportok
     (`missingAnswerConcepts`) nem üresek, és mind a `tightened`-ben vannak (JSON-egyezés).
   - A levél (`buildResultEmail`) változatlan.
3. **`server/task-results.ts` (új):**
   - `recordTaskResults(lessonId, roundKey, rows)`: `insert … onConflictDoNothing`, csak a lecke feladatai;
   - `maybeRelaxTightening(lessonId, taskIds)`: feladatonként számlál (`count(*)`, `count(*) filter (where tightened_only_miss and
     arbiter_raised and final_state = 'ok')`); a küszöb `RELAX_MIN_ANSWERED = 20`, `RELAX_FALSE_REJECT_RATE = 0.4`;
   - lazítás: `db.transaction` + `select … for update` a leckére, újraellenőrzés, a csoportok áthelyezése, `version + 1`, napló.
   - Tiszta függvény a lazításhoz: `relaxTask(task, stats, now)` — tesztelhető DB nélkül.
4. **`server/lesson-result-email.ts` `/:lessonId/results`:**
   - `kind = "tasks"` esetén a válasz után (nem blokkolva) `recordTaskResults` → `maybeRelaxTightening`;
   - a hiba `logger.error`, a válasz változatlan.
   - A roundKey ugyanaz, mint a levélé (`roundKeyOf(who, kind, roundId)`).
5. **Teszt:**
   - `gradeTasks` új mezők (szigorított feladat, csak a szigorított csoport hiányzik, döntőbíró emelt);
   - `relaxTask`: küszöb alatt nem lazít, fölötte lazít, ≥ 1 kötelező marad, már lazított → nincs változás;
   - a route rögzít (a meglévő eredmény-route teszt mintájára, DB-mock).
6. **Ellenőrzés:**
   - `check`, `check:test`, `eslint`, `npm test`, `build`;
   - a migráció helyi, eldobható Postgresen (Docker) lefut, és a Drizzle-séma egyezik.
7. **Kitelepítés:** az aktív-futás őr = 0. A migrációt a Render indulása futtatja (a repó szokása szerint — ellenőrizd a
   `migrate` lépést).
