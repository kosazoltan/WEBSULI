# WEBSULI javítás — CHECKPOINT / megszakadás-védelem

> single source of truth a folytatáshoz. Compaction/restart után ELŐSZÖR ezt olvasd.
> Kontextus-védelem: midTurnPrecheck (minden tool után) + memoryFlush 150K. Blokk-határon frissítsd.

## Állapot-tábla (2026-06-24 ~02:10)
| Blokk | Sub-task | Státusz | Bizonyíték |
|---|---|---|---|
| A1 | CSRF Origin-check | ✅ ESZTER PASS | routes.ts:755-779; csrf-origin.test.ts 3p |
| A2+E1 | git-titok+szemét untrack | ✅ DONE | 7 fájl git rm --cached; .gitignore |
| A3 | static-audit guard+prod404 | ✅ ESZTER PASS | static-audit.ts; 2p |
| A4 | error-report HMAC+ratelimit | ✅ ESZTER PASS | error-report.ts+mailer; 4p |
| B1 | ban-enforcement | ✅ ESZTER PASS | auth.ts:152+188 |
| B2 | session-fixation | ✅ ESZTER PASS | auth.ts:192 regenerate |
| B3 | DB SSL prod | ✅ ESZTER PASS | db.ts:35 |
| B4 | errorLogs migráció | ✅ ESZTER PASS | migrations/0006_error_logs.sql |
| C1 | AI payload limit | ✅ ESZTER PASS | ai-payload-guard.ts + index.ts:315 |
| C2 | AI timeout/retry wrapper | ✅ ESZTER PASS | ai-provider-wrapper.ts; routes.ts:1178,1266 |
| C3 | DB tranzakciók | ✅ ESZTER PASS | quizGen tx, score upsert, routes inArray |
| E2 | CI merge-gate | ✅ DONE | .github/workflows/ci.yml |
| E4 | vite dead chunk | ✅ DONE | ai-vendor törölve |
| D2 | streak/combo best-track | ✅ IMPL | BlockCraft bestStreakRef+Space bestComboRef; tsc=0 |
| D3 | diamond stat | ✅ IMPL | BlockCraft totalDiamondsRef (valódi DIAMOND); tsc=0 |
| D1 | Three.js scene mount | ✅ IMPL | BlockCraft phaseRef + [] dep |
| D4 | input blur+timeout cleanup | ✅ IMPL | BlockCraft+Space blur; Space timeoutsRef+pushTimeout; SpeedQuiz/BrainRot registry |
| D5 | RAF re-render throttle | ✅ IMPL | BrainRot 100ms throttle |
| D6 | a11y dialog+Games | ✅ IMPL | Tsunami+Space role=dialog/aria-modal; Games asChild. Keyboard-only (BlockCraft look) = follow-up |
| E3 | Logger infrastruktúra | ✅ IMPL | server/lib/logger.ts + client/src/lib/logger.ts; tsc=0. 851+59 csere fokozatos follow-up. |
| F | közös játékmotor | ⏳ TODO | külön spec |

## KÖVETKEZŐ LÉPÉS
> TELJES D-BLOKK (D1-D6)+E3 ESZTER PASS (2026-06-24 02:40): tsc=0, 9/9 teszt, test_integrity_scan PASS, reward-hack tiszta, minden sub-task fájl:sor bizonyítva.
> ÖSSZ-ÁLLAPOT: A+B+C+D+E2/E3/E4 mind ESZTER PASS / DONE. CSAK Bence release-gate van hátra.
> KÖVETKEZŐ: Bence (secops) release-gate — secret-scan, lint, git add/commit/branch. Bence az EGYETLEN aki commitol/pushol.
> Follow-up (nem blokkoló, F-fázis): D6 keyboard-only BlockCraft; E3 851+59 console csere fokozatos; F közös játékmotor (külön spec).

## D-blokk fix-pontok (MELY-ELEMZES alapján)
- D1 BlockCraftQuiz.tsx:1456 Three.js scene phase-effect → mount-szintű
- D2 streak/combo: SpaceAsteroidQuiz.tsx:1961(+1264,1617), BlockCraftQuiz.tsx:1930(+1357-58) bestComboRef
- D3 BlockCraftQuiz.tsx:1932 diamondsMinedRef (csak DIAMOND)
- D4 input-cleanup: blur-reset (BlockCraft:1438, Space:1918) + timeout-registry (SpeedQuiz/BrainRot/Tsunami)
- D5 BrainRotSteal.tsx:466-525 RAF re-render fojtás
- D6 a11y: quiz-overlay dialog (Tsunami:1601,Space:2280,BlockCraft:2309) + keyboard (BlockCraft:1432) + Games.tsx:369 button-in-Link

## RELEASE-INFO (Bence-gate-hez)
> A git working-tree-ben VANNAK nem-spec módosítások is (.agentic-qa-kit.json, .claude/settings.json, scripts/qa/hooks/*, AGENTS.md, pull_request_template.md, enforce-repo-rules.mjs) — ezek EGY MÁSIK folyamat (QA-kit) termékei, NEM a WEBSULI biztonsági/játék-spec részei. Bence CSAK a spec-fájlokat stage-elje.
> SPEC-VÁLTOZÁSOK (release scope):
>   Módosított: source/server/{auth,db,routes,index}.ts, routes/{error-report,static-audit}.ts, lib/error-mailer.ts, gameQuizGeneratorService.ts, gameScoreService.ts, vite.config.ts; client/src/pages/{BlockCraft,Space,Tsunami,BrainRot,SpeedQuiz}.tsx, Games.tsx
>   Új: source/server/lib/{ai-payload-guard,ai-provider-wrapper,logger}.ts, client/src/lib/logger.ts, source/tests/{csrf-origin,static-audit-guard,error-report-hmac}.test.ts, source/migrations/0006_error_logs.sql, .github/workflows/ci.yml
>   Törölt (untrack): Gemini.jpg, source/KEY_TO_UPLOAD.txt, source/deploy_package*.zip, vault/infrastructure/github-secrets-canonical.md
>   .gitignore bővítve. + .harness/ (spec/notes/backups — NE commitold a backupokat, .gitignore-old vagy hagyd ki)

## Backupok: .harness/backups/ (auth, db, routes, improveAsync, index, vite — mind .bak.<ts>)
