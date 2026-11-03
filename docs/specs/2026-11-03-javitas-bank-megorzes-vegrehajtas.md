# Végrehajtás: a lecke-javítás ne rontsa a gyakorlóbankot (terv: `docs/specs/2026-11-03-javitas-bank-megorzes.md`)

Munkakönyvtár: `source/`. Ág: `fix/javitas-bank-megorzes`.

## T1: tartalom szerinti átvétel (`server/studio/experience-builder.ts`)

- `ExperienceBuildDeps` kap egy `previousSections?: Lesson["sections"]` mezőt. A javító út adja át: az eredeti lecke fejezetei.
- `buildUnit`-ban, a `fromPrevious` előtt keresd meg a korábbi egységet:
  - `deps.previous.bankPlan.units` azonos `sectionIndex`-ű eleme;
  - egyező, rendezett `conceptIds`;
  - `canonicalJson(withoutFigures(previousSections[i])) === canonicalJson(withoutFigures(lesson.sections[i]))`.
- Csak ha nincs `reviewFeedback`.
- Ha van ilyen egység, a `fromPrevious` a korábbi bank azon tételei, amelyek `sourceHash`-e az egység `sourceHash`-e. Különben a
  régi, hash-azonos szűrés.
- Ha a mentett vagy átvett csomagok közül a tartalom szerinti átvétel nyert, a bélyegző hash a korábbi egység hash-e legyen: a
  `hash` változó és a `unit.sourceHash` is. Így a tételazonosítók (`m-/t-/q-<hash24>-n`) változatlanok.
- Megjegyzés a kódban: hivatkozás a specre és a mért tényre.

## T2: közös vak minőségkapuk (`server/studio/single-run/engine.ts`)

- Új export: `bankQualityGates(fresh, ctx, teachingOf, log, telemetry?, quizBlindCache?)`. Visszaad:
  - `{ answerKeys? }`, ha `answerKeyTestsEnabled()`, az eddigi `answerKeysFor(ctx, freshJsonCall(fresh, "VÁLASZKULCS-TESZTEK
    (a pontozó próbája).", telemetry), warn)`;
  - `{ quizBlind? }`, ha `STUDIO_QUIZ_BLIND !== "0"`, az eddigi `quizBlindProblems(...)`.
- A `buildBank` ezt használja. Az archiváló burkoló (`answerKeysWithNotes`) és a megosztott `quizBlindCache` megmarad: a gyártás
  viselkedése bájtra azonos (a címkék és a naplószövegek is).

## T3: a javító út bekötése (`server/studio/structured-improvement.ts`)

- `finishStructuredImprovement` kap egy opcionális `gates?: (ctx) => Partial<ExperienceBuildDeps>` paramétert.
- A `buildLessonExperience` hívása kapja meg:
  - `previousSections: original.sections`;
  - forrás-helyesbítéskor az érintett fogalmú fejezetek kimaradnak: ott a `previousSections` adott indexén a jelölt fejezete helyett
    `undefined`-nek számít, vagyis a helyesbített fogalmat tanító fejezetet nem vesszük át;
  - `...gates?.({ classroom, concepts })`.
- `buildStructuredImprovement` az `opts`-ban továbbadja a `gates`-et.
- `generateStructuredImprovement` a `bankQualityGates`-t friss beszélgetésgyárral köti be: `createLessonConversation`, mint a
  `singleRunRepairCall`.

## T4: teszt (`tests/repair-bank-reuse.test.ts`, új)

- **Kétfejezetes fixtúra** (minta: `tests/lesson-experience.test.ts` 470–492. sor).
  - Első építés `memory: "M"`-mel.
  - Javítás `memory` nélkül, `previous` + `previousSections` (a 2. fejezet címe változik).
  - Elvárt: pontosan 1 hívás; a 0. fejezet kvíz-, feladat- és módszertételei `deepEqual` az elsővel (azonosító is); a 2. fejezet
    azonosítója új.
- **Érvénytelen régi csomag** (pl. a régi kvíz egyik tételének `correctIndex`-e kilóg): újragyártás, 2 hívás.
- **`previousSections` nélkül** és eltérő konfiggal: 2 hívás (a régi viselkedés).
- **Ellenőrzés:**
  - `node --import tsx --test tests/repair-bank-reuse.test.ts tests/lesson-experience.test.ts` → `ℹ fail 0`;
  - `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`;
  - `npx eslint client/src server --max-warnings 0`;
  - `npm test`.

## T5: Antigoné helyreállítása (adat, újragyártás nélkül)

- **Harness:** `.harness/live/antigone-restore.local.mts` (gitignore-olt). A Render `DATABASE_URL`-jével fut
  (`run-with-render-db.local.mjs`, az érték nem jelenik meg). Lépései:
  - beolvassa a lecke élő sorát, a `html_files` sort, a térképet és a fogalmakat (mint `loadSource`, `sourceFiles` nélkül);
  - előveszi a javítás előtti v1 bankot a `<javítás-azonosító>` jelölt `previousLesson.experience` mezőjéből;
  - jelölt = `{ ...élő json, experience: v1.experience }`;
  - helyben futtatja az `assertRepairCandidate` kaput;
  - a `lessonRepairSchema`-n át `improved_html_files` sort ír, `status: pending`, `contentType: lesson`, `createdBy` = az eredeti
    javítás készítője, `improvementPrompt`: „Gyakorlóbank visszaállítása a javítás előtti változatra (spec 2026-11-03-javitas-bank-megorzes)”.
- **Alkalmazás:** az admin böngészős munkamenetből `POST /api/admin/improved-files/<új-azonosító>/apply` → 200 `success: true`.
- **Visszaellenőrzés:**
  - a lecke verziója 3;
  - a bank = v1 (kanonikus hash);
  - a tanítás és az `art` = v2;
  - új mentés a v2-ről;
  - a kvízexport darabszáma = v1 kvíz;
  - a vak mérőszkript (`.harness/live/blind-score.local.mts`) a v3-on ≥ 81%;
  - böngészőben a Feladatok/Kvíz fül betölt.
- **Visszaállítási pont:** az alkalmazás előtti v2 mentése (admin „Biztonsági mentések”).

## T6: PR → CI → merge → deploy

- Két commit: docs (ez a két fájl), majd fix (kód + teszt). Ellenőrzés: `node ../scripts/qa/three-phase-check.mjs --base origin/main`.
- Push előtt `.audit-ok` sentinel külön hívásban. PR → CI zöld → merge → `https://websuli.vip/api/health` revízió = merge commit.
