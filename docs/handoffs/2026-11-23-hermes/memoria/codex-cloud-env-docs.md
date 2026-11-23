---
name: codex-cloud-env-docs
description: "Codex felhőkörnyezetek (2026-10-18): repónkénti docs/codex-felhokornyezet.md, a jelenlegi vs. legacy doksi, push-buktatók"
metadata:
  node_type: memory
  type: project
  modified: 2026-10-18T21:23:51.899Z
---

2026-10-18-án Codex felhőkörnyezet készült a WEBSULI, EC-Residence, bestpostplanner, valutavalto-program, EXZ és newugyvitel
repóhoz. Mindegyik repóban (vagy PR-ban) `docs/codex-felhokornyezet.md` írja le; az exc-platform (ebc-it szervezet) a Codex
GitHub-appnak nem elérhető (tulajdonosi engedély kell).

- **A hiteles doksi:** a jelenlegi modell a `learn.chatgpt.com/docs/environments/cloud-environments` (TÖBBES szám). Az egyes
  számú `.../cloud-environment` a Codex Cloud (Legacy): 12 órás cache, a setup korlátlan nettel, setup-only titkok. A
  reviewer-botok ezt számon kérik.
- **EXZ push:** a Git LFS pre-push a lock-API-nál `credential-manager get`-en lóg →
  `GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=lfs.locksverify GIT_CONFIG_VALUE_0=false` (nem perzisztens).
- **Branch protection:** az EXZ és a valutavalto-program main ága 1 jóváhagyó review-t követel; saját PR-t így nem lehet mergelni,
  admin-bypass csak kifejezett tulajdonosi engedéllyel.
- **bestpostplanner:** a pre-push a teljes jest-csomagot futtatja; Windows-on 9 zalog/child-process suite elbukik (DB-től
  függetlenül). A docs-commit a `D:\repo\bestpostplanner\.codexdocs-wt` worktree-ben vár.

**Why:** a környezet a ChatGPT-fiókban él, a leírás a többi gépnek és ügynöknek szól; háromszor kellett átírni, mert eleinte a
legacy oldalt olvastam.
**How to apply:** a Codex-környezetről szóló állítást a többes számú oldalhoz mérd. Kapcsolódik: [[websuli-push-audit-hook]].
