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
