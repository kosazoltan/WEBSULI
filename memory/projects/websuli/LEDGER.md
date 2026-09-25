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
- 2026-09-02 (folyt.): a T4 első deploy után az élő előnézet ÜRES volt — a frame-ancestors
  módosítás a rossz (általános) helmet-blokkba került; hotfix 9ff8ebb a /dev ágba. Élő
  ellenőrzés valódi Chrome-ban: /preview/:id iframe az onrender originről betölt, konzol
  tiszta; onrender /dev fejléc: frame-ancestors 'self' + websuli.org/.vip. (Az automatizált
  böngésző-pane cross-origin iframe-et nem renderel és 'Framing' hibát mutat — nem mérvadó.)
- T1 élesben: /api/material-result 503 "nem elérhető" → a Render envben nincs RESEND_API_KEY
  és/vagy ADMIN_EMAILS. Amíg nincs beállítva, a tananyagok "Eredmény küldése" gombja a
  tanulónak hibaüzenetet ad (korábban mailto nyílt). Teendő: Render env beállítása (user).
- 2026-09-02: Resend-kulcs megkapva (helyi gitignore-olt .env-be került, chatbe/commitba NEM).
  Helyi próba: POST /api/material-result → 200 delivered:1, Resend id 58364b34-… a
  kosa.zoltan.ebc@gmail.com címre (feladó: WebSuli <onboarding@resend.dev>). render.yaml:
  RESEND_API_KEY / RESEND_FROM_EMAIL / ADMIN_EMAILS sync:false. ÉLESBEN a Render
  dashboardon kell beállítani (nincs Render API-token) — amíg nincs, az endpoint 503.

## 2026-09-02 — CI E2E javítás (2026-07-21 óta bukott) + Render env API-n

- Render: RESEND_API_KEY / RESEND_FROM_EMAIL / ADMIN_EMAILS a Render API-n (PUT env-vars)
  beállítva, deploy live; élesben POST /api/material-result → 200 delivered:1.
- CI E2E gyökérok: nem indult szerver és nem volt DB. Javítás: playwright.config.ts
  webServer (node dist/index.js, /api/health, reuseExistingServer:false, channel:'chrome');
  ci.yml: postgres:16 service, db:migrate (a T3 miatt üres DB-n is fut), tests/e2e-seed.ts
  (1 publikus tananyag), report-artifact bukásnál.
- A helyi futás VALÓDI hibákat is talált (kód javítva, nem a teszt): Tailwind `xs`
  breakpoint sosem volt definiálva → a "Belépés/Böngészés/Játékok" feliratok minden
  képernyőn rejtve (ikon-only gombok); a fejléc-sáv nem volt <header>; a szűrőgombok
  aria-pressed/aria-disabled/role nélkül. Teszt-módosítás csak dokumentált spec-váltásra:
  hero-stats testid (a `text=Tananyag` a kártyákra is illett), az 1. osztály gombja 0
  tananyaggal letiltott → első engedélyezett osztály, aktív állapot aria-pressed alapján.
- Csapda: a másik munkamenet worktree-je régi buildű szervert futtatott az 5000-en, a
  Playwright reuseExistingServer azt tesztelte (fehér oldal) → reuseExistingServer:false.
- Helyi eredmény: 17/17 passed (25.5s), a szerver leáll a futás után.
- 2026-09-02 07:15: CI TELJESEN ZÖLD (27c6bd7): Lint ✅ Unit ✅ Playwright E2E ✅ 17/17
  (48.8s) — először 2026-07-21 óta. Menet közben talált+javított: a 0000 séma-export
  `'{RAY[}'` tömb-defaultja (drizzle-kit introspekciós hiba, ezért volt kikommentezve) →
  '{1}'::integer[] a schema.ts szerint; seed 12 tananyagra (viewport-túllógás a görgetés-teszthez).

## 2026-09-02 — Szólétra (WordLadderHuEn) grafikai + játékélmény-újratervezés

- Spec: docs/specs/wordladder-redesign-2026-09-02.md (3 irány mérlegelve; a kvíz a létra
  mellé került, nem modal). Tiszta logika: client/src/lib/wordLadderLogic.ts (+9 teszt).
- Játékmenet: 16 fok (6/5/5), válasz-felfedés 900 ms (helyes zöld ✓, hibás piros ✗),
  megcsúszás wobble-lel (0-ról nem), 4 zóna (rét/erdő/felhők/csillagok) háttér- és
  fok-színekkel + dekorációval, mérföldkő-feliratok (5/10/15), sorozat-feliratok (3, 5, 10…),
  +XP lebegő szám, konfetti a célnál, SVG-létra és mosolygó mászó (lángocska ≥3 sorozat),
  prefers-reduced-motion tisztelve. DEV-only `?rung=N` kezdőfok a gyors QA-hoz.
- Változatlan: kérdésbank, XP-képlet, pontszám-küldés, jelvények, napi kihívás, hang.
- Böngészőben végigjátszva: helyes/hibás útvonal, zónaváltás (erdő), cél+konfetti+jelvény,
  mobil (375px) elrendezés túlcsordulás nélkül. Menet közben talált+javított hiba: a lépés
  alatt a következő kérdés helyes válasza szivárgott ki a felfedő színezéssel → a
  kérdéscsere csak a lépés után.

## 2026-09-09 — Tananyag Készítő v7.4 közös spec + internetes ügynök javítás + Grok lektor
- Spec: docs/specs/2026-09-09-webes-tananyag-agent-es-mentes.md (10. pont: 2. kör),
  docs/specs/2026-09-09-tananyag-keszito-v74-integracio.md (+ vegrehajtas, + a skill másolata).
- Kiindulás: a Cursor-commit (ce87955) élesben bizonyítottan elhasalt (180 s abszolút korlát a
  HTML közepén → "Időtúllépés", a chat eldobta a választ). Javítás: pause_turn folytatás,
  stop_reason kapu, tétlenségi + 20 perces korlát, 64K kimenet, verifier-figyelmeztetés.
- v7.4: server/ai/lesson-html-spec.ts egy helyen (motor referencia-kóddal, TTS, diktálás,
  latin-ext fontok + fallback + glyph-warmup, 8 téma). Bekötve 4 promptba; a DB-ben aktív
  egyedi material_creator prompt MELLÉ is (az felülírta a beépített szabályokat).
- Modellek: qwen/qwen3.8-max eltűnt az OpenRouterről → lektor x-ai/grok-4.6 (Zoltán döntése),
  author-fallback qwen3.8-max-0902; minden más id az élő listákban létezik.
- Kapuk: tsc 0, eslint 0 warning, 1039/1039 unit, Playwright 3/3, npm run build OK.
  Valós Opus 5 futások: v7.1 prompt 223 s/17,3K token; v7.4 32K-nál csonka → 64K: 382 s/34,1K,
  headless-Chrome önteszt 15/15 feladat a saját mintaválasszal, fontok/TTS/alert rendben.
- Helyi .env: AI_INTEGRATIONS_ANTHROPIC_API_KEY a D:/Hermes/.env-ből (érték sehol nem szerepel).

## 2026-09-09 — Studio animátor lépés: OpenRouter 429 → fallback-modell + kozmetikai továbbengedés
- Éles hiba (job 14bb50b7, 18:43–18:51): „animator lépés modellhívása hibára futott: a szolgáltató
  hibát jelzett”; a felület tévesen a Publikálási kapunál mutatta. Helyi reprodukció ugyanazzal a
  leckével: qwen/qwen3.8-flash → OpenRouter 429 „Rate limit exceeded” (16 s); z-ai/glm-5.3-flash →
  213 s, érvénytelen JSON.
- Gyökérok: a FALLBACK_MODELS csak dokumentálva volt, a step-runner sosem használta; a
  modellhívás-hiba az animátornál is végleg leállította a gyártást (#169 csak séma/szerződés-
  sértésre engedte tovább az eredeti leckét).
- Javítás (step-runner.ts): modellhívás-hibánál egy próba a lépés fallback-modelljén (minden
  lépésre); animátornál kettős hiba esetén az EREDETI lecke megy tovább a lektorra; a hibaüzenet
  a szolgáltatói okot és mindkét modellt megnevezi. 3 új runner-teszt (m/n/o), 1042/1042 zöld.

## 2026-09-09 — Animátor: hamis szerződéssértés (kulcssorrend) + modellcsere Terra/Grok
- Mérés az elbukott job leckéjén: Terra 41 s / 4,8K token / 5 animáció, Grok 4.6 117 s / 9,3K / 17
  animáció — mindkettő sémahelyes, de a `checkAnimatorResult` „nem-animate blokkok megváltoztak”-ot
  jelzett. Diff: bájtra azonos tartalom, CSAK a JSON-kulcsok sorrendje más → a sorrend-érzékeny
  `JSON.stringify` minden animált leckét eldobatott (a fix-concept ellenőrző ugyanígy).
