# Végrehajtás — a vak hibakereső ellenőr futtató gépe (DeepSeek, OpenRouter)

Terv: `docs/specs/2026-11-18-vak-ellenor-deepseek.md`. Ág: `chore/vak-ellenor-deepseek` (a `chore/vak-hibakereso-ellenor`
tetejéről). Munkafa: `.claude/worktrees/vak-ellenor-deepseek`. Push / PR TILOS (csak az orkesztrátor jelére); új npm-függőség
TILOS; a kulcs semmilyen kimenetbe nem kerülhet (terv D2).

1. Ez a doksi-commit (terv + végrehajtás), a kód előtt.
2. `scripts/qa/gates/gates.config.json`: `blindReview` szakasz (modell, végpont, `mode`, `minToolCalls`, korlátok, tartalék-árak,
   `npmScripts`, `allowPlaywright`).
3. `scripts/qa/gates/blind-review/openrouter.mjs`: `loadApiKey({ env, readFile, localConfigPath })` (csak az `OPENROUTER_API_KEY`
   sort olvassa a mutatott `.env`-ből), `maskSecrets(text, key)`, `callOpenRouter({ fetchImpl, key, body, timeoutMs })` (a hiba
   szövege maszkolt és csonkolt), `usageCost(usage, fallbackPrices)`.
4. `scripts/qa/gates/blind-review/tools.mjs`: `resolveInside(root, p)` (útvonal-őr), `cleanEnv(env)` (engedélylista),
   `planCommand(argv, ctx)` (engedélylista → a ténylegesen indítandó `node …` argumentumtömb, vagy elutasítás), `makeTools(ctx)`
   (`read_file`, `list_dir`, `search`, `git_diff`, `git_log`, `git_show`, `run_command`, `write_temp_file`, `submit_report`) és a
   `TOOL_SCHEMAS`.
5. `scripts/qa/gates/blind-review/ts-sandbox-loader.mjs`: `module.registerHooks` — `.ts` / `.tsx` betöltése a munkafa `typescript`
   csomagjával, `@shared/` és `@/` álnevek, kiterjesztés nélküli importok.
6. `scripts/qa/gates/blind-review/evidence.mjs`: `buildBlindEvidence(...)`, `checkBlindEvidence({ evidence, head, reportSha256,
   verdict, cfg })`.
7. `scripts/qa/gates/blind-review/blind-review.mjs`: `parseArgs` (szigorú), `extractTemplate(skillText)`, `createBudget(limits)`,
   `runReview({ ... })` (a ciklus; `fetchImpl`, óra, eszközök injektálhatók), `prepareWorktree` / `cleanupWorktree`, `main`.
   `scripts/qa/gates/blind-review/futtato-kiegeszites.md`.
8. `scripts/qa/gates/record-review.mjs`: a `buildRecord` opcionális `blind` ellenőrzése + `--tulajdonosi-felmentes`; a `main`
   bekötése. A meglévő tesztek változatlanul zöldek (a `blind` paraméter nélkül a viselkedés a régi).
9. Tesztek (`scripts/qa/gates/blind-review/*.test.mjs` + a `record-review.test.mjs` bővítése): a terv B1–B13 pontjai hamis
   OpenRouter-válaszokkal; a homokozó valódi `node --permission` futással.
10. `package.json`: `gate:blind-review`. Dokumentáció: `docs/minosegkapuk.md` (új alszakasz), a skill forrása + tükre (rövid
    „így indítod” szakasz, bájtra azonos), `AGENTS.md` (egy sor a „Vak hibakereső ellenőr” szakaszban).
11. `npm run gate:stage`; mutációs ellenpróba (B14) a biztonsági őrökre — a védő sor ideiglenes kivétele szerkesztéssel, nem
    `git checkout`-tal (C-70), utána visszaállítás és zöld futás.
12. Mért alapvonal (terv „Mérési terv”): a `--goal` fájlok megírása a referencia megnyitása ELŐTT; két futás; összevetés; az
    eredmény a runbookba (`docs/minosegkapuk.md`) és a záró jelentésbe.
13. A `chore/vak-hibakereso-ellenor` legfrissebb állapotának beolvasztása (merge, nem rebase); `npm run gate:stage`, `npm run
    gate:push`; fej-hash az orkesztrátornak.

- [x] 1 · [x] 2 · [x] 3 · [x] 4 · [x] 5 · [x] 6 · [x] 7 · [x] 8 (felmentő kapcsoló nélkül) · [x] 9 · [x] 10 · [x] 11 · [x] 12 · [x] 13

## Kiegészítés — kizárólagosság, skill, szabályrendszer (2026-11-18) — végrehajtás

Terv: `docs/specs/2026-11-18-vak-ellenor-deepseek.md`, „Kiegészítés” fejezet (K1–K5). A fenti 8. lépésből a
`--tulajdonosi-felmentes` kapcsoló ELMARAD.

