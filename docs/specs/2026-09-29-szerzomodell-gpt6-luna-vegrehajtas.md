# Végrehajtás — szerzőmodell GPT-6 Luna / tartalék GPT-5.6 Terra (2026-09-29)

Terv: `docs/specs/2026-09-29-szerzomodell-gpt6-luna.md`. Ág: `feat/szerzomodell-gpt6-luna`. Parancsok a `source/`-ban.

## T1 — Teszt először (`tests/lesson-pipeline-runner.test.ts` VÉGÉRE, új teszt)
- `resolveStudioModel("author")` → `"gpt-6-luna"`; `FALLBACK_MODELS.author` → `"gpt-5.6-terra"`.
- Author-lépés: az elsődleges modell ÉRVÉNYTELEN JSON-t ad (`{"title": "x",` csonka, finish `stop`), a tartalék a
  `CANNED_AUTHOR`-t → `outcome.ok === true`, hívássorrend `[gpt-6-luna, gpt-5.6-terra]`, a job `model`-je a tartalék.
- Futtatás a kód előtt: `node --import tsx --test tests/lesson-pipeline-runner.test.ts` → az új teszt BUKIK.

## T2 — Kód (`server/ai/models.ts`)
1. `DEFAULT_MODELS.author: "gpt-6-luna"` + mérési megjegyzés (spec hivatkozással).
2. `FALLBACK_MODELS.author: "gpt-5.6-terra"`; a 98. sori „no cross-vendor fallback” megjegyzés pontosítása:
   a tartalék azonos (openai) családú, így a lektor függetlensége megmarad.
Ellenőrzés: `node --import tsx --test tests/lesson-pipeline-runner.test.ts tests/models-routing.test.ts tests/ai-model-routing-complete.test.ts` → pass.

## T3 — Kapuk és visszamérés
1. `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`, `npm run lint`, `node --import tsx --test tests/*.test.ts`, `npm run build`.
2. Deploy után élő webes próbagyártás a termelési kódúton (`web-live-oszthatosag.local.mts`) → `done`, lecke visszaolvasva.

## T4 — Review-javítások (PR #131)
1. Teszt először: `tests/author-fallback-review.test.ts` — (a) `webAuthorModelForAttempt(0,'p','f')==='p'`, `(1,…)==='f'`,
   `(2,…)==='f'`, fallback nélkül mindig `'p'`; (b) bekötés-őr: a `web-research-runner.ts` a szerzői providert
   `webAuthorModelForAttempt(attempts, …)`-tel választja (`createStudioProvider(model, …)`); (c) workflow-usage: érvénytelen JSON (20/10) + érvényes (5/5) → 25/15.
2. Kód: `server/studio/web-research-runner.ts` (export + bekötés), `server/studio/run-step.ts` (usage a hibaágakon).
3. Ellenőrzés: `node --import tsx --test tests/author-fallback-review.test.ts` → pass; teljes kapu.
