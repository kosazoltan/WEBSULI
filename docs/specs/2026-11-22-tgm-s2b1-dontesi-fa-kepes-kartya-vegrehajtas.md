# Végrehajtási utasítás — S2b-1: döntési fa és képes kártyák

Terv: [`docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md`](2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md). Közös szabályok:
`docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` 0. szakasz (tiltások, kapuk, böngészős próba, 0.7 funkciókapcsoló).

Ág: `feat/tgm-s2b1-v2` a friss `origin/main`-ről, munkafa `.claude/worktrees/tgm-s2b1`; az eredeti `feat/tgm-s2b-dontesi-fa-kepes-kartya`
commitjai `cherry-pick -x`-szel (rebase / force tilos). Fájlok: `shared/lesson-schema.ts`, `shared/lesson-visual-params.ts`,
`shared/lesson-block-label.ts`, `client/src/lesson-runtime/blocks/tree-cards.tsx` (új), `client/src/lesson-runtime/blocks/animate-blocks.tsx`,
`client/src/lesson-runtime/lesson-design.css`, `shared/fixtures/lesson-source-visuals.ts`, `client/src/lesson-runtime/LessonRuntimeProbe.tsx`;
tesztek: `tests/lesson-tree-cards.test.ts` (új), `tests/source-visuals.spec.ts` (bővül), `tests/studio-author-catalog.test.ts`.

1. Bukó tesztek V29–V31 (egység) és V32 (böngésző).
2. Kód.
3. `cd source` majd `node --import tsx --test tests/lesson-tree-cards.test.ts tests/lesson-source-visual-kinds.test.ts
   tests/source-coverage-gate.test.ts tests/source-visuals-flag.test.ts tests/studio-author-catalog.test.ts` → pass.
4. A főág új őrei: `tests/playwright-bundled-chromium-guard.test.ts` (#525, böngészőcsatorna-tilalom) és a többi őr-teszt a `gate:stage`
   őr-körében → pass.
5. Böngészős próba (0.4): `npx.cmd playwright test -c playwright.source-visuals.config.ts --workers=1` → passed.
6. `npm run gate:stage` a munkafa gyökeréből → ZÖLD; utána a 0.3 szerinti kapuk (push, vak ellenőr, PR) az orkesztrátor jelzésére.
