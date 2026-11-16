# Végrehajtási utasítás — valódi e-mail-címek ki + #462 N2–N4

**Állapot:** folyamatban – 2026-11-16, ág `fix/valodi-cimek-ki`
Terv: `docs/specs/2026-11-16-valodi-cimek-ki.md`

Útvonalak a `source/` alatt, ha nincs más jelölve. SZABÁLY: valódi címet semmilyen kimenetbe (commit, PR, napló, chat) ne írj;
parancskimenetet `sed -E 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/<cím>/g'`-vel szűrj.

## V1 — dokumentáció (repó gyökeréből)

- `source/GOOGLE_AUTH_SETUP.md:22`, `docs/archive/memory-dead-vps-20260906/procedural__deploy__google-auth-setup.md:18`:
  `ADMIN_EMAIL=<ADMIN_EMAIL>`.
- `memory/projects/websuli/LEDGER.md:193`: „az admin-címre (`ADMIN_EMAILS`)”.

## V2 — `server/scripts/setAdmin.ts`

- `const email = normalize(process.argv[2])`; hiányzó / hibás → `console.error("Használat: …setAdmin.ts <email>")`, `process.exit(1)`
  a `pg.Pool` létrehozása ELŐTT. A cím-ellenőrzés: `normalizeAdminEmail` (`server/lib/admin-access.ts`).
- INSERT `first_name` / `last_name` nélkül; naplóban `maskEmail`.
- Review #474: keresés `lower(email) = lower($1)`, frissítés a megtalált sor `id`-jára (a tárolt írásmód marad); több illeszkedő
  sor → hiba, exit 1, módosítás nélkül; új sor csak, ha nincs egyező (a megadott írásmóddal). DB-teszt:
  `tests/set-admin-script-db.integration.ts` (a `test:learning-db` futtatóban).
- Forrás-őr: a `scripts/setAdmin.ts` `is_admin` engedélye marad (a sorok továbbra is illenek).
- Teszt `tests/set-admin-script.test.ts`: `spawnSync(process.execPath, ["--import", "tsx", "server/scripts/setAdmin.ts"])` argumentum
  nélkül és hibás címmel → status 1, a kimenet a „Használat” szót tartalmazza; a forrásban nincs `@` karakterű sztringliterál.

## V3 — VAPID subject

- Új `server/lib/vapid-subject.ts`: `export const DEFAULT_VAPID_SUBJECT = "https://websuli.vip"`;
  `export function vapidSubject(env = process.env): string` — `VAPID_SUBJECT` trim; érvényes, ha `^mailto:` + `normalizeAdminEmail`
  szerinti cím, vagy `new URL()` szerint `https:` és nem `localhost`; különben `logger.warn` (érték nélkül) + alapérték.
