# WEBSULI — Mély kód- és architektúra-elemzés

**Dátum:** 2026-06-23 · **Elemző:** Junior (orchestrator) + 2 fókuszált read-only kód-elemző subagent (games / server, gpt-5.4)
**Módszer:** fájl+sor-szintű bizonyíték, statikus eszközök (tsc, eslint, git ls-files, secret-scan). Lost-in-the-middle ellen szétdarabolt, fókuszált elemzés. Nincs hallucináció: minden lelet konkrét fájl:sor.

---

## 0. Tények (mért bizonyíték)

| Metrika | Érték | Forrás |
|---|---|---|
| Alkalmazás-kód | **44 069 LOC** TS/TSX (client 29 866 / server 13 650 / shared 553) | LOC-scan |
| Stack | Vite+React 18, Express 4, Drizzle ORM + Neon PG, Three.js, TanStack Query, wouter, Passport, OpenAI+Anthropic SDK | package.json |
| Typecheck | **tsc = 0 hiba** ✅ | `npx tsc --noEmit` |
| Lint | **1163 warning, 0 error** | `npx eslint` |
| → no-console | **892** | eslint rule freq |
| → no-explicit-any | **124** | eslint rule freq |
| → no-unused-vars | **130** | eslint rule freq |
| Debt-marker app-kódban | **2** (1 TODO, 1 @ts-ignore) ✅ | grep |
| Playwright teszt | **17 blokk / 242 sor** — 6 játékra + admin (vékony) | spec scan |
| Root .md dokumentáció | **36 fájl / 163 KB** (deploy-káosz) | ls |
| 6 játék | BlockCraftQuiz 2210, SpaceAsteroidQuiz 2205, TsunamiEscapeEnglish 1583, BrainRotSteal 1014, SpeedQuizMath 650, WordLadderHuEn 583 LOC | LOC-scan |

---

## 1. 🔴 KRITIKUS — biztonság / titokszivárgás (azonnal)

### S1. CSRF kikapcsolva minden mutáló AI/admin végponton — [CRIT]
`server/routes.ts:732-760`, `server/index.ts:75`, `server/auth.ts:35-61`
A cookie-alapú admin session mellett a kód **kifejezetten kikapcsolja a CSRF-védelmet** minden `/api/ai/*`, `/api/admin/improve-material/*`, `/api/admin/improved-files/*` mutáló végpontra. Admin sessionnel kereszt-site kérésből AI-job indítható, státusz váltható, törölhető, apply-olható.
**Fix:** CSRF visszakapcsolása ezekre is, VAGY stateless Bearer auth + Origin/Referer ellenőrzés.

### S2. Git-trackelt valós titkok — [CRIT]
- `source/KEY_TO_UPLOAD.txt` → **SSH private key minta**, git-trackelt
- `vault/infrastructure/github-secrets-canonical.md` → **live-key + SSH key minta**, git-trackelt
- (jó hír: `client_secret*.json` és `source/.env` NINCS trackelve — `.gitignore` lefedi)
**Fix:** `git rm --cached` + history-tisztítás (git-filter-repo/BFG) + **érintett kulcsok azonnali rotálása a kibocsátónál** (feltételezni kell, hogy kompromittálódtak). A `.gitignore`-ba felvenni: `KEY_TO_UPLOAD.txt`, `vault/**/*secret*`, `**/*canonical*`.

### S3. Publikus `/api/error-report` — auth/rate-limit nélkül, DB-írás + e-mail trigger — [HIGH→CRIT]
`server/index.ts:415-417`, `server/routes/error-report.ts:29-57`, `server/lib/error-mailer.ts:18-21,195-206`
Nincs auth/rate-limit/signature; DB-be ír és e-mailt triggerelhet (spam/DoS/mail-flood). Fallback HMAC secret és fix Gmail címek a kódban.
**Fix:** HMAC-signature ellenőrzés + rate-limit + titkok env-be.

### S4. Publikus `/api/static-audit` — RCE-közeli felület — [HIGH→CRIT]
`server/index.ts:416-417`, `server/routes/static-audit.ts:10-18`, `server/lib/static-audit.ts:20-104`
Kérésre **`npx tsc` + `git grep` fut** és env-hiányokat/reportot ad vissza → infoleak + CPU/IO DoS.
**Fix:** productionben teljes letiltás vagy admin-guard mögé.

---

## 2. 🟠 MAGAS — auth / adatintegritás / 3D-teljesítmény

### Szerver

