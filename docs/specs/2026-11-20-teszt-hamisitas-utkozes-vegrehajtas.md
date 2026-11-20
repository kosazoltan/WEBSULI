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
