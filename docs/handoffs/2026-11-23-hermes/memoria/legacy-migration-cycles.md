---
name: legacy-migration-cycles
description: "Régi anyagok Stúdió-átalakítása — 5-ös ciklusok felülvizsgálattal, a futás drága analitika; költségszerkezet és eszközök"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-17T08:00:00.000Z
---

2026-10-20/21: a 2026-06-01 előtti régi HTML-anyagok HELYBEN Stúdió-leckévé alakítása (#349 sor, #350 `all`, #352
ciklus-kapu). **Lezárva 2026-10-21 22:31: 178/178 kész, 0 hiba** (átlag ~$5,9 / anyag, ~15,5 perc).

**Tulajdonosi elvárás (2026-10-21):** 5 anyagonként megállás → az utolsó 5 metrikájának felülvizsgálata → a gyártó
javítása (pazarlás, minden mért hiba) → memória + kanban → CSAK UTÁNA a következő 5. A futás „nagyon drága analitika”:
minden tanulságot a gyártás / okosítás / javítás mechanizmusába kell visszavezetni. Minden ciklus végén ugyanazok a
KPI-k, az előzővel összevetve (a tulajdonos a fokozatos javulást kéri).

**Why:** a tulajdonos meglepődött, hogy a teljes sor elindult (a „3 próba után mind” választ ő úgy értette, csak a 3) —
költségérzékeny.
**How to apply:** tömeges, fizetős futást csak kifejezett, egyértelmű „mind” után; a ciklus-kapu (`LEGACY_BATCH_LIMIT`,
+5 / PR) deployja futásmentes. A menet és a lekérdezések: `.claude/skills/websuli-gyartas-analitika/SKILL.md`.
Költség: telemetria `stations` ($4 / $0,20 cache / $20 per MTok). A nyilvános API `X-Websuli-Scoring: 5` fejlécet kér
(nélküle 409). Scratchpad-eszközök (nem a repóban, elveszhettek): `legacy-audit.sh`, `mine-logs.mjs`, `cycle-kpi.sh`.

**Tartós tanulságok:**
- Mért pazarlás (98 futás): gyakorlóbank 41% (átlag 3,7 javítókör), ellenőrzés 22% (~25 hívás / anyag, 0 cache),
  lektori kivétel. Karok: S3d csoportos szigorítás (#353) → lektor-gyorsítótár + szkriptes sémajavítás → kevesebb,
  célzottabb ellenőrzés (a `check` effort csökkentése CSAK A/B méréssel) → prompt-próza tömörítése. A lektor-kivételek
  oka a `studio_jobs.output.lektorArchive`-ból olvasható (#355 óta).
- A tisztítás a határon kell (modellhívás ÉS DB-írás): a félbevágott emoji a mentést is buktatta, a job „running”
  maradt, a sor beragadt (#356: `deepWellFormed`, `jobStillRunning`).
- Deploy-átfedésben a RÉGI példány is indíthat munkát → példánykerítés (#355).
- A magyar pontozó TÖVEZ (ragcserét elfogad) → egyszavas pontos alakhoz `exactForms` (7. ciklus).
- A megalapozási kapu hamis jelzései (ékezetes rövid név, címke-kettőspont, maradékos osztás) → #363, #364.
- Háromfázisú kapu: a végrehajtási doksi az első kódcommitkor hivatkozzon a tervfájlra (lásd a repó C-37 csapdáját).

A ciklus-KPI napló (0–8. ciklus) teljes táblája és a ciklusonkénti részmérések: az archív példányban,
`memory/archive/2026-11-17/legacy-migration-cycles.md`.
Kapcsolódó: [[no-deploy-during-active-runs]], [[bank-model-opus-decision]].
