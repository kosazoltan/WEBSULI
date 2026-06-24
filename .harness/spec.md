# WEBSULI — Javítási terv (spec.md)

**Verzió:** 2026-06-23 · **Driver:** Junior · **Forrás:** MELY-ELEMZES-2026-06-23.md
**Single source of truth.** Minden javítás innen indul. A kód változik, nem a spec — ha a spec hibás, ide kell visszajelezni.

## Végrehajtási sorrend (kockázat szerint)
A KRITIKUS biztonsági blokk megy először, mert ezek élesben kihasználhatók. Sorrend: BLOKK A (CRIT sec) → BLOKK B (HIGH auth) → BLOKK C (AI/tx) → BLOKK D (játékok) → BLOKK E (DX/CI) → BLOKK F (közös motor, külön spec).

---

## BLOKK A — KRITIKUS biztonság (azonnal)

### A1. CSRF visszakapcsolása mutáló AI/admin végpontokon
**Fájl:** `server/routes.ts:732-760`, `server/index.ts:75`, `server/auth.ts:35-61`
**Probléma:** CSRF kikapcsolva `/api/ai/*`, `/api/admin/improve-material/*`, `/api/admin/improved-files/*` mutáló útvonalakon.
**Technikai megoldás:**
- Origin/Referer allowlist-ellenőrző middleware minden state-changing (POST/PUT/PATCH/DELETE) admin+ai route-ra.
- Allowlist env-ből: `ALLOWED_ORIGINS` (vesszős lista). Ha `Origin` és `Referer` is hiányzik VAGY nincs az allowlistán → 403.
- GET/HEAD/OPTIONS mentesül.
**Done When:** minden mutáló `/api/ai/*` és `/api/admin/*` route-on aktív az Origin-check; idegen Origin → 403; teszt bizonyítja.

### A2. Git-trackelt valós titkok eltávolítása + ignore
**Fájl:** `source/KEY_TO_UPLOAD.txt` (SSH key), `vault/infrastructure/github-secrets-canonical.md` (live-key)
**Technikai megoldás:**
- `git rm --cached` mindkettőre (a working-copy marad, csak a tracking szűnik).
- `.gitignore` bővítés: `source/KEY_TO_UPLOAD.txt`, `vault/**/*canonical*`, `vault/**/*secret*`, `*.zip`, `Gemini.jpg`.
- History-tisztítás (git-filter-repo/BFG) — **csak figyelmeztetésként dokumentálva**, mert destruktív és push-jogot igényel (Bence/explicit user-jóváhagyás).
- Rotálási emlékeztető a jelentésbe (kulcsokat a kibocsátónál cserélni).
**Done When:** `git ls-files` nem listázza a 2 fájlt; `.gitignore` tartalmazza a mintákat; rotálási TODO dokumentálva. (History-rewrite NEM része az automata végrehajtásnak.)

### A3. `/api/static-audit` lezárása
**Fájl:** `server/index.ts:416-417`, `server/routes/static-audit.ts:10-18`, `server/lib/static-audit.ts:20-104`
**Probléma:** publikus végpont `npx tsc` + `git grep`-et futtat → RCE-közeli + DoS + infoleak.
**Technikai megoldás:**
- Admin-guard (`requireAdmin`) elé tenni, ÉS `if (process.env.NODE_ENV === 'production') return 404` kapcsoló.
**Done When:** prod-ban 404; nem-admin → 401/403; teszt bizonyítja.

### A4. `/api/error-report` keményítés
**Fájl:** `server/index.ts:415-417`, `server/routes/error-report.ts:29-57`, `server/lib/error-mailer.ts:18-21,195-206`
**Probléma:** publikus, auth/rate-limit nélkül DB-t ír + mailt triggerel; fallback HMAC secret + fix Gmail a kódban.
**Technikai megoldás:**
- Rate-limit middleware (pl. IP-alapú, max 5/perc) a route-ra.
- HMAC-signature kötelező (`X-Signature` header, `ERROR_REPORT_HMAC_SECRET` env); ha nincs env → route letiltva (nem fallback secret).
- Fix Gmail címek → env (`ERROR_REPORT_TO`).
**Done When:** rate-limit aktív; HMAC nélkül/rossz signature → 401; hardcoded secret+mail-cím eltűnt; teszt bizonyítja.

