---
name: hosszu-futas-vezenyles
description: "WEBSULI hosszú futás: hol a hibajegyzék, a vezénylő skill, a kapusor-zár és a helyi ág-mentés; új munkamenet elején ezekkel indul a munka"
metadata:
  type: reference
---

2026-11-23: a tulajdonos kérte, hogy minden megtalált hiba (futás, skill, memória, munkafa, ág) egy jegyzékben legyen, és egy hosszú
futásban javuljon. Eszközök:

- Hibajegyzék (kanban): `~/.claude/projects/D--repo-WEBSULI/kanban/hosszu-futas-hibajegyzek.md` (H-01…; Nyitott / Folyamatban / Javítva / Beépítve).
- Vezénylő skill: `websuli-szelet-futoszalag` (`~/.claude/skills/…`) — szeletenkénti lépéssor, hibaosztály-söprés, eszköz-csapdák.
- Kapusor-zár: `~/.claude/scripts/websuli-kapusor.sh` (`source` + `kapusor_be "<név>"` minden sor-szkript elején).
- Segédszkriptek: `~/.claude/scripts/websuli-doc-insert.py`, `websuli-keep-both.py`, `websuli-branch-audit.py`.
- Helyi ág-mentés (köteg): `C:\Users\kosaz\websuli-mentes\websuli-helyi-agak-2026-11-23.bundle` — a csak helyben lévő és a távolinál
  előrébb járó ágak; a kapu-hook a mentő-refspecet (`higienia-backup/…`) tiltja, távoli mentés csak PR-ral vagy tulajdonosi döntéssel.

Kapcsolódó: [[foterv-2026-11-23]], [[foszal-allapot]], [[futas-vegi-hurok]].
