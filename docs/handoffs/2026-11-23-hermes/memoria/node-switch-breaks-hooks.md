---
name: node-switch-breaks-hooks
description: Node-telepítés/csere (NVM for Windows) futó Claude-munkamenetben eltünteti a node-ot a PATH-ról → a fail-closed kapu-hook minden shell-parancsot tilt
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-20T17:07:13.393Z
---

Az NVM for Windows telepítője (`winget install CoreyButler.NVMforWindows`) átveszi a meglévő Node-ot: a `C:\Program Files\nodejs` megszűnik, a Node a `%LOCALAPPDATA%\nvm\v<ver>` alá kerül, a symlink a `C:\nvm4w\nodejs`. A futó Claude-folyamat PATH-ja régi marad, így a `node`-ot hívó hookok nem indulnak; a `check-quality-gates.mjs` `onFailure: "block"` miatt UTÁNA MINDEN Bash/PowerShell hívás tiltott (2026-11-20, új gép beállítása).

**Why:** a hookok `node "${CLAUDE_PROJECT_DIR}/scripts/qa/hooks/…"` parancsok; a Claude-alkalmazás indításkori PATH-ját öröklik. A hook megkerülése (más eszközzel shell) tilos, lásd [[quality-gates-mandate]].

**How to apply:** Node-verzió cseréjét/NVM-telepítést soha ne futtass a munkamenetből. Előbb kérd meg a tulajdonost, hogy saját terminálban csinálja (`nvm install 24`, `nvm use 24`), majd indítsa újra a Claude-alkalmazást; csak utána folytasd. A WEBSULI Node 24.x-et kér (`source/package.json` engines, CI).
