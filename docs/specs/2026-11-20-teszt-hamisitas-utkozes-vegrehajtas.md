# Végrehajtás — a tesztek „hamisítása” mindig eltérő értéket adjon (2026-11-20)

Terv: `docs/specs/2026-11-20-teszt-hamisitas-utkozes.md`. Ág: `fix/teszt-1-4096-ingadozas` (az origin/main-ről, `d9d1e6c6`),
munkafa: `.claude/worktrees/teszt-utkozes`. Push / PR nincs (orkesztrátori jel kell); a nehéz kör (`gate:stage && gate:push`) a
kapu-sorban `teszt-utkozes` néven.

1. Ez a doksi-commit (terv + végrehajtás), a kód előtt.
2. Bukó bizonyíték: `source/tests/support-tamper.test.ts` (új) — a régi hamisítás kényszerített `…xx` / `…AA` végződésnél az
   eredetivel azonos értéket ad (A3); a még nem létező `tests/support/tamper.ts` segédre hivatkozó esetek a javítás előtt bukanak.
3. `source/tests/support/tamper.ts`: `withDifferentChar(value, index)` (A1, A2, terv 4–5.).
4. `source/tests/support/player-google-stub.ts:65` → `withDifferentChar(state, -1)`; `source/tests/rt-ticket.test.ts:45` →
   az aláírás első karakterének cseréje (A4).
5. Célzott egységtesztek (`support-tamper`, `rt-ticket`), `npm run gate:stage`, majd a kapu-sorban `gate:stage && gate:push` (A5);
   az új fej és a NOT RUN tételek jelentése.

- [x] 1 · [x] 2 · [x] 3 · [x] 4 · [ ] 5 (kapu-sor: teszt-utkozes)

## Kiegészítés — a vak ellenőr 1. köre (GPT-6.2 Sol: NEM, 022032fd) — végrehajtás

Terv: `docs/specs/2026-11-20-teszt-hamisitas-utkozes.md` (A3 pontosítva, A6–A7 új, 2. és 5. szakasz pontosítva).

6. Bukó bizonyíték: L4 — `withDifferentChar("x".repeat(32), -1 - Number.EPSILON)` nem dobott (futtatva); L2 — offline kulcskeresés
   (`harness-secret-5188596` → `…AAAA` token, a régi hamisítást a `parseLearnerToken` elfogadja); az új rögzített esetek a
   `support-tamper.test.ts`-ben (L1: rögzített `…xx` state, rögzített `…AA` jegy befagyasztott órával; L2; L4) — L4 a javítás
   előtt bukott.
7. `source/tests/support/tamper.ts`: az eredeti index egész voltának ellenőrzése a normalizálás előtt (L4).
8. `source/tests/player-account-db.integration.ts`: 306. sor → `withDifferentChar(token, -1)` (L2); `wrongLoginCode(email)` a kódrekordok
   lenyomatai alapján + új DB-eset a kiadott `00000000`-ra (L3).
9. Célzott egységtesztek, `tsc`; a kapu-sorban (`teszt-utkozes`) `gate:stage && gate:push`, valamint a DB-kör (`test:learning-db`).

- [x] 6 · [x] 7 · [x] 8 · [ ] 9 (kapu-sor)
