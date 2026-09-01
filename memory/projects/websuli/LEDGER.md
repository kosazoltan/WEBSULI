---
id: project_websuli_20260720_001
type: project
domain: websuli
created: 2026-07-20
source: hermes-orchestrator-session
tags: [ledger, changelog, decisions]
project: websuli
---

# WEBSULI Ledger — döntés- és változásnapló

> Append-only. Minden elvégzett feladat után új, dátumozott bejegyzés.
> Formátum: mit / miért / érintett fájlok / verifikáció.

## 2026-07-20 — QA-kör + titok-higiénia (Hermes Orchestrator)

**UI/frontend javítások (working tree, nincs commit):**
- Érvénytelen Tailwind opacity osztályok (`/82 /72 /78 /12 /18 /8 /88 /96 /98`)
  → érvényes 5-ös lépcsőkre cserélve; a /games "Játszva tanulás" panel szövege
  olvashatatlan volt (örökölt sötét szín sötét háttéren, böngészőben mérve).
  Fájlok: `Games.tsx`, `GamePedagogyPanel.tsx`, `GameNextGoalBar.tsx`,
  `WordLadderHuEn.tsx`, `TsunamiEscapeEnglish.tsx`, `SpeedQuizMath.tsx`.
- N+1 kérésvihar a főoldalon: 167 egyedi `POST /likes/check` a batch mellett
  → `LikeButton` új `suppressCheck` prop + `UserFileList` `batchLikesLoading`
  kapu; queryKey in-place `sort()` mutáció javítva (`[...ids].sort()`).
- Szólétra menü: 22 fok × 14px túlcsordult a h-48 konténeren → 8px + overflow-hidden.
- 404 oldal: világos téma törte a sötét designt, nem volt visszaút → sötét téma
  + "Vissza a főoldalra" gomb (`not-found.tsx`).
- API console-spam prod-ban → `debugLog` (import.meta.env.DEV kapu, `queryClient.ts`).

**Környezet/titkok:**
- `npm install` pótolta a hiányzó `three`, `nodemailer`, `@types/three` csomagokat
  → tsc 0 hiba (előtte 8), eslint 0 error / 1163 warning.
- Git-trackelt `SECRETS_TEMPLATE.txt` + `GOOGLE_AUTH_SECRETS_TEMPLATE.txt`
  élő Google OAuth kulcsokat tartalmazott → placeholderre cserélve; eredeti
  értékek gitignore-olt archívumba: `source/.env.secrets-archive-20260720.txt`,
  .env backup: `source/.env.backup-20260720`.
- `.env` kiegészítve a kód által igényelt opcionális változókkal (kikommentezve):
  RESEND_*, VAPID pár, ERRORLOG_HMAC_SECRET, ADMIN_EMAILS, DEV_DATABASE_URL,
  CUSTOM_DOMAIN.

**Verifikáció:** dev szerver fut (:5000), `/api/csrf-token` 200 OK. Záró kapu a
javítások UTÁN (2026-07-20 este): `npx tsc --noEmit` → **0 hiba (exit 0)**;
`npx eslint client/src server` → **0 error / 1160 warning** (baseline 1163 volt).

## 2026-07-20 (este) — lint / merge / push / deploy

- Rebase origin/main-re (2 upstream commit: Node 20→22 CI-fix, security+quality
  #5); 2 konfliktus kézzel oldva (TsunamiEscapeEnglish.tsx: upstream a11y
  attribútumok + mi opacity-fixünk együtt; .gitignore: mindkét blokk megtartva).
- Rebase utáni kapuk: tsc 0 hiba, eslint 0 error.
- Push: main → origin/main (48685cd..8702e2b), 2 commit:
  4811a7c fix(ui+perf) QA-kör, 8702e2b chore(security) template-kulcsok ki.
