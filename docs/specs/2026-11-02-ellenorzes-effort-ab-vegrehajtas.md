# Végrehajtási utasítás: ellenőrzés-effort kapcsoló + A/B mérés

Terv: `docs/specs/2026-11-02-ellenorzes-effort-ab.md`. Ügynöknek szóló, lépésenkénti utasítás.

## 1. `source/server/studio/single-run/conversation.ts` — effort-opció
- `anthropicClient(opts)` bővül: `effort?: "low" | "medium"`. A `stream(...)` hívásban
  `output_config: { effort: opts.effort ?? SINGLE_RUN_EFFORT }`.
- `openAIClient(opts)` bővül ugyanígy; a `responses.create(...)`-ben `reasoning: { effort: opts.effort ?? SINGLE_RUN_EFFORT }`.
- `createLessonConversation(system, opts, env)` opts-a bővül: `effort?: "low" | "medium"`, és továbbadja mindkét kliensnek.
- Más viselkedés nem változik; alapértelmezés nélkül bitre azonos a maival.

## 2. `source/server/studio/single-run/engine.ts` — a kapcsoló és a bekötés
- Új export: `export function checkEffort(env: NodeJS.ProcessEnv = process.env): "low" | "medium"` —
  `env.STUDIO_CHECK_EFFORT` trim+kisbetűsítve `"low"` → `"low"`, minden más (üres, hiányzó, elgépelt) → `"medium"`.
- A `SingleRunDeps.fresh` szignatúrája: `fresh(system: string, opts?: { effort?: "low" | "medium" }): LessonConversation`.
- A `freshJsonCall`-ban (241. sor környéke): `fresh(freshSystemPrompt("check"), { effort: checkEffort() })`.
- A `freshBankCall` és a lektor-hívások VÁLTOZATLANUL opts nélkül hívnak (medium).

## 3. A `fresh` gyárak továbbadják az opts-ot
- `source/server/studio/single-run/live.ts` (`singleRunDeps`): `fresh: (system, opts) => createLessonConversation(system, { ...opts, onFallback..., onUsage... })`.
- `source/scripts/measure/single-run-measure.mts` (130. sor): ugyanígy továbbadja.
- `source/server/studio/single-run/concept-fix.ts` (101. sor) és `source/server/studio/structured-improvement.ts` (103. sor):
  a lambda átveszi és továbbadja az opts-ot.

## 4. `source/scripts/measure/single-run-measure.mts` — mérési kimenet
- `out.checkEffort = (process.env.STUDIO_CHECK_EFFORT ?? "").trim() || "medium (default)"` az 1. lépésnél.
- A 4. pontban a job-olvasás kiegészül: `out.answerKeyArchive = job?.output?.answerKeyArchive ?? null` (a visszajátszáshoz).

## 5. Teszt: `source/tests/check-effort.test.ts` (node:test)
- `checkEffort`: `"low"` → low; `" LOW "` → low; hiányzó / `""` / `"alacsony"` → medium.
- `anthropicClient` mock klienssel (a `stream` paramétereit elkapva): `effort: "low"` → `output_config.effort === "low"`;
  opts.effort nélkül → `"medium"`.
- `openAIClient` mock klienssel: `reasoning.effort` ugyanígy.

## 6. Ellenőrzés
- `cd source && npx tsc --noEmit` ; `npm run lint` ; `node --import tsx --test tests/check-effort.test.ts`.
- Teljes érintett teszt: `npm test` (PR előtt).

## 7. A mérés lefuttatása (tulajdonosi keret: ~60–90 USD)
1. 5 éles térkép kiválasztása (csak olvasás): van `source_text`, különböző tantárgy; az azonosító-előtagok rögzítése.
2. Páronként, `MEASURE_SAME_MAP=1`-gyel, a `source/` mappából:
   - A-ág: `STUDIO_CHECK_EFFORT=medium npx tsx scripts/measure/single-run-measure.mts <map8> <map8>-A <kimeneti mappa>`
   - B-ág: `STUDIO_CHECK_EFFORT=low  npx tsx scripts/measure/single-run-measure.mts <map8> <map8>-B <kimeneti mappa>`
   (háttérben, legfeljebb 2–3 párhuzamosan; aktív követés a kimeneti JSON-okon és a Docker-konténereken).
3. Kiértékelés páronként: ellenőrzés-állomás USD + körszám (telemetria), `gates`, `measureLesson`-metrikák.
4. Visszajátszás: a B-ág `answerKeyArchive` esetei MEDIUM efforttal újraítélve (friss, rövid hívások) — egyetértési arány.
5. Jelentés a tulajdonosnak az E4 döntési szabály szerint; kanban #5 jegyzet + done (ha a döntés megszületett).