- `server/pushNotifications.ts:11` → `const vapidEmail = vapidSubject();`
- `server/routes.ts:3011` → `vapidSubject()` (import a fájl tetején).
- `.env.example`: a VAPID blokkba `# VAPID_SUBJECT=` (mailto: vagy https:, alapérték https://websuli.vip).
- Teszt `tests/vapid-subject.test.ts`: nincs → alapérték; érvényes `mailto:` és `https:` → maga; üres, `mailto:`, `mailto:nem-cim`,
  `http://`, `javascript:`, `https://localhost` → alapérték; a figyelmeztetés nem tartalmazza az értéket.

## V4 — `client/src/pages/AdminDocumentation.tsx:858-863`

- A „Több adminisztrátor” elem: „az admin-jogot csak az engedélylistán (`ADMIN_ALLOWLIST` környezeti változó) szereplő fiókok
  kapják; a címek nincsenek a kódban.” — beágyazott lista nélkül.

## V5 — őr-teszt `tests/no-real-emails-guard.test.ts`

- Gyökér: `fileURLToPath(new URL("../..", import.meta.url))`; fájlok: `git -C <gyökér> ls-files -z`.
- Kihagyás: `package-lock.json`, `*.lock`, `pnpm-lock.yaml`, `node_modules/`, bináris kiterjesztés, NUL-bájtos tartalom.
- Minta: `/[\p{L}\p{N}._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/gu`, a `@`-előtti karakter nem lehet betű/szám
  (a `user@2x.png` és hasonlók domainje úgysem engedélyezett → bukna; ezért a domain-engedélylista dönt).
- `ALLOWED_DOMAINS` (indokkal) és `ALLOWED_ADDRESSES` (pontos, kisbetűs, indokkal). Döntés: cím kisbetűsen az
  `ALLOWED_ADDRESSES`-ben, VAGY a domain kisbetűsen az `ALLOWED_DOMAINS`-ban.
- Üzenet: `fájl:sor: engedélylistán kívüli e-mail-cím (<domain első betűje>***)` — a cím nem.
- Elavult engedély: az `ALLOWED_ADDRESSES` minden eleme legalább egyszer előforduljon (különben bukás) — a lista csak szűkülhet.
- Ellenpróba ugyanebben a fájlban: futásidőben összerakott álcím (`["valaki", "gmail.com"].join("@")`) → `isAllowed` hamis; egy
  ideiglenes fájllal kézzel is (a jelentésben).
- Parancs: `node --import tsx --test tests/no-real-emails-guard.test.ts`.

## V6 — N2 (`tests/admin-access-source-guard.test.ts`)

- FORBIDDEN bővítés: `/\bisAdmin\s*=(?!=)/`.
- Ellenpróba bővítés: `const { isAdmin = false } = u;`, `const { isAdmin: a = false } = u;`, `const { id, isAdmin = true } = u;`.
- `ok` lista bővítés: `isAdminUser(u) === true`, `const isAdminUserFlag = 1`.
- A meglévő fán zöld (új találat esetén a kódot kell javítani, nem a listát).

## V7 — N3, N4 (`server/lib/admin-access.ts`)

- `EMAIL_RE` mindkét karakterosztályába `:` (kizárás).
- `invalidEntries` figyelmeztetés: „… hibás elemét (pl. „mailto:” előtag, kettőspont, hibás alak) figyelmen kívül hagytuk.”
- `:214` → `logger.info(\`[ADMIN-ACCESS] admin-engedélylista forrása: ${policy.source}, ${policy.emails.size} cím.\`)`;
  a `maskEmail` import, ha máshol nem kell, kikerül.
- Teszt `tests/admin-access.test.ts`: `normalizeAdminEmail("mailto:tulaj@pelda.hu")` → null; `parseAdminAllowlist("mailto:a@pelda.hu,
  b@pelda.hu")` → 1 cím, 1 hibás; `ADMIN_EMAIL=mailto:…` → `adminEmailInvalid`, forrás `none`; a jelzős fiók nem lesz általa listás;
  a napló engedélylista-sora nem tartalmaz `@`-ot, és darabszámot tartalmaz.

## V8 — ellenőrzés (külön parancsok)

`npm run lint`, `npm run check`, `npm run check:test`, `npm run build` + `grep -rIlE` a `dist`-en a két címre (csak darabszám),
`npm test`, `npm run test:learning-db`, `npm run test:e2e -- tests/admin-allowlist.spec.ts`, a gyökérben
`node scripts/qa/three-phase-check.mjs --base origin/main`. Utána PR, CI, review-szálak.

## V9 — utójavítás: szintetikus Gmail-tesztcímek (main piros, 24add8b6)

**Állapot:** folyamatban – 2026-11-16, ág `fix/cimor-szintetikus-gmail`

Ok: a #471 a `tests/player-account-db.integration.ts`-be szintetikus `gmail.com` / `googlemail.com` címeket hozott (a
Gmail-kanonizálás tesztje, a domain nem cserélhető). Javítás a `tests/no-real-emails-guard.test.ts`-ben:
- `isAllowedEmail(address, file?)`: a Gmail-domainen a pontos lista mellett FÁJLRA SZŰKÍTETT kivétel — csak a
  `SYNTHETIC_GMAIL_FILES` tesztfájlokban (`tests/player-account-db.integration.ts`, `tests/player-codes.test.ts`), és csak ha a kanonizált helyi rész (kisbetű, `+címke` és pontok nélkül)
  PONTOSAN szerepel a szintetikus listán (`SYNTHETIC_GMAIL_LOCALS`, `Set.has`, review #479 — nem előtag-egyezés: `k1tiltott`, `aliasproba`, `limitp`, `rotgoogle`, `rotkod`, `diakpelda`, `masik`, `k1-gold-unban`, `k1goldunban`, `k1felold2`, `k1baliaselotte`, `k1ketpeldany`, `k1zaralias` — a
  #475 címeit is lefedi).
- Ellenpróba: valódinak látszó `vezeteknev.keresztnev` helyi részű Gmail-cím ugyanabban a fájlban bukik; listás szóval kezdődő, de hosszabb helyi rész is bukik; a szintetikus szó más fájlban bukik.