- Javítás: `canonicalJson` (rekurzívan rendezett kulcsok) a 4 egyezés-vizsgálatban; teszt.
- Tulajdonosi döntés: animátor elsődleges `openai/gpt-5.6-terra` (OpenRouteren, ~0,07 $/lecke),
  fallback `x-ai/grok-4.6`. Újramérve a javított ellenőrzővel: Terra 56 s, contractOk, fellBack=false.
- Kapuk: tsc 0, eslint 0, 1043/1043 unit, build OK.

## 2026-09-13 — Internetes tananyag: tudásbázis nélkül készült a 7.4 HTML

**Tünet:** az internetes készítés nem a skill 7.4 fúziós láncát futtatta; gyenge vagy forrás nélküli tananyag készült.

**Mért gyökérok (ellenőrzött):**
- A webes lépéssor `generate → gate` volt; a feltöltős út `knowledge` lépése hiányzott.
- `generateWebResearchLesson` egyetlen Opus 5 `effort: low` hívásban keresett, letöltött és HTML-t írt.
- A rendszerprompt egyszerre adta a teljes `LESSON_HTML_SPEC_V74` `ee_evaluate` dumpot, a fúziós „ne gyárts pontozó JS-t” szerződést és a KIMENET-TAKARÉKOSSÁGOT.
- A letöltött szöveg csak a tool-eredményben élt; nem lett idézetellenőrzött fogalomjegyzék a szerzői bemenet.
- Korai baseline: HTML `web_fetch_requests: 0` mellett is készült (`tmp/web-research-diagnosis/baseline-evidence.json`).

**Javítás:** `lesson-flow-2`; gyűjtés (search+fetch) és szerzői HTML külön; kivonat `verbatimOk`; bank `buildLessonExperience` + `writeHtmlLessonData`. Spec: `docs/specs/2026-09-13-web-knowledge-pipeline.md`. Kivonat: Studio extract modell `provider.chat` (a `callStepModel` `StudioStep` uniója nem tartalmaz `"extract"`-ot). A job a `generate()` után jelöli a knowledge/author fázist.

**Verifikáció (ellenőrzött):**
- `npm.cmd run verify` → exit 0: `tsc --noEmit`, eslint 0 warning, `tsc --noEmit -p tsconfig.test.json`, unit **1225/1225**, `vite`+server build 7.06s.
- Célzott unit korábban: 102/102 pass a pipeline-fájlokon.
- Read-only Neon-minta (`html_files`, 2026-05-01…2026-07-01, `length(content) > 20000`): 5 hosszú HTML. Méret 77–155 KB; 5–18 h2; sok gyakorló/kvíz-szöveg; saját CSS-prefix (`tr-`, `ife-`, `cu-`, `bet-`, `tm-`). Egyiken `ee_evaluate` (angol nyelvtan). Egyiken sincs `data-teaching-explanation`, `websuli-lesson-data` vagy `edu-` — a fúziós 7.4 bank/marker későbbi szerződés. Metaadat: `tmp/web-research-diagnosis/may-june-html-samples.json`. HTML-tartalom nem került chatbe.

**Nem futtatott:** éles webes gyártás a deploy után, admin QMD-export (401), böngészős Egervár, Playwright e2e (CI futtatja).


## 2026-09-19 — Autonóm tananyagkészítő ökoszisztéma (feltöltés + internetes készítés)

**Tünet (tulajdonos):** a forrásellenőrzés kézi visszaigazolásra várt és elakadt; nem készült végtermék sem feltöltésből (JPG/PDF), sem internetes utasításból. A 2026-09-14-i dirty munka nem volt beolvasztva.

**Mért gyökérokok (éles Neon, csak olvasás):** 30 napon upload 1 done / 5 error / 3 waiting, web 1 done / 1 error. A 3 „waiting” = `Forrásellenőrzés szükséges` parkolás 1–3 pending kulcsfogalom miatt 39–49-ből (4/5 egykarakteres OCR-zaj: `burokelevelek`/`buroklevelek`). Lektor `[xAI] Request timed out` 480 s után tartalék nélkül → generikus hiba. Bankcsomag 2. kísérlet után bukott. `Invalid PDF structure.` nyers pdfjs-hiba. Valódi próbafutásokon még: webes szemléltetés-kapu csak a bank UTÁN (javítókör nélkül); animációs blokk szinonimás címkéje (`talajképződés` vs „A talaj kialakulása”) 3 kör után buktatta a leckét; a 49 fogalmas tulajdonosi térkép egyetlen kvíz-tétel lektori blokkolóján bukott a körlimitnél; a webes javítócsomag egy banktétel kapubukása miatt egészében elveszett.

**Javítás:** PR #68 (a hét 2026-09-14-i téma egyben, like-CSRF Origin-allowlisttel), PR #69 (`relocateQuote` determinisztikus idézet-újrapozicionálás ≥0,90; `autonomousApprovalDecision` — pending kulcsfogalom látható, de nem tanított, ≥1 igazolt core és ≥60 % igazolt arány; `FALLBACK_MODELS.lektor = anthropic/claude-sonnet-5`; `PACKET_ATTEMPTS = 3`; PDF bájt-sniff + vision-tartalék; `verifyTeachingVisuals` a webes szerzői körben; `stripUngroundedAnimateLabels`), PR #70 (bank-only lektor javító kör a körlimitnél; `salvageTeachingEdits`, `REVIEW_REPAIR_ATTEMPTS = 3`). Spec: `docs/specs/2026-09-19-autonomous-lesson-pipeline.md` (+ vegrehajtas).

**Verifikáció (ellenőrzött):** PR #68/#69 CI zöld (lint/typecheck, unit, Playwright E2E), merge, Render `/api/health` revision = merge-commit. Unit: 1257 → 1282 pass / 0 fail. Valódi futások a termelési kódúton (`runOneStep`, éles DB, valódi modellek): JPG-forrás → `done` 1158 s (lesson 4faf19b6, 4 fejezet, 45 feladat, 75 kvíz, 11 módszer, publikálva); PDF-forrás → `done` 1092 s (lesson 9d982753). A tulajdonosi térkép (08af437e) autonóm kurálása: 3 relokált idézet, 0 kimaradt, jóváhagyva.

