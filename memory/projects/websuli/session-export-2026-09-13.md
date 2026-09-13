---
id: episodic_websuli_20260913_001
type: episodic
domain: websuli
created: 2026-09-13
source: codex-session-handoff
tags: [pipeline, handoff, testing, hygiene]
project: websuli
---

# WEBSULI session-export — 2026-09-13

## Bizonyított állapot

- A repó jelenlegi ága `main`, HEAD: `76d7a6d80fca78c5a27bf7e57799296878da970b`.
- Az éles health-ellenőrzés ugyanezt a revíziót adta vissza.
- A legutóbbi preflight eredménye: `unfinishedJobs: []`, `webRuns: []`, `productionWrites: 0`.
- Egervár ostromáról nincs mentett futásazonosító, ezért új Egervár-tananyag gyártása ebben a munkamenetben nem történt meg.
- A régi Trója/Odüsszeusz rekord lezárt, régi módszerverziójú tartalom; új gyártás alapjaként nem használható.
- Az aktuális Chrome-munkamenet nem adminos, ezért az élő runtime-dokumentumok admin API-exportja nem futott le; a lekérdezés 401-et adott.

## Ellenőrzések

- Teljes helyi verify: PASS a legutóbbi 7.4-es kiadási ciklusban.
- HTML-perzisztencia célzott Playwright-próba: PASS, 10/10.
- Éles preflight: PASS, éles írás nélkül.
- Új Egervár webes keresés, forrásletöltés, lektorálás, publikáció és visszaolvasás: NOT RUN.

## Tanulságok a következő futáshoz

1. Új tananyag csak a WebSuli saját internetes pipeline-ján keresztül készülhet.
2. A fusion-7.4-4 minimumot, a forrásbizonyítékot és a független lektori kaput nem lehet kézi tartalommal pótolni.
3. A runtime QMD/IAM/Cogni/Kanban/SOUL/RUNBOOK/MEMORY/SKILL dokumentumai az admin API tartós adatából állnak elő; a repó csak a forrást és a biztonságos exportállapotot dokumentálja.
4. A sikeres teszt nem helyettesíti az éles tananyag-futás és a pedagógiai elfogadás bizonyítékát.

## Biztonsági határ

Ez a fájl csak a WEBSULI projekthez tartozó, titokmentes összefoglaló. Globális session-transcriptet, más projekt memóriáját, tokent, jelszót, OAuth-fájlt vagy nyers modellválaszt nem tartalmaz.
