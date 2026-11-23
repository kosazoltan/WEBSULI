---
name: vak-kor-konvergencia
description: "TÖRVÉNY (tulajdonos 2026-11-22) — ugyanazt a hibát tilos újra elkövetni; nem konvergáló vak köröknél gépi megállás + megközelítésváltás (követelmény, hibaosztály-leltár, kis PR), nem foltozás"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-22T09:33:47.191Z
---

Mért tény (2026-11-21/22, 32 vak kör): a leletszám körről körre NEM csökkent a nagy PR-okon (#521 blokkolók 2-3-2-3-3-4-2, a futtató közepesek 7-7-7-6, #510 4 NEM egymás után), a kicsiken 1–2 kör alatt IGEN (#525, memória-index). Ok: leletenkénti foltozás (a javítás új felületet hoz), a vak ellenőr körönként csak mintát ad (~5–10 lelet), a nagy diff kimeríthetetlen. Szakmai forrás: Contrast Security „When AI reviewers cannot agree”, arXiv 2603.16244 (több kör → kevesebb pontosság), LinkedIn – Andrey Arroyo (10 kör vs. a követelmény tisztázása után 2 kör).

**Why:** a tulajdonos kifogásolta, hogy a folyton elbukó köröket nem közelítem új szemszögből és nem tanulok belőlük; törvény-szintű, kötelező utasítás: „ugyanazokat a hibákat tilos ugyanúgy újra elkövetni, kötelező tanulni belőlük”; ha végképp nem megy, internetes / GitHub-forrásból kell megoldást keresni.

**How to apply:**
1. Minden új vak kör ELŐTT: `python -X utf8 ~/.claude/scripts/vak-kor-konvergencia.py --reports <eddigi jelentések>` — exit 1 esetén TILOS új kör.
2. Megközelítésváltás sorrendje: (a) a követelmény / invariáns egy mondatban a tervben; (b) hibaOSZTÁLY-leltár: a diff minden előfordulása táblázatban (fájl:sor, korlát, teszt), közös segéddel javítva; (c) PR-bontás ≤ ~400 sor; (d) utána EGY mélyebb kör nagyobb kerettel; (e) ha ez sem: tulajdonosi döntés űrlapon.
3. Új PR már az első vak kör előtt legyen kicsi; fejlesztői önellenőrzés az ellenőr célfájlja szerint, osztályszinten.
4. Minden hibaosztály a session végén: csapda + tapasztalat-kanban + skill. Kapcsolódó: [[futas-vegi-hurok]], [[blind-review-runner]], [[gate-speed-decisions]].