---

## BLOKK B — MAGAS: auth / adatintegritás

### B1. Ban-enforcement
**Fájl:** `server/auth.ts:66-83,148-155,203-221`, `shared/schema.ts:35-36`, `server/storage.ts:375-384`
**Megoldás:** `isBanned` ellenőrzés (a) Local login után, (b) Google OAuth callback után, (c) `deserializeUser`-ben, (d) auth-guard middleware-ben → bannolt user 403 + session destroy.
**Done When:** bannolt user nem tud belépni ÉS aktív session-je elutasítódik; teszt mindkét útra.

### B2. Session-fixation javítás
**Fájl:** `server/auth.ts:183-188`
**Megoldás:** sikeres auth előtt `req.session.regenerate()` (Local + OAuth), majd `req.login()`.
**Done When:** login után a session-ID megváltozik (teszt: pre/post cookie diff).

### B3. DB SSL validáció
**Fájl:** `server/db.ts:25-33`
**Megoldás:** `rejectUnauthorized:false` → `true`; CA-cert env-ből (`DATABASE_CA_CERT`) ha kell. Dev-fallback csak `NODE_ENV!=='production'` esetén, warninggal.
**Done When:** prod-ban `rejectUnauthorized:true`; típus+lint tiszta.

### B4. `errorLogs` migráció
**Fájl:** `shared/schema.ts:529-560`, `source/migrations/`
**Megoldás:** `drizzle-kit generate` → új SQL migráció a hiányzó táblára. Kézzel ellenőrzött `CREATE TABLE IF NOT EXISTS`.
**Done When:** van migráció ami létrehozza az error_logs táblát; `tsc` tiszta.

---

## BLOKK C — KÖZEPES: AI-költség / robusztusság / tranzakció

### C1. AI-payload limit + Zod-validáció
**Fájl:** `server/routes.ts:1791-2249`, `server/improveAsync.ts:186-203,533-576`
**Megoldás:** közös `aiPayloadLimits` (max files, max bytes/file, max conversationHistory hossz, max customPrompt hossz) middleware; `analyze-files`/`analyze-file` válaszra Zod-schema (`server/ai/aiSchemas.ts` kiterjesztés); upstream hiba → generikus klienshiba (nincs raw leak).
**Done When:** túllépő payload → 413/400; nem-séma AI-válasz → szerveroldali hiba, nem nyers kliensre; tesztek.

### C2. AI provider-wrapper timeout/retry
**Fájl:** `server/routes.ts:1110-1183,1188-1271`
**Megoldás:** közös `callAIProvider()` wrapper: AbortController timeout (env `AI_TIMEOUT_MS`, default 30s), 1 retry exponenciális backoffal, generikus klienshiba.
**Done When:** timeout aktív; kliens nem kap `err.message` raw-t; teszt.

### C3. Tranzakciók
**Fájl:** `server/gameQuizGeneratorService.ts:146-200`, `server/gameScoreService.ts:109-156`, `server/routes.ts:4589-4592`
**Megoldás:** `db.transaction()` a quiz deactivate+insert köré; score-mentés `onConflictDoUpdate` (atomikus upsert); bulk-move egyetlen `UPDATE ... WHERE id IN (...)`.
**Done When:** mindhárom atomikus; teszt a részleges-hiba forgatókönyvre.

---

## BLOKK D — Játékok (3D + statisztika + a11y)

### D1. BlockCraft Three.js scene mount-szintű effect
**Fájl:** `BlockCraftQuiz.tsx:1456` — renderer-effect `phase`-ről mount-szintre; állapot refekben.
**Done When:** phase-váltáskor nincs scene-újraépítés (teszt/manuális render-count).

### D2. Streak/combo helyes statisztika
**Fájl:** `SpaceAsteroidQuiz.tsx:1961` (+1264,1617), `BlockCraftQuiz.tsx:1930` (+1357-1358)
**Megoldás:** külön `bestComboRef`/`bestStreak` futás-szinten; achievement+leaderboard azt menti.
**Done When:** a mentett streak = futásbeli max; teszt.

