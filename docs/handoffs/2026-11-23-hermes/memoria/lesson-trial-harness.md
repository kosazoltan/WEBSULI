---
name: lesson-trial-harness
description: "Lecke-promptváltozást mért alapvonalhoz mérj (a régi próbaharness az S4b-ben törölve, 2026-10-16) — és ne polírozz végtelen review-körökben"
metadata:
  node_type: memory
  type: feedback
  originSessionId: cce0558c-83f4-47c2-beaa-003dce27b7c3
  modified: 2026-10-19T04:35:11.704Z
---

Lecke-gyártási promptot csak mért alapvonal és változat összevetése után változtass. A régi próbaharness
(`scripts/measure/lesson-trial.mts`, a régi lépésgépre épült) 2026-10-16-án az S4b-vel együtt törölve. Az egyfutásos motor
mérése: `npx tsx scripts/measure/single-run-measure.mts <térkép-id eleje | file:út> <címke> [kimeneti mappa]` (eldobható
Docker-Postgres, éles DB csak olvasva; kimenet: a job telemetriája + `measureLesson`). A kulcsot PowerShellből kell átadni:
`AI_INTEGRATIONS_ANTHROPIC_API_KEY` ← a User env `ANTHROPIC_API_KEY`. Futás közben a haladás az eldobható konténer `studio_jobs`
sorából olvasható. Referencia a J1–J5 után (2026-10-16): történelem `030a27c0`, közzétéve, 1898 s, 0,64 M bemeneti token.

S5/S6 A/B (2026-10-19, #311, `MEASURE_KNOWLEDGE=1` + kapcsolók, Egyiptom `030a27c0`, 1 pár):
- **KI:** 18,1 perc; 23 fogalom / 8 fejezet; bank 6 javító kör; lektor 3 tételt vett ki; 640k be / 213k ki token.
- **BE:** 15,2 perc; 19 fogalom / 6 fejezet; bank 3 javító kör; lektor 1 tételt vett ki; 547k be / 194k ki token.
- **Zavaró tényező:** a szkript futásonként újra kinyeri a térképet, ezért a fogalomszám eltér. Döntés előtt mindkét ágat
  ugyanarról a térképről kell futtatni.

**Why:** 2026-10-14-én a korai mérések hibásak voltak (szerep-skill nélküli prompt; a szótő-mérő kötőszavakat és tankönyvi
ábraszámokat is tartalomnak számolt → hamis „−9 pont”). A tulajdonos jogosan kérdezte, nem polírozok-e önmagamban körbe:
a review-botok minden körben találnak valamit.

**How to apply:** mérőszámot az eredmény után csak bizonyított okkal módosíts, és a régit is jelentsd; a review-körök közül csak
valódi hibát (működés, biztonság) javíts, stílus/dokumentáció miatt ne indíts új kört; döntési pontoknál állj meg és kérdezz.
Kapcsolódó: [[websuli-push-audit-hook]], [[docker-available]].