- Deploy (auto, GitHub-ról): Vercel frontend — az élő bundle
  (index-DGTpmKi4.js) már tartalmazza a `suppressCheck` markert = új build ✅;
  Render API health 200 ✅. websuli.vip /health OK, /api/csrf-token 200.
- VPS megjegyzés: a 95.216.191.162 gépen NINCS /var/www/websuli — a régi
  VPS-deploy doksik elavultak (doc drift), az éles út: Vercel + Render.

## 2026-07-21 — Git history titok-tisztítás (filter-repo)

- Teljes bundle-backup: D:\repo\_backups\websuli-pre-rewrite-20260721.bundle.
- `git filter-repo --replace-text`: 4 érték (2× Google Client ID + 2× Secret)
  → `***REMOVED***` MINDEN commitban; lokális ellenőrzés minden refre: TISZTA.
- Force push main → origin (09be169...517510b). A régi historyt hordozó 4 remote
  branch (3× claude/*, fix/security-quality) törölve a GitHubról; a lokális
  másolataik filter-repo által átírva.
- Purge-lista + replacement fájl: D:\repo\_backups\ (600-as joggal, gitignore-on kívül).
- MARADÉK KOCKÁZAT: GitHub a törölt commitokat cache-eli (dangling objektumok,
  PR-diffek); teljes törléshez GitHub Support kérés kell — ezért a Client
  Secret ROTÁCIÓJA továbbra is kötelező.

## 2026-09-01 — lint / merge / push / deploy (agentic-qa-kit v1.2)

- Kapuk push előtt: `npx tsc --noEmit` → 0 hiba; `npx eslint client/src server`
  → 0 error / 1163 warning (CI baseline 1166); unit 9/9 pass (csrf-origin,
  static-audit-guard, error-report-hmac).
- Commit 3618160 (main): `.agentic-qa-kit.json` 1.0.0→1.2.0, `.claude/settings.json`
  enforce-repo-rules PreToolUse hook (Bash/PowerShell/Edit|Write),
  `scripts/qa/hooks/enforce-repo-rules.mjs`, `.harness/release-log.md`.
  NEM commitolt (szándékosan): `tmp/*.md` (2026-06-23 audit-jegyzetek).
- Push main → origin (d162bd4..3618160); audit-sentinel (.audit-ok) a valódi
  kapuk lefuttatása után írva. Vercel production deploy READY
  (dpl_AHGKLUp27f6waSq2wUJYwoB6pmUR); websuli.vip /health 200, /api/csrf-token 200.
- TALÁLT HIBA (nem javítva, külön feladat): a CI Playwright E2E job 2026-07-21 óta
  MINDEN main-futáson bukik — `playwright.config.ts` webServer blokk kikommentezve,
  a CI nem indít szervert → `net::ERR_CONNECTION_REFUSED localhost:5000`, 17/17 fail.
  Lint+Unit zöld. Kód-hiba a CI-ben, nem a tesztekben.
- NYITVA: PR #6 (`claude/codebase-review-cleanup-k5axvo`, DRAFT, 87 fájl,
  +2557/−7347, 2026-08 biztonsági audit + 139 unit teszt + CORS same-origin fix).
  Nem olvasztottam be — draft, emberi döntés kell.
- Lokális `fix/security-quality-2026-06-23` ág elavult (PR #5-ként beolvadt).

## 2026-09-01 (este) — PR #6 merge + deploy (user megismételt "LINT MERGE PUSH DEPLOY" = döntés)

- PR #6 (`claude/codebase-review-cleanup-k5axvo`, DRAFT, 3 commit: 5b55fe0, 158d24b,
  1e1a141) lokálisan beolvasztva a main-be: konfliktusmentes, merge-commit b747629.
- Kapu a merge-fán (npm ci után): tsc 0 hiba; eslint 0 error / 989 warning
  (1163-ról csökkent); unit 145/145 pass (14 tesztfájl, benne a PR 139 új tesztje);
  `npm run build` exit 0 (bundle index-CxhQcm29.js).
- Push main → origin (49eb074..b747629); GitHub a PR #6-ot MERGED-nek jelölte.
- Deploy: Vercel production dpl_9frybwUMbCd8bSvWkNy8fTNBmKML READY, websuli.vip
  alias rajta; élő bundle = index-CxhQcm29.js (azonos a lokális builddel).
  Backend (Render, X-Render-Origin-Server) füstteszt: /api/health, /api/auth/user,
  /api/tags, /api/config, /api/html-files, /api/games/catalog, /api/csrf-token → 200.
- Nyitott kockázat: CI Playwright E2E továbbra is strukturálisan bukik (nincs
  szerver a CI-ben) — külön feladat. A PR nagy (87 fájl), a merge-utáni
  visszaállítási pont: `git revert -m 1 b747629`.

## 2026-09-01 (éjjel) — Mély kódaudit + autonóm javítás (fix/deep-audit-2026-09-01)

- Módszer: 5 párhuzamos csak-olvasó elemző ügynök (backend routes/opus, backend
  storage+services/opus, kliens-alap, kliens-oldalak, játékok) → ~50 finding →
  refuter-kör (minden CRITICAL/HIGH forrásból újra-ellenőrizve) → spec
  (docs/specs/deep-audit-2026-09-01.md) → 2 javító ügynök (kliens) + saját szerver-munka.
- KRITIKUS javítások: (1) DB-backup és JSON-export üres `content`-tel készült
  (getAllHtmlFiles listanézet) és a restore ebből írta felül az összes tananyagot →
  teljes select + `server/lib/backup-guard.ts` kapu minden restore-úton;
  (2) `/api/login`,`/api/logout` Origin/CSRF-őr halott kód volt (setupAuth előbb
  regisztrált, mint a routes.ts app.use) → `server/lib/origin-guard.ts`, közvetlenül a
  route-on, új teszt a VALÓS sorrenddel; (3) BlockCraft render-loop pálya/kör után nem
  indult újra (+ scene guard) → canvas mindig a DOM-ban, runningRef/stepRef, phase-vezérelt
  loop; (4) AchievementToast önmagát törlő effect → sosem tűnt el; (5) srcDoc iframe
  `allow-same-origin`+`allow-scripts` AI-generált HTML-en (EnhancedMaterialCreator).
- HIGH: scheduledPublishing rossz tábla/oszlopnév (`"htmlFiles"`→`html_files`);
  games_catalog hiányzó `space-asteroid-quiz`/`brain-rot-steal` (0007 migráció; a pontok
  és AI-kvízek FK-hibával vesztek el); deleteUser FK-nullázás + tranzakció; improveAsync:
  stream `error` chunk → throw, stale `processing` 15 perc után feloldva, abort-timer
  szivárgás, `replace(…, () => fixedJs)`, status handler try/catch; kvízgenerálás üres
  eredménynél nem deaktivál; body-parser: nagy limit csak session-sütivel; SpaceAsteroid
  pause alatt fogyó óra; PdfUpload néma FileReader-hiba; AdminFileDashboard mentetlen
  sorrend elveszett; queryClient 403 body kétszer olvasva; ChatInterface autoscroll;
  ExtraEmailsManager promote gomb; pdf-view classroom 0/9-12 crash.
- MEDIUM/LOW: compression SSE-kizárás, payload-guard `fileData`, Google-callback
  session.regenerate, like 404 + onConflictDoNothing, readStream error, bulk-delete valós
  darabszám, popular COALESCE, upsert target email, migrate.ts TLS, comments limit,
  sitemap getBaseUrl, push unsubscribe validáció, quiz-bank catch csak hiányzó táblára,
  message típus, content[0], err.message csak dev-ben, error-mailer boolean, napi
  összesítő dátumszűrt lekérdezés, reorder chunkolt, database/info Postgres + maszkolt
  URL, AdminDocumentation admin-guard, admin validTabs, MaterialImprover confirm,
  DatabaseManager, AuthStatus kezdőbetű, ClassroomGateModal a11y, WordLadder lock +
  timeouts, SpeedQuiz/BrainRot perfect-számítás, BrainRot duplikált opciók,
  CosmicBackground 0-méretű canvas crash (böngészőben találva).
- Kapuk (valós kimenet): tsc 0; eslint 0 error / 994 warning (CI baseline 1166; +5 új
  console.error hibaágakon); unit 161/161 (3 új tesztfájl: backup-guard,
  origin-guard-order, audit-2026-09-static); `npm run build` exit 0; böngészőben:
  BlockCraft indul + "Kör vége" → "Új próbálkozás" után újra renderel, jelvény-toast
  eltűnik, főoldal 167 tananyaggal betölt.
- NEM javítva (BACKLOG): ADMIN_EMAILS a publikus /dev/:id HTML-ben (új API kell);
  `/dev/:id` view-írás rate-limit (iskolai NAT-kockázat); Preview.tsx allow-same-origin
  (PR #2 szándékos, mikrofon); migrate.ts 0000 blokk-kommentes séma futtatása üres DB-n.
- Branch: fix/deep-audit-2026-09-01 — push/merge külön utasításra.

## 2026-09-02 — audit-merge deploy + CI-javítás

- Merge 47ff967 (fix/deep-audit-2026-09-01) → push → Vercel READY (index-CXtEhaSL.js élőben),
  Render újraindult (uptime 29s), élő füstteszt: like nem létező anyagra 404 ✅, login Origin
  nélkül / idegen Referer 403 ✅, katalógusban space-asteroid-quiz ✅.
- CI Lint bukott: a PR #6 óta a baseline 989 warning (nem 1166), az audit 5 új console.*
  hívása 994-re vitte → a hívások a server/lib/logger-re cserélve (kód-javítás, küszöb
  változatlan) → 989/989.
- Idegen Origin-es login 500-at adott a CORS-delegate hibájából → a globális hibakezelő a
  "CORS policy blocked" hibát 403 "Origin not allowed"-ként adja vissza.
- 2026-09-02 folyt.: az idegen-Origin login a CORS-delegate hibájából 500-at adott → az
  Error status=403 (index.ts) + FORBIDDEN ág az egységes hibakezelőben (routes.ts);
  élesben ellenőrizve: 403. CI 7a1f086: Lint ✅ Unit ✅ (E2E: régi strukturális hiba).

## 2026-09-02 — az audit 4 nyitott tételének lezárása (spec: docs/specs/backlog-4-2026-09-02.md)

- T1: `POST /api/material-result` (Origin-őr, 10/15perc limiter, validáció a
  server/lib/material-result.ts-ben, Resend `sendAdminNotification` minden ADMIN_EMAILS
  címre); az injektált `sendResultEmail()` fetch-csel hívja, a HTML-ben nincs e-mail cím.
- T2: server/lib/view-dedup.ts — ip|materialId 1 órás dedup, max 50k kulcs; /dev/:id csak
  friss kulcsra ír material_views sort.
- T3: server/lib/migration-sql.ts — a blokk-kommentes 0000 séma-exportot a runner
  kicsomagolja és futtatja (meglévő DB-n "already exists" tolerálva).
- T4: getMaterialOrigin() (MATERIAL_ORIGIN, prod-ban RENDER_EXTERNAL_URL) → /api/config
  materialOrigin → Preview.tsx iframe src; /dev helmet: frameguard ki, frame-ancestors
  'self' + CUSTOM_DOMAIN + allowlist.
- Kapuk: tsc 0; eslint 0 error / 989 warn; unit 172/172 (+11 teszt); build OK. Helyi
  füstteszt: /dev HTML 0 e-mail; endpoint 403/400/404/503; 3 GET → 1 tracking sor.
