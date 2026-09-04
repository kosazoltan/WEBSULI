# LS-2c — Pipeline modellhívások bekötése (pedagogue / author / lektor)

**Dátum:** 2026-09-04 · **Ág:** feat/ls-2c-pipeline-calls · **Kanban:** #135
**Kapcsolódik:** lesson-studio-master-plan-2026-09-04 (6. § pipeline), owner-brief (2026-09-04, session 20260904_210454_572825)

## Cél

A ls-2c állapotgép (`pipeline.ts`) eddig lépéseket szekvenált, de csak az `extract`
hívott ténylegesen modellt — a pedagogue/author/lektor model-azonosítók deklarálva
voltak, futó hívás nélkül. Ez a szelet beköti a kifizetett hívásokat:

1. **1. rész (commit 79d7864):** a tiszta réteg — `step-io.ts` (outline/lektor-jelentés
   sémák, `outlineCoversMap`, `lessonIdsSubsetOfMap`, `buildPedagoguePrompt` /
   `buildAuthorPrompt`, `D1_RULE_TEXT` szó szerint) és `run-step.ts`
   (`callStepModel`: egy prompt-pár → JSON, fail-closed). RED→GREEN 16/16.
2. **2. rész (ez a commit):** az orchestration + admin végpontok.
   - `step-runner.ts`: `runPipelineStep(jobId, deps)` — betölti a job sort, lépés
     szerinti bemenetet épít, `callStepModel`-t hív a `resolveStudioModel(step)`-ből
     gyártott `OpenRouterProvider`rel, output+tokeneket ment a `studio_jobs` sorra,
     `{ok, next}`-et ad vissza `nextStep()`-ből. Vékony `PipelineStore` adapter-interfész
     mögött a DB (a teszt memóriában stubolja; az igazi Drizzle-adapter ugyanitt).
     `advanceJob`, `approveOutline`, `startJobFromMap`, `createDrizzlePipelineStore()`.
   - `lesson-pipeline-routes.ts` (`/api/studio`, admin-only): `POST /lessons/from-map/:mapId`
     (job-létrehozás + indítás), `GET /jobs/:id` (pollozható állapot + produced kimenetek),
     `POST /jobs/:id/approve-outline` (admin-kapu pedagogue → author), `POST /jobs/:id/resume`
     (input-hash idempotens újrafutás).
   - `buildLektorPrompt` a `step-io.ts`-ban (a lektor lépés promptja, D1 szó szerint).

## Nem-cél

- A determinisztikus `gate` lépés futtatása (külön szelet) — a pipeline ott parkol.
- Admin kliens UI (job-monitor, vázlat-jóváhagyó képernyő) — a `client/src/components/studio/`
  egyelőre csak a KnowledgeMapEditort tartalmazza; a végpontok szerveroldalon készen vannak.
- Animator, TTS, `/lesson/*` CSP (LS-4), feedback-loop (LS-5).

## Edge case-ek / fail-closed viselkedések

- `StepModelError`, séma- vagy fedettség-sértés → `status='error'`, `step='error'`,
  a hiba oka a soron — félkész output SOHA nem kerül a `studio_jobs.output`-ba.
- `OPENROUTER_API_KEY` hiány → a job `error` státuszba kerül magyar üzenettel, nincs crash.
- Utolsó lektor-kör után is blokkoló (round ≥ `MAX_AUTHOR_ROUNDS`) → `error`,
  „emberi döntés szükséges".
- `book_probably_wrong` jegyzettel kizárólag az admin találkozik: a szerző promptjából
  kiszűrjük, és `info` súlyú — soha nem blokkol (D1).
- `author` jóváhagyott vázlat nélkül nem fut — a job az adminra vár (parkolt, nem hiba).
- Resume / ismételt futás: azonos `inputHash`+`status='ok'`+meglévő output → gyorsítótár-találat,
  nincs második kifizetett hívás.
- `from-map` csak a térkép saját tárgyával/osztályával indul (409 eltérésnél) — egy
  igazságforrás, a térkép metaadata.

## EARS elfogadás

- When a job is created from an approved map, the pedagogue step shall produce an outline
  that covers every core concept and ≥90% of supporting, and shall advance the pipeline to
  `author` awaiting admin approval.
- While validating the outline, the server shall reject it, naming every missing core id,
  unknown id and the supporting ratio, and shall never persist a partial outline.
- When the admin approves an outline, the server shall re-validate it against the map and
  shall only then run the author step, which shall persist the lesson row and advance to
  `lektor`.
- While validating the lesson, the server shall reject any concept id absent from the map.
- When the lektor reports only `book_probably_wrong` notes, the pipeline shall advance to
  `gate` with zero blockers.
- When the lektor reports a blocker, the pipeline shall return the job to `author` with
  round+1; at round ≥ 2 with blockers it shall fail with „emberi döntés szükséges".
- When a step is re-run with an identical input hash and a stored output, the system shall
  reuse the stored output without another model call.

## Névvel megjelölt tesztek

- `tests/lesson-pipeline-runner.test.ts` (RED előbb, majd GREEN 10/10):
  (a) pedagogue perszisztálja a vázlatot és author felé lép; (b) fedettség-sértő vázlat
  hibára fut, megnevezve a hiányzó id-t; (c) author perszisztálja a leckét és lektor felé
  lép; (d) kitalált fogalom-id → error; (e) csak book_probably_wrong → gate, 0 blokkoló;
  (f) not_in_map blokkoló → author, round+1; (g) round≥2 blokkolókkal → error; (h)
  approve-outline ismeretlen id-val elutasítva, hívás nélkül; (i) azonos input-hash →
  gyorsítótár, nincs második hívás; + hiányzó OPENROUTER_API_KEY → error magyar üzenettel.
- `tests/studio-step-schemas.test.ts` bővítve: `buildLektorPrompt` D1 szó szerint.
- Fordított mutációk (mindhárom célozta a saját tesztjét, mind bukott, visszaállítás után
  zöld): D1-szűrő kiiktatása, ismeretlen-id őr, a pedagogue fedettségi kapu.

## Kapuk

```bash
npm run verify   # check + lint + check:test + test + build
npm run test:e2e # Playwright (valós szerver-indítás a dist-ből)
```

- `npm test`: 397/397; eslint: 0 hiba, 971 figyelmeztetés (küszöb 989); `tsc --noEmit`: 0;
  `check:test` (új kapu, CI-ben is): 0.
- **Új kapu ebbe a szeletbe:** `tsconfig.test.json` + `check:test`. A `tsconfig.json`
  `exclude`-ja (`**/*.test.ts`) miatt a tesztfájlokat eddig SEMMI nem típusellenőrizte —
  sem lokálisan, sem CI-ben; a kapu hitelesítő mutációja először hazudott (örökölt exclude
  → 0 fájl → pofonegyszerű zöld), a javítás után 12 valós látens típushibát talált 5
  tesztfájlban (mind tesztfájlban, teszt-gyengítés nélkül javítva).

## Megjegyzés a hatókörről

A `POST /lessons/from-map/:mapId` a térkép `subject`/`classroom` mezőit használja (a kérés
mezőinek egyeznie kell — különben 409). Átköltöztetés (más osztálynak írni ugyanazt a
témát) nincs a szeletben; ha a tulajdonos kéri, külön változásként könyveld.