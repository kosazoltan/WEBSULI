# Lesson Studio — Execution Runbook for the Orchestrator (Opus 5)

> Companion of `lesson-studio-master-plan-2026-09-04.md` (the WHAT). This file is the HOW: environment, commands, order, decision rules, stop conditions. Written for an agent that has **no memory of the planning conversation**. Baseline `main` @ `7cbf198`. Every `file:line` below was measured on that commit; re-verify with `git grep -n` before editing (lines move).
> Owner decisions are final and repeated here: **D1 source-always-wins · D2 coupon ladder 1/2/3/4 min, lesson-perfect 10 min, server-timed · D3 Tsunami + BrainRot get the engine first.** No local models (GPU down).

## 0. Read-me-first checklist (do in this order, every session)

1. `cd D:/repo/WEBSULI && git status -sb && git log -1 --oneline` — you must be on a feature branch for any code change (`git switch -c feat/ls-<slice>-<short>` from `main`). Never commit on `main`. Never push/merge unless the owner says so in the current session.
2. Read `AGENTS.md` (repo rules: spec-first for 3+ files, test-integrity, evidence-before-completion, Hungarian to the owner).
3. Read the master plan §0 (blocking facts) and §10 (slices). Then the slice section of THIS file.
4. Kanban is mandatory before code: `node --no-warnings "D:/Hermes/skills/software-development/hermes-kanban-workflow/scripts/kanban.mjs" list --repo WEBSULI`. Master row **#97** (status review = plan approved). Each slice gets its own row (`add`, `start`, `note`, `review`, `done`).
5. Load skills: `proportional-planning`, `test-driven-development`, `exc-tdd`, `windows-path-compatibility`, `hermes-kanban-workflow`, `requesting-code-review`. Do not load HAP.
6. Toolchain check (once): `cd source && node -v` (needs ≥ 22.16) `&& npm ci` (only if `node_modules` missing) `&& npx tsc --noEmit && npx eslint client/src server --max-warnings 989 && node --import tsx --test "tests/*.test.ts"`. All must be green **before** you change anything; record the numbers. If not green, stop and report — do not "fix" unrelated red.
7. Playwright locally needs a Postgres `DATABASE_URL` in `source/.env` (never print it). If absent, E2E is `NOT RUN` in your report with that reason — do not fake it.

## 1. Environment facts (measured 2026-09-04)

| Fact | Value |
|---|---|
| Repo | `D:\repo\WEBSULI`, app in `source/` (`rest-express`, ESM, Node ≥22.16) |
| Run | `npm run dev` (tsx) · `npm run build` (vite + esbuild → `dist/`) · `npm start` |
| Checks | `npx tsc --noEmit` · `npx eslint client/src server --max-warnings 989` (baseline **989**, must not grow) · unit `node --import tsx --test "tests/*.test.ts"` · e2e `npx playwright test` (`testMatch: **/*.spec.ts`, webServer `node dist/index.js` on :5000, needs DB) |
| DB | Drizzle + `pg`; schema `source/shared/schema.ts` (24 tables); migrations `source/migrations/0000…0007*.sql`; new migration = `npx drizzle-kit generate` then review SQL; CI runs `npm run db:migrate` on empty Postgres |
| CI | `.github/workflows/ci.yml`: lint-typecheck → unit → e2e (Postgres service) |
| Deploy | Render (`render.yaml`, rootDir `source`, `/health`) — **do not touch** |
| Auth | `source/server/auth.ts` (259 lines): local + Google; ban check; `regenerate`; Google callback `res.redirect('/admin')` at **line 145** |
| Client auth | `source/client/src/hooks/useAuth.ts` → `GET /api/auth/user` |
| Routes | `source/server/routes.ts` **5640 lines** monolith. Key anchors: CSRF middleware 713–757; `/api/material-result` 849; quiz-bank 937; `generate-quiz` 970; `material-quizzes` 1004; `analyze-files` 1840 (allowed MIME 1849; vision `image_url` 1872–1919, model `gpt-5`); `html-files` GET 2833 / POST 2924; admin `system-prompts` POST 5154 |
| AI | `source/server/ai/{AIProvider,AIProviderFactory,ClaudeProvider,OpenAIProvider,AICache}.ts`; `source/server/lib/{ai-provider-wrapper,ai-payload-guard}.ts`; async job pattern `source/server/improveAsync.ts` (DB-persisted status rows, client polls) |
| Games | 6 pages under `source/client/src/pages/*Quiz*.tsx`/`Tsunami…`/`BrainRot…`; hooks `useMaterialQuizzes.ts`, `useStreakProtector.ts`, `useGameScoreSync.ts`; server `gameScoreService.ts` (atomic upsert, clamps 200000/10000/86400) |
| UI | Tailwind `source/tailwind.config.ts` (screens: only `xs:480px` + container `2xl`); `index.css` 554 lines (`glass-card` defined **twice**); shadcn under `components/ui/`; `HeroSection.tsx` CTAs `h-6 sm:h-7` |
| Undefined breakpoints in use | `tablet:` (AdminFileDashboard ×5, pdf-view ×3, Preview ×2), `foldable:` ×1, `uw:` ×1 — currently dead classes |
| Git bloat | `tmp/local-repo-safety/repo-backup-20260331-191613.bundle` 39 MB tracked; `source/client/public/gemini-hero-bg.jpg` = `copernican-hero-bg.jpg` 11.16 MB each; `tests/screenshots/*.png` ~15 MB |
| Secrets | `source/.env` untracked (never read/print). Root `client_secret_*.json` untracked but present — never `git add`. `OPENROUTER_API_KEY` lives in Hermes env, not in this repo |
| Hermes host quirks | git-bash; native tools want `D:/...` paths; `search_files` with absolute paths can fail (os error 3) → use `git grep` / `rg "D:\repo\WEBSULI"`. `patch` tool may flip LF→CRLF: check `git diff --stat` for whole-file diffs and normalize |

## 2. Working agreement (applies to every slice)

- **Spec first** for the slice: copy `docs/specs/_TEMPLATE.md` → `docs/specs/ls-<n>-<name>-<date>.md`, fill Cél/Nem-cél/Érintett/Döntések/Edge/EARS/Tesztterv (Hungarian is fine — it is owner-facing). The EARS lines come from master plan §12 + this file.
- **RED first**: create the test files listed for the slice, run them, paste the failing output into the kanban note. Then implement. Then GREEN. Then a **reverse mutation** (temporarily break the change, see the test fail, restore) for at least one behaviour per slice — note the mutated line.
- **Size**: keep each PR ≈ ≤400 LOC diff; split a slice into PR-a/PR-b if needed. No drive-by refactors, no `any`-cleanup, no console→logger sweeps unless the slice says so.
- **Owner communication**: Hungarian, dense. At slice end report: files changed, commands run with PASS/FAIL, NOT RUN + reason, residual risk, and a short "Így használd" paragraph (goes also into `AdminDocumentation.tsx` from slice 2 on).
- **Stop and ask** (do not guess): a D1/D2/D3 conflict; a needed env var missing in prod; a migration that drops/rewrites data; anything touching `render.yaml`, deploy, or Google OAuth client config.
- **Stuck rule**: 2 identical failed approaches → change hypothesis; 5 iterations without a green test → write the blocker + options and stop.
- **Model routing for AI steps**: only via `server/ai/models.ts` (slice 0). Never hardcode a model id in a route again.

## 3. Slice 0 — Hygiene & foundations (class S; 4 small PRs)

Kanban: `add --repo WEBSULI --title "LS-0 hygiene: returnTo, mobile CTA, breakpoints, git bloat, models.ts, prompts→DB"`.

### 0a — Google OAuth `returnTo` (behaviour)
- **Now**: `auth.ts:145` always `res.redirect('/admin')`; `Login.tsx` sends everyone to `/auth/google`; non-admins land on an admin page.
- **Change**: `GET /auth/google?returnTo=<path>` stores a **same-origin relative path** (regex `^/[A-Za-z0-9_\-/#?=&.]*$`, reject `//`, reject anything else → default) in `req.session.oauthReturnTo` before `passport.authenticate`. In the callback after `req.login`: `const to = user.isAdmin && !stored ? '/admin' : (stored ?? '/games')`; delete it from session; redirect. Local `/api/login` unchanged.
- **Client**: `Login.tsx` Google button → `/auth/google?returnTo=${encodeURIComponent(location.search returnTo || '/games')}`; games/lesson pages that prompt login pass their own path.
- **RED tests**: `source/tests/auth-return-to.test.ts` — pure helper `sanitizeReturnTo(input): string|null` in `source/server/lib/return-to.ts`: accepts `/games`, `/lesson/abc#s-2`; rejects `//evil`, `https://x`, `javascript:`, empty → null. Integration-ish: extract the redirect decision into `resolvePostLoginRedirect({isAdmin, stored})` and test the 4 combinations.
- **Reverse mutation**: make `sanitizeReturnTo` return input unchanged → the `//evil` test must fail.

### 0b — Mobile CTA & breakpoints (UI; needs Playwright render)
- `HeroSection.tsx`: CTA buttons → `min-h-11 min-w-11 h-11 px-3` (44 px), icons `w-4 h-4`, labels **always visible** (remove `hidden xs:inline` on the three CTAs; if width is tight <360 px, wrap with `flex-wrap`, do not hide text). Email subscribe: remove `hidden sm:block` wrapper or move the dialog trigger into the mobile row.
- `tailwind.config.ts` `screens`: add `tablet: "768px"`, `foldable: "900px"`, `uw: "1600px"` (**decision: define, do not delete** — 11 usages already assume them). Verify each usage still makes visual sense at 768/900/1600 in the Playwright pass.
- **RED tests**: `source/tests/screens-defined.test.ts` — scans `client/src/**/*.tsx` for `\b([a-z]{2,8}):(?:[a-z-]+)` prefixes that are Tailwind-variant-like and not in {sm,md,lg,xl,2xl,dark,hover,focus,focus-visible,active,disabled,group-hover,peer,first,last,odd,even,placeholder,motion-reduce,motion-safe,print,aria-*,data-*} ∪ config `screens` keys → must be empty. (This is the regression guard for the `xs` class of bug.) E2E: add to `websuli.spec.ts` a 360×740 test asserting the three hero CTAs have visible text and bounding box height ≥ 44.
- Playwright render evidence at 360/375/768/1280: no horizontal scrollbar on `/`.

### 0c — Git bloat (repo hygiene; separate PR, no code)
- `git rm --cached tmp/local-repo-safety/repo-backup-20260331-191613.bundle` and add `tmp/local-repo-safety/` + `*.bundle` to root `.gitignore`. Do **not** delete the file from disk.
- Replace `copernican-hero-bg.jpg` usages with `gemini-hero-bg.jpg` if any (`git grep copernican`), `git rm` the duplicate. Convert `gemini-hero-bg.jpg` to WebP ≤ 250 KB at ≤1920 px (`npx sharp-cli` is **not** a dependency — use Python Pillow if available on the host, else ask owner); update `HeroSection.tsx` `backgroundImage`.
- `source/tests/screenshots/*.png` (~15 MB): move out of git (`git rm --cached`, add to `.gitignore`); they are Playwright artifacts, not fixtures (verify with `git grep screenshots/ source/tests` first — if a spec reads them, keep).
- Report before/after `git count-objects -vH` (history is not rewritten in this slice; note that the bundle stays in history — owner decides on filter-repo separately).

### 0d — `models.ts` + prompts → DB + `gamesPlayed` readout
- New `source/server/ai/models.ts`: exports `STUDIO_MODELS` per step (from master plan §11, **`animator: 'qwen/qwen3.8-flash'`**), each `process.env.STUDIO_MODEL_<STEP> ?? default`; `family(modelId)` (`openai|x-ai|qwen|z-ai|anthropic`); `assertDistinctFamilies()` throws if `author` and `lektor` share a family. Replace the hardcoded `"claude-3-5-sonnet-20241022"` in `routes.ts` HTML-fix/theme routes and `"gpt-5"` in `analyze-files` with `models.ts` lookups (`legacy.htmlFix`, `legacy.analyzeFiles`) — behaviour identical.
- New `source/server/ai/OpenRouterProvider.ts` implementing the existing `AIProvider` interface (read `AIProvider.ts` first; mirror `OpenAIProvider.ts` shape): base URL `https://openrouter.ai/api/v1`, `Authorization: Bearer ${process.env.OPENROUTER_API_KEY}`, headers `HTTP-Referer: https://websuli.vip`, `X-Title: WebSuli Studio`; JSON mode via `response_format` when supported; wrap with `withAIProvider`. Register in `AIProviderFactory`. If `OPENROUTER_API_KEY` is unset → provider `isConfigured()=false`, factory falls back, startup logs one warning (no throw).
- Prompts: seed rows into `system_prompts` for the **existing** inline prompts (name `legacy.htmlFix.v1`, `legacy.htmlTheme.v1`, `legacy.analyzeFiles.v1`) via a migration or a `scripts/seed-prompts.ts`; routes read by name with in-memory cache (60 s) and **fallback to the inline string** if the row is missing (no behaviour change in prod without the seed).
- `gamesPlayed` readout: extend `GET /api/admin/parent-dashboard` response with `gamesCatalog: [{gameId, totalGamesPlayed, distinctPlayers}]` from `game_scores` aggregate; show a small table in `ParentDashboardPanel.tsx`. This is the data for the D3-adjacent question "what do the kids actually play".
- **RED tests**: `source/tests/models-routing.test.ts` (env override wins; `assertDistinctFamilies` throws for same family; animator default is `qwen/qwen3.8-flash`), `source/tests/openrouter-provider.test.ts` (headers set, JSON fence stripping, unconfigured → `isConfigured()===false`), `source/tests/prompt-store.test.ts` (missing row → fallback string).

### Slice 0 definition of done
tsc 0 · eslint ≤ 989 · unit green incl. the 6 new files · e2e green (or NOT RUN + reason) · Playwright screenshots at 360/375/768/1280 attached to the kanban note path · owner report in Hungarian · kanban `review` with PR/branch note.

## 4. Slice 1 — KnowledgeMap (class M)

Kanban row `LS-1 KnowledgeMap`. Spec file first.

- `source/shared/knowledge-map-schema.ts` exactly per master plan §5.1 (Zod). Export types + `validateKnowledgeMap`.
- Schema/migration: tables `knowledge_maps`, `km_concepts` (§4). `drizzle-kit generate`; review SQL for `IF NOT EXISTS` style consistent with `0005…0007`.
- Server `source/server/studio/extractor.ts`: reuse the `analyze-files` request handling (MIME allowlist `routes.ts:1849`, payload guard) but a **new** prompt `studio.extract.v1` (seeded) whose contract is: output `KnowledgeMap` JSON only; `definition` must be a **verbatim substring** of the page text when the page is text-bearing; unknown → `ambiguities`. Model `STUDIO_MODELS.extract` via `OpenRouterProvider` (vision: `image_url` parts as today). Persist as a `studio_jobs` row (`step: 'extract'`) — create the `studio_jobs` table in this slice (§4) since the extractor is the first job type.
- Routes (new file `source/server/routes/studio.ts`, mounted under `/api/studio` **behind `isAuthenticatedAdmin`**; do not grow `routes.ts`): `POST /extract` (files[]) → jobId; `GET /jobs/:id`; `GET /maps/:id`; `PATCH /maps/:id/concepts/:cid` (weight/decision/definition edit); `POST /maps/:id/ambiguities/:idx/resolve`; `POST /maps/:id/curate` → status `curated`.
- Client `source/client/src/studio/KnowledgeMapEditor.tsx`: left = source page image (the client already rasterizes PDF→PNG for `analyze-files`; reuse that path), right = concept list grouped by `examWeight` with keep/drop/merge, weight toggle, definition inline edit, ambiguities panel. Mobile: stacked; all controls ≥44 px. Add as a new admin tab (`admin.tsx` tabs + `MobileBottomNav` "Anyagok" sheet).
- **RED tests**: `tests/knowledge-map-schema.test.ts` (min 1 concept; classroom 0–12 int; examWeight enum; sourceRef shape), `tests/extractor-verbatim.test.ts` (pure `checkVerbatim(definition, pageText)` → ok / `not_verbatim` flag; whitespace-insensitive), `tests/studio-jobs-idempotent.test.ts` (same `inputHash` → returns existing row), e2e: editor renders at 375/768/1280 and a concept weight toggle persists (needs seeded map via `tests/e2e-seed.ts` extension).
- DoD: as slice 0 + an owner walkthrough: upload one real PDF page (owner supplies), curate, screenshot.

## 5. Slice 2 — Lesson schema, pipeline v1, runtime v1 (class L; split into 2a schema+runtime, 2b pipeline)

Kanban rows `LS-2a Lesson runtime`, `LS-2b Studio pipeline v1`.

### 2a
- `source/shared/lesson-schema.ts` per §5.2 (blocks explain/example/check/recap in this slice; `animate`/`try` kinds declared in the union but the runtime renders a placeholder card "Hamarosan" until slice 4). Refinements: `sourceOnly === true`; every non-recap block `coversConceptIds.min(1)`; `feedbackPerOption.length === options.length`.
- Tables `lessons`, `concept_results` (§4). `html_files.contentType` may now be `'lesson'`; `POST /api/html-files` Zod (`insertHtmlFileSchema` in `schema.ts`) extends enum to `['html','pdf','lesson']`; for `lesson` the `content` column stores the lesson id (string) — `Preview.tsx` reads `contentType==='lesson'` and mounts `<LessonRuntime lessonId=…/>` **instead of the iframe** (no `/dev/` fetch, no sandbox).
- Runtime `source/client/src/lesson-runtime/` (`LessonRuntime.tsx`, `blocks/{Explain,Example,Check,Recap}Block.tsx`, `SectionProba.tsx` (grading call lands in slice 3; in 2a it shows local score only and no coupon), `theme.ts` mapping classroom→ageBand→Tailwind token classes from `tailwind.config.ts` `kid-*/teen-*/senior-*`), `TtsButton.tsx` (Web Speech `hu-HU`, hidden when unsupported). Public route `/lesson/:id` in `App.tsx` (lazy). All tap targets `min-h-11 min-w-11`; `prefers-reduced-motion` respected.
- **RED tests**: `tests/lesson-schema.test.ts` (sourceOnly must be true; recap exception; check feedback length; unknown block kind rejected), `tests/age-band.test.ts` (1–4 kid, 5–8 teen, 9–12 senior, 0 → teen by decision), e2e `/lesson/:seededId` at 375/768/1280: no horizontal overflow, axe-core no serious violations (add `@axe-core/playwright` devDependency), every button ≥44 px.

### 2b
- Tables `lektor_notes` (§4). State machine `source/server/studio/pipeline.ts`: `advance(jobId)`; steps `pedagogue → author → lektor → gate`; `rounds` counter; `inputHash` cache; each step = `system_prompts` row `studio.<step>.v1` + `STUDIO_MODELS[step]` + Zod validation of the output (`OutlineSchema`, `LessonSchema`, `LektorReportSchema`).
- Validators (pure, tested): `outlineCoversMap(outline, map)` (core 100 %, supporting ≥ 90 %); `lessonIdsSubsetOfMap(lesson, map)`; `coverage(lesson, map)` → `{core, supporting, missing[]}`; `lektorGate(report)` → blockers count; **D1**: `lektor_notes.kind === 'book_probably_wrong'` is always `severity: 'info'` and the pipeline never feeds it back to the author — enforce in code, not prompt.
- Prompts (seed `studio.pedagogue.v1`, `studio.author.v1`, `studio.lektor.v1`): Hungarian, include the map verbatim, include D1 wording literally: *"A forrás a mérce. Ha a forrás szerinted téved, azt csak `book_probably_wrong` jegyzetként jelezd; a leckében a forrás állítása marad."* Author prompt must echo concept ids, never invent.
- Routes in `routes/studio.ts`: `POST /lessons/from-map/:mapId` → pedagogue job; `GET /jobs/:id` (poll); `POST /jobs/:id/approve-outline`; `POST /jobs/:id/resume`; `GET /lessons/:id/draft`; `POST /lessons/:id/publish` (runs gate; creates/updates the `html_files` row with `contentType:'lesson'`).
- Client: `studio/OutlineReview.tsx` (coverage bar, reorder via existing `@dnd-kit`), `studio/JobMonitor.tsx` (poll like `MaterialImprover.tsx`), `studio/LektorNotes.tsx` (three lists; `book_probably_wrong` shown in a grey "Csak neked" box), publish button disabled until gate green.
- **RED tests**: `tests/coverage-gate.test.ts`, `tests/pipeline-state.test.ts` (round cap 2; idempotent; error state on invalid JSON), `tests/lektor-d1.test.ts` (a `book_probably_wrong` note never changes the lesson JSON hash; is `info`), `tests/models-distinct-families.test.ts` (author≠lektor family at startup).
- DoD: one real lesson published from the owner's curated map; Hungarian "Így használd" added to `AdminDocumentation.tsx`.

## 6. Slice 3 — Rewards + Game Engine (class L; D2 + D3)

Kanban row `LS-3 rewards+engine`.

- `source/shared/reward-policy.ts`: `RewardPolicy` type + `computeCoupon(policy, state, {score, isLessonFinal})` pure. Defaults (seed `reward_policy` table): `ladder=[1,2,3,4]`, `lessonPerfectMax=10`, `thresholds={retry:80, perfect:100}`, `bonusSeconds=30`, `couponTtlHours=24`, `freePlay=true`.
  - score < 80 → `{coupon:null, weakConceptIds}`; ladder streak reset to 0.
  - 80 ≤ score < 100 → `{minutes: ladder[min(streak, len-1)]}`; streak unchanged.
  - score = 100 → `{minutes: ladder[min(streak, len-1)]}`; streak += 1.
  - `isLessonFinal && score===100` → `{minutes: lessonPerfectMax}`.
- Tables `reward_policy`, `coupons` (§4). Server `source/server/rewards/{grade.ts,coupons.ts}` + routes `routes/lessons.ts` (public, rate-limited with the existing `publicWriteLimiter` pattern): `POST /api/lessons/:id/proba` (server grades from the lesson JSON; writes `concept_results`; returns score, weak ids, coupon), `POST /api/coupons/:id/start`, `GET /api/coupons/active`, `POST /api/coupons/:id/bonus` (requires `quizItemId` that the server issued to this coupon session — keep a `served_items` jsonb on the coupon).
- Identity: `req.user?.id` else `normalizeFingerprint(body.fingerprint)` (existing helper in `lib/public-input.ts`).
- Runtime: `SectionProba.tsx` calls the endpoint; `<CouponBanner minutes onPlay>` → `/games?coupon=<id>`; weak concepts auto-expand `depth:'why'` blocks.
- Engine `source/client/src/game-engine/`: `useGameSession({gameId})` → `{remainingSeconds, paused, quizQueue, onQuizAnswer, endReason}`; server-synced clock (`GET /api/coupons/active` every 15 s + local countdown); pause on `blur`/`visibilitychange`; quiz items: `useMaterialQuizzes` extended with `conceptIds` filter (lesson concepts first); shared `<QuizModal>` = the runtime's `CheckBlock` in modal mode (true `role="dialog"`, focus trap, Escape); `useTimeoutRegistry`, `useRunTimer`, `bestStreak` tracked as max not current.
- **D3 adoption**: `TsunamiEscapeEnglish.tsx` then `BrainRotSteal.tsx` mount `useGameSession`; HUD countdown; at 0 → overlay "Idő lejárt — új próba a leckében" → link `/lesson/:id#section-N`. Without a coupon and `freePlay=true` → unchanged behaviour. Fix the `BrainRotSteal.tsx:~466-525` per-frame `setState` storm as part of adopting the engine loop (refs + one commit per frame) — this is in scope because the engine owns the loop.
- **RED tests**: `tests/reward-policy.test.ts` (ladder 1,2,3,4 on consecutive perfect; no advance on 80–99; reset <80; cap 10 on final perfect; policy read from object not literals), `tests/proba-server-grading.test.ts` (client score ignored; wrong answers → weak ids), `tests/coupon-clock.test.ts` (remaining computed from server `serverStartedAt`; bonus rejected for unserved item; expiry), engine unit `tests/game-engine.test.ts` (blur pauses; bestStreak max), e2e coupon flow on the seeded lesson.
- DoD: owner's child can finish a section at 100 % and get 1 minute in Tsunami; the second perfect section gives 2. Screenshots at 375 of the HUD.

## 7. Slice 4 — Animate + Try + Animator + strict CSP (class L)

Kanban row `LS-4 animate+try+csp`.

- Runtime `blocks/AnimateBlock.tsx` with 8 kinds (`numberLine, fraction, timeline, geometry, process, map, wordBuilder, sentenceParts`) — each a small framer-motion component with a `params` Zod schema in `shared/animate-params.ts`; reduced-motion → final frame. `blocks/TryBlock.tsx` kinds `dragSort` (dnd-kit), `fillBlank`, `match`.
- Pipeline step `animator` (`studio.animator.v1`, model `qwen/qwen3.8-flash`): invariants validator `animatorInvariants(before, after)` — no concept ids added/removed, no non-animate block removed, only `animate` blocks inserted.
- CSP: in `source/server/index.ts` add a branch for `req.path.startsWith('/lesson/')` that applies the strict app CSP **without** `'unsafe-eval'` (keep `'unsafe-inline'` for style only). Do not change `/dev/` (HTML materials still need it — documented decision).
- Space + BlockCraft adopt `useGameSession` (3D loops stay; only the quiz modal, coupon HUD, streak fix, blur pause).
- **RED tests**: `tests/animator-invariants.test.ts`, `tests/animate-params.test.ts`, `tests/csp-lesson-route.test.ts` (supertest-style header check: `/lesson/x` CSP lacks `unsafe-eval`; `/dev/x` still has it), Playwright reduced-motion snapshot equals final frame.
- DoD: Lighthouse a11y on `/lesson/:id` recorded (real number; if <90, list the failing audits — do not tune the test).

## 8. Slice 5 — Feedback loop (class M)

Kanban row `LS-5 feedback`.

- `GET /api/studio/lessons/:id/concept-stats` (from `concept_results`: attempts, wrong %, per section). Studio panel highlights concepts with wrong % ≥ 40 → button "Írj mélyebb magyarázatot" → `POST /jobs/fix-concept {lessonId, conceptId}` → author→lektor on that section only (pipeline `scope` param).
- On publish, every `check` block → `game_quiz_items` row with `sourceMaterialId` + `conceptId` (ALTER adds column) so games pull lesson-bound items.
- Parent digest (`parent-dashboard` + weekly email in `server/lib/material-result.ts` neighbourhood): per child "érti / még nem" concept lists instead of raw XP only.
- `AdminDocumentation.tsx`: full Hungarian Studio guide (§14 of master plan, expanded with screenshots paths).
- **RED tests**: `tests/concept-aggregation.test.ts`, `tests/quiz-items-from-checks.test.ts` (conceptId set; idempotent on re-publish), `tests/fix-concept-scope.test.ts` (only the target section changes hash).

## 9. Reporting template (paste into kanban note and owner reply)

```
LS-<n><letter> — <name>
Branch: feat/ls-... @ <sha>   Kanban: #<id> -> review
Files: <list>
RED→GREEN: <test files> (RED output attached: yes/no)   Reverse mutation: <file:line mutated> -> <test> FAILED as expected
Checks: tsc PASS | eslint <n>/989 PASS | unit <k>/<k> PASS | e2e PASS/NOT RUN(<reason>) | Playwright 360/375/768/1280 PASS (paths)
Owner-visible change (HU): ...
Így használd (HU): ...
Residual risk: ...
Not done / deferred: ...
```

## 10. What the owner will do at each slice (HU, for the orchestrator to relay)

- **LS-0**: semmi teendő; ellenőrizd, hogy Google-belépés után a `/games`-re érkezel, a főoldali gombok telefonon olvashatók.
- **LS-1**: tölts fel egy valódi tankönyv-oldalt (PDF vagy fotó), kurálj: pipa, súly, kérdések megválaszolása.
- **LS-2**: hagyd jóvá a vázlatot, nézd meg a lektor három listáját, publikálj egy leckét; keresd a „Csak neked” szürke dobozt (könyv téved-jelzés).
- **LS-3**: Dominik játsszon: szekció-Próba 100 % → 1 perc Tsunami; második 100 % → 2 perc; állítsd a perceket a Stúdió „Jutalom” lapján.
- **LS-4**: nézd az animációkat telefonon; kapcsold be a „csökkentett mozgás”-t a rendszerben, ellenőrizd, hogy állóképet kapsz.
- **LS-5**: két hét adat után nyomd meg a „Írj mélyebb magyarázatot” gombot egy piros fogalomnál.
