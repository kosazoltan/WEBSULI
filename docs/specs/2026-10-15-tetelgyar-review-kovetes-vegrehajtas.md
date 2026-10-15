# Végrehajtási utasítás — Tételgyár review-követés (#225, #226, #227 észrevételei) és a D5 pótolt végrehajtási leírása

Terv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md`. Ág: `fix/tetelgyar-review-kovetes`.

**Eljárási megjegyzés (review #227, P1):** a D5 (folytatási keret) a #227-ben külön `*-vegrehajtas.md` nélkül került kódba — ez a háromfázisú
szabály megsértése volt. Az alábbi „R4” pont UTÓLAG rögzíti a végrehajtás pontos leírását; a mulasztást a záró jelentés is jelzi.

## R1 — a kapu → lektor visszaél látogatási keretet is ad (review #225, P2)
Ok (kódból): `workflowAllowResumeEdge` csak az `after` élt adja hozzá; ha a lektor `maxVisits` kerete elfogyott, a `workflowPhase("lektor")`
az `assertWorkflowStep` keret-ellenőrzésén „Elfogyott a lépés javítási kerete” hibával áll meg.
Fájl: `server/workflows/engine.ts` `workflowAllowResumeEdge`: ha a `to` lépésnek `workflowVisitsLeft(view, to) <= 0`, a definícióban a `to`
lépés `maxVisits` értéke +1 (egyszer, ugyanabban a mentésben, naplózva). Teszt: `tests/lektor-evidence.test.ts` — elfogyott lektor-kerettel is
végigmegy a `gate → lektor → gate → readback`.

## R2 — minden bankegység kap tartalékot (review #226, P1)
Ok: ≥ 15 kis egységnél a teljes tartalék (pl. 14) < egységszám → egyes egységek 0 tartalékot kapnak.
Fájl: `shared/lesson-bank-plan.ts` `allocate`: a teljes tartalék `max(LESSON_BANK_RESERVE[kind], ceil(0,3 × Σmin), egységszám)`.
Teszt: `tests/bank-item-ref.test.ts` T1-teszt kiterjesztése 15, 40 és 80 egységre.

## R3 — a túltermelt bank a séma felső korlátján belül (review #226, P2)
Ok: a `experienceSchema` `tasks.max(480)`, `quiz.max(960)` a 80 × 6 fogalmas maximumhoz készült; 130%-kal 624 / 1248 is lehet.
Fájl: `shared/lesson-experience.ts` (és a vele azonos `server/studio/web-bank-repair.ts` patch-séma): `tasks.max(640)`, `quiz.max(1280)` — csak
emelés, a régi leckék érvényesek maradnak. Teszt: a legnagyobb terv (80 egység × 6 fogalom) célösszege ≤ az új korlát.

## R4 — D5 végrehajtási leírás (utólag rögzítve; a kód a #227-ben)
- `server/workflows/engine.ts`: `WORKFLOW_EXECUTION_BUDGET = 4`, `WORKFLOW_EXPLICIT_RESUME_BUDGET = 6`, `workflowExecutionBudget(explicitResume)`;
  `executeWorkflow` bemenete `explicitResume?: boolean`, a keret-ellenőrzés ezt használja.
- `server/studio/lesson-pipeline-routes.ts`: `driveTracked(..., explicitResume = false)`; a `POST /jobs/:id/resume` `true`-val hívja;
  `oneStepRunView`: `resumable` csak ha a workflow `executions < WORKFLOW_EXPLICIT_RESUME_BUDGET`.
- Teszt: `tests/lesson-workflow.test.ts` — automatikusan 4, kifejezett folytatással 6, utána mindkét úton elutasítás.

## Ellenőrzés
`npx.cmd tsx --test tests/lektor-evidence.test.ts tests/bank-item-ref.test.ts tests/lesson-experience.test.ts tests/lesson-workflow.test.ts`,
`npm.cmd run check`, `lint`, `check:test`, `build`, teljes `npm.cmd test`.
