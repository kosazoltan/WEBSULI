---
name: potlasok-terv-dontesek
description: "WEBSULI pótlási terv (2026-11-19): GPT-6.2 Sol leltár (docs/websuli-potlasok.md) + terv docs/specs/2026-11-19-websuli-potlasok-terv*.md; a tulajdonos 16 döntése (D-01…D-16); végrehajtás a futó javítások után"
metadata:
  node_type: memory
  type: project
  originSessionId: 99a9b29f-318a-40fe-a572-f8ecf28ad2ae
  modified: 2026-11-19T17:57:30.803Z
---

A tulajdonos 2026-11-19-én kérte: az elmúlt hét összes félbemaradt kérését kutassa fel a GPT-6.2 Sol (high), egy külön tervező
ügynök készítsen belőle tervet, és a futó javítások lezárása után **automatikusan hajtsam végre** szeletenként.

- Leltár: `docs/websuli-potlasok.md` (ág `docs/websuli-potlasok`, 68 tétel). Terv + végrehajtás: `docs/specs/2026-11-19-websuli-potlasok-terv.md`
  és `…-terv-vegrehajtas.md` (50 szelet, P1 elöl: advent S6 / S5 — határidő november 30. —, pontozó, kliens-IP, kisfilm #418,
  eredménylevél szélei, szkriptkapuk P2, hook-szelet 1, kapu-időkorlát; utána a Szólétra-javítás G-21).
- Döntések (űrlapon): D-01…D-07, D-09…D-14, D-16 a javasolt opció; **D-08: IGEN, egyujjas mód az Aszteroidában (G-15)**;
  **D-15 törölve** — a „mintavideó + 5 próbavideó” kérés a bestpostplanner repónak szólt, rossz helyre ment.

**Why:** a tulajdonos szerint a kérései „elhullottak”; a leltár és a terv a tartós nyilvántartás, hogy semmi ne vesszen el.
**How to apply:** a futó PR-ok (merge-sor) lezárása után a terv 7.1 sorrendje szerint, WIP ≤ 4, minden szelet a teljes kapuval
(GPT-6.2 Sol vak ellenőr, gépi zár). Kapcsolódó: [[gate-speed-decisions]], [[blind-review-runner]].
