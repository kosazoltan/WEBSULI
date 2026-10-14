# Végrehajtás: tartalék — B1 alszelet (2026-10-14)

Spec: `docs/specs/2026-10-14-tartalek-b-szelet.md`. Parancsok a `source/` mappából. Sorrend: teszt → kód → zöld.

## V1 — szabály és segéd
- `server/ai/models.ts`: `independentFallbackFor(model, checkedModels?)`.
- `server/ai/studio-provider.ts`: `crossFamilyFallbackOptions` — tartalékhívásnál a `MODEL_REASONING_EFFORT` modellje (Qwen
  high) is felülírja a lépés-szabályzat effortját.
- `server/studio/run-step.ts`: `callStepModelWithFallback(input, { providerFactory, providerStep?, keyConfigured?,
  checkedModels?, signal? })` → `{ json, usage, model }` (a TÉNYLEGES modell).

## V2 — hívóhelyek
- `step-runner.ts`: vak megoldó és bank-ellenőr (`checkedModels: [bank-elsődleges]`); pontjegyzék; kérés-ellenőrzés
  (`checkedModels: authorModels`); szövegjavító (szerzőlépésben a tényleges modell → `authorModels`); fogalomjavítás (szerző
  tartalékkal, lektor `lektorChainFor([tényleges szerző])` láncon).
- `web-teaching-repair.ts`: `callTeachingRepair` tartalékkal; a tényleges modell a `repairWrote`-ba.
- `web-bank-repair.ts`: `repairCall` tartalékkal.
- `structured-improvement.ts`: a `call` tartalékkal; a szerző tényleges modellje gyűlik, a lektor a láncon.

## V3 — tesztek
- Új: `tests/cross-family-fallback-b.test.ts` — `independentFallbackFor` (ellenőrző/nem ellenőrző, Qwen-ütközés), a segéd
  (elsődleges → tartalék, `{ fallback: true }`, a tényleges modell visszaadva, megszakításnál nincs tartalék, kulcs nélkül
  nincs tartalék), Qwen-tartalék high effort a kérésben.

- Dokumentált spec-változás: `lesson-pipeline-runner.test.ts` „review #177 (2.2b)” — a vak megoldó egyetlen újrakérése most az
  elsődlegesen és a független tartalékon (Qwen) fut: 3 hívás (1 részleges + 2 bukó), és utána sincs újabb fizetett próba.

## V4 — kapuk
- `npm.cmd run check`, `check:test`, `lint`, `test`, `build`.
