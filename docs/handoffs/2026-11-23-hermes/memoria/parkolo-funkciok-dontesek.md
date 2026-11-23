---
name: parkolo-funkciok-dontesek
description: "Parkoló (kapcsoló mögött KI) WEBSULI-funkciók leltára és a tulajdonosi döntések (2026-11-22): sorban, egymás után befejezni; kisfilm-küszöb 480 MB jóváhagyva; S5/S6 A/B a TGM után"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-22T17:42:29.184Z
---

Leltár (2026-11-22, főág 442a9653): MP_MODE (élesben off), STUDIO_SOURCE_VISUALS (KI, S3/S3b hiányzik), GATE_MODES.sourceCoverage = report (enforce az S3b után), STUDIO_CATALOG_S6 és STUDIO_SUBJECT_MEMORY (KI, fizetős A/B kell), LESSON_CLIPS_AUTO (idle), ADVENT_CALENDAR (élesben KI; felület S3/S4 és élesítés S5/S6 csak ágakon, a `sweep` nincs bekötve), ADMIN_ALLOWLIST (render.yaml-ban kikommentezve). A `render.yaml` egyetlen funkciókapcsolót sem tartalmaz: mindegyik csak a Render felületén állítható (a tulajdonos végzi), blueprint-újratelepítés nem őrzi meg.

**Why:** a tulajdonos kérte, hogy a kész, de parkoló fejlesztések ne álljanak kikapcsolva; döntései (űrlapon, 2026-11-22): „Szépen, sorban, egymás után végezz el” (advent befejezése, forrásábrák TGM S3/S3b, közös játék #97 biztonsági leletei — egy szálon, a futó PR-ok után); kisfilm-küszöb „480 MB, mért első kör”; S5/S6 A/B „később, TGM után”.

**How to apply:** a futó PR-ok után ebben a sorrendben: advent (határidő nov. 30, bekapcsolás a tulajdonos előnézeti próbája után) → TGM-lánc (S5a-v2, S2b-1-v2, S5b, S6a, S6b, S2b-2, S6c, SK2, majd S3a/S3b) → #97. Az env-kapcsolók élesítését mindig a tulajdonos végzi. Kapcsolódó: [[lesson-variety-priority]], [[gepkoltoztetes-folytatas]].
