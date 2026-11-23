---
name: retro-naplo
description: "WEBSULI futásonkénti retró-napló: mi ment rosszul, mennyibe került, mi lett javítva (fájllal), mi került kanbanba – a legfrissebb felül"
metadata:
  node_type: memory
  type: project
  originSessionId: 5e40d429-1a44-43d0-a815-181a3773f233
  modified: 2026-11-22T08:55:01.015Z
---

Minden fejlesztési/javítási futás végén ide kerül EGY bejegyzés (a legfrissebb felül), mért tényekből:
`YYYY-MM-DD – <feladat> – hiba/költség – elvégzett javítás (fájl) – kanbanba került tétel`.
A részletes retró a repóban marad (lásd [[projekt-tudasterkep]]); itt csak a kumulált tanulság.

2026-11-23 – főszál: kapurendszer-audit + TGM-lánc (S5a, S2b-1, S5b) + B1a – hiba/költség: 2 nap alatt 4 PR beolvasztva (#522, #531, #532, #530), #533 és #534 IGEN F-fel a CI-ra vár; az S2b-1-en 7 vak kör ment el (3 a bot kérte kilógófelirat-ellenőrzésre, amely végül kikerült), az S5b-n 3 kör (~2,5 USD); a #534 javításánál a tároló (`pipeline-store.upsertLesson`) újraszámolta a jelölőt — a motorbeli javítás élesben hatástalan lett volna – elvégzett javítás: vak futtató blokkoló-definíció + `--previous` + beépített konvergencia-őr (`vak-v2`: `scripts/qa/gates/blind-review/convergence.mjs`, `blind-review.mjs`, `vak-ellenor-megbizas.md`); csapda C-TGM-1 (`docs/agent-csapdak.md`, az S6a ágon); a formaazonosító korcsoportos feloldása (`shared/lesson-opener.ts`) – kanbanba: a futtató főágra vitele (K3), bizonyíték-átvitel (K2), PR-leírás generátor, kilógó felirat böngészős mérése, L6/L7/L9 jegyek.

2026-11-22 – gépköltöztetés utáni folytatás (H0–H2) + futás végi hurok – hiba/költség: 2 nap alatt 2 PR beolvasztva (#523, #524), a vak körök ~25 USD / 60, a biztonsági keményítő PR-ok (#521, futtató) és a #510 nem konvergált (szűkítés, bontás, előre-vágás); egy jóváhagyás nélküli fizetős képgenerálás (0,093 USD); az új gépen Chrome 158 + Playwright 1.57 összeomlás blokkolta a PR-kaput – javítás: C-92 (CRLF), C-93 + PR #525 (csomagolt Chromium), `~/.claude/scripts/futas-vegi-ellenor.py`, `~/.claude/skills/futas-vegi-zaras/SKILL.md`, Stop hook `~/.claude/hooks/futas-vegi-emlekezteto.mjs`, a globális CLAUDE.md első blokkjának javítása – kanban: tapasztalat-kanban létrehozva (`~/.claude/projects/D--repo-WEBSULI/kanban/tapasztalat-kanban.md`), 9 kártya.
