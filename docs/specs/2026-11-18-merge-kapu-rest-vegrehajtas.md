# Végrehajtás — a merge előtti kapu REST-en is fut

Terv: `docs/specs/2026-11-18-merge-kapu-rest.md`. Ág: `fix/merge-kapu-rest` (a friss mainről).

1. Ez a doksi-commit (terv + végrehajtás), a kód előtt.
2. `scripts/qa/gates/pre-merge-gate.mjs`:
   - új, exportált tiszta függvények: `prFromRest(pull, files, comments)` és `threadsFromCcr(list)` (a tervben leírt leképezés);
   - `main()`: `gh repo view` → `gh api repos/{owner}/{repo}`; `gh pr view --json` → a három REST-hívás + `prFromRest`;
     a review-szálak GraphQL-lekérdezése `try`-ban, hibánál `gh api repos/R/pulls/N/ccr/review_threads` + `threadsFromCcr`;
     ha az is bukik, a kivétel a meglévő „adatgyűjtés” FAIL-ba fut;
   - a kötelező ellenőrzések: a `branches/main/protection` 403-ánál a `branches/main` `protection` mezőjéből;
   - a független review után: a fájl- és kommentlista `--paginate --slurp` + `flattenPages` (csonka fájllista → kivétel), nem lista
     CCR-válasz → kivétel, a tartalékutak a kiváltó hibát naplózzák.
   - `decideMerge` és a többi lépés változatlan.
3. `scripts/qa/gates/pre-merge-gate.test.mjs`: `prFromRest` (open/clean/draft/sha/fájl/komment leképezés; `unknown`/`null`
   → `UNKNOWN`; `decideMerge` a leképezett PR-rel PASS) és `threadsFromCcr` (`resolved: true/false`, hiányzó mező → nyitott).
4. `docs/minosegkapuk.md` „Merge előtt” sor kiegészítése: REST-en gyűjt, a review-szálakat GraphQL-ről, felhőben a CCR-útról.
5. `node --test scripts/qa/gates/pre-merge-gate.test.mjs`, `npm run gate:stage`; élő próba felhőből: `npm run gate:merge -- 506`
   (az adatgyűjtésen túljut).
6. Független ellenőr (friss kontextusú alügynök) → ítélet a PR-be; PR; zöld CI; a saját kapuja; merge.

- [x] 1 · [x] 2 · [x] 3 · [x] 4 · [x] 5 · [ ] 6 (ellenőr: IGEN, FELTÉTELLEL → javítva; visszaellenőrzés, PR, CI, összevonás)

## Javítókör (2026-11-19, gazda: a helyi orkesztrátori munkamenet; vak ítélet a `c96e4801` fejre: IGEN, FELTÉTELLEL)

Terv: `docs/specs/2026-11-18-merge-kapu-rest.md`, „Javítókör a vak, hibakereső ellenőrzés után”. Minden pont előbb bukó teszttel.

7. `git merge origin/main` (rebase / force nincs).
8. K4, K6, K1: `prFromRest` — szerző (`user.login`, `user.type`, `author_association`) a leírásra és a kommentekre,
   `previous_filename`; `threadsFromCcr` — elemenként kötelező logikai `resolved`, üres lista → kivétel; új tiszta függvények:
   `trustedAuthor`, `verdictTexts`, `rootReviewComments`, `checkRunsFromPages`, `threadsFromGraphqlPages`.
9. K3: `collectMergeData({ exec, root, n, log, sleep })` — a `main()` adatgyűjtése, tesztelhető hamis `gh`-val; a `main()` ezt hívja.
10. K2: az ítélet-lépés a `verdictTexts` szűrt szövegeiből; a PR-leírás önbevallott ítélet-sorának cseréje a valódi vak ítéletre
    (a szöveg a scratchpadban készül; a PR szerkesztése a gazda / tulajdonos jóváhagyásával).
11. `node --test scripts/qa/gates/pre-merge-gate.test.mjs scripts/qa/gates/lib.test.mjs`; mutációs ellenpróba (másolaton);
    `npm run gate:stage`; `npm run gate:push`; vak visszanézés.
