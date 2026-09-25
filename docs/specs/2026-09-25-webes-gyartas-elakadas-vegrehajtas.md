# Végrehajtás: Internetes tananyagkészítés — elakadás megszüntetése (1. szelet)

> Spec: `docs/specs/2026-09-25-webes-gyartas-elakadas.md`. Munkakönyvtár: `source/`. Sorrend kötelező.

## T1 — Közös bankhívás-modul

Fájl: `server/studio/bank-call.ts` (új).
1. `export function bankModelForAttempt(attempt: number): string` — `attempt >= PACKET_ATTEMPTS` → `BANK_RESCUE_MODEL`;
   `attempt === PACKET_ATTEMPTS - 1` → `FALLBACK_MODELS.bank ?? resolveStudioModel("bank")`; különben `resolveStudioModel("bank")`.
2. `export function bankProviderStep(attempt: number): "author" | "bank"` — `attempt >= PACKET_ATTEMPTS` → `"author"`, különben `"bank"`.
3. `export async function callBankPacketModel(provider, model, system, user, signal?)` — `callStepModel(provider, { step: "animator", model, system, user }, signal)`;
   `StepModelError` ok nélkül vagy `AIProviderTimeoutError` okkal → `RetryableBankCallError(`${model}: ${message}${timedOut ? " (időtúllépés)" : ""}`, { cause })`; más hiba változatlanul.
Teszt: `tests/bank-call.test.ts` — a három modellág, a `bankProviderStep`, és a három hibaág álszolgáltatóval.
Parancs: `node --import tsx --test tests/bank-call.test.ts` → minden `ok`.

## T2 — A feltöltős út a közös modult használja

Fájl: `server/studio/step-runner.ts`, a `buildLessonExperience(... call: async (bankSystem, user, attempt) => …)` blokk.
1. A `bankModel` kiválasztás → `bankModelForAttempt(attempt)`.
2. A `try { result = await callStepModel(providerFactory(bankModel, …), …) } catch {…}` → `result = await callBankPacketModel(providerFactory(bankModel, bankProviderStep(attempt)), bankModel, bankSystem, user)`.
3. Minden más (kulcsellenőrzés, napló, `bankRecoveryAttempt`, usage) változatlan. Fölöslegessé vált importok törlése (lint).
Parancs: `node --import tsx --test tests/studio-*.test.ts tests/lesson-experience.test.ts` → zöld.

## T3 — Webes bank: közös hívás, párhuzamosság, haladás, mentett csomagok

Fájl: `server/studio/web-research-runner.ts`.
1. `ResearchObserver` bővül: `bankCheckpoint?: ExperienceCheckpoint; onBankCheckpoint?(checkpoint: ExperienceCheckpoint): Promise<void>`.
2. A kezdeti kulcsellenőrzés a `resolveStudioModel("bank")` modellre is kiterjed.
3. `buildLessonExperience` deps: `concurrency: PACKET_CONCURRENCY`, `checkpoint: bankCheckpoint`, `save` (→ `onBankCheckpoint` + státusz „Gyakorlóbank: N csomag kész…”),
   `onAttemptFailure` (logger.warn), `call: (system, user, attempt) => { model = bankModelForAttempt(attempt); kulcs nélkül WebResearchFailure; callBankPacketModel(createStudioStepProvider(model, bankProviderStep(attempt)), model, system, user, controller.signal).json }`.
Parancs: `npx tsc --noEmit` → 0.

## T4 — Job-futtató: mentési lánc, árva-felismerés, háttér-folytatás, checkpoint

Fájl: `server/studio/web-research-jobs.ts`.
1. `StoredResearchJob.bankCheckpoint?: ExperienceCheckpoint`.
2. `persist`: `checkpoint = checkpoint.catch(() => undefined).then(() => store.update(snapshot, "running"))`.
3. Observer: `bankCheckpoint: job.bankCheckpoint`, `onBankCheckpoint(cp) { job.bankCheckpoint = cp; persist(); }`.
4. `read`: `running` jobnál, ha van `workflows` és rekord: `running` → nem nyúl hozzá; `error`/`interrupted` → `error` + üzenet. Rekord nélkül a 25 perces szabály.
5. `run(job, retry, onStarted?)`: a workflow-callbackben az állapotváltás után `onStarted?.()`.
6. `publish(id, userId, options?: { background?: boolean })`: nem `ready`/`done` jobnál, `background` esetén `Promise.race([started, work])`, a `work` hibája nem kezeletlen; utána `store.read`.
Fájl: `server/studio/web-research-routes.ts` — `jobs.publish(id, user, { background: true })`.
Teszt: `tests/web-research-jobs.test.ts` új esetek (spec 7. pont). Parancs: `node --import tsx --test tests/web-research-jobs.test.ts` → zöld.

## T5 — Szívverés

Fájl: `server/workflows/engine.ts` — `.catch(() => { ctx.lostLease = true; })` → a kivételt naplózza, `lostLease`-t nem állítja.
Parancs: `node --import tsx --test tests/workflow*.test.ts` → zöld.

## T6 — Kliens: követés újraindítása folytatás után

Fájl: `client/src/components/studio/WebResearchAgentPanel.tsx`, `handleSave`: ha a válasz `state === "running"` → `setCanResume(false)`, `setIsLoading(true)`, `setPending({ ...pending })`, return.
Parancs: `npx tsc --noEmit`, `npx eslint client/src server --max-warnings 0`.

## T7 — Kapu és dokumentáció

1. `npm run check && npm run check:test && npm run lint && npm test && npm run build` (a `source/`-ban) → mind 0.
2. `memory/projects/websuli/LEDGER.md` új bejegyzés: diagnózis, javítás, NOT RUN (éles futás).
3. Commit, push `claude/webuli-online-tananyag-fc2qaz`, draft PR.
