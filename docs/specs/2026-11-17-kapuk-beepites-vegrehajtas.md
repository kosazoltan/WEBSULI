# Végrehajtás: A minőségkapuk mély beépítése — A) rész

Terv: `docs/specs/2026-11-17-kapuk-beepites.md` (és `docs/specs/2026-11-17-vezerles-dieta.md` 10. pont a B) részhez)
**Állapot:** A) rész folyamatban (ág: `chore/kapuk-beepites`); B) rész a #490 összevonása után.

Munkafa: `D:\repo\WEBSULI\.claude\worktrees\kapuk-beepites`; minden parancs a munkafa gyökeréből. Minden feladat után:
`npm run gate:stage` (csak zöld után tovább).

## 1. CI statikus kapu

- Új fájl: `scripts/qa/gates/ci-static-gate.mjs` — `createGate('ci-static-gate')`, `makeContext({ base })`; két lépés:
  „repó-szabályok a diffre” (`applyRepoRules` + az `enforce-repo-rules` hook, `classifyHookOutput`) és „tiltott minták a diffben”
  (`scanAddedLines`), a `lint-gate.mjs` exportjaival. Kapcsoló: `--base <ref>` (alap: `origin/main`). Kilépés 1 bármely FAIL-nál.
- Új teszt: `scripts/qa/gates/ci-static-gate.test.mjs` — ideiglenes git-repóban: tiszta diff → 0; `.only(` tesztfájlban → 1, a
  kimenetben nincs a sor értéke.
- `.github/workflows/ci.yml` `three-phase` job: új lépés a „Háromfázisú rend ellenőrzése” elé:
  `node scripts/qa/gates/ci-static-gate.mjs --base origin/${{ github.base_ref }}`.
- Ellenőrzés: `node --test scripts/qa/gates/ci-static-gate.test.mjs` → pass; `node scripts/qa/gates/ci-static-gate.mjs` → 0.

## 2. Opt-in git pre-push hook

- Új fájl: `scripts/qa/hooks/git-pre-push.mjs` — stdin: `<helyi ref> <helyi sha> <távoli ref> <távoli sha>` soronként; minden nem
  nulla helyi sha-ra zöld `pre-push-<sha>` vagy `pre-pr-<sha>` bizonyíték kell (`evidenceDir(git common dir)`); különben 1 + teendő.
- Új fájl: `scripts/qa/hooks/install-git-hooks.mjs` — `--install` (alap) / `--uninstall` / `--status`; a `<git-common-dir>/hooks/pre-push`
  fájlba egy `#!/bin/sh` burkoló kerül jelölő sorral; idegen hook vagy `core.hooksPath` → nem ír, 1; eltávolításkor archivál.
- Új teszt: `scripts/qa/hooks/install-git-hooks.test.mjs`.
- Ellenőrzés: `node --test scripts/qa/hooks/install-git-hooks.test.mjs` → pass. A telepítőt a tulajdonos gépén NEM futtatjuk.

## 3. Codex-felhő

- Új fájl: `scripts/qa/codex-cloud-setup.sh` (LF) — `node --version` ≥ 22 ellenőrzés; `npm ci` a `source/`-ban; Playwright chromium
  (`npx playwright install --with-deps chromium`, hiba → figyelmeztetés); a `gh` megléte (hiány → figyelmeztetés: a `gh`-s lépések
  SKIP); a végén `npm run gate:lint -- --fast` próbafutás.
- `docs/codex-felhokornyezet.md`: „Minőségkapuk a felhőben” szakasz — melyik kapu fut (lint, stage, push részben), melyik nem
  (hook, merge-kapu), a kézi sorrend, és hogy a telepítőt a környezet „setup” parancsába kell tenni (tulajdonosi lépés).

## 4. Cursor, skillek, runbook

- `.cursor/rules/websuli-core.mdc`, `.cursor/rules/haromfazisu-munka.mdc`: egy-egy sor → `minosegkapuk.mdc` / `docs/minosegkapuk.md`.
- 5 skill: egy-egy sor a mandátum-hivatkozás után: kódot módosító munkánál a kapuk (`npm run gate:stage` …, `docs/minosegkapuk.md`).
- `docs/minosegkapuk.md` VÉGÉRE: „## Futtatókörnyezetek” — környezet × kapu tábla, CI statikus lépés, git-hook telepítése,
  `npm run verify` ↔ kapuk.
- Ellenőrzés: `node scripts/qa/gates/skills-sync-check.mjs` → 0.

## 5. Kibocsátás

1. `npm run gate:push` → ZÖLD.
2. Jelzés az orkesztrátornak (független ellenőr + ítélet rögzítése), majd `npm run gate:pr -- --body-file <leírás.md>`.
3. `.audit-ok` (fő checkout + munkafa, külön parancs), egyetlen `git push -u origin chore/kapuk-beepites`, `gh pr create --body-file`.
