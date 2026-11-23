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
8. K4, K6, K1: `prFromRest` — `previous_filename`; `threadsFromCcr` — elemenként kötelező logikai `resolved`, üres lista → kivétel;
   új tiszta függvények: `rootReviewComments`, `checkRunsFromPages`; a GraphQL-szálak lapozása a `collectMergeData`-ban.
9. K3: `collectMergeData({ exec, root, n, log, sleep })` — a `main()` adatgyűjtése, tesztelhető hamis `gh`-val; a `main()` ezt hívja.
10. (Első kör: K2 szerző-szűrés — a második vak kör V1 döntése szerint kivezetve.) A PR-leírás önbevallott ítélet-sorát a gazda
    cseréli a feltöltés előtt (a szöveg a scratchpadban: `body-513-uj.md`).
11. Első kör ellenőrzése: 20 teszt, mutáció 16 / 17; szakasz- és push-kapu zöld (`469b6cda`).

## Második javítókör (2026-11-19; vak ítélet a `469b6cda` fejre: IGEN, FELTÉTELLEL, V1–V6)

Terv: `docs/specs/2026-11-18-merge-kapu-rest.md`, „K2 → V1” és az utána álló pontok.

12. V1: `mergeVerdict(pr, evidence, blind)` — ítélet KIZÁRÓLAG helyi bizonyítékból (`texts: []`); a `trustedAuthor` /
    `verdictTexts` / `TRUSTED_ASSOCIATIONS` és a PR-leírás / kommentek leképezése kikerül; a kommentlistát a kapu nem kéri le.
13. V2: `mergeSteps({ data, evidence, external, guard, rt, cfg })` — a `main()` lépés-összerakása, a `cfg.blindReview` továbbadásával;
    teszt: a leírás ítélet-sora bizonyíték nélkül FAIL, helyi IGEN PASS, helyi NEM FAIL.
14. V3: üres CCR-lista csak a REST 0 gyökérkommentje mellett (`threadsFromCcr(list, { allowEmpty })`). V4: hiányzó `total_count` → FAIL.
15. V6: `docs/minosegkapuk.md` „Merge előtt” sora és az „Ismert korlátok” ítélet-pontja. V5: jegy (a szöveg a scratchpadban).
16. Célzott tesztek (`pre-merge-gate.test.mjs`, `lib.test.mjs`); mutációs ellenpróba (19 / 19); szakasz-kapu; 05:30 UTC után a
    push-kapu; vak visszanézés.

## Harmadik javítókör (2026-11-19; vak ítélet a `10e79d78` fejre: IGEN, FELTÉTELLEL, W1–W4)

Terv: `docs/specs/2026-11-18-merge-kapu-rest.md`, „W1”, „V3 → W2”, „W4” és a „Cél” / EARS pontosítása.

17. W1: `mergeVerdict` szigorú módban csak a futtató rekordját fogadja el; `mergeSteps`-teszt `exclusive: true`-val (sima rekord
    FAIL, futtató-rekord PASS); előbb bukó mutáns (`blind` helyett `null`).
18. W2: az üres CCR-lista csak teljesen üres review-kommentlistánál megy át, teszttel (csak válasz-komment → FAIL).
19. W3: a terv „Cél” és EARS pontjai; a javasolt új PR-cím a scratchpad `body-513-uj.md` tetején (a címet a gazda módosítja).
20. W4: jegy-szöveg a scratchpadba. Ellenőrzés: célzott tesztek, mutáció, szakasz- és push-kapu.

- [x] 17 · [x] 18 · [x] 19 (Cél / EARS a tervben; a PR címe és leírása frissítve) · [x] 20 (W4 → SQL-feladat #399, V5 → #400)

## Negyedik és ötödik javítókör (2026-11-22; vak kör 1 és 2)

Terv: `docs/specs/2026-11-18-merge-kapu-rest.md`, „Negyedik és ötödik javítókör”.

21. Kör 1, L1–L6: induláskori érvénytelenítés, késői main-csúcs a C-61-hez, szigorú REST/GraphQL-alak, runbook (`ccb0ce33`).
22. Kör 2, L1–L2: késői kötelező lista a 403-as úton, PR-enkénti zár + futásazonosító (`21780cc5`).
23. `git merge origin/main` (rebase / force nincs); célzott tesztek; szakasz- és push-kapu; helyi GPU-ellenőr
    (`local-review.mjs`) az új fejre; push; zöld CI; merge-kapu. Az összevonás a gazda dolga.

- [x] 21 · [x] 22 · [ ] 23
