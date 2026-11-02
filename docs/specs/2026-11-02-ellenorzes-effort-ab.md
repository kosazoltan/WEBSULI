# Az ellenőrzés-állomás effort-A/B mérése (kanban #5)

Állapot: tulajdonosi jóváhagyás 2026-11-02 — „A/B mérés (~$60–90)", 5+5 anyag eldobható DB-n.

## Tény (kódból, 2026-11-02)
- Az „ellenőrzés" telemetria-állomás a bank minőségkapuit futtatja: válaszkulcs-teszt és kvíz vak előszűrő
  (`source/server/studio/single-run/engine.ts` — `freshJsonCall`, 241. sor), hívásonként friss beszélgetésben.
- Minden állomás ugyanazzal a modellel (Opus 5.5, tartalék GPT-6.1 Sol) és `SINGLE_RUN_EFFORT = "medium"` beállítással fut
  (`source/server/studio/single-run/conversation.ts:16`, `:87`, `:115`).
- Ciklus 8 mérése (skill: websuli-gyartas-analitika): az ellenőrzés a költség ~20,8–22%-a, 26–27 kör/anyag.
- A mérő-infrastruktúra kész: `source/scripts/measure/single-run-measure.mts` — eldobható Dockeres Postgres,
  `MEASURE_SAME_MAP=1` esetén a két ág ugyanazzal az éles térképpel (fogalmakkal) fut; az élesből csak OLVAS.
- A válaszkulcs-esetek a `studio_jobs.output.answerKeyArchive`-ban megőrződnek (1. ciklus óta) — offline visszajátszhatók.

## Cél
- Megmérni: az ellenőrzés-állomás `low` efforttal mennyivel olcsóbb, és romlik-e az ítéletek minősége.
- Döntési adat a tulajdonosnak: váltás vagy maradás, számokkal.

## Nem-cél
- Modellváltás az ellenőrzésben (a 2026-10-16-i döntés: Opus marad — memória: bank-model-opus-decision).
- A szerzői / bank / lektor állomások effortjának módosítása.
- Az éles alapértelmezés átállítása (az a mérés EREDMÉNYE utáni külön tulajdonosi döntés).

## Érintett fájlok
- `source/server/studio/single-run/conversation.ts` — effort-opció az `anthropicClient` / `openAIClient` / `createLessonConversation` felé (alapértelmezés: a mai `medium`).
- `source/server/studio/single-run/engine.ts` — `checkEffort(env)`: a `STUDIO_CHECK_EFFORT` env olvasása (`low` | `medium`, minden más → `medium`); a `freshJsonCall` az ellenőrző friss beszélgetését ezzel kéri.
- `source/server/studio/single-run/live.ts` + `concept-fix.ts` + `structured-improvement.ts` — a `fresh(system, opts?)` szignatúra átvezetése (viselkedés változatlan).
- `source/scripts/measure/single-run-measure.mts` — a kimenet kiegészül: `out.checkEffort`, `out.answerKeyArchive` (a visszajátszáshoz).
- `source/tests/check-effort.test.ts` — új teszt.

## Edge case-ek
- Érvénytelen `STUDIO_CHECK_EFFORT` (üres, elgépelt) → `medium` (biztonságos default), nincs kivétel.
- GPT-tartalékra váltásnál a `low` effort a Responses API `reasoning.effort`-jába megy (ugyanaz a kapcsoló).
- A kapcsoló CSAK az „ellenőrzés" állomás friss beszélgetéseire hat; a fő beszélgetés és a bank/lektor marad `medium`.

## A mérés (5+5, tulajdonosi keret: ~60–90 USD)
- 5 éles térkép (különböző tantárgy/évfolyam, van `source_text`), mindegyik KÉT futás `MEASURE_SAME_MAP=1`-gyel:
  A-ág `STUDIO_CHECK_EFFORT=medium`, B-ág `STUDIO_CHECK_EFFORT=low`.
- Kimenet páronként: az „ellenőrzés" állomás USD-je és körszáma (telemetria), kapu-jelzések (`gates`), lecke-metrikák
  (`measureLesson`), kapunaplók.
- Minőség-mérce (a zaj ellen): a B-ág `answerKeyArchive` eseteinek visszajátszása MEDIUM efforttal, offline —
  egyetértési arány a low- és medium-ítéletek között.

## Eredmény (2026-11-02, 5+5 futás, összköltség ~49 USD)

| Térkép (tantárgy) | Ellenőrzés A→B (USD) | Megtakarítás | Teljes A→B (USD) | Lecke B |
|---|---|---|---|---|
| 00d11a27 (angol 6.) | 0,97 → 0,61 | 37% | 4,62 → 5,07 | rendben (56 fel / 98 kvíz) |
| 291a52ce (matek 5.) | 1,06 → 0,62 | 42% | 4,72 → 4,59 | rendben |
| 7df40282 (termism. 5.) | 1,17 → 0,65 | 44% | 4,00 → 4,10 | rendben |
| 8ad1258a (töri 5.) | 1,23 → 0,79 | 36% | 4,60 → 4,44 | rendben |
| 07ddb36a (magyar 4.) | 1,60 → 0,87 | (45%) | 7,29 → (5,82) | **NEM PUBLIKÁLHATÓ** — végellenőrzés: csak kis/nagybetűben eltérő egyválasztós opciók maradtak |

- Ellenőrzés-állomás megtakarítás a 4 tiszta páron: **átlag 39,7%** (36–44%) — az E4 40%-os küszöbe ALATT.
- **A teljes futásköltség nem csökken**: a tiszta párokon A $17,94 vs B $18,20 — az állomás-megtakarítást (~$0,45/lecke)
  elnyeli a futások közti szórás (javítókörök máshol).
- Medium-visszajátszás (minden futás archivált feladatain): átengedett rubrika A-kontroll 29/281 (10,3%) vs B 28/290 (9,7%)
  — a tesztíró minőségében NINCS mérhető romlás low efforton.
- A B-ág kapu-jelei: answerKeyFails 0→1, 2→1, 0→0, 0→3; 1/5 futás a végellenőrzésen elbukott (A: 0/5).

**Döntés az E4 szerint: MARADÁS a medium efforton.** A megtakarítás a küszöb alatt van, a rendszer-szintű költség nem
csökken, és a low ágon volt publikálási bukás. A `STUDIO_CHECK_EFFORT` kapcsoló a kódban marad (alapértelmezés: medium),
így egy későbbi modell- vagy promptváltozás után a mérés fillérpontosan megismételhető.

## Elfogadás (EARS)
- E1: HA `STUDIO_CHECK_EFFORT=low`, AKKOR az ellenőrzés-állomás hívásai `low` efforttal mennek, minden más állomás `medium` marad.
- E2: HA a kapcsoló nincs beállítva vagy érvénytelen, AKKOR a viselkedés bitre azonos a maival (`medium`).
- E3: HA az 5+5 futás lezárult, AKKOR páronként rendelkezésre áll: ellenőrzés-USD, körszám, kapu-statisztika, lecke-metrika,
  és a B-ág ítéleteinek medium-visszajátszásos egyetértési aránya.
- E4: Javaslat a tulajdonosnak: váltás CSAK akkor, ha az ellenőrzés-költség ≥ 40%-kal csökken ÉS az egyetértés ≥ 95%
  ÉS a lecke-metrikák nem romlanak; különben maradás.
