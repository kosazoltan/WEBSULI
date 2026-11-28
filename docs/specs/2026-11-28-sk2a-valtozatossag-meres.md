# SK2a — változatosság gépi mérőszáma (2026-11-28)

A TGM végrehajtási terv SK2 szeletének első fele (`docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` SK2 1–4., 6.).
A leckeszintű kapu (SK2 5.) külön szelet (SK2b).

## Eltérés a tervtől

- Tulajdonosi döntés 2026-11-22 („NINCS LEVÁGÁS”): a régi bátorító nyitást a kód nem vágja le, csak megszámolja (`legacyOpenerCount`).
- A mérő a repó meglévő írásvédett DB-segédjét (`scripts/lib/read-only-db.ts`) használja `.mts` szkriptként; a munkamenet-jegyzetbeli
  `variety-*.mjs` szkriptek nem maradtak meg, ezért nincs átvétel.

## Követelmények

- `shared/variety-metrics.ts`: `sectionPattern`, `patternShares`, `samePatternProbability`, `feedbackOpenerShares` (első két szó),
  `animKindShares`, `tryShare`, `varietyReport`, `failedThresholds`; `VARIETY_THRESHOLDS` a terv szerinti értékekkel.
- `scripts/measure/variety-measure.mts --since <dátum> --baseline <fájl>`: táblázat (alapvonal | most | küszöb | megfelel);
  ≥ 10 leckénél bukó állományszintű küszöb → kilépési kód 1; kevesebbnél „kis minta”, 0. Csak összesített szám.
- `scripts/measure/fixtures/variety-baseline.json`: a 03-as jelentés összesített alapvonala.
- `tests/variety-metrics.test.ts`: kézzel számolt elvárás 4 szintetikus leckére + mutációk (azonos minta → bukik; 4 ábrából 3 azonos → jelzés;
  régi nyitás számlálva, szöveg változatlan) + a mérő kis mintás füstpróbája.

## Élő mérés (2026-11-28, publikált leckék 2026-11-24 óta, 15 lecke / 117 fejezet)

| mérőszám | alapvonal | most | küszöb |
| --- | --- | --- | --- |
| topPatternShare | 0.616 | 0.265 | ≤ 0.35 |
| samePatternProbability | 0.404 | 0.105 | ≤ 0.2 |
| topFeedbackOpenerShare (hibás válaszok) | 0.468 | 0.089 | ≤ 0.1 |

Jelzés (nem küszöb): a leckék 73%-ában egy ábrafajta az ábrák > 40%-a (`kindHeavyLessonShare` 0.733) — az SK2b kapu jelzésága ezt
naplózza; 13%-ban a try-arány < 1/3.
