# Végrehajtási utasítás — autonóm tananyagkészítő ökoszisztéma

Munkakönyvtár: `D:\repo\WEBSULI\source`, ha másképp nincs jelölve. Sorrend kötelező.

## A. Dirty munka beolvasztása (PR 1)

1. `.gitignore` (repo gyökér): új sorok `.playwright-mcp/` és `test-results/`.
2. `server/routes.ts:762` — a like-lookup ág `return next()` helyett `return enforceOriginAllowlist(req, res, next)`.
   `tests/csrf-origin.test.ts` új tesztje: engedélyezett Origin (`https://websuli.example`) → nem 403;
   új assert: `Origin: https://evil.example` → 403.
3. Futtatás: `npm run check && npm run check:test && npm run lint && npm test`. Elvárt: exit 0, 0 bukás.
4. Branch `feat/merge-2026-09-14-work`; stage: minden módosított/új forrás- és tesztfájl + a 14 spec
   + `.gitignore`. NEM stage: `.playwright-mcp/`, `test-results/`. Commit, push, PR, CI zöld, merge.

## B. Autonóm forrásellenőrzés (PR 2, 1. szelet)

5. `server/studio/verbatim.ts`: `export function relocateQuote(quote, sourceText): string | null`.
   Normalizált idézet (`normalizeForCompare`) és forrás; ha idézet < 3 szó vagy hosszabb a
   forrásnál → `null`. Szóhatárra igazított csúszóablak a forrás eredeti (nem normalizált)
   szövegén; ablakhossz = normalizált idézet hossza ±15 %; hasonlóság = 1 − levenshtein/max(len).
   Küszöb 0,90. Visszaadás: az EREDETI forrásszöveg részlete (trim). Teljesítmény: a jelölt
   kezdőpontokat az idézet első két szavának (vagy első szavának) előfordulásaira szűkítsd; ha
   nincs ilyen, minden szóhatár kezdőpont, de a forrás ≤ 200 000 karakter.
6. `server/studio/source-transcript.ts` `repairSourceQuotes`: a modellkörök ELŐTT minden
   `verbatimOk=false` fogalomra `relocateQuote`; találatnál `quote` csere + újraellenőrzés.
7. `server/studio/auto-approve.ts`: `export function autonomousApprovalDecision(concepts: {examWeight, verbatimOk, reviewState}[]): { ok: true; excluded: string[] } | { ok: false; reason: string }`
   — élő = nem rejected; `verifiedCore = core && (kept|edited)`; `pendingCore = core && pending`;
   `ok` ha `verifiedCore ≥ 1` és `(kept+edited)/élő ≥ 0,6`; `excluded` = pending fogalmak id-i.
   Különben `reason` magyarul a számokkal.
8. `server/studio/lesson-pipeline-routes.ts` sourceCheck ág (jelenleg 365–437):
   a) a pending fogalmakra a tárolt `sourceFiles[].extractedText` (`sourceTextForReference`) ellen
      `relocateQuote` → találatnál `quote`, `verbatimOk=true`, `verbatimReason=null` DB-frissítés;
   b) `autoReviewDecision` a maradékra (változatlan);
   c) `canApprove` helyett `autonomousApprovalDecision`; `ok:false` → `phase:"error"` az okkal
      (nem `parked`); `ok:true` → térkép `approved`, `sourceGapNote` = „N kulcsfogalom idézete
      nem igazolható, ezért nem került a tananyagba: <term…>. A forrásjegyzékben javítható."
   d) `startJobFromMap` után, ha van `sourceGapNote`: `studioJobs.output = { qualityNotes: [note] }`
      (ellenőrizd, hogy a `successPatch` `...job.output` spreadje megőrzi; ha a gate felülírja a
      `qualityNotes`-t, ott összefűzés);
   e) `driveOneStep` `done` ágán a `detail` végére a note.
9. `server/studio/step-runner.ts:1085` és `:1306`: `ne(reviewState,"rejected")` →
   `inArray(kmConcepts.reviewState, ["kept","edited"])`.
