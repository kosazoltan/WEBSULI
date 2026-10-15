# Végrehajtási utasítás — Tételgyár T0: determinisztikus, komponensenkénti lektor-bizonyíték

Terv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md` (T0, G5). Ág: `feat/tetelgyar-t0-bizonyitek`. Parancsok a `source/` mappából.

Mért ok: job `416ad01d` — a #224 utáni kapu-folytatás a végkapun „a lektorált bemenet eltér a mostanitól” üzenettel bukott. A lenyomat a kapu
ELŐTTI leckéből számol (`rawLesson`), tehát az eltérés a lektor mentése és a kapu indulása között keletkezett; a pontos komponens utólag nem
állapítható meg (UNVERIFIED: a mentett adatból újraszámolva sem a rendezett, sem a rendezetlen fogalomsorrend nem adta vissza a tárolt értéket).
Mért: a `loadMap` fogalomlekérdezése `ORDER BY` nélküli, és a rendezett/rendezetlen sorrend eltér → a lenyomat bemenete nem determinisztikus.

## T0.1 — determinisztikus sorrend
Fájl: `server/studio/step-runner.ts`, `createDrizzlePipelineStore()`:
- `loadMap`: a fogalmak `.orderBy(asc(kmConcepts.orderIndex), asc(kmConcepts.id))`.
- `loadBlockerNotes`: `.orderBy(asc(lektorNotes.createdAt), asc(lektorNotes.id))`.
(A lépés-gyorsítótár kulcsai a sorrend miatt egyszer újraszámolódhatnak — elfogadott, ez a cél.)

## T0.2 — komponensenkénti bizonyíték
Fájl: `server/studio/step-runner.ts`:
1. Új export `lektorEvidenceOf(input: { lesson: Lesson; map: unknown; concepts: Array<{ id: string }>; previousBlockers?: unknown[] }): LektorEvidence`, ahol
   `LektorEvidence = { version: 1; teaching: string; items: Record<string, string>; map: string; concepts: string; blockers: string }`:
   - `teaching` = sha256(canonical(lecke `experience` nélkül)); `items` = `{ "<bank>:<id>": sha256(canonical(tétel)) }` minden quiz/tasks/methods tételre;
   - `concepts` = sha256(canonical(id szerint rendezett fogalmak)); `map`, `blockers` = sha256(canonical(...)).
   A `canonical` a `server/studio/step-io.ts` `canonicalJson`-ja.
2. A lektor lépés mindhárom mentési pontja (`reviewInputHash: lektorReviewHash(input, job.round)`) mellé: `reviewEvidence: lektorEvidenceOf(input)`.
3. Új export `evidenceDiff(stored: unknown, current: LektorEvidence): string[]` → az eltérő komponensek magyar neve (`tanítás`, `banktétel: <bank>:<id>` (legfeljebb 5), `térkép`,
   `fogalmak`, `előző blokkolók`); érvénytelen/hiányzó tárolt bizonyítéknál `["nincs komponensenkénti bizonyíték"]`.

## T0.3 — a kapu döntése
Fájl: `server/studio/step-runner.ts`, `runGate` (a `expectedReviewHash` ága):
- Elfogadott a bizonyíték, ha `job.output.reviewInputHash === expectedReviewHash`, VAGY a tárolt `reviewEvidence` és a `rawLesson`-ból számolt bizonyíték között
  csak az `előző blokkolók` tér el (a blokkolók a lektor munkakörnyezete, nem a lektorált tartalom).
- Eltérésnél a hibaüzenet: `… (a lektorált bemenet eltér a mostanitól: <evidenceDiff vesszővel>)` — a kezdő szöveg változatlan.

## T0.4 — a bizonyíték-eltérés folytatható (lektor újrafut)
Fájl: `server/studio/step-runner.ts`:
- `resumeKindOf`: kapu-látogatás + egyező redaktált hiba + a hiba `A 7.4 végkapuhoz` kezdetű ÉS tartalmazza `a lektorált bemenet eltér a mostanitól` → `"review"`.
- `retryFailedGate` → a `"review"` fajtánál `step: "lektor", status: "pending"`, `previousGateError`, `gateRecoveryAttempt + 1`; a `"gate"` fajtánál változatlan.
Fájl: `server/studio/lesson-pipeline-routes.ts`: a `resume` kapu-ága a `"review"` fajtát is a `retryFailedGate`-re viszi (a `visit.step === "gate"` ág már oda megy).

## T0.4b — a kapu → lektor átmenet a futás definíciójában
Mért (kódból): a gyártási láncban a lektor csak az animátor után jöhet (`shared/lesson-workflow.ts`), és a definíció futásonként mentett —
a `gate → lektor` lépés `assertWorkflowStep` hibát adna. Fájl: `server/workflows/engine.ts`: új `workflowAllowResumeEdge(from, to, reason)` a
`workflowEnsureRepairBudget` mintájára: csak kifejezett folytatásban (`ctx.continuation`), csak ha az utolsó látogatás a `from` lépés hibája;
a `to` lépés `after` listája bővül, a definíció mentődik, napló `[WORKFLOW] Folytatási visszaél`. A `retryFailedGate` a `"review"` fajtánál ezt hívja;
`false` esetén hiba (nincs csendes átlépés). Teszt: `tests/lektor-evidence.test.ts` — a memória-workflow-ban folytatásként engedélyezett, egyébként nem.

## T0.5 — tesztek
- `tests/gate-resume.test.ts`: `resumeKindOf` → `"review"` a bizonyíték-eltérésre; más 7.4 végkapu-ok (nyitott blokkoló) → null.
- `tests/lesson-pipeline-runner.test.ts`: `retryFailedGate` a bizonyíték-eltérésnél `lektor`/`pending`-be tesz.
- Új `tests/lektor-evidence.test.ts`: `lektorEvidenceOf` kulcssorrend-független; egy tétel változása csak azt a tételt jelzi; `evidenceDiff` csak-blokkoló eltérésnél `["előző blokkolók"]`.
- Parancsok: `npx.cmd tsx --test tests/lektor-evidence.test.ts tests/gate-resume.test.ts tests/lesson-pipeline-runner.test.ts`, `npm.cmd run check`, `npm.cmd run lint`.

## T0.6 — élő E1
Deploy után a `416ad01d` felületről folytatva: a lektor újrafut (a jelenlegi leckén), majd a kapu publikál, vagy pontosan megnevezett okkal áll meg.
