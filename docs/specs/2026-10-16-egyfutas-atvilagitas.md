# Az együgynökös (egyfutásos) tananyagkészítés teljes átvilágítása — terv

Tulajdonosi kérés (2026-10-16): a teljes készítővonal ellenőrzése és mérése. Érintett: készítés, tárolás, mentés, javítás, újrakészítés,
a draft folytatása és a megszakadt folyamat folytatása. A kérdések:
- Megfelelő metrikákat ad-e a vonal?
- Nincs-e túlbonyolítva a promptok, skillek és scriptek sora?
- Akadályozza-e az átadás a pontos munkát?

A kimenet: javaslatok (javítás, pontosítás, egyszerűsítés), vagy nyilatkozat arról, hogy a rendszer jól és rendeltetésszerűen működik.

## Hatókör (a kód az S4b után: Opus 5.5 + GPT-6.1 Sol, egy beszélgetés)
| Út | Belépés | Motor |
|---|---|---|
| Készítés (feltöltés) | `POST /lessons/one-step` | `runSingleUpload` → `runSingleLesson` |
| Készítés (web) | `POST /web-research/jobs` | `gatherWebSources` → `runOneStepInWorkflow` |
| Készítés (térképről) | `POST /lessons/from-map/:mapId` | `startMapRun` → `runSingleFromMap` |
| Különálló tudástár | `POST /maps/extract` | `extractMapSingleRun` (1. állomás) |
| Javítás (fogalom) | `POST /lessons/:id/fix-concept` | `fixConceptSingleRun` |
| Javítás (lecke) | `POST /admin/improve-material/:id` | `generateStructuredImprovement` + `singleRunRepairCall` |
| Újrakészítés / folytatás | `/drafts/:id/remake`, `/drafts/:id/continue`, `/jobs/:id/resume`, `/jobs/:id/approve-outline` | `remakeAsSingleRun` → `startMapRun` |
| Megszakadt folyamat | boot / időszakos söprés | `closeOrphanedOneStepRuns`, `sweepStudioJobs` |
| Tárolás / mentés | — | `saveSingleRunMap`, `studio_jobs.output` (`singleRun.conversation`, lecke, checkpoint), `pipeline-store` közzététel |

## Mérés (tény, nem becslés)
1. **Statikus:**
   - a rendszerprompt és az állomás-kérések mérete;
   - ismétlődés;
   - a szerep-, támogató- és tantárgyi skillek száma, mérete és használata;
   - a prompt-építők (`step-io.ts`) és a nem használt ágak;
   - kódméret modulonként;
   - halott kód (importgráf).
2. **Élő futás**, eldobható Postgresen, valódi Opus 5.5-tel: legalább két forrás (szöveges, illetve kép vagy PDF). Futásonként rögzítendő:
   - idő, fordulószám és állomásonkénti javító fordulók;
   - bankkísérletek;
   - token (be, gyorsítótárból, ki) és költség;
   - a kapuk eredménye (válaszkulcs-teszt, vak kvíz, lektor, végkapu);
   - a publikált lecke mérőszámai (`measureLesson`: lefedettség, szó, forráson kívüli arány stb.).
3. **Életciklus-próbák** (DB, hamis modellel, ahol fizetős hívás nem kell): mentés, újragyártás, folytatás, árva söprés, javítás —
   a tényleges állapotátmenetek.
4. **Telemetria:** mit ment a rendszer a futásról, és visszamérhető-e utólag a fenti metrika.

## Értékelés szempontjai
- **Helyesség:** a kapuk tényleg megfogják-e a hibát (mutációs vagy hibás bemenetes próba).
- **Átadások:** a beszélgetés-alapú átadás veszít-e információt (pl. kontextusméret, javító fordulók elvesztése).
- **Egyszerűség:** van-e redundáns réteg, holt szabály vagy túlzott prompt.
- **Mérhetőség:** utólag megállapítható-e egy futás minősége és költsége.

## Nem-cél
A lecke- és bankszerződés, a pontozó és a gyerekfelület megváltoztatása. Ha az átvilágítás javítást javasol, az a háromfázisú renddel,
külön szeletként készül.

## Mért eredmény (2026-10-16, eldobható DB, valódi Opus 5.5)
| | Matematika (Oszthatóság, 6. o.) | Kép (Fotoszintézis) | Történelem (Ókori Egyiptom, 5. o.) |
|---|---|---|---|
| Eredmény | közzétéve | közzétéve | **elbukott (6. fejezet bankja)** |
| Idő | 1609 s | 1569 s | 1269 s |
| Bemenet / gyorsítótár / kimenet (token) | 4,89 M / 88% / 140 e | 3,58 M / 88% / 136 e | 3,59 M / 90% / 110 e |
| Bank (bemenet, forduló) | 3,17 M, 14 | 2,58 M, 12 | 3,41 M, 15 |
| Lektor (bemenet, forduló) | 1,53 M, 3 | 0,86 M, 2 | — |
| Kötelező tények / fogalmak a leckében | 100% / 94% | 100% / 100% | — |