- **S5. Ban nem érvényesül** — `server/auth.ts:66-83,148-155,203-221`, `shared/schema.ts:35-36`, `server/storage.ts:375-384`. Van `isBanned` mező, de sem login (Local/Google), sem deserialize, sem auth-middleware nem ellenőrzi → tiltott user bejut/bent marad. **Fix:** ban-check login + deserialize + guard szinten.
- **S6. Session-fixation** — `server/auth.ts:183-188`. Login után nincs `req.session.regenerate()`. **Fix:** session-ID regenerálás login/OAuth callback előtt.
- **S7. DB SSL `rejectUnauthorized:false`** — `server/db.ts:25-33`. Nincs tanúsítvány-validáció → MITM kockázat. **Fix:** rendes CA, `rejectUnauthorized:true`.
- **S8. Admin debug/force-apply infoleak** — `server/routes.ts:5248-5276,5283-5382`. Nyers tartalomrészlet (`contentFirst200`), stacktrace, plusz raw-SQL írási út. **Fix:** prod-ból ki / debug-flag mögé; nyers tartalom+stack megszüntetése.
- **S9. `errorLogs` tábla migráció nélkül** — `shared/schema.ts:529-560`, 0 SQL migráció. A séma hivatkozik rá, de nincs `CREATE TABLE` → runtime DB-hiba az error-logging útvonalon. **Fix:** migráció generálása (`drizzle-kit generate`).

### Játékok (3D + statisztika)

- **G1. BlockCraft: teljes Three.js scene újraépül `phase`-váltáskor** — `BlockCraftQuiz.tsx:1456`. A renderer-effect `phase`-re kötött → quiz/level váltáskor GPU-churn, jank, memory churn. **Fix:** mount-szintű effect, játékállapot refekben.
- **G2. Streak/combo statisztika alulmér (3 játékban)** — `SpaceAsteroidQuiz.tsx:1961` (`runStreak` = aktuális combo, nem futás-max; nullázódik `1264`,`1617`), `BlockCraftQuiz.tsx:1930` (`recordRun` az aktuális streaket menti, resetel `1357-1358`). **Fix:** külön `bestComboRef`/`bestStreak` futás-szinten, achievementhez azt menteni.
- **G3. BlockCraft gyémánt-statisztika hibás** — `BlockCraftQuiz.tsx:1932`. `diamondsMined` a `rareBlocks`-ból becsülődik, de az szénre/vasra/mobra is nő (`1823`,`1836`). **Fix:** külön `diamondsMinedRef`, csak valódi DIAMOND találatnál nő.

---

## 3. 🟡 KÖZEPES — AI-költség, tranzakciók, re-render, a11y

### Szerver / AI

- **A1. Korlátlan AI-payload + hiányzó Zod-válaszvalidáció** — `server/routes.ts:1791-2249` több blokk, `server/improveAsync.ts:186-203,533-576`. Korlátlan `files`/`extractedText`/`conversationHistory`/`customPrompt` → **AI-költségrobbanás + prompt-injection felület**; `analyze-files`/`analyze-file` csak `JSON.parse`, nincs Zod; raw upstream hiba kiszivárog. **Fix:** fájlszám/bytes/history limit, kötelező Zod-validáció, safe error-mapping.
- **A2. Nincs timeout/backoff a külső AI-hívásokon** — `server/routes.ts:1110-1183,1188-1271` (Anthropic HTML-fix/theme). `error: err.message` megy kliensre. **Fix:** közös provider-wrapper timeout+retry+generikus klienshiba.
- **A3. Tranzakció-hiány** — `gameQuizGeneratorService.ts:146-200` (deactivate → egyenkénti insert tx nélkül → részleges/üres quizkészlet); `gameScoreService.ts:109-156` (read-then-write, nincs atomikus upsert → lost update); `routes.ts:4589-4592` (bulk move N külön update). **Fix:** `db.transaction` / `onConflictDoUpdate`.

### Játékok (re-render + input + a11y)

- **G4. BrainRotSteal: RAF minden frame-ben React state-et ír** — `BrainRotSteal.tsx:466-525` (`setBrainRots`/`setParticles`/`setFloatingTexts`) → teljes re-render lavina. **Fix:** gyorsan változó animáció refbe/canvasba vagy batch-elt frissítés.
- **G5. Beragadó mozgásbillentyűk** — `BlockCraftQuiz.tsx:1438`, `SpaceAsteroidQuiz.tsx:1918`. Nincs `window.blur` reset → ablakváltáskor beragadnak (a Tsunamiban van, ott jó minta). **Fix:** blur-cleanup minden játékban.
- **G6. Központosítatlan setTimeout-ok** — `SpeedQuizMath.tsx:359,369,393`, `BrainRotSteal.tsx:343,376`, `TsunamiEscapeEnglish.tsx:890,944,948`. Unmount után késői state-update. **Fix:** timeout-ID-k refbe + közös cleanup.
- **G7. Akadálymentesség hiányok** — quiz-overlay nem valódi dialog (`role="dialog"`/`aria-modal`/fókusz/Escape hiány): `TsunamiEscapeEnglish.tsx:1601`, `SpaceAsteroidQuiz.tsx:2280`, `BlockCraftQuiz.tsx:2309`. BlockCraft csak `mousemove`+pointer-lock, **nincs keyboard-only játszhatóság** (`1432`). Invalid HTML: `Games.tsx:369` `<button>` `<Link>`-ben. **Fix:** valódi dialog-szemantika+fókusz, billentyűs look-vezérlés, `Button asChild`.

