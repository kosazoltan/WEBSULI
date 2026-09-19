# Végrehajtási utasítás: one-step finalization fix

## Feladat

A one-step tananyaggyártási folyamat generikus „Váratlan hiba történt” üzenetét a valódi végállapotból eredő háttérhibák fölé helyezett helytelen overwrite miatt kell javítani.

## A javítás felbontása

1. A relevant file-ok beolvasása:
   - source/server/studio/lesson-pipeline-routes.ts
   - source/server/studio/step-runner.ts
   - source/server/workflows/engine.ts
   - source/server/studio/one-step-progress.ts
2. Ellenőrizni, hogy a `void runOneStep(...).catch(...)` blokk a végső `done`/`parked` állapotot felülírja-e generikus hibára.
3. A hibahelyet minimálisan javítani úgy, hogy a terminal state és a flow közötti konzisztencia megmaradjon.
4. Ha a readback/lesson lookup hibára fut, a valódi hibaüzenetet visszaadni, ne a generikus fallbacket.
5. Célzott tesztet futtatni a végállapotok konzisztenciájára.

## Fájlok és műveletek

- source/server/studio/lesson-pipeline-routes.ts
  - a `runOneStep` metódus catch ágon legyen védett a terminal-state overwrite ellen.
  - `run?.phase === "done"` vagy `"parked"` esetén ne írja felül az error-t.
- source/server/studio/step-runner.ts
  - nem változtatunk a tényleges pipeline lépésein; csak a mintavételek szerint a végállapotok konzisztenciája legyen helyes.
- source/server/workflows/engine.ts
  - a workflow végén történő `error` overwrite ne takarja el a már elért valós végeredményt.
- source/tests/lesson-pipeline-runner.test.ts
  - célzott regressziós teszt: valid `done` run ne legyen `error` after catch, és a `parked` state ne fusson generikus errorre.

## Ellenőrzés

- `cd d:\repo\WEBSULI\source && node --import tsx --test tests/lesson-pipeline-runner.test.ts`
- Ha szükséges, a releváns részfutás a `--test-name-pattern` használatával.

## Elvárt kimenet

- A run végső állapota már nem generikus hiba, hanem a tényleges `done` vagy `parked`.`
- A one-step progress poll ugyanazt az állapotot adja vissza, amit a pipeline ténylegesen elért.
