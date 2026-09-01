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