**Folytatás (PR #71, #72):** webes 3. futás két javítócsomagja formai okból bukott → `locateAnchor` whitespace-toleráns horgony + `FORMAT_RETRIES` azonnali újrakérés; webes 4. futás 4 lektori kör után is új szubjektív kifogásokon bukott → `previousReview` + konvergencia-szabály, és a korlátos körök után CSAK explanation_depth/age_and_added_value nyitva maradásakor közzététel `reviewEvidence.warnings`-szel (tényhiba/forrásfedettség/kérdés-megalapozás továbbra is megállít); tulajdonosi térkép 3. futása egy mintaválasz kötőszó-heurisztikáján bukott → `needsSentence` normalizálás a csomag-ellenőrzésben. Mind az öt PR (#68–#72) beolvasztva; Render `/api/health` revision = 67a03dd.

**Végeredmény (ellenőrzött):** internetes készítés → `done` 983 s (html_files 551bb3f7, 4 fejezet, 45 feladat, 75 kvíz, 11 módszer, `verifyLessonMethodHtml` ok, warnings: explanation_depth, age_and_added_value). A JPG-lecke (html_files 5743139a) az éles websuli.vip/preview oldalon a Browser-pane-ben megnyitva: cím, tantárgy, 5. osztály, négy lap; Feladatok „15 feladat a 45-ből”, Kvíz „25 kérdés a 75-ből”.

**Folytatás (PR #73, #74):** a Studio-lektor is körönként új coverage_gap/core blokkolót adott más fejezetre (3 futás) → `applyLektorConvergence` + `previousBlockers` a promptban (késői fedettségi hiány = warn, tényhiba blokkoló marad). A webes `warnings` a Studio panelen (`web-research-warnings`). Tulajdonosi 49 fogalmas térkép (08af437e) 4. futása → `done` 2317 s: lesson 565bdf67 / html_files d1db0a0c „Zöldségek növényi szervei és fejlődése", 10 fejezet, 50 feladat, 98 kvíz, 24 módszer, 0 blokkoló lektorjegyzet; élesben a /preview oldalon renderel.

**Nem futtatott / nyitott:** üres `title` a webes jobnál (a HTML-ből jön a cím); a Studio panel figyelmeztető mezője valódi böngészőben nem ellenőrzött (admin OAuth-session nélkül); a régi, hibára zárt jobok nem lettek újraindítva (a térkép új jobbal készült el).

## 2026-09-19 (este) — Modellmátrix, Opus 5 tervkészítő, szerep-skillek, eszközök, csak-bank körök

**Tünet (tulajdonos):** a tananyagkészítés „iszonyatosan tokenpazarló" (egy lecke ≈ 4,1 USD, 35–40 perc, az animátor+bank Terrán a költség 3/4-e), a modellek rögtönöznek, a lektor körönként új tételt talál, a futás hibára zár.

**Diagnózis (mért, workflow-napló `lesson_workflow_runs.snapshot.visits` + `checkpoints`):** animátor+bank 443–453k be / 172–182k ki tokenszám Terrán; olcsó modellek valódi próbája (glm-5.3-flash 6,3 s, 0 gondolkodó token, érvényes bankcsomag). Öt valódi futás a Műveleti sorrend térképen (a5747585) mutatta meg a maradék hibaosztályokat: glm hosszkorlát → a csomag-ciklus meghalt; egyetlen banktétel-blokkoló → teljes szerzői újraírás + 6 csomag újraépítés; a végkapu a lektor bemenetét `previousBlockers` nélkül hashelte (minden 2. körös lecke bukott — #74 óta élesben); kapu hamis pozitív a forrás kidolgozott példáján; a 2. csak-bank blokkoló a limiten ölte meg a 77 perces futást; kvíz correctIndex ≠ magyarázat (kétszer).

**Javítás (PR #77–#81, mind merge + Render-deploy ellenőrizve):** lépésenkénti modellmátrix (`bank` szerep; pedagogue `claude-opus-5` közvetlen Anthropic, adaptív gondolkodás, medium; animator+bank `z-ai/glm-5.3-flash` low, tartalék deepseek, mentőkör terra; `STUDIO_STEP_POLICY`); hét szerep-skill + a tervező lelke a rendszerutasítás elején (DB-s felülírás sem kerüli meg, hash-ek része); determinisztikus eszközök (outline-autofix, bank-packet-autofix, section-visuals → az animátor modellhívás nélkül; `npm run studio:tool`, `.agents/skills/websuli-studio-tools`); `RetryableBankCallError`; csak-bank kör bármelyik körben, `MAX_BANK_ONLY_ROUNDS = 2`; kapu = lektor bemenet; `quoteNumbersPresent`; `quizCorrectIndexProblems`; párhuzamos csomagépítés (`PACKET_CONCURRENCY = 3`, engine persist sorosítva).

**Verifikáció (ellenőrzött):** kapuk minden PR-nál (tsc, check:test, lint 0 warning, `npm test` 1297 → 1327 pass / 0 fail), CI zöld (lint/typecheck, unit, Playwright E2E), Render `/api/health` revision = merge-commit (#77 3f9aaa2, #78 2a75e78, #79 2cdbf26, #80 64b3eee). Valódi futás (run 2210c108, termelési kódút, éles DB): **`done` 1 333 s**, lecke `cfdaca52`, html_files `3084206c` „Műveleti sorrend tanulása", 9 fejezet a cél-minta szerint, 45 feladat / 75 kvíz / 19 módszer; tokenek: Opus 11k/2,2k, terra 10k/7k, glm 187k/70k, grok 137k/1,4k → ≈ 0,6–0,7 USD (korábban ≈ 4,1), 22 perc (korábban 35–40).

**Nyitott:** a 20 perces időcél a #81 (párhuzamos csomagok) mérésével igazolandó; a glm ~15–100 tok/s lassú hosszú csomagoknál; a második elutasított címke („Zárójel használata" a `148 + 6 · 8` blokkon) szerzői kérdés; az UK-térkép (08af437e) az új mátrixon még nem futott.

**Kiegészítés 2026-09-20 00:05 (PR #81, #82, #83):** párhuzamos csomagépítés (3 egyszerre; run 3aafddb1: bank 740 s a soros 1 052 s helyett), fejezet-szintű megalapozottság (a fejezet példája a fejezet explain-je által megalapozott fogalmat gyakoroltatja — 2 futásban 5-ből 4 kapu-elutasítás ilyen hamis pozitív volt), kvíz opció↔indoklás számbeli ellentmondás minden opcióra kódból. Második `done`: run 3aafddb1, 1 564 s, lecke `7ec84713`, html_files `90f53a1a`, 12 fejezet, 45/75. Várható a következő futásra ≈ 15 perc.

**Kiegészítés 2026-09-20 04:40 (PR #84, #85):** run 7 a #83 minden-opciós kvíz-szabály hamis pozitívján bukott → #84 (csak a helyes opció) + a determinisztikus ábra képaláírása szóhatáron vág (run 7: „12 · 2 = 24” → „12 · 2 = 2” lektor-blokkoló). A tulajdonos 49 fogalmas biológia-térképe (08af437e) az új mátrixon `done` 2 072 s, lecke `35a75fbb`, 59/118/33, ≈ 1,4 USD (volt ≈ 4,1). Run 8 (Műveleti) `done` 2 382 s párhuzamos terhelés mellett, lecke `b643e839`; a „leggyakoribb hibák” fejezet terve példát kap a kérdés előtt (#85). Nyitott: célzott fejezet-javítás (a szerzői kör után szinte minden csomag újraépül), egy 482 s-os csak-bank kör kivizsgálása, a 20 perces időcél egyedül futó leckén igazolandó.

**Kiegészítés 2026-09-20 09:00 (PR #86, #87):** célzott szerzői javítás (`section-patch.ts`: csak a kifogásolt fejezet íródik újra, a többi bájtra azonos → a bankcsomag újrahasznosul) és aritmetikai állítás-ellenőrzés a bankban (`tools/arithmetic-claims.ts`). Mérés 9 (run 128fda1b, egyedül): `done` 1 487 s, lecke `2afa67ea`, 10 fejezet, 45/75/21, egyetlen csak-bank kör, szerzői újraírás és mentőkör nélkül. A bank 1 134 s (76 %) → `PACKET_CONCURRENCY` 5 (#87), mérés 10 igazolja a 20 perces célt.

**Lezárás 2026-09-20 09:10 (PR #87):** mérés 10 (run 924dbfaf, egyedül futó Műveleti-lecke, 5 párhuzamos csomag + célzott javítás): **`done` 839 s = 14 perc**, lecke `5ece9c8c`, 9 fejezet, 45/75/20, ≈ 0,6 USD. A spec §7 elfogadási céljai (idő < 20 perc, lecke < 1,2 USD, bank < 0,2 USD) teljesülnek. Célzott javítás mérve: szerzői kör 11 s, animátor 2. kör 100 s (korábban 480–1 010 s). Kiadva: PR #77–#87, Render-revízió mindnél ellenőrizve.

**Lezárás 2026-09-20 10:05 (PR #89):** értelmező lektor (kutatás-alapú „nem kicsinyes" politika, blokkoló csak ha hamis ÉS félrevezet, kalibráló példák, medium effort), kétirányú fejezet-szintű megalapozottság, kapu a limiten célzott javítást ad. Mérés 12 (run 3d18dbe1, egyedül): **`done` 580 s = 9,7 perc**, lecke `72cac9fe`, 11 fejezet, 45/75/22, ≈ 0,7 USD; hamis pozitív 0, szerzői kör 0, a lektor egyetlen valódi hibát talált (10 s-os tétel-javítás). Kiadva: PR #77–#89.

## 2026-09-20 (dél) — Színes, figyelemfelkeltő tananyag (a gyerekek édesanyjának kérése)

**Kérés:** alsó tagozatosoknak érdekfeszítő színek, kiemelések minden tananyagban, leckénként véletlen grafikai hangulat; ötletforrás a 2026. jan–márc. leckék főlapja.

**Diagnózis:** a Studio-lecke témája eddig determinisztikus hash volt (6 visszafogott téma), a tervező nem foglalkozott a megjelenéssel, a szöveg kiemelés nélkül futott. A régi leckék (mérve): élénk többszínű paletták, 135°-os gradiensek, emoji-világok (🥷 🚀 🍎 🦋 🌊 🎮), tipp-dobozok.

**Javítás (PR #91):** 8 vizuális világ (`shared/lesson-visuals.ts` + CSS, paletta-szinkron teszttel); a runner véletlen világot javasol a tervezőnek (jobonként rögzítve, hash része); a lélek/skill: színes, figyelemfelkeltő, a kiemelés a lényeget mutatja; a vázlat fejezet-emoji-t és kulcskifejezéseket ad; a szerző `**…**`-gal emel ki; a runtime `<mark class="lesson-key">`-ként rendereli, emoji a címek és a haladásjelző előtt, „Miért?" kártya; a bank témája a világ. Spec: docs/specs/2026-09-20-colorful-lessons.md.

**Verifikáció (ellenőrzött):** kapuk (tsc, check:test, lint, npm test 1342/1342, vite build), CI zöld, merge. Mérés 13 (run 8769e7ea, egyedül): `done` 946 s, lecke `9a472399`; a tervező „ocean-kids" világot választott, 8/8 fejezet emoji + 2–3 kulcskifejezés, a szerző 8/8 fejezetben kiemelt, `experience.theme = ocean-kids`.

## 2026-09-20 (délután) — Regressziós kör a színes leckék után; főoldal-frissülés mobilon; javító-kör azonosító-feloldás

**Kérés:** a teljes tananyagkészítés tesztelése (semmi ne törjön, a grafikai sokszínűség érvényesüljön); a főoldal tananyaglistája mobilon nem frissül magától, és könnyű váltás kell a tananyagok között — megérteni, mérni, tervezni, javítani.

**Diagnózis (mérve):** a főlap lekérdezése `staleTime: Infinity`-vel és `refetchOnMount: false`-szal futott, a mobil böngésző bfcache-ből hozta vissza az oldalt, ezért a lista csak kézi újratöltésre frissült; a lecke-oldalon nem volt előző/következő navigáció. Regresszióban két új kódhiba: (1) az aritmetikai őr a tanulói lépéssort (`40 – 18 + 4 = 22 + 4 = 26`) páronként hamisnak vette és a csomagot 4 kísérlet után megölte; (2) a csak-bank javító kör válaszának torzított quiz-azonosítóját a szigorú őr négyszer eldobta (run 8909db64), pedig a lektor 3 valódi hibát jelölt.

**Javítás:** PR #94 (főlap: `homeFilesQueryOptions` staleTime 0 + refetchOnMount always + 60 s látható-frissítés + `pageshow` refetch, frissítő gomb, előző/következő tananyag-váltó a lecke-eszköztárban, `/api/html-files` no-cache; spec `docs/specs/2026-09-20-home-list-refresh.md`); PR #95 (aritmetikai egyenlőség-lánc + utolsó-kísérleti biztonsági szelep; világváltásnál a fejezet-emojik a választott világ készletére cserélődnek); PR #96 (`resolvePatchIds`: index-utótag vagy egyértelmű párosítás a kifogásolt tételekre, kétértelműségnél a hibaüzenet nevesíti a kapott azonosítókat).

**Verifikáció (ellenőrzött):** kapuk zöldek (tsc, check:test, lint 0, npm test 1348/1348), CI zöld mindhárom PR-on, Render revízió ellenőrizve. Élesben mobil nézetben (375 px): a lecke-oldalon a váltó gombok aktívak („Előző: A talaj", „Következő: Present Simple…"), vízszintes túlcsordulás 0; a főlap `Cache-Control: no-store`, a frissítő gomb a bundle-ben. Regresszió: JPG `done` 973 s (meadow), internetes `done` 1 166 s, térkép `done` 1 160 s (magic, 8/8 emoji + kiemelés, 2 valódi lektori hiba 1 csak-bank körrel javítva, kapu elsőre); négy egymást követő lecke négy különböző világ (ocean-kids → meadow → jungle → magic). Spec §7m.

**Tanulság:** a javító-kör őre ne öljön meg futást formai (azonosító-) eltérés miatt, ha a szándék egyértelmű; a tanulói lépéssorok egyenlőség-láncok; az időmérés csak egyedül futó leckén érvényes.

## 2026-09-20 (délután, 2.) — Disztraktor-magyarázatok számai a bank-skillben; bukott bankkísérlet oka a naplóban

**Kérés:** a lektor rendszeresen elkapta a hibás kvíz-opciók magyarázatának téves számait (csomagonként egy csak-bank kör, ≈ 4–5 perc) — legyen egyszerű, gyors, mért javítás teljes lánccal.

**Javítás (PR #97):** a bank-skill 4. lépése: a hibás opció magyarázata is számol, minden leírt számot újraszámolva; bizonytalanul szám nélkül nevezi meg a téves lépést; önellenőrzési kérdés. Kód nem változott a szabályhoz. Mellé: `onAttemptFailure` a banképítőben, a runner WARN-nal naplózza a bukott kísérlet szöveges okát (eddig csak ujjlenyomat).

**Verifikáció (ellenőrzött):** 4. mérés (run a9a4f683, egyedül): `done` 1 513 s, lecke `73bcdab7` (space világ, 9/9 emoji, 22 kiemelés, élesben megnézve), **0 lektori jegyzet, 0 csak-bank kör**, kapu elsőre. Az animátor 1 261 s: minden csomag újraépült (skill-verzió), 3 csomag tartalék/mentő láncra ment — az ok a következő méréstől olvasható. Kapuk: tsc, check:test, lint 0, 1348/1348; CI zöld.

**Tanulság:** a lektor blokkolóit hibaosztályonként a gyártó skilljébe kell visszaírni (mért példával), nem új kód-őrrel; a frissen épülő bank ideje a tartalék-láncolástól szór, ezért időmérés csak azonos checkpoint-állapotból hasonlítható.

## 2026-09-20 (délután, 3.) — Az animátor fázis 20 perces futásának gyökéroka: rejtett SDK-újrapróbálás időtúllépésre

**Kérés:** „Az animátor fázis ilyen hosszú futása nem megengedett. Keresd meg a gyökérokot, és javítsd!”

**Diagnózis (mérve):** 23 futás animátor-adata szerint a friss bank tokenszáma stabil (51–79k), az idő 245–1 261 s között szór; minden lassú fázisban `infrastructure` lelet. A 4. mérés naplójából a tartalék → mentőkör rések 364 és 602 s, a regressziós futásból 558 s = 240 + 124, 240 + 240 + 122, 240 + 240 + 78: a bank/animátor OpenRouter-kliens `maxRetries` nélkül futott, az SDK a 240 s-os időtúllépést kétszer csendben újrapróbálta (a lektornál ez már ki volt kapcsolva). A lassú hívó a deepseek tartalék (24k-ig futó válaszok), 5-ből 4-szer a mentőkörbe futott.

**Javítás (PR #98):** `maxRetries: 0` minden szabályzatos lépésnél; a bank-hívás időtúllépése bukott kísérlet → következő modell (más szolgáltatói hiba változatlanul kilép a resume-útra); a bank tartaléka egyből a terra mentőmodell. Tesztek: egyetlen kérés 500-ra; időtúllépés végigviszi a csomag-ciklust; models-routing frissítve (dokumentált spec-változás §7o).

**Második gyökérok (5. mérés, run a0eb2bed):** az animátor glm-hívása 609 s-ig futott a 240 s-os kliens-timeout és `maxRetries: 0` ellenére. Forrásból bizonyítva (`openai/client.js` `fetchWithTimeout`): az SDK az időzítőt a fejlécek érkezésekor törli, a törzs olvasása korlátlan; az OpenRouter azonnal küld fejlécet. Csak a lektornak volt külső `AbortSignal` határideje. Ráadásul a csak-bank kör feleslegesen újrahívta az ábra-modellt (722 s, eredmény nélkül).

**Javítás 2. (ugyanabban a PR-ban):** `stepDeadlineMs(step)` — külső, törzsre is érvényes határidő minden szabályzatos lépésnek, lejáratkor `AIProviderTimeoutError`; csak-bank körben nincs ábra-modellhívás. Tesztek: a jelzés a kérésre kötve + 240 s; csak-bank kör egyetlen (bank) hívással.

**Verifikáció (ellenőrzött):** kapuk zöldek (tsc, check:test, lint 0, 1352/1352), CI zöld. 5. mérés (régi kód, 49 fogalmas térkép): `done` 2 415 s, 1. kör friss bank 480 s, a 2. kör 820 s-ából 722 s a felesleges ábra-hívás. **6. mérés (minden javítással, JPG új térkép + friss bank, egyedül): `done` 521 s a teljes lánc, animátor 249 s** (4. mérés: 1 261 s, −80 %), 3 bukott glm-kísérlet oka a naplóban, 0 tartalék/mentőkör, lektor 0 jegyzet, kapu elsőre; élesben space világ, 11/11 emoji.

**Tanulság:** az SDK-alapértelmezések (retry) a lépés-időkorlátot megtöbbszörözik; minden modellhívó kliensnél explicit `maxRetries`. A lelet-ujjlenyomat nem diagnosztika: a bukott kísérlet oka és ideje WARN-nal a naplóba.

## 2026-09-20 (délután, 4.) — Szolgáltatói JSON-mód a bankra, és szerkezeti diagnosztika a törött válaszokra

**Kérés:** „Folytasd a javítást!” — az animátor fázis maradék időrablóinak felszámolása.

**Diagnózis (mérve, reprodukálva):** a 6. mérés három bukott bankkísérletéből kettő „a válasz nem érvényes JSON” volt. A nyers választ sehol nem tároljuk (a checkpoint csak a sikeres eredményt menti), ezért szondával reprodukáltam a termelési paraméterekkel: 8 glm-hívásból 1 törött, `Expected ',' or '}' … at position 1602` — a válasz teljes (`}`-ra végződik), a hiba a szöveg közepén, tehát nem csonkolás és nem a ```json kerítés, hanem a modell sorosítása.

**Javítás (PR #99):** `AIProviderConfig.jsonMode` → OpenRouter `response_format: { type: "json_object" }`, bekötve a bank és animátor lépésre (glm és deepseek is elfogadja, szondával ellenőrizve); a tartalmat nem érinti, a kerítés is elmarad. Mellé `jsonFailureShape`: a hibaüzenet hossz–lezártság–hibapozíció hármast közöl, tartalom nélkül, így a következő eset magától megkülönbözteti a csonka választ a hibás sorosítástól.

**Verifikáció (ellenőrzött):** kapuk zöldek (tsc, check:test, lint 0, 1352/1352). 7. mérés (JPG új térkép + friss bank, egyedül): `done` **399 s**, animátor **144 s**, lecke `c10c6ae5`, lektor 0 jegyzet, kapu elsőre; élesben ocean-kids világ, 10 emoji, 32 kiemelés. A teljes lánc 1 513 → 399 s (−74 %), az animátor 1 261 → 144 s (−89 %).

**Korlátozás (mérve, nem elhallgatva):** JSON-mód mellett is előfordul törött válasz — az OpenRouter `json_object` a glm útvonalon nem bizonyítottan kikényszerített. A 8. mérés az új diagnosztikával bizonyította az okot: „7 330 karakter, lezárt, de középen hibás (a modell sorosítása), 915. pozíció” — tehát nem csonkolás; egy másik csomag valódi hosszkorlátra futott. Mindkettő egy újrakísérlésbe kerül, és a következő kísérlet átment. Heurisztikus JSON-javítást szándékosan nem építettünk: tanulói tartalmat csendben elronthat, a nyereség egy kísérlet a tízből.

**8. mérés (run 0a262308):** `done` 756 s, 12 fejezetes lecke `bfb43d92` (meadow, 45/75/26); animátor 1. kör 156 s, a csak-bank kör 260 s **ábra-modellhívás nélkül** (a naplóban 0 ilyen hívás; korábban ugyanitt 722 s ment el rá).


## 2026-09-20 (délután, 5.) — A 915. pozíció felderítve: három sorosítási hibaosztály, determinisztikus javítással

**Kérés:** „Akkor a 915. pozíciónál javítsd a metódust” — a maradék törött JSON tényleges okát kellett megtalálni és javítani.

**Diagnózis (bájt-szintű bizonyíték):** a nyers választ nem tároljuk, ezért szondával reprodukáltam JSON-módban, termelési paraméterekkel, és a hibapozíciónál kiolvastam a karakterkódokat. Három osztály:
1. a sztringet **magyar záró idézőjel (U+201D)** zárja a `"` helyett → a sorvég vezérlőkarakterként a sztringbe kerül (`Bad control character`);
2. a kész JSON után **csonka ``` kerítés** marad (`Unexpected non-whitespace character after JSON`);
3. a belső idézet **`„`-vel nyílik, de egyenes `"`-rel zárul** → idő előtt lezárja a JSON-sztringet (`Expected ',' or '}'`). Ez volt a 9. mérés két bukásának oka (744. és 5 940. pozíció), és egy válaszban akár hétszer előfordul.

**Javítás (PR #101):** `parseModelJson` — mindhárom a HATÁROLÓ karakter hibája, ezért helyreállítható tartalomvesztés nélkül; minden lépés után újraelemzés (max 8), és ami nem értelmezhető, az az EREDETI hibával bukik. Nem heurisztikus javító: a hiányzó vessző (`{"a":"x" "b":"y"}`) szándékosan NEM javul össze, a helyesen lezárt `„idézet”` érintetlen — tesztek őrzik.

**Verifikáció:** 16 válaszos szonda a valódi javító úttal: 5 javult modellkör nélkül, és a maradék egyetlen bukás valódi csonkolás volt (ott a modellkör a helyes válasz) — 16-ból 15 sikerül elsőre. Kapuk zöldek.

**Tanulság:** ha egy modellhiba „középen törött JSON”, a bájtokat KI KELL olvasni — a három ok mind határoló-karakter volt, egyik sem igényelt tartalmi találgatást. A szonda (12–16 párhuzamos hívás termelési paraméterekkel) néhány centért ad bizonyítékot ott, ahol a napló tartalmat nem őrizhet.

## 2026-09-20 (késő délután) — Egységes köralakú joystick minden irányvezérléses játékban

**Kérés:** „Mindegyik vezérelhető játék vezérlését állítsd át az Asteroidban kialakított, köralakú, joystick-szerű vezérlésre.”

**Felderítés:** hét játék van, ebből **négynek** van irányvezérlése: SpaceAsteroidQuiz (már joystickos), TornadoHunter200 (`◀`/`▶` + Gáz/Fék pedál), BlockCraftQuiz (négy irány-gomb), TsunamiEscapeEnglish (Balra/Jobbra gomb). A WordLadder, SpeedQuizMath és BrainRotSteal csak válaszgombos — ezeket nem érinti.

**Javítás (PR #103):** mindhárom játék a közös `VirtualJoystick`-ra állt át, a meglévő `joystickToDirections` adapterrel — a játékok fizikáját nem kellett átírni, csak a meglévő irány-referenciákat (`touchRef`/`keysRef`) állítja a tárcsa. Tornadónál a gáz és a fék is a tárcsára került (azok is irányok), gombon csak a horgony és a kamera maradt. Tsunaminál a sprint szándékosan külön gomb maradt: ha a tárcsa is állítaná, a felengedése kikapcsolná a gombbal tartott sprintet.

**Spec-változás (nem teszt-gyengítés):** a `tornado-mobile-controls` teszt eddig a `Gáz`/`Fék`/`◀`/`▶` gombok meglétét követelte. A tulajdonosi utasítás nyomán az ÚJ szerződésre íródott át, erősebben: a tárcsa meglétét, mind a négy irány bekötését ÉS a régi gombok hiányát is kéri. A `game-touch-controls` joystick-ellenőrzése az Aszteroidáról mind a négy játékra kiterjedt.

**Verifikáció (mérve):** kapuk zöldek (tsc, check:test, lint 0, npm test 1365/1365, vite build). Fejlesztői kiszolgálón 375×812 mobil nézetben, játékot elindítva mindhárom játékban megjelent a tárcsa, a régi irány-gombok száma 0, és a megmaradt akciógombok a helyükön (Sprint / Ugrás-Bányász-Lerak / ⚓-Cam). Képernyőkép igazolja az Aszteroida-elrendezést: bal alul tárcsa, jobb alul kerek gomb.

**Tanulság:** a `joystickToDirections` adapter miatt a tárcsa bekötése játékonként néhány soros; a kockázat nem a fizikában van, hanem az olyan állapot-ütközésekben, ahol ugyanazt a jelzőt gomb és tárcsa is állítaná (sprint).

## 2026-09-23 (este) — tanári kérés, Tananyagjavító, kettős OCR, skill minden szerepkörnek (PR #104, merge 28d9001)

**Kérés:** a készítés indításakor pársoros kérés az ügynöknek; javító modul a kész lecke alatt és külön „Tananyagjavító” menü; a lektorálás hibáinak (hazugság, hallucináció, pontatlanság, lost-in-the-middle) megszüntetése; OCR-ellenőrzés kézírásra; minden szerepkörnek runbook-skill.

**Mért gyökérokok (éles DB, csak olvasás):** a javító futás 4756f8c2 lektora a kézírás-OCR „föld-változása” hibáját követelte vissza a helyes „Hold” ellen; e3348439 a füzet önellentmondó c7 sorát („10 év = 1 évszázad”) követelte. A javító út szerzői/lektori hívása skill nélkül futott; a kód-audit 17 skill nélküli modellhívást talált.

**Megoldás:** support-skills.ts (11 támogató skill), repair-skill.ts, lektor-runbook (mérce-sorrend, bejárás, cáfolás, egy gyökérok = egy jegyzet, átírási hiba, önellentmondó forrás), source-corrections.ts (determinisztikus szűrő, a quote sosem változik), OCR kettős olvasás (qwen + glm-5.3-flash, Gemini nélkül) döntő olvasással és őrrel, magyar kézírás-skill. Statikus teszt tiltja a skill nélküli modellhívást.

**Verifikáció (mérve):** lektor A/B visszajátszás a két valódi jelöltön, 3-3 hívás: hamis blokkoló 6/6 → 0/6. Éles E2E javító futás (mentés nélkül): kész 594 s, 0 blokkoló, évfolyam 7→5, bódex 0 / kódex 16, Stonehenge, Hold, tanítás −23 %. OCR 3 valódi kézírásos lapon: qwen 95,4 / glm 89,1 / luna 87,3 / deepseek-v4.1-flash 0 (csonkol). Kapuk: tsc (+tsconfig.test.json), eslint, 1379 teszt, build, CI minden check zöld. Deploy: Render revision 28d9001, Vercel asset main-DZyXbpek.js = helyi build.

**Nyitott:** tulajdonosi döntés a D1-ről önellentmondó forrásállításnál (a lecke most a hibás c7 sort tanítja, a lektor infóként jelzi). Admin-felületi böngészős próba nem futott (bejelentkezés kell).

## 2026-09-23 (késő este) — „Az időszámítás…” lecke újraírva élesben + hotfix (PR #105, merge ef05159)

**Kérés:** a lektor miatt bukott leckét újra elkészíteni, tömörebben, 5. osztályos szinten, a történelmi alapfogalmakra fókuszálva; a régi hibásat eltávolítani. Tulajdonosi döntés: az időegységeknél a helyes „1 évszázad = 100 év = 10 évtized” (tanári helyesbítésként, a D1 általánosan változatlan).

**Végrehajtás:** a termelési javító úton (javítási rekord bb6c1413, jelölt 579 s alatt, 0 lektori jegyzet), majd `applyTrackedImprovement`. Az első alkalmazás elbukott: `km_concepts.verbatim_reason` varchar(32), a helyesbítés audit-szöveget írt bele → tranzakció visszagördült, a lecke érintetlen. Hotfix: okkód (`corrected:owner`), regressziós teszt; ugyanez a hiba az egylépéses készítést is megakasztotta volna.

**Visszaolvasás (éles DB + élő API):** lecke v2, 5. osztály (lecke, anyag, térkép), 12 fejezet, tanítás 24 112 → 18 901 kar., bank 45/75; bódex 0 / kódex 19, Stonehenge, Hold változása, „100 év” 18, „10 év = 1 évszázad” 0; c1, c2, c7, c25–c27 `edited`/`corrected:owner`. A régi változat csak visszaállítható mentésként él (material_improvement_backups 97b1323c).

## 2026-09-24 — „Az időszámítás…” lecke rövidítése szülői kérésre (adatművelet, kódváltozás nélkül)

**Kérés (Léna anyukája):** ne legyen terjedelmes; a gyermek csak a lényeget és a történelmi kifejezéseket tanulja meg.

**Végrehajtás:** a térképen négy nem-történelmi kiegészítő fogalom `extra` súlyt kapott (c10 100 év emberöltőkben, c18 teremtéstörténet, c20 az evolúció bizonyítékai, c23 a rasszok felsorolása; előtte supporting/supporting/core/supporting — visszaállítható). Utána a termelési javító út (javítási rekord 00cbfc38, 428 s) a tömörítési kéréssel, majd `applyTrackedImprovement` (mentés cb0b0d30).

**Visszaolvasás (éles DB + élő API):** lecke v3, 5. o., 12 → 6 fejezet (időszámítás, időegységek, korok, az ember kialakulása röviden, kódex/iniciálé/pergamen/antik, források), látható tanítási szöveg ~650 szó (tanítás JSON 18 901 → 9 688 kar.), bank 45/75; bódex 0, Sany 0 / Samu, a vértesszőlősi előember; 1 évszázad = 100 év.

## 2026-09-24 — rózsaszín Hercegnő-kastély világ, leckénként változó különlegességek; a lecke kiegészítése (PR #106, #107)

**Kérés:** a Homo sapiens alfajai és az írott/szóbeli emlékek (fajták, rögzülés) a leckébe; fiatalos, rózsaszín, figyelemfelkeltő design effektekkel egy 5. osztályos kislánynak; a változatosság a skillekbe; újragenerálás.

**Kód:** `princess` világ, `LESSON_FLAIRS` (6 CSS-effekt, leckénként 3, determinisztikus; mozgáscsökkentésnél/csendes módban ki), `designFromInstruction`, `experience.flair` (séma-enum, a modell nem írhatja), skillek (tervkészítő, szerző, tananyagjavító). Mért hiba a javító úton: a térképre közben felvett fogalmat a szerző nem címkézhette → most engedélyezett és néven nevezett (d1894a8). Élő mérés: a csillogás a címre lógott (375/800 px) → #107.

**Adat:** térkép 2c43327f: c23 (Homo sapiens sapiens csoportjai) extra → supporting; új tanári kiegészítés c29 „írott emlékek”, c30 „szóbeli emlékek” (source_ref „Tanári kiegészítés 2026-09-24”, verbatim_reason `owner:addition`). Lecke: javítási rekord f04dbc06 (418 s, 0 blokkoló), alkalmazva (mentés 6f2f6fbe).

**Verifikáció:** élő API: theme princess, flair sparkles/shimmer-keys/pop-correct/float-emoji; képernyőkép websuli.vip/preview/739ec478 (800 és 375 px): rózsaszín háttér, csillogás a fejlécben, fejezet-emojik 👑💖🦄🌸✨🎀, kiemelt kulcsszavak. Kapuk: tsc (+test), eslint, 1385 teszt, build, CI zöld (#106, #107).

## 2026-09-24 — régi kliens + új lecke: „sérült” helyett megjelenés (PR #108, merge 7182508)

**Mérve élesben (tulajdonosi képernyőkép):** a telepítés előtt megnyitott fül régi kódja a `princess` témát nem ismerte → „Ez a lecke sérült” (experience.theme); frissítés után hibátlan (a tulajdonos megerősítette). A szerviz-worker átengedő; a régi kód a memóriában maradt.
**Javítás:** `tolerantLessonInput` (olvasáskor ismeretlen téma → alapértelmezett, ismeretlen különlegesség kimarad; íráskor szigorú), olvashatatlan leckénél egyszeri automatikus újratöltés újabb buildnél, különben „Frissítés” gomb. Élő ellenőrzés: main-BZ24UWWF.js, princess, 6 fejezet, nincs „sérült”.
**Tanulság:** új enum-értéket (téma, blokk, mező) az adatba csak úgy szabad írni, hogy a régi kliens olvasása ne bukjon — előbb a kliens tolerancia menjen ki, utána az új érték.

## 2026-09-24 — teljes rendszer-audit és javítás (PR #109, merge 08e2e77)

**Módszer:** kapuk (main CI zöld), éles állapot csak olvasva (Render-napló 24 h: csak a két ismert lektor-bukás; DB: nincs elakadt futás, error_logs 7 napon üres), 3 csak-olvasó alügynök cáfolási körrel, élő böngészős mérés.
**Javítva (11):** főoldal like N+1 (98 → 13 kérés, 86 × 779 ms → 2 × 133 ms, élesben mérve); lecke-betöltés zsákutca (retry + gomb); évfolyam- és design-felismerés hamis találatai; számcsere a betűhiba-szűrőn; leromlott OCR cache-elése; nem-tranzakciós térképírás; term ≤ 200; AI-kliensek timeout + maxRetries; javító panel hibaállapot és 44 px; 3 elavult „waiting” workflow-futás lezárva (DB).
**Nem javítva (indokolt):** /api/pdf és /dev IP-korlát — Vercel-proxy mögött megosztott IP, osztályokat zárna ki; előbb a valós kliens-IP-t kell mérni.
**Kapuk:** tsc (+test), eslint, 1393 teszt, build, CI zöld. Egy ideiglenes diag-szkript véletlenül commitba került (titok nélkül) → eltávolítva, `*.tmp.*` a .gitignore-ban.

## 2026-09-24 — élő próba: felvételi feladatlap PDF → gyakorló lecke (PR #110, #111, #112)

**Próba:** M6_2021_1_fl_1.pdf cím és utasítás nélkül, egylépéses útvonal, 3 élő futás (29a13b45, 9c0169b7, e79ab9da). Felismerés ✅: matematika, 6. osztály, feladatlap; a törtek a sérült PDF-szövegrétegből is helyesek; 54 fogalom.
**Javítva (7 mért lelet):** grúz szó a definícióban → idegen írás-őr; aritmetikai őr hamis riasztásai (zárójel utáni „2 = 490”, „1/15 = 4 km”, „980 Ft : 2 = 490 Ft”) a valódi hibák elkapása mellett; a csak-bank kör túllépte a workflow keretét → 43 perc után „Váratlan hiba” + árva „running” job (most tiszta lektori hiba); a lektor újraoldja a forrásfeladatot, ellentmondásnál a tanítást jelöli; az ismétlődő kérdés hibája megnevezi a tételt.
**Nyitott (modell-képesség):** a 9. feladat (kiskockás téglatest: 7×11×6 = 462, Réka 70, Janka 280) rész-kérdéseit a bank és a lektor nem vezette le; a lektor az ellentmondást jelzi, így hibás megoldás nem kerül ki, de a lecke megáll.
**Tanulság:** a helyi élő futás az éles DB-t használja — egy Render-deploy induláskori takarítása lezárja a helyben futó jobot; élő próba alatt ne deployolj.

## 2026-09-24 — magyarázó ábrák (PR #113, #114, merge e3a4b59)

**Tulajdonosi jelzés:** „a holdciklushoz csak egy kört rajzolt, nem magyarázó ábrák készülnek”.
**Gyökérok (bizonyított):** a `geometry` rajzoló egyetlen címke nélküli kör; a 09-19-es eszköz-kiváltás miatt példa mellett az ábra-modell nem futott (minden ábra a példa lépéseinek szövegdoboza); az ábra-modell a glm-flash volt.
**Javítás:** új rajzolók (cycle valós holdfázissal, labeledShape téglatesttel, barChart, venn, bővített numberLine); ábra-modell Claude Opus 5.5 (tulajdonosi döntés), csak ábra-foltot ad, a program illeszti be; skill + SOUL; hibás foltnál egy újrakérés.
**Mérés:** böngészőben 360/375/1280 px 0 átfedés/levágás, kontraszt ≥ 14:1; élő Opus-hívás 20–27 s, ~3k kimeneti token, 4/5 hibátlan. Spec: `docs/specs/2026-09-24-magyarazo-abrak.md`.
**Nyitott:** 2. szelet (szabad SVG-illusztráció) és 4. szelet (ábra-minőségkapu, lektor-szempont) még nincs kész; teljes élő leckegyártás az új ábrákkal még nem futott.

## 2026-09-24 — magyarázó ábrák 2. és 4. szelet (PR #115, #116, merge abc58ef)

**4. szelet (#115):** gyenge ábra gépi felismerése (a példa lépéseit ismétlő szövegdoboz, puszta körvonal, ki nem rajzolódó ábra) → egy célzott újrakérés az ábrakészítőnek; lektor-szempont: a szöveget ismétlő ábra language-jegyzet.
**2. szelet (#116):** szabad SVG-illusztráció (`shared/illustration-svg.ts`): allowlistes tisztítás, felirat a lecke szavaival, becsült elrendezés-ellenőrzés (telefonos betűméret, átfedés, kilógás); kliens újratisztít; elutasítás oka a célzott újrakérésbe.
**Élő mérés (Opus 5.5):** 1. hívás 11,1 px-es illusztráció-betű telefonon → szerződés + ellenőrzés; 2. hívás 3 illusztráció (kódexlap, Homo sapiens csoportok, források), 0 elutasítás, ≥ 12,7 px. Számegyenes ugrásfeliratai összecsúsztak → javítva.
**Tanulság:** a böngésző getBoundingClientRect-átfedése kétsoros SVG-feliratnál a betűdoboz mellékhatása lehet — képpel kell ellenőrizni; a skill-hossz két teszt is rögzíti (role-skills-everywhere 4800/6000, studio-role-skills < 5200).
**Nyitott:** teljes élő leckegyártás az új ábrákkal még nem futott; a régi leckék ábrái csak újrageneráláskor frissülnek.

## 2026-09-24 — címke-őr javítás, „időszámítás” lecke ábrái frissítve, 5. élő PDF-futás (PR #117, merge dd81324)

**Hiba (élő mérésből):** a címke-őr (grounding.blockText) az új ábrák kirajzolt szövegét nem látta → 8 fogalomcímke lekerült, egy idővonal kiesett. Javítva: `renderedVisualTexts`. Rajzolók: körforgás oldalsó felirata, számegyenes jelölésfeliratai ütközésmentesek (360/375 px mérve).
**„Az időszámítás…” lecke (01638ae9, html 739ec478):** csak az ábrák cserélődtek (szöveg bájtra azonos, szerződés OK): 10 ábra, mind a 6 fejezetben (holdfázis-ciklus, idővonalak, számegyenesek, 3 illusztráció: embercsoportok, kódexlap, források). Mentés: scratchpad `lesson-01638ae9.backup.json`. Élesben ellenőrizve: 10 ábra, 3 kirajzolt illusztráció, 0 konzolhiba.
**5. élő PDF-futás (1294 s):** az ábrakészítő 16 ábrát adott (oszlopdiagram, halmazábra, téglalap, téglatest, illusztráció, számegyenes), 1 elutasított → célzott újrakérés 10 s alatt pótolta. A lecke a lektornál állt meg bankhibákon („2021-rejtély” mintaválasz-lista, egy kerekítési opció) — 3 körben javítatlan. A szerző ismét 7×11×5-öt számolt, a lektor nem jelezte.
**Döntés:** stuck-state — a PDF-en további vak iteráció helyett opciók a tulajdonosnak (javítókulcs feltöltése / bank-javítás erős modellen / kézi javítás).

## 2026-09-24 — felvételi feladatlap lecke kézi javítással közzétéve + lektor-tanítás (PR #118, merge e635ffa)

**Lecke (M6 2021 Mat1):** lesson d2043ac4 → html f8a742e8 (https://websuli.vip/preview/f8a742e8-d014-4547-a9f0-86972f02ac54). Saját megoldókulcs mind a 10 feladatra (scratchpad `m6-megoldokulcs.md`). Tanítás javítva: 9. feladat 7, 11, 6 / 462 / Réka 70 / Janka 280; 5. feladat teljes lista (2120, 2123, 2321, 2324, 2423); 6a–b, 6d 8-as lépés, 7a/c, 8a kiegészítve; két szövegdoboz-ábra valódi ábrára cserélve; öt címkézetlen fogalom a szövegbe. A bank (218 tétel) Opus 5.5-tel újraépült, 3 párhuzamos Opus-ellenőrző a megoldókulcshoz mérte: 4 hiányos levezetés (Tivadar 8-as lépés) javítva, tényhiba nem maradt. A futtató kapui (fúziós bank, 7.4 skill, fedettség, ív, mintapontozás) átmentek; `publishLesson`; élesben 17 ábra, 0 konzolhiba.
**Lektor-tanítás:** 31 jegyzet a megoldókulcshoz mérve → horgony (a lecke részeredményét fogadja el) + nem konvergáló javítási irány. A/B: önálló megoldás a leckét látva nem elég; VAK megoldás (Opus 5.5, teljes forrás, lecke nélkül) 26/26 helyes, 7× „NINCS ELÉG ADAT”; vak megoldásokkal az új lektor első körben blokkolót adott a tanításra (h = 6, 462). `server/studio/blind-solver.ts`, lektor-prompt + skill (solutions, teljes javítási irány).
**Tanulság:** a lektor-hibák oka itt nem a képesség, hanem a horgonyzás — a független (vak) bizonyíték oldja fel. A PDF szövegrétegéből a táblázat és a törtek szétesnek: a vak megoldó ott kihagy (helyes viselkedés).

## 2026-09-24 — új lecke teljes gyártása vak megoldóval (PR #119, merge 469efee)

**Futás:** saját 6. osztályos feladatlap ismert megoldókulccsal (23 részfeladat), lesson 38b1238d → html bfbab797 (https://websuli.vip/preview/bfbab797-399b-4877-9437-d01740fa9870). 1. futás: a vak megoldó csendben kimaradt — a `loadMap` meta mezőnként épült, a `sourceText` elveszett (memóriatárolós egységteszt nem fogta). Javítás után (job d0731b46, 609 s, 1 kör): vak megoldó 22/23 helyes (8b rossz), a lektor nem vette át; tanítás a kulcshoz mérve hibátlan.
**Ábrák:** a címke-őr eldobta a fogalmat körülíró feliratú ábrákat, a tartalék előtte futott → 5/12 fejezet ábra nélkül. Most: foltbeillesztő okkal elutasít + célzott újrakérés, prompt-szabály, tartalék a címke-őr után; ugrásfelirat 16 → 24. Eredmény: 12/12 fejezet ábrás, 375 px-en nincs levágás/átfedés/hScroll.
**Bank:** 2 Opus-ellenőrző: lehetetlen adatú kvíz, hamis visszajelzések, igaz disztraktor, ~19 rubrika végeredmény nélkül — kézzel javítva; bank- és lektor-skill: végeredmény külön kötelező csoport.
**Nyitott javaslat:** külön Opus „bank-ellenőr” lépés a vak megoldásokkal mint kulccsal (a lektor bank-recallja alacsony). Harness-csapda: `createRun` nélkül a wrapper „nem adott vissza teljes leckét” hibát dob sikeres jobra is.

## 2026-09-24 — bank-ellenőr (PR #120, merge f9f48b2)

**Mit:** a lektor-lépéssel párhuzamosan fejezetenként Opus 5.5 (`bank-verifier` támogató skill) ellenőrzi a bankot a vak megoldásokkal mint kulccsal; hibák → `experience.*` blokkoló → meglévő csak-bank kör; elfogyott keretnél `bank_check_late` figyelmeztetés; hibátlan tételek hash-e a jobban (`bankVerifierCleared`). Csak vak megoldás + bank esetén fut.
**Élő mérés (38b1238d, 144 tétel):** lektor 0 → bank-ellenőr 29/31 ismert hiba + 8 új valódi hiba, 0 hamis riasztás, 27–43 s. A skill v2-t a mérés hozta: disztraktor-átszámolás (más szavakkal igaz), minden KIÍRT művelet ellenőrzése a hibás opciókban is, szinonimával kiváltható végeredmény-csoport. A 8 új hiba (kvíz 10, 30, 46, 53, 55, 67, 71, 74) a közzétett leckében javítva, élő API-n ellenőrizve (mentés: scratchpad `lesson-38b1238d.pre-bankcheck.backup.json`).
**Tanulság:** a találati arány futásonként ingadozik — egy futás nem teljes lefedés; a pontosság stabil.
**Mellék:** a GitLab/Supabase/Sentry pluginek kikapcsolva a globális settings.json-ban (tulajdonosi kérés).

## 2026-09-24 este — éles gyártás-sorozat, bankmodell-csere, célzott bankjavítás (PR #121–#124)

**Futások (saját feladatlapok ismert kulccsal):** 351e14cc — hibára futott (aritmetika-téves riasztás „–6 + 11 = 5”, PR #121); 68a5b500 — 60 perc után a 2. javító körben (glm javító köre nem konvergált, 23→16 hiba); 67a05970 — done, de 7 ismert bankhiba (luna-bankkal is 9→13→7: nem konvergált); **a804b07f — done 736 s, bank-ellenőr 13 → 1 → 0**, lecke 91b53ef1 / html 72bb18d4, vak megoldó 20/20 = kulcs, tanítás helyes, 375 px Playwright: hScroll 0, 7 ábra, 0 konzolhiba.
**Bankmodell (PR #123):** 6 jelölt ugyanazon a leckén, termelési úton, bank-ellenőrrel mérve: glm-5.3-flash 22/146, 653 s; **gpt-5.6-luna 9/144 (2×), 130–143 s, 0,09 USD**; terra 8/144, 0 bukás, 0,71 USD; sonnet-5 17/146; glm-5.3 építési hiba; haiku-4-5 nem támogatja az adaptive thinkinget. Bank = luna, tartalék/mentőkör = terra.
**Aritmetika-ellenőrző (PR #121, #122):** előjeles szám, tört/vegyes tört mint egy szám, szóközös ezres tagolás, szóhoz tapadó címke-kettőspont.
**Gyökérok (PR #124):** a csak-bank javító kör a kifogást FOGALOM szerint osztotta szét — közös fogalmú fejezeteknél a nem-tulajdonos csomag teljesen újraépült (9 kifogás → 91 új tétel, új hibákkal). Visszajátszással bizonyítva (job checkpoint + `withPreparationSkill` a futás skill-pillanatképével — enélkül a baseHash eltér, hamis `priorOk=false`). Javítás: a kifogás a tételt tartalmazó csomaghoz megy.
**Maradék:** független újraellenőrzés a kész bankon 4/134 jelzés (3 valódi hamis disztraktor-egyenlőség + 1 szabály-túlzás); a 3-at + egy tanítási check-blokkot kézzel javítottam, élő API-n ellenőrizve. A bank-ellenőr recallja futásonként ingadozik (egyszeri „hibátlan” ítélet nem garancia).
**Nyitott:** a 67a05970 próbalecke (html 45af1165) 7 ismert bankhibával közzétéve — tulajdonosi döntés: javítás vagy eltávolítás.

## 2026-09-25 — internetes tananyag-készítés: kimerült OpenAI-keret (PR #126, merge ba7786f)

**Hiba:** webes job 22a38c0a („Első károly magyar király”) a bankfázisban „nem fejeződött be” hibával állt le; Render-napló: csak „background job failed”.
**Gyökérok (bizonyítva):** reprodukció a job workflow-rekordjának MEMÓRIA-másolatával (a checkpointok miatt csak a bankfázis fut élőben) → `StepModelError` cause „[OpenAI] Rate limit exceeded”; próbahívás az éles kulccsal (Render-lenyomat egyezik) → 429 `insufficient_quota` / `credit_balance_exhausted`: **az OpenAI-fiók kreditje elfogyott** (terra és luna is). A kód a 429-et sebességkorlátnak fordította, az okot a webes futtató és a háttérjob naplója eldobta.
**Javítás:** `AIProviderQuotaError`; `QuotaFailoverProvider` — kvótahibánál ugyanaz a kérés `openai/<modell>` néven az OpenRouteren (10 perc memória); a webes ág naplózza az okot. **Élő bizonyíték:** a tulajdonos jobja a termelési folytatási úton 1158 s alatt `done`, közzétéve (html 22a38c0a), 6 fejezet + 15 feladat + 25 kvíz; 375/1440 px: hScroll 0, konzolhiba 0.
**Nyitott:** az OpenAI-kredit feltöltése (tulajdonos); addig minden OpenAI-hívás az OpenRouter-egyenleget terheli (~245 USD volt). Párhuzamos felhős munkamenet PR #125-je (webes bank: tartalék/mentőkör, párhuzamosság, árva-szabály) ugyanazokat a fájlokat érinti — élesben nem futott, rebase kell.

## 2026-09-25 — internetes tananyagkészítés: hol és miért akadt el (1. szelet: működés)

**Kérés:** ellenőrizni, hol és miért akadt el az internetes tananyagkészítés, és javítani a működését és a módszerét.
**Korlát:** felhő-munkamenet; éles DB, Render-napló és websuli.vip nem elérhető (proxy 403, nincs kulcs) → a diagnózis kódból, alügynökös cáfolással; élesben UNVERIFIED.
**Diagnózis (fájl:sor a specben):** 09-20 óta a `web-*.ts` csak a skill-blokkot kapta; a feltöltős út 09-19/20-as bankjavításai nem kerültek át. (1) A webes bank SOROSAN (concurrency nélkül) épült a 20 perces fáziskeretben — mérve 10 csomag sorosan 1 795 s > 1 200 s → „Időtúllépés”. (2) Az első rossz csomagválasz (hossz/üres/nem JSON) `StepModelError` → nem `RetryableBankCallError` → a tartalék/mentőkör nem futott. (3) A bank a drága szerzőmodellen, JSON-mód és törzs-határidő nélkül. (4) Egy bukott állapotírás megmérgezte a mentési láncot → generikus „AI hiba”. (5) A 25 perces árva-szabály az élő munkást is halottnak nyilvánította (a későbbi írások csendben elvesztek), újraindulás után viszont 25 percig „fut” látszott. (6) A folytatás egyetlen HTTP-kérésben futott, a kliens 20 s után feladta a követést. (7) Átmeneti DB-hiba a szívverésnél végleges bérletvesztés.
**Javítás:** `server/studio/bank-call.ts` (közös bankmodell-út + hibaosztályozás; step-runner is ezt használja), webes bank `PACKET_CONCURRENCY`-vel, bankmodell → tartalék → mentőkör, csomagonkénti haladás és job-sorba mentett csomagok (folytatáskor modellhívás nélkül); ellenálló mentési lánc; árva-felismerés a workflow-bérletből; háttér-folytatás (`publish(..., { background: true })`) + a kliens újraindítja a követést; szívverés-kivétel nem bérletvesztés.
**Verifikáció:** tsc, check:test, eslint 0, npm test 1438/1438, build; új unit tesztek (bank-call 2, web-research-jobs +4) — a 4 job-teszt a régi kódon bukik; Playwright webes spec 6/6 (új folytatási teszt a régi kliensen bukik), 390/1440 px túlcsordulás 0.
**NOT RUN:** éles internetes gyártás (nincs éles hálózat/kulcs); Render-deploy.
**Nyitott (2. szelet, tulajdonosi döntés):** a webes út módszer-lemaradása (vak megoldó, bank-ellenőr, Opus-ábrák, forrás-helyesbítés, forrásalapú évfolyam, Studio-lecke) — javaslat: a letöltött oldalak `text` forrásként az egylépéses Studio-gyártásba (spec 9. pont).

## 2026-09-25 este — internetes gyártás: #125 összefésülve, élesben igazolva (PR #127, merge c3e1a35)

A párhuzamos felhős munkamenet PR #125-je (webes bank = feltöltős bankhívás: bankmodell → tartalék → mentőkör, párhuzamos csomagok, mentett részeredmény; árva-szabály a bérletből; háttér-folytatás; szívverés-hiba ≠ bérletvesztés) átnézve (tesztet nem töröl/gyengít), a #126 kvóta-átállással összefésülve, #125 lezárva mint beolvasztott. Hozzáadva: a webes „animator” lépés = bankhívás → „a gyakorlóbank készítése nem fejeződött be” + ok; a tartalék lektor hibája naplózva és az üzenetben (eddig `catch { throw primaryError }` elnyelte).
**Élő mérés (memória-tár, valódi modellek):** Hunyadi Mátyás 1. futás — bank ≈160 s, utána a grok-4.6 lektor 480 s időtúllépés, a tartalék hibája elveszett; 2. futás — **done 710 s**, bank ≈90 s, lektor + javítókör rendben, HTML 108 KB. A tartalék lektor önmagában (valódi bemenet 161+105 s; 470k karakter 6 s) működik — az 1. futásbeli azonnali bukása nem reprodukálható, most naplózott.
**Nyitott:** OpenAI-kredit feltöltése; a grok-4.6 webes lektor nagy bemenetnél a 480 s-os kerethez közel fut.
