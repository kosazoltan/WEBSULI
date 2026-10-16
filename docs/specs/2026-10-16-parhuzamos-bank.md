# Párhuzamos gyakorlóbank az egyfutásos gyártásban — terv

Tulajdonosi kérés (2026-10-16, „3”): az állandó gyakorlóbank lehetőségének mérése ÉS a párhuzamos bankgyártás.

## Mért kiinduló állapot
- **Időarány:**
  - Az élő mérés a J1–J5 után (Ókori Egyiptom): 1898 s; ebből a bank 771 s, az ellenőrzések 573 s, együtt 71%.
  - Az éles „Medve” lecke (job `b3c07512`): 2149 s; ebből a bank 1248 s, az ellenőrzés 434 s, együtt 78%.
- **A motor ma sorosan gyárt:** `buildLessonExperience(..., { concurrency: 1 })` (`server/studio/single-run/engine.ts`).
- **A banképítő már tud párhuzamosan dolgozni:** egyszerre `concurrency` darab egység épül, utána determinisztikus
  kereszt-ellenőrzés fut, és az ütköző csomag sorosan újraépül.
- **Mért előzmény a régi úton** (`experience-builder.ts`, `PACKET_CONCURRENCY` megjegyzése): soros 1795 s, 3 párhuzamos 681–1134 s.
- **Állandó katalógus-bank — ingyenes visszajátszás** (`docs/measurements/2026-10-16-katalogus-ab-replay.json`):
  - 55 leckéből 11 fedett.
  - A fedett leckéken −13% bankhiba és −19% bankkör; összesen −0,24% és −2,1%.
  - A mostani szó szerinti szabállyal a katalógus tehát alig gyorsítana. A bővítés (nyílt feladat, módszer átvétele) külön
    tulajdonosi döntés kell.

## Cél
A gyakorlóbank egységei párhuzamosan épülnek; alapból 3, a `STUDIO_BANK_CONCURRENCY` (1–5) felülírja. Egységenként a kulcsmentes
ellenőrzések is párhuzamosan futnak. A minőségi kapuk, a lektor és a végkapu változatlan.

## Nem-cél
A katalógus bekötése, a modell, a promptok, a kvóták.

## Szélső esetek
- **Ismétlődő kérdés két egyszerre épülő egységben:** a builder `crossProblems` ellenőrzése sorosan újraépíti az ütközőt
  (meglévő viselkedés).
- **Szolgáltatói túlterhelés:** a friss beszélgetés hívásonként vált tartalékra (meglévő). A párhuzamosság az egyidejű hívások
  számát növeli; a kulcsszintű korlátot élő mérés ellenőrzi.
- **Folytatás (J5):** a checkpoint tartalom-hash szerint újrahasznosít, a párhuzamos mentés sorrendje nem számít. A mentések a
  workflow-kerítés mögött mennek.
- **Haladásjelzés:** több egyszerre készülő csomagnál a felület mindet megnevezi („a 4–6. fejezet csomagjai készülnek”).
- **Érvénytelen kapcsolóérték:** a 3-as alapérték marad.

## Elfogadás (EARS)
- HA a bank N > 1 egységből áll és a párhuzamosság k, AKKOR egyszerre legfeljebb k bankhívás fut, és mindegyik friss
  beszélgetésben.
- HA `STUDIO_BANK_CONCURRENCY=1`, AKKOR a gyártás soros (a korábbi viselkedés).
- A haladásjelzés a párhuzamosan készülő csomagok fejezeteit nevezi meg.
- Élő mérés ugyanazon a forráson: közzétett lecke, és rövidebb bankidő, mint a soros alapvonal (771 s).

## Mért eredmény (2026-10-16, élő mérés, `scripts/measure/single-run-measure.mts`, eldobható DB, valódi Opus 5.5)
Ugyanaz a forrás (`030a27c0`, Ókori Egyiptom), csak a bank párhuzamossága változott (soros → 3).

| | Soros (J1–J5 után) | Párhuzamos (3) |
|---|---|---|
| Eredmény | közzétéve | közzétéve |
| **Teljes idő** | 1898 s | **1022 s (−46%)** |
| Bemenet / kimenet (token) | 642 e / 214 e | 621 e / 220 e |
| Bank: hívások / javító kísérlet / összegzett hívásidő | 11 / – / 771 s | 13 / 7 / 856 s |
| Ellenőrzés (hívások / összegzett hívásidő) | 23 / 573 s | 31 / 643 s |
| Lektor kivett banktétel | 4 | 2 |
| Kötelező tények / fogalmak a leckében | 97% / 91% | 100% / 93% |

Tartalékváltás nem volt. Az összegzett hívásidő a párhuzamos hívások összege; a falióra-időt a teljes idő mutatja. A költség
(token) gyakorlatilag változatlan; a gyorsulás tisztán a párhuzamosságból jön. A soros futás telemetriája még a javító-kísérlet
jelölése előtt készült (ott a bank „javító” értéke nem mért). Egy-egy futás: a szóródást a későbbi futások telemetriája mutatja.