14. `gates.config.json`: `blindReview.requiredFrom`; `mirroredSkills` + `websuli-vak-ellenor`.
15. `scripts/qa/gates/lib.mjs`: a `resolveVerdict` opcionális `blind` paramétere (K1), a `verdictResult` üzenete (K5);
    `pre-pr-gate.mjs`, `pre-merge-gate.mjs`: a `blind` átadása; `scripts/qa/hooks/check-quality-gates.mjs`: az üzenet (K5).
16. Skill: `.agents/skills/websuli-vak-ellenor/SKILL.md` + tükör; a `websuli-fejlesztesi-ellenor` és a három kapu-skill hivatkozása.
17. Vezérlőfájlok (K4) + új `CLAUDE.md`; őr-teszt (`scripts/qa/gates/blind-review/rules-guard.test.mjs`).
18. Amint az első valódi futás sikeres: jelentés az orkesztrátornak parancs-mintával (K2).

- [x] 14 · [x] 15 · [x] 16 · [x] 17 · [x] 18

## 2. kiegészítés — modellcsere, géppel ellenőrzött leletek, prompt-gyorsítótár (2026-11-18) — végrehajtás

Terv: `docs/specs/2026-11-18-vak-ellenor-deepseek.md`, „2. kiegészítés” (M1–M4) és „3. kiegészítés” (C1–C5).

19. `gates.config.json`: `blindReview.model` = `qwen/qwen4-max`; `maxUsdDefault` 2, `maxUsdHardCap` 6; `promptCache`; a tartalék-árak a
    gyorsítótár olvasási / írási árával; `commandTimeoutSec` a gyorsítótár élettartama alatt.
20. `scripts/qa/gates/blind-review/findings.mjs`: `verifyFindings` (hivatkozás- és futtatás-ellenőrzés, ítélet-összhang),
    `summaryMarkdown` (gépi összegzés); a `submit_report` eszköz `findings` tömbje; a futtató parancsnaplója (`runLog`).
21. `blind-review.mjs`: `withCacheMarkers` (töréspontok a kérés MÁSOLATÁN), csak bővülő üzenetlista, `session_id`, hívásonkénti
    `cached_tokens` / `prompt_tokens` a bizonyítékban, `cacheStats`, gyorsítótár-tudatos plafon-becslés; a munkafa abszolút útvonala
    nem megy ki a modellnek.
22. Tesztek: `findings.test.mjs`; az előtag bájtazonossága körről körre és a töréspontok helye (`blind-review.test.mjs`); mutációs
    ellenpróba (időbélyeg az előtagban → bukik).
23. A szövegek modellneve mindenhol a konfigurált modell; az alapvonal-mérés a Qwen4 Max modellel, a bejáratás DeepSeek-eredménye
    összehasonlításként.

- [x] 19 · [x] 20 · [x] 21 · [x] 22 · [x] 23

## 4. kiegészítés — kapcsolható kizárólagosság, böngésző és adatbázis, részben igazolt próba (2026-11-18) — végrehajtás

Terv: `docs/specs/2026-11-18-vak-ellenor-deepseek.md`, „4. kiegészítés” (E1–E4).

24. `gates.config.json`: `exclusive: false`, `exclusiveSince: null` (a `mode` / `requiredFrom` helyett); `maxHeavyRuns`,
    `heavyTimeoutSec`, `heavyWaitMaxSec`. `lib.mjs` (`blindRequired`, `acceptRecordedReview`), `record-review.mjs` (`blindSupplement`),
    a hook és a kapu-üzenetek.
25. Szövegek: a „Ki az ellenőr” jelölt bekezdés (AGENTS.md, skill) = a mai szabály + a futtató mint kiegészítő + az átállás feltétele;
    `CLAUDE.md`, Cursor / Copilot / Codex, runbook, a `websuli-vak-ellenor` és a kapu-skillek; memória.
26. `scripts/qa/gates/blind-review/heavy.mjs`: `assertSafeHeavyEnv`, sorompó, saját konténer takarítása, a forgatókönyv érvényesítése;
    `scenario-runner.spec.ts.txt` (a futtató rögzített spec-je, a munkafába másolva); eszközök: `run_db_tests`, `run_e2e`,
    `run_browser_scenario`; képek visszaadása a modellnek.
27. `findings.mjs`: `run.input`, `run.scope`, a parancs fajtája → „részben igazolt”; összegzés-oszlop.
28. Tesztek + mutációs ellenpróba; `gate:stage`; újramérés (nehéz kör csak 22:15 UTC után, sorompóval); `gate:push`.

- [ ] 24 · [ ] 25 · [ ] 26 · [ ] 27 · [ ] 28
