# Végrehajtás — kontextus-diéta

Terv: `docs/specs/2026-11-28-kontextus-dieta.md`. Ág: `chore/kontextus-dieta`.

1. `docs/agent-szabalyok.md`: az `AGENTS.md` 95–210. sorának (Review guidelines … Aktív munkafázis-követés) és a 6–14. sor
   (Alapelvek) szó szerinti másolata, fejléc-mutatóval. Ellenőrzés: `sed -n 95,210p AGENTS.md | diff - <(…)` jellegű szövegegyezés.
2. `docs/agent-szabalyok-codex-protokoll.md`: az `AGENTS.md` 211–244. sora (CHATGPT_CODEX_PROTOCOL) szó szerint.
3. `AGENTS.md`: a két tartomány helyére tömör szabály + mutató; kezelt blokkok változatlanok. Ellenőrzés: `wc -c AGENTS.md` ≤ 12 288;
   `git diff` a kezelt blokkokon belül üres.
4. Hivatkozó sor a frontmatter után minden `.agents/skills/*/SKILL.md`-ben, majd `node scripts/qa/gates/skills-sync-check.mjs --fix`;
   a nem tükrözött `.claude/skills` skillbe kézzel. Ellenőrzés: `node scripts/qa/gates/skills-sync-check.mjs` → 0.
5. `source/tests/context-diet-guard.test.ts`: méretkorlát + hivatkozó sor. Ellenőrzés:
   `cd source && node --import tsx --test tests/context-diet-guard.test.ts` → pass.
6. Kapuk: `npm run gate:stage` → `npm run gate:push` → `node scripts/qa/gates/local-review.mjs` → `npm run gate:pr -- --body-file …`.
7. Worktree-higiénia: `D:\repo\wt-windows-x64-WEBSULI` — mergelt + tiszta → `git worktree remove`, különben jelentés.
