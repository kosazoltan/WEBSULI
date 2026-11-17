# Retro — Játékok utómunka: piros main, E2E-ablakok, kérdésbank-mérés (2026-11-16 este – 2026-11-17 hajnal)

Előzmény: `docs/handoffs/2026-11-16-jatekelmeny-fiok-retro.md`. Mért tényekből (`gh pr view`, `gh run list`, `gh api …/protection`,
a Render-napló). Időpontok UTC; Europe/Budapest (CET, UTC+1) szerint egy órával későbbiek.

## 1. Mért tények

| PR | Összevonva (UTC) | Fej a mainen | Tartalom |
|---|---|---|---|
| #471 | 2026-11-16 21:10:56 | `5cb3cd3e` | tiltás-ujjlenyomat, szintetikus Gmail-tesztcímek |
| #474 | 2026-11-16 21:41:53 | `38861d28` | címőr-teszt (repó-szintű) |
| #466 | 2026-11-16 21:45:51 | `24add8b6` | J4b Matek főellenfél |
| #479 | 2026-11-16 23:44:23 | `f7894087` | címőr: pontos szintetikus helyirész-lista |
| #478 | 2026-11-17 01:16:33 | `76cf426a` | kérdésbank memóriajavítás |
| #477 | 2026-11-17 01:17:09 | `bab40853` | lejárt kupon minden kuponos játékot megállít |
| #480 | 2026-11-17 01:17:31 | `eb2a4ebe` | megoldás-kijelzés az első képkockától |

- **Piros main:** a `38861d28` és a `24add8b6` CI-ja is bukott (Unit Tests, mindkét natív futás; a `38861d28`-on a Playwright E2E is).
  A főág a #474 összevonásától (21:41:53Z) a #479-ig (23:44:23Z) **2 óra 2,5 perc** (Budapest: 22:41 – 00:44) volt piros; a #479 CI-ja
  (`f7894087`, 23:44:26Z) zöld. A nyitott #475, #476, #477, #478, #480 Unit Tests + natív jobja piros lett.
- **Kötelező ellenőrzések** (`gh api repos/kosazoltan/WEBSULI/branches/main/protection`): Háromfázisú rend, Lint & Typecheck, Unit
  Tests, Playwright E2E. A Playwright E2E ~1 óra (#477: 23:54Z–00:54Z).
- **Kérdésbank (#478), éles mérés 2026-11-17 01:21Z (Render-napló):** hideg építés 12 677 ms a 0,5 CPU-s példányon (terv: ≤ 2 s —
  NEM teljesül; fejlesztői gépen 2,0–3,5 s), meleg 9–56 ms szerveroldalon, 2,86 MB gzip válasz játékonként, memóriahiba-naplósor a
  telepítés óta 0.

## 2. Mi ment rosszul és mennyibe került

1. **A címőr összevonása elavult zöldre** (C-61): a #474 a #471 előtti CI-zöldjén ment be; a main 2 óra 2,5 percig piros, minden
   nyitott PR jobja vele piros. A #479 első, előtag-egyezéses kivételét a review-bot jogosan kifogásolta; pontos listára cserélve.
2. **Javaslat a kötelező E2E kihagyására** (C-63): az alügynök „csak tesztfájl változott” alapon; megvártuk, ~1 óra.
3. **A zöld CI utáni doksi-commit** (C-62): a #477-re 23:08Z-kor feltöltött doksi-commit újraindította az E2E-t, ami a piros mainnel
   együtt tesztelt; a PR kiesett az ablakból.
4. **#476 három review-kör** (C-68): a token-forgatás javítása két új hibát hozott, a visszaellenőrző kör fogta meg.
5. **#478 átfedő-építés hiba** (C-69): a független review találta; a PR-ban javítva. A tervcél hideg építésre az éles gépen nem teljesül.
6. **Elveszett commitolatlan javítás** (C-70): `git checkout <fájl>` a mutációs visszaállításnál.
7. **E2E-ingadozók** (C-64, C-65, C-66): poll-verseny, külső időmérés, laponként foltozott megállítás.

## 3. Mit javítottunk ebben a futásban

- `source/tests/no-real-emails-guard.test.ts`: pontos lista + ellenpróbák (#479).
- `source/server/gameQuizBankService.ts`: egy-építés korlát (#478).
- Közös `GAME_HALT_EVENT` / `requestGameFrame`: a lejárt kupon minden kuponos játékot megállít (#477).
- `source/client/src/game-engine/play/questionUi.ts`: a megoldás-kijelzés az első képkockától számít (#480).
- Ez a doksi-PR: `docs/agent-csapdak.md` C-61…C-72, ez a retro, `docs/telepites-elotti-or.md`.
- Összevonási ablakok: #479 külön (a main helyreállítása), majd #478 + #477 + #480 egy percen belül (01:16:33Z–01:17:31Z), mindegyik
  előtt futásőrrel (`scripts/qa/active-runs-guard.sh`).

## 4. Kanbanra került

#71 kérdésbank utómunka (lenyomat-lekérdezés, előmelegítés, válaszméret) · #72 további „mindent beolvas” végpontok · #73 3–4 fős szoba
beragad visszavágó közbeni kilépés után · #74 szünet alatt futó 3D-rajzolás · #75 ritka holtpont a tiltás feloldása és a fióktörlés között.
(A kanbanszámokat a megbízás adta; a kanban-tárból ebben a PR-ban nem ellenőriztük: UNVERIFIED.)

## 5. Maradék kockázat

- A kérdésbank hideg építése a célgépen ~12,7 s: az első kérés lassú (kanban #71).
- Az elavult őr-zöld és a zöld CI utáni push szabályát (C-61, C-62) gép nem kényszeríti ki, csak a katalógus.