**Leletek:**
- **L1:** a válaszkulcs-teszt „fordított / tévhit” próbái olyan hibás válaszokat adnak, amelyek a helyes válasz összes szavát
  tartalmazzák. A szócsoport-pontozó ezeket elvben sem tudja elutasítani, a kapu mégis blokkol: bankkörök vesznek el, és a
  történelem-futás elbukott.
- **L2:** minden forduló a teljes beszélgetést küldi. A bank- és a lektorforduló fordulónként 215–510 ezer bemeneti tokent visz.
- **L3:** a lektor ugyanabban a beszélgetésben bírálja a saját munkáját (nem független).
- **L4:** a futásról nincs mentett mérőszám (token, idő, forduló, kapueredmény).
- **L5:** az állomás-kérések többügynökös szerepeket és átadásokat szólítanak meg (az ábrakérés angolul).
- **L6:** megszakadt futás nem folytatható.
- **L7:** a szókeret túllépése csak jelzés.

## Javítás (tulajdonosi jóváhagyás 2026-10-16: „Mindent valósíts meg a javaslataid alapján”)
- **J1:** a szócsoport-pontozóval elvben megkülönböztethetetlen hibás próba (a szókészlete tartalmaz egy teljes pontos helyes választ)
  nem blokkoló; a tesztíró utasítása ilyet nem kér.
- **J2:** a gyakorlóbank csomagjai és a lektorálás friss, célzott beszélgetésben futnak (ugyanaz a modellpár). A bank a fejezet kérését kapja,
  a lektor a forrás átiratát, a tudásbankot és a kész leckét. A szerzői munka (terv, tananyag, ábra, lektori javítás) a fő beszélgetésben
  marad.
- **J3:** futásonkénti telemetria a jobon (`output.telemetry`), állomásonként:
  - fordulók, token (be / gyorsítótár / ki), idő, javító fordulók;
  - a friss hívások, a kapuk eseményei, a tartalékváltás.

  Megjelenik a JobMonitorban. Állandó mérőszkript: `scripts/measure/single-run-measure.mts`.
- **J4:** az állomás-kérések egyetlen szerepet szólítanak meg, magyarul; a más ügynökökre / átadásokra utaló szöveg kikerül.
- **J5:**
  - a megszakadt egyfutásos gyártás a mentett részekből folytatható (terv, tananyag, bank-ellenőrzőpont, beszélgetés) az utolsó lezárt
    állomás után;
  - a szókeret túllépése egy rövidítő javító fordulót kap.

## Mérés a javítások után (2026-10-16, `scripts/measure/single-run-measure.mts`, eldobható DB, valódi Opus 5.5)
Ugyanaz a történelem-forrás (`030a27c0`, Ókori Egyiptom), amelyen a javítások előtt a gyártás a 6. fejezet bankjánál elbukott.

| | Előtte | Utána (J1–J5) |
|---|---|---|
| Eredmény | elbukott (6. fejezet bankja) | **közzétéve** (7 fejezet, 55 feladat, 98 kvíz, 18 módszer) |
| Idő | 1269 s (a bukásig) | 1898 s |
| Bemenet / gyorsítótár / kimenet (token) | 3,59 M / 90% / 110 e | **0,64 M** / 20% / 214 e |
| Bank (bemenet, forduló) | 3,41 M, 15 | 0,22 M, 11 (friss beszélgetésben) |
| Lektor (bemenet, forduló) | — | 0,22 M, 3 (friss beszélgetésben) |
| Kötelező tények / fogalmak a leckében | — | 97% / 91% |
| Kapuk | — | 7 blokkoló válaszkulcs-bukás javítókörben, 2 nem blokkoló, 4 banktételt a lektor kivett |

Tartalékváltás nem volt; a szókeret nem lépett túl.

**Értékelés:**
- A J1 a bukás okát megszüntette: a megkülönböztethetetlen próba csak tájékoztató, a valóban túl megengedő rubrika továbbra is
  javítókört kap.
- A J2 a bemeneti tokent kb. hatodára csökkentette: a friss beszélgetés nem viszi a teljes gyártást minden fordulóban.
- A gyorsítótár-arány alacsonyabb, mert a friss beszélgetések kevés közös előtagot osztanak. A kimenet nagyobb, mert minden friss
  hívás teljes JSON-t ad.
- Az idő nőtt, mert a kulcsmentes ellenőrzés (23 hívás, 573 s) és a bank egymás után fut.