---

## 4. 🟢 ALACSONY — repo-higiénia / DX

- **R1. Repo-szemét** — `Gemini.jpg` (**11 MB!**) + 4× `deploy_package*.zip` (1.6 MB) git-trackelve. **Fix:** `git rm --cached` + `.gitignore` (`*.zip`, nagy bináris).
- **R2. Dokumentáció-káosz** — 36 root .md (163 KB): VPS-DEPLOY-FIX, SSH-KEY-INFO, HOSTINGER stb. redundáns/elavult. **Fix:** `docs/` alá konszolidálni, max 3-4 kanonikus.
- **R3. 892 `no-console`** prod-kódban — logszivárgás + teljesítmény. **Fix:** `logger` absztrakció + eslint `no-console: error` prod-ban.
- **R4. 124 `no-explicit-any` + 130 unused-var** — típusbiztonsági lyukak. **Fix:** fokozatos szigorítás.
- **R5. ai-vendor manualChunks halott bejegyzés** — `vite.config.ts`. A kliens NEM importál AI SDK-t (ellenőrizve), így a chunk-entry felesleges. **Fix:** törölni.

---

## 5. ✅ Ami JÓ (megőrizni)

- `tsc = 0 hiba`, csak 2 debt-marker az app-kódban — fegyelmezett típushasználat.
- `App.tsx` már használ `lazy`(15×) + `Suspense` + `ErrorBoundary`(4×) — code-splitting megvan.
- `vite manualChunks` vendor-szeparáció (react/ui/pdf külön).
- `tsconfig strict` bekapcsolva.
- Kliens nem importál AI SDK-t → nincs kliens-oldali AI-secret szivárgás.

---

## 6. Keretrendszer fejlesztési roadmap (prioritás-sorrend)

1. **Biztonsági tűzoltás (1-2 nap):** S1 CSRF, S2 secret-rotálás+history-tisztítás, S3/S4 publikus végpontok lezárása. — *Bence/Eszter gate kötelező.*
2. **Auth-keményítés (2-3 nap):** S5 ban-enforcement, S6 session-regenerate, S7 SSL-validáció.
3. **AI-költség + robusztusság (2-3 nap):** A1 payload-limit+Zod, A2 timeout/backoff wrapper, A3 tranzakciók.
4. **CI-gate bevezetése (1 nap):** GitHub Actions: `tsc` + `eslint --max-warnings` + `playwright` mint **merge-gate** (jelenleg NINCS — csak `auto-review.yml`). + husky pre-commit (lint-staged).
5. **🎮 Közös játékmotor (3-5 nap) — a legnagyobb minőség-emelő:** lásd 7. szakasz.
6. **a11y-réteg (2 nap):** közös `<QuizModal>` valódi dialog-szemantikával (G7), keyboard-only támogatás (G6 input).
7. **Repo-higiénia (fél nap):** R1 szemét, R2 docs-konszolidáció, R5 dead chunk.
8. **Logger + lint-szigorítás (1-2 nap):** R3 892 console → strukturált logger, R4 any/unused fokozatos 0-ra.

---

## 7. 🎮 KÖZÖS JÁTÉKMOTOR — a kulcsjavaslat

A 6 játék **copy-paste hibaosztályt** szül: ugyanaz a rossz `runStreak` (G2), hiányzó cleanup (G5/G6), eltérő answer-lock, eltérő a11y (G7) — mindegyikben külön, külön bugokkal. A megoldás 3 kiemelhető réteg:

1. **`useQuizGameEngine` (run/session stat-motor):** XP, streak + **bestStreak/bestCombo helyesen**, submit, achievement — egy helyen, helyesen. Megszünteti G2+G3-at mind a 6 játékban.
2. **`<QuizModal>` (közös quiz-overlay):** prompt, **answer-lock** (dupla-klikk ellen), reveal, timeout, **valódi dialog-szemantika + fókuszkezelés** — megszünteti G7-et.
3. **`useGameLoop` (input/timer utils):** RAF-regiszter, interval, **blur-reset**, timeout-registry közös cleanuppal — megszünteti G5+G6-ot.

A 3D-specifikus rész (Space, BlockCraft Three.js) erre **adapterként** ül rá. Eredmény: a játéklogika-hibák egy helyen javíthatók, új játék fele annyi kódból, egységes a11y és teljesítmény.

---

## 8. Javasolt végrehajtás (harness pipeline)

Minden javítás spec-driven, fázisokkal: **Junior spec.md → Codi implementál → Eszter verify → Bence security/release**. A biztonsági blokk (1. prioritás) **nem mehet** Eszter+Bence PASS nélkül élesbe. Külön spec.md a közös motorra (5.), mert az a legnagyobb, leghasznosabb refaktor.
