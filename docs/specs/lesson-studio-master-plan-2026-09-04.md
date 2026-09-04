# Lesson Studio — Master Plan (C-variant)

> Date: 2026-09-04 · Author: Hermes / claude-fable-5-1 (Planner) · Status: APPROVED BY OWNER (decisions D1–D3 below are final)
> Executor: Hermes default session on `anthropic/claude-opus-5` (via OpenRouter). Step-by-step work orders: `lesson-studio-execution-runbook-2026-09-04.md` (read it before touching code). Reviewers/helpers: see §11 model routing. No local models (GPU down).
> Language: this file is the agent-to-agent contract and is written in English. Owner-facing text inside the product stays Hungarian.
> Baseline: `main` @ `7cbf198`. Companion evidence: chat analysis of 2026-09-04, `SECURITY-AUDIT-2026-08.md`, `docs/specs/backlog-4-2026-09-02.md`.

## 0. Blocking facts (read first)

1. **D1 — Source always wins.** The uploaded textbook/handout is the exam. If the source is wrong or outdated, the lesson still teaches the source. The Lektor MAY flag a "source-conflict" note **for the admin only**; the lesson body MUST NOT contradict, "correct" or footnote the source. No "helyesbítve" label anywhere in student-facing output. Rationale (owner): Central-European curriculum — tests ask what the book says.
2. **D2 — Coupon ladder is increasing and capped.** Section Próba tiers grant play-time coupons: 1 → 2 → 3 → 4 minutes per consecutive excellent section; a lesson-closing Próba at 100% may raise the grant to **10 minutes max**. All values are server-side parameters (`reward_policy` table), never literals in code. Coupon clock runs on the **server**.
3. **D3 — Tsunami + BrainRot stay.** They get the shared game engine first (owner's 4th-grade child plays them). No archiving decision in this plan.
4. Every `Lesson` block is bound to `KnowledgeMap` concept ids. Publishing is gated on coverage: `core` = 100%, `supporting` ≥ 90%. Blocks with zero concept binding are rejected by the Zod schema unless `kind: "recap"`.
5. Existing `contentType: 'html'` materials keep working unchanged. New type `lesson`. No forced migration.
6. Ticket-first: every slice below gets its own local kanban row (`kanban.mjs add --repo WEBSULI`) before code. Master row: **#97**.
7. TDD-from-design: each slice names its failing test files. Coder writes them RED first. A slice PR with green tests but no new test for the behaviour is rejected.
8. Never print, log or commit API keys. OpenRouter key is read from Hermes env, referenced as `OPENROUTER_API_KEY`.
9. `search_files` with absolute Windows paths is unreliable on this host (os error 3). Use `git grep` inside the repo or `rg` with native `D:\...` path.
10. Hungarian source text (textbook excerpts, owner comments) is quoted verbatim inside prompts and specs; never paraphrase it into another language for a model.

## 1. Goal

Turn WEBSULI from "AI writes an opaque HTML blob" into a **source-bound, structured lesson pipeline**:

- Admin uploads PDF / JPG / PNG / DOCX of the school material.
- An extractor builds a **KnowledgeMap** (exam-relevant concepts with source references). Admin curates it — this is the one irreplaceable human step.
- Pedagogue → Author → Animator → Lektor agents design a **Lesson** (JSON) freely, but every claim maps to a KnowledgeMap concept (D1).
- A shared **Lesson Runtime** renders lessons (explain / example / animate / check / try / recap) with age-band theming, TTS, 44 px touch targets, reduced-motion.
- Section **Próba** results issue **server-timed play coupons** (D2); the six games consume coupons through a shared **Game Engine** and inject quiz items from the lesson's concepts.
- Per-concept results flow back to the Studio ("fix this concept") and to the parent digest.

## 2. Non-goals

- No payments, tenants, teacher accounts, LMS/SSO.
- No rewrite of existing HTML materials; converter is a later optional slice.
- No replacement of Three.js in Space/BlockCraft; no visual redesign of games outside the shared engine/tokens.
- No change to Google OAuth eligibility rule for cloud sync (Google + mailing list) except the redirect target (slice 0).
- No new hosting; Render + Postgres stay.

## 3. Architecture (target)

```
Admin Studio (client/src/studio/)           Student surfaces
  Sources → KnowledgeMap editor              Home → /lesson/:id (Lesson Runtime)
  Outline review → Job monitor → Preview       Section Próba → coupon → /games/* (Game Engine)
        │                                                │
        ▼                                                ▼
server/studio/  (pipeline state machine, DB-persisted jobs)      server/rewards/ (coupon issue/verify/clock)
  extractor → pedagogue → author → animator → lektor → gates       server/games/ (quiz items by concept)
        │
        ▼
server/ai/ (existing AIProviderFactory + wrapper + payload-guard) + NEW OpenRouterProvider
shared/ lesson-schema.ts · knowledge-map-schema.ts · reward-policy.ts · classrooms.ts
```

## 4. Data model (Drizzle, new tables; migrations via `drizzle-kit generate`)

| Table | Purpose | Key columns |
|---|---|---|
| `knowledge_maps` | one per material draft | `id, materialId?, subject, classroom, unitTitle, status(draft/curated), sourceFiles jsonb, createdBy` |
| `km_concepts` | exam concepts | `id, mapId, term, definition (verbatim), type(definition/fact/date/formula/procedure/person/place), examWeight(core/supporting/extra), sourceRef jsonb{file,page,bbox?}, relatedIds jsonb, adminDecision(keep/drop/merge)` |
| `lessons` | structured lesson | `id, htmlFileId (1:1 with html_files row of contentType 'lesson'), mapId, version, json jsonb (Lesson), coverage jsonb, publishedAt` |
| `studio_jobs` | pipeline runs | `id, lessonId?, mapId, step(extract/pedagogue/author/animator/lektor/gate/done/error), status, model, promptVersion, inputHash, output jsonb, tokensIn, tokensOut, error, createdAt, finishedAt` |
| `lektor_notes` | admin-only findings | `id, jobId, kind(source_conflict/coverage_gap/language/age), severity(blocker/warn), payload jsonb, resolvedBy, resolution` |
| `reward_policy` | D2 parameters | `id, key, value jsonb` — seeded: `ladder=[1,2,3,4]`, `lessonPerfectMax=10`, `sectionThresholds={retry:<80, good:80, perfect:100}`, `bonusPerCorrectInGame=30s`, `coolDown=...` |
| `coupons` | issued play time | `id, userIdOrFingerprint, lessonId, sectionIdx, minutes, reason, issuedAt, consumedSeconds, expiresAt, serverStartedAt?` |
| `concept_results` | per-concept outcomes | `id, lessonId, conceptId, userIdOrFingerprint, correct bool, ms, createdAt` |
| `game_quiz_items` (ALTER) | add `conceptId varchar references km_concepts` | |
| `html_files` (no change) | `contentType` gains value `'lesson'` (varchar, no enum) | |

`system_prompts` (existing) becomes the prompt store: rows keyed `studio.<step>.<version>`; the pipeline records `promptVersion` per job.

## 5. Shared schemas (Zod, `source/shared/`)

### 5.1 `knowledge-map-schema.ts`
```ts
Concept = { id, term: string.min(1), definition: string, type: enum, examWeight: enum,
            sourceRef: { file, page?: int, region?: {x,y,w,h} }, relatedIds: string[] }
KnowledgeMap = { subject, classroom: 0..12 int, unitTitle, concepts: Concept[].min(1),
                 requiredSkills: string[], ambiguities: {question, options?}[] }
```

### 5.2 `lesson-schema.ts`
```ts
AgeBand = "kid"(1–4) | "teen"(5–8) | "senior"(9–12); derive from classroom, never stored twice.
Block (discriminated on kind):
  explain { text: RichText, depth: "core"|"deeper"|"why", readAloud: bool, coversConceptIds: string[].min(1) }
  example { problem, steps: string[].min(1), answer, coversConceptIds.min(1) }
  animate { animKind: "numberLine"|"fraction"|"timeline"|"geometry"|"process"|"map"|"wordBuilder"|"sentenceParts",
            params: record, caption, coversConceptIds.min(1) }
  check   { question, options: string[].min(2).max(5), correctIndex, feedbackPerOption: string[] (same length), hint?, coversConceptIds.min(1) }
  try     { tryKind: "dragSort"|"fillBlank"|"match", spec: record, coversConceptIds.min(1) }
  recap   { bullets: string[].min(1), nextLessonId?: string }   // only block allowed with no concepts
Section = { heading, blocks: Block[].min(1), probaEnabled: bool = true }
Lesson  = { title, subject, classroom, mapId, sections: Section[].min(1),
            misconceptions: {conceptId, text}[], sourceOnly: literal(true) }   // D1 flag, must be true
```
Refinements: every `check` needs ≥1 `feedbackPerOption` that references a misconception when the option is wrong (soft warn, not schema fail); `sourceOnly` must be `true`.

### 5.3 `reward-policy.ts`
Types only + `computeCoupon(policy, history, sectionScore, isLessonFinal)` pure function (tested).

## 6. Pipeline state machine (`server/studio/`)

```
extract → (admin curates map) → pedagogue → (admin approves outline) → author → animator → lektor
   ├── lektor.blockers>0 && rounds<2 → author (round+1)
   └── else → gate (coverage + schema + render) → preview (admin) → publish
```
- Jobs are DB rows (`studio_jobs`), polled by the client — same pattern as `improveAsync.ts`; **no in-memory job maps**.
- Each step: load prompt from `system_prompts` (`studio.<step>.<ver>`), build input, call provider via `withAIProvider` (timeout/retry/backoff), validate with Zod, persist output + tokens, advance.
- Idempotency: `inputHash` = sha256(step + promptVersion + normalized input). Re-running an identical step returns the cached row.
- All AI outputs are **JSON only**; strip code fences; fail closed on parse error (status `error`, admin sees the raw text length, never the raw text of a prompt injection).

### 6.1 Extractor (vision)
Input: files (existing `analyze-files` limits: PDF/JPEG/PNG/DOCX/TXT/HTML, payload guard). Output: `KnowledgeMap`. Prompt rules: quote definitions **verbatim** from the page; no outside knowledge; when unsure → `ambiguities`. PDF pages are rasterized client-side (existing PDF→PNG path) and sent as `image_url`.

### 6.2 Pedagogue
Input: curated `KnowledgeMap`, classroom, exam type. Output: outline `{ sections: [{heading, conceptIds, plannedBlocks: kind[], animationSuggestions}] , misconceptions }`. Constraint: **union of conceptIds over sections ⊇ all `core` + ≥90% `supporting`**; the validator rejects otherwise before the admin sees it.

### 6.3 Author
Input: outline + map. Output: full `Lesson`. Hard rules in prompt: D1 (source-only), Hungarian, age-band register, every block bound to concept ids from the map (ids echoed, not invented — validator checks ids ∈ map).

### 6.4 Animator
Input: `Lesson`. Output: same `Lesson` with `animate` blocks inserted/parameterized only from the 8 kinds. Validator: no new concept ids, no removed blocks.

### 6.5 Lektor (different model family than Author — see §11)
Input: `Lesson` + `KnowledgeMap`. Output: `{ notes: LektorNote[] }` with kinds `source_conflict` (claim not traceable to a concept → **blocker**; claim contradicting a concept → **blocker**), `coverage_gap` (blocker if core), `language`, `age`. Also allowed: `source_conflict` of kind `book_probably_wrong` — **severity `info`, admin-only, never changes the lesson** (D1).

### 6.6 Gate (Tier-0, no LLM)
1. Zod `Lesson` validates. 2. Coverage core 100 / supporting ≥90. 3. All concept ids exist. 4. Playwright render of `/lesson/:draftId` at 375×667, 768×1024, 1280×800: no horizontal overflow, all block roots visible after scrolling, every interactive control ≥44×44 CSS px, contrast ≥4.5:1 on text nodes sampled (axe-core). 5. TTS text length per block ≤ 1200 chars.

## 7. Lesson Runtime (`client/src/lesson-runtime/`)

- Route `/lesson/:id` (public) and `/lesson/draft/:jobId` (admin). `Preview.tsx` branches on `contentType === 'lesson'` and mounts the runtime **instead of** the iframe. The lesson path serves **no third-party script** → `/dev` CSP relaxation is not applied; CSP for `/lesson/*` = the strict app CSP without `unsafe-eval` (slice 4).
- Components: `ExplainBlock` (depth toggle "Miért?"), `ExampleBlock` (step reveal), `AnimateBlock` (8 kinds, framer-motion, `prefers-reduced-motion` → static final frame), `CheckBlock` (instant feedback per option, hint), `TryBlock` (3 kinds, dnd-kit already a dependency), `RecapBlock`, `SectionProba`, `TtsButton` (Web Speech, hu-HU).
- Theming: age-band tokens from `tailwind.config.ts` (`kid-*`, `teen-*`, `senior-*` — currently unused, become used here). All tap targets `min-h-11 min-w-11`.
- Coupons UI: after Próba, `CouponBanner` shows minutes and a "Játszani" CTA; `/games` reads active coupon from server.

## 8. Rewards (`server/rewards/`, D2)

- `POST /api/lessons/:id/proba` `{ sectionIdx, answers[] }` → server grades against the lesson JSON (never trusts client score), writes `concept_results`, computes coupon with `computeCoupon`:
  - score < `retry` → no coupon, returns `weakConceptIds` (runtime opens `why` + animation for them).
  - `good` ≤ score < `perfect` → ladder step **does not advance**; coupon = current ladder minute value.
  - score = `perfect` → coupon = ladder[min(streak, ladder.length-1)], streak++.
  - `isLessonFinal && perfect` → coupon = `lessonPerfectMax` (10).
  - Ladder streak is per (user/fingerprint, lesson).
- `POST /api/coupons/:id/start` → server sets `serverStartedAt`; `GET /api/coupons/active` → remaining seconds computed server-side; `POST /api/coupons/:id/bonus` (+30 s) only when the game reports a correct in-game quiz answer **and** the server verifies the quiz item id was served to that session.
- Identity: Google user id when logged in; else fingerprint (existing `normalizeFingerprint`). Leaderboard sync eligibility rule unchanged.
- Anti-abuse: rate-limit Próba submissions (existing `publicWriteLimiter` pattern), server-side answer grading, coupon expiry (default 24 h, parameter).

## 9. Game Engine (`client/src/game-engine/`, D3)

`useGameSession({ gameId })` provides: coupon clock (server-synced, visible HUD countdown), pause on `blur`/`visibilitychange`, quiz injection from `useMaterialQuizzes` filtered by the **active lesson's concept ids** first, then grade fallback; `onQuizAnswer` → bonus call; unified `QuizModal` (same component as Runtime `CheckBlock`), `AnswerLock`, `useRunTimer`, `useTimeoutRegistry`, `bestStreak/bestCombo` computed correctly (fixes the under-count found in the June analysis).

Order of adoption (D3 first): **Tsunami → BrainRot → Space → BlockCraft → SpeedQuiz/WordLadder** (last two may merge into a Runtime "Villám-próba" mode later; not in this plan).

When the coupon hits 0: game shows "Idő lejárt — új próba a leckében" and returns to `/lesson/:id#section-N`. Free play without coupon remains possible **only** if `reward_policy.freePlay=true` (default `false` for logged-in users with an active lesson; `true` otherwise so the site is not locked for visitors).

## 10. Slices (each = own kanban row, own spec under `docs/specs/`, own PR ≤ ~400 LOC diff where feasible)

| # | Slice | Deliverable | RED tests to write first | Gate |
|---|---|---|---|---|
| 0 | Hygiene | OAuth callback `returnTo` (default `/games`, admin → `/admin`); hero CTA ≥44px + label visible <480px; define or replace `tablet/foldable/uw` screens; remove `tmp/local-repo-safety/*.bundle` + duplicate 11 MB JPEG from git; `gamesPlayed` admin readout; prompts → `system_prompts` rows; model ids → `server/ai/models.ts` | `tests/auth-return-to.test.ts`, `tests/screens-defined.test.ts` (scans TSX for `xx:` prefixes not in config), e2e: hero CTA text visible at 360px | tsc, eslint ≤ baseline, unit, e2e |
| 1 | KnowledgeMap | schemas, tables+migration, `POST /api/studio/extract` (reuses analyze-files path), `KnowledgeMapEditor` (source page image + concept list + weight + ambiguities) | `tests/knowledge-map-schema.test.ts`, `tests/extractor-verbatim.test.ts` (definition ⊆ OCR text or flagged), e2e editor renders 3 viewports | + Playwright |
| 2 | Lesson + pipeline v1 | `lesson-schema.ts`, `lessons`/`studio_jobs`/`lektor_notes`, pedagogue→author→lektor, coverage gate, Runtime with explain/example/check/recap, `Preview` branch, first lesson published as `contentType:'lesson'` | `tests/lesson-schema.test.ts` (sourceOnly, concept binding, recap exception), `tests/coverage-gate.test.ts`, `tests/pipeline-state.test.ts` (round limit 2, idempotent inputHash), `tests/lektor-d1.test.ts` (book_probably_wrong is info, never mutates lesson) | + axe on runtime |
| 3 | Rewards + Engine (D2, D3) | `reward_policy` seed, `computeCoupon`, Próba endpoint, coupon endpoints, `CouponBanner`, `useGameSession`, Tsunami + BrainRot on engine | `tests/reward-policy.test.ts` (ladder 1,2,3,4; cap 10; retry <80; no advance on good), `tests/proba-server-grading.test.ts`, `tests/coupon-clock.test.ts` (server time, bonus only for served item), engine unit tests for blur pause + bestStreak | + e2e coupon flow |
| 4 | Animate + Try + Animator + CSP | 8 animate kinds, 3 try kinds, Animator step, TTS, strict CSP on `/lesson/*`, Space + BlockCraft on engine | `tests/animator-invariants.test.ts` (no new ids, no removed blocks), `tests/csp-lesson-route.test.ts`, Playwright reduced-motion static frame | + Lighthouse a11y ≥ 90 on `/lesson/:id` (record score, do not fabricate) |
| 5 | Feedback loop | `concept_results` aggregation, Studio "fix this concept" (re-runs author→lektor on one section), `game_quiz_items.conceptId` export, parent digest per concept, `AdminDocumentation` Studio guide (HU) | `tests/concept-aggregation.test.ts`, `tests/quiz-items-from-checks.test.ts` | + owner walkthrough |

Optional later: HTML→Lesson converter; SpeedQuiz/WordLadder merge.

## 11. Model routing (OpenRouter; ids verified against `/api/v1/models` on 2026-09-04)

Provider: new `server/ai/OpenRouterProvider.ts` implementing `AIProvider` (OpenAI-compatible chat completions, `HTTP-Referer`/`X-Title` headers, JSON mode where supported). Existing OpenAI/Claude providers remain as fallbacks. Model ids live in `server/ai/models.ts` and are **overridable by env** (`STUDIO_MODEL_<STEP>`).

| Step | Primary | Fallback | Why |
|---|---|---|---|
| extract (vision) | `openai/gpt-5.6-terra` | `x-ai/grok-4.6` | strong vision + JSON; verbatim quoting |
| pedagogue | `x-ai/grok-4.6` | `openai/gpt-5.6-terra` | planning, misconceptions |
| author | `openai/gpt-5.6-terra` | `qwen/qwen3.8-max` | long structured HU output |
| animator | `qwen/qwen3.8-flash` | `z-ai/glm-5.3-flash` | bounded transform, cheap (owner decision 2026-09-04: no local GPU — never route to a local Ollama tag) |
| lektor | `qwen/qwen3.8-max` | `z-ai/glm-5.3` | **different family from author** (D1 enforcement) |
| gate helpers (language/age scoring) | `z-ai/glm-5.3-flash` | — | cheap classification |
| in-game quiz item polish | `z-ai/glm-5.3-flash` | — | cheap |

Rule: author and lektor must never resolve to the same model family; `models.ts` exports `assertDistinctFamilies()` called at startup (test in slice 2). Costs: record `tokensIn/Out` per job; Studio shows per-lesson token totals. Pricing display: `pricing_required` unless fetched from OpenRouter `/models` at runtime — never hardcode USD.

Hermes-side execution: Planner = this file + `docs/specs/lesson-studio-execution-runbook-2026-09-04.md`. Orchestrator/Coder = the Hermes default session switched to `anthropic/claude-opus-5` (OpenRouter); it codes directly or via `delegate_task` (children inherit Opus 5). **No local model anywhere** — the GPU is down (owner, 2026-09-04); `localcoder`/`localhelper` profiles must not be invoked. Independent review = `reviewer1`/`reviewer2` profiles **only if** their `config.yaml` is verified to pin an OpenRouter model of a different family than Opus (`x-ai/grok-4.6`, `qwen/qwen3.8-max` preferred); otherwise review runs as a separate `delegate_task` child with an explicit adversarial brief and the report is labelled `same-family-review`. Judge only on disagreement or security-class finding (`proportional-planning`). No HAP: auditability is satisfied by `studio_jobs` + PRs + kanban notes.

## 12. Acceptance (EARS, plan level)

- WHEN an admin uploads a PDF and curates the map THEN the system SHALL produce a Lesson whose every non-recap block references ≥1 curated concept id.
- WHEN the Lektor finds a claim not traceable to the map THEN the system SHALL block publishing until the author round removes it or the admin marks it `extra` — and SHALL NOT alter the source-derived statement (D1).
- WHEN the source is judged wrong by the Lektor THEN the system SHALL store an admin-only `book_probably_wrong` note and SHALL render the lesson exactly per source (D1).
- WHEN a student scores 100% on consecutive section Próbák THEN the system SHALL issue coupons of 1, 2, 3, 4 minutes respectively, and 10 minutes on a perfect lesson-final Próba (D2), computed and timed on the server.
- WHEN a game runs with an active coupon THEN the engine SHALL inject quiz items bound to the active lesson's concepts and SHALL add 30 s per verified correct answer.
- WHEN the coupon reaches zero THEN the game SHALL stop and route back to the lesson section.
- WHEN `/lesson/:id` renders at 375 px THEN there SHALL be no horizontal overflow and every control SHALL be ≥44×44 px.
- WHEN Tsunami or BrainRot start THEN they SHALL run on `useGameSession` (D3) with coupon HUD.

## 13. Risks

- Vision extraction quality on photographed pages → mitigated by the mandatory admin curation step and `ambiguities`.
- Prompt injection inside uploaded documents → JSON-only outputs, Zod validation, no raw model text to students, admin sees lengths not payloads on error.
- Coupon gaming via fingerprint reset → acceptable for anonymous; logged-in path is authoritative; policy `freePlay` default keeps visitors unblocked.
- Scope creep on animations → exactly 8 kinds in this plan; new kinds need a spec.
- Owner learning curve → each slice ships a Hungarian "Így használd" section into `AdminDocumentation.tsx`.

## 14. Owner walkthrough (Hungarian summary of how you will use it)

1. **Új tananyag → Források**: PDF/JPG/DOCX feltöltés, tantárgy, osztály, témakör.
2. **Tudás-térkép**: bal oldalt a forrás oldala, jobb oldalt a kiszedett fogalmak; te pipálsz, súlyozol (core/supporting/extra), válaszolsz a kérdésekre. **Ez a te lépésed.**
3. **Vázlat**: a Pedagógus javaslata fedettség-sávval; húzd, kérj többet/kevesebbet, hagyd jóvá.
4. **Írás, animálás, lektor**: háttérben. Kapod a listát: forrástól eltérés (blokkol), fedettség-hiány, nyelv/életkor. A „könyv téved” jelzést csak te látod; a lecke a könyvet tanítja.
5. **Előnézet** telefon/tablet/asztal nézetben, kitöltheted a Próbákat.
6. **Publikálás**: főoldalra kerül; a Check-ek bekerülnek a játékok tananyag-bankjába.
7. **Gyerek**: szekció végén Próba → 80% alatt visszaküldi a „Miért?” részekhez; 100% → 1, majd 2, 3, 4 perc játék; a lecke-záró hibátlan Próba 10 perc. A játékban a kvízek az aktuális leckéből jönnek, jó válasz +30 s.
8. **Két hét múlva**: a Stúdió jelzi, melyik fogalomnál buknak, egy gombbal újraíratod azt a szekciót.
