---
name: futas-vegi-hurok
description: "Minden feladat után kötelező futás végi hurok a Claude-környezetben (retró, csapda, memória, tapasztalat-kanban, skill-döntés, higiénia) + gépi ellenőrző zöldje; nem a Hermesben"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-22T08:55:07.125Z
---

Minden elvégzett feladat után és minden session végén lefut a `futas-vegi-zaras` skill (`~/.claude/skills/futas-vegi-zaras/SKILL.md`), a lezárás pedig a gépi ellenőrző zöldje: `python -X utf8 ~/.claude/scripts/futas-vegi-ellenor.py --repo D:/repo/WEBSULI --csapda "…" --kanban "…" --skill "…"`. A repónkénti tapasztalat-kanban: `~/.claude/projects/D--repo-WEBSULI/kanban/tapasztalat-kanban.md` — új feladat előtt olvasd el.

**Why:** a tulajdonos 2026-11-22-én kérte, hogy a hibák és megoldások minden repóban tartósan elérhetők legyenek, és minden futás tiszta fával záruljon; kétszer is kijavította, hogy ez a saját Claude Code munkakörnyezetben legyen, NE a Hermesben (Hermes-hivatkozás az utasításban hiba).

**How to apply:** feladat végén a skill 7 lépése; a Stop hook (`~/.claude/hooks/futas-vegi-emlekezteto.mjs`) csak figyelmeztet. Vektoros memória ebben a környezetben nincs — ne állítsd vezetettnek. Kapcsolódó: [[completion-mandate]], [[retro-naplo]].