### D3. BlockCraft gyémánt-stat
**Fájl:** `BlockCraftQuiz.tsx:1932` (+1823,1836) — külön `diamondsMinedRef`, csak DIAMOND-nál nő.
**Done When:** diamondsMined csak valódi gyémánttól nő; teszt.

### D4. Input-cleanup (blur reset + timeout registry)
**Fájl:** `BlockCraftQuiz.tsx:1438`, `SpaceAsteroidQuiz.tsx:1918` (blur); `SpeedQuizMath.tsx:359,369,393`, `BrainRotSteal.tsx:343,376`, `TsunamiEscapeEnglish.tsx:890,944,948` (timeout)
**Megoldás:** `window.blur` mozgásflag-reset; timeout-ID-k refbe + unmount cleanup.
**Done When:** ablakváltáskor nincs beragadt billentyű; unmount után nincs késői state-update warning.

### D5. RAF re-render fojtás (BrainRot)
**Fájl:** `BrainRotSteal.tsx:466-525` — animációs adat refbe/canvasba vagy batch-elt state.
**Done When:** frame-enkénti teljes re-render megszűnik.

### D6. a11y: quiz-overlay dialog + keyboard
**Fájl:** `TsunamiEscapeEnglish.tsx:1601`, `SpaceAsteroidQuiz.tsx:2280`, `BlockCraftQuiz.tsx:2309` (dialog); `BlockCraftQuiz.tsx:1432` (keyboard look); `Games.tsx:369` (button-in-Link)
**Megoldás:** `role="dialog"`+`aria-modal`+fókuszkezelés+Escape; billentyűs look-vezérlés; `Button asChild`.
**Done When:** axe/manuális a11y a megjelölt pontokon zöld; keyboard-only játszhatóság BlockCraftnál.

---

## BLOKK E — DX / repo-higiénia / CI

### E1. Repo-szemét eltávolítás
`Gemini.jpg` (11MB), `source/deploy_package*.zip` (4db) → `git rm --cached` + `.gitignore`.
**Done When:** nincs trackelve; `.gitignore` lefedi.

### E2. CI merge-gate
`.github/workflows/ci.yml`: `npm ci` → `tsc` → `eslint --max-warnings <N>` → `playwright`. Branch-protection ajánlás dokumentálva.
**Done When:** PR-en lefut tsc+eslint+test; piros teszt blokkol.

### E3. Logger absztrakció + lint-szigorítás (fokozatos)
892 `no-console` → `logger` wrapper; eslint prod `no-console: error`. **Fokozatos**, nem egy lépésben (külön sub-task, nem blokkolja a biztonságit).
**Done When:** logger bevezetve; útiterv a 892 csökkentésére.

### E4. Dead vite chunk + docs-konszolidáció
`vite.config.ts` `ai-vendor` chunk törlése; 36 root .md → `docs/` konszolidáció (dokumentált javaslat, nem destruktív tömeges törlés).
**Done When:** ai-vendor chunk törölve, build OK; docs-terv leírva.

---

## BLOKK F — Közös játékmotor (külön spec, legnagyobb refaktor)
`useQuizGameEngine` (stat: XP/streak/bestStreak/submit/achievement) + `<QuizModal>` (prompt/answer-lock/reveal/timeout/dialog-a11y) + `useGameLoop` (RAF/interval/blur/timeout-registry). 3D adapterként ül rá.
**Megjegyzés:** ez NEM az azonnali blokk része — saját spec.md kell hozzá a biztonsági javítások után.

---

## Pipeline minden blokkra
Junior spec (kész) → Codi implementál (`src/` + `tests/`) → Codi self-verify (tsc+lint+test) → Eszter verify (független) → Bence security/release. A biztonsági blokk NEM élesedik Eszter+Bence PASS nélkül.

## Globális Done When (egész terv)
- `tsc = 0 hiba` végig.
- eslint nem nő (warning-szám ≤ kiindulás).
- minden blokk saját Done When-je teljesül, teszttel bizonyítva.
- nincs új git-trackelt titok.
