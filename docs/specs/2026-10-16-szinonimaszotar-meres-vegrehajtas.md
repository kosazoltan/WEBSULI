# Szinonimaszótár-mérés — végrehajtási utasítás (AI-olvasható)

Terv: `docs/specs/2026-10-16-szinonimaszotar-meres.md`.

## Fájl
`source/scripts/measure/synonym-bank-trial.mts`. Csak olvas (`withReadOnlyDb`), modellt nem hív.
- Bemenet: a T2.0 nyers `answer-key-trial.json` (esetek, kulcs `jobId:taskId`) + a jobok mentett bankja, tantárgya (`knowledge_maps.subject`), tanítása.
- `calibrateRubric` után a tanulás és az alkalmazás a terv szerint, három változatban (a / b / c), „egy jobot kihagyunk” módon.
- Az élő `arbiter_verdicts` tábla „helyes” ítéleteinek száma (csak `count`, tartalom nem).

## Futtatás (source/ mappából)
`npx tsx scripts/measure/synonym-bank-trial.mts <answer-key-trial.json> ../docs/measurements/2026-10-16-szinonimaszotar.json`

## Elvárt kimenet
JSON a következő mezőkkel:
- `baseline` (`failingCorrect`, `wrongPass`);
- `variants.{all,sameSubject,sameJobOtherTasks}`, mindegyikben `failingCorrect`, `wrongPass`, `entries`, `appliedTasks`, `guardRejected`;
- `examples` (legfeljebb 15 tanult bejegyzés);
- `arbiterCorrectVerdicts`.

Az eredmény és a döntési javaslat a terv „Eredmény” fejezetébe kerül.