10. Tesztek: `tests/studio-verbatim.test.ts` (+relocateQuote: OCR-zaj két valós éles példával;
    parafrázis → null; 2 szavas → null); `tests/studio-auto-approve.test.ts` (+autonomous: 3 pending
    core / 49 → ok + excluded; 0 verified core → not ok; kézi `canApprove` változatlan);
    `tests/studio-source-transcript.test.ts` (+relokáció modellhívás nélkül).
    Futtatás: `node --import tsx --test tests/studio-verbatim.test.ts tests/studio-auto-approve.test.ts tests/studio-source-transcript.test.ts tests/studio-one-step*.test.ts tests/lesson-pipeline-runner.test.ts`. Elvárt: 0 bukás.

## C. Lektor tartalék + bankcsomag + PDF (PR 2, 2. szelet)

11. `server/ai/models.ts` `FALLBACK_MODELS`: `lektor: "anthropic/claude-sonnet-5"`. Előtte valódi
    ellenőrzés: OpenRouter `/api/v1/models` tartalmazza; egy 1 mondatos hívás a helyi
    `OPENROUTER_API_KEY`-jel 200-at ad (érték nem kerül kiírásra).
    `tests/models-routing.test.ts`: `assertDistinctFamilies` a tartalékkal is átmegy.
12. `server/studio/web-teaching-review.ts` `callTeachingReviewer`: primer `StepModelError` esetén
    `FALLBACK_MODELS.lektor` egyszeri újrapróba; mindkét hiba esetén a primer hiba dobódik.
13. `server/studio/experience-builder.ts:161`: `attempt < 2` → `attempt < 3`. Teszt:
    meglévő builder-teszt bővítése: 2 hibás válasz után a 3. érvényes → csomag elkészül.
14. `server/studio/document-source.ts`: `sniffSourceKind(buffer)`; `kind:"pdf"` + képbájtok →
    `{...file, kind:"image", content: "data:image/<mime>;base64,…"}` (extractedText nélkül, az
    OCR később tölti); `getDocument` try/catch → `transcribePdf` ha van, különben
    `Error("A PDF nem olvasható (sérült vagy titkosított): <pdfjs üzenet>")`.
    `tests/document-source.test.ts`: JPEG-bájtos „pdf" → image; sérült PDF + transcribePdf → átirat;
    sérült PDF transcribePdf nélkül → magyar hiba.
15. Kapuk: `npm run check && npm run check:test && npm run lint && npm test`. Elvárt: exit 0.

## D. Valódi végponttól-végpontig próba (helyi folyamat, éles DB, valódi modellek)

16. `scripts`-en kívüli ideiglenes tsx-szkript (scratchpad): betölti `.env`-et, meghívja a
    sourceCheck-logikát a `08af437e…` térképre (relokáció + autonóm döntés), majd
    `startJobFromMap` + `driveOneStep`. Elvárt: `studio_jobs.step = done`, `lessons.published_at`
    kitöltve, `html_files` sor; a run `detail` tartalmazza a kimaradt fogalmat (`hagymafej`).
17. Valódi PDF-forrás: scratchpadben generált 2 oldalas szöveges PDF (természetismeret 5. o.)
    + ugyanaz JPG-ként; `runOneStep` mindkettőre. Elvárt: `phase:"done"`, `htmlFileId`.
18. Böngészőben (valódi Chrome) a `/preview/<htmlFileId>` megnyitása: 4 lap látható, Feladatok
    ≥45, Kvíz ≥75 tétel — képernyőkép.

## E. Kiadás

19. Branch `feat/autonomous-lesson-pipeline`; commit(ok); `.audit-ok` sentinel a kapuk után külön
    hívásban; push; PR; CI zöld; merge. Vercel + Render deploy READY ellenőrzése
    (`/api/health`, élő `assets/index-*.js` hash).
20. `docs/lesson-improvement.md` 1. szakasz utolsó pontja: az egylépéses úton a pending
    kulcsfogalom nem tanítható, nem blokkol, a run jelzi; kézi úton változatlan.
21. Memória + LEDGER bejegyzés; záró jelentés: futtatott parancsok kimenetével, NOT RUN tételekkel.
