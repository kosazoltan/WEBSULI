# Tanári témafókusz az egylépéses Studio-gyártásban (2026-09-29)

## Kérés
Tulajdonos (2026-09-29, a felkínált lehetőségek közül): „Javítsd: a tanár témájára szűkíts.”

## Mért hiba
Élő webes próbagyártás („Oszthatóság 3-mal és 9-cel”, 6. o.; Studio-futás `0f22a6af…`): a két letöltött
Sulinet-oldal az ÖSSZES oszthatósági szabályt tartalmazza, ezért a terv 12 fejezetéből csak 4 szólt a 3-ról és
9-ről; a 2, 4, 5, 6, 8, 10, 20, 25, 50, 100 szabályát is tanította. A tanár számonkérésének konkrét feladatai
(246, 459, 7341, 5183, ellenpélda) a tananyagszövegben nem szerepeltek.

## Gyökérok (felderítve, fájl:sor)
- A tanári kérés (`instructions` → `ownerInstruction`) a terv előtt SEMMIT nem szűkít: a hatókör-osztályozó és a
  kivonatoló nem kapja meg (`one-step.ts:55`, `run-extraction.ts:121-125`), a kurálás sem
  (`lesson-pipeline-routes.ts:503`); a `correctMapFromOwner` csak `term`/`definition`-t javít.
- A kérés csak prompt-szöveg (`shared/owner-instruction.ts:17`), amely maga is kimondja: „a kötelező fedettség …
  marad”. A kód minden `core` fogalmat és a `supporting` 90%-át kikényszeríti: `outlineCoversMap`
  (`step-io.ts:~118-145`, pedagógus: `step-runner.ts:667`), `checkCoverageGate` (`coverage.ts:81`), lektor
  `coverage_gap/core` blokkoló (`lektor.ts:64`). A kivonatoló szándékosan teljes (`extractor.ts:209`).
- Meglévő, lefedettségből kimaradó súly: `extra` (`shared/knowledge-map-schema.ts:23`) — sem a vázlat, sem a kapu
  nem követeli (`coverage.ts:66`).

## Cél
Ha a tanár kérést ad, a gyártás a kért témára fókuszál: a témához (és a megértéséhez közvetlenül szükséges
előfeltételekhez) nem tartozó fogalmak az ADOTT JOBBAN `extra` súlyúak lesznek — elérhetők maradnak, de a
lefedettség nem követeli őket. A tanári kérés (feladattípusok, példák) így valóban alakíthatja a leckét.

## Nem cél
- A közös tudástár (`km_concepts`) módosítása: a térképet a forrás-hash alapján más futások is újrahasznosítják
  (`lesson-pipeline-routes.ts:354`) — egy másik kérés nem kaphat szűkített térképet.
- A kivonatolás, kurálás, a lefedettségi küszöbök (100% core, 90% supporting) megváltoztatása.
- Kérés nélküli futás viselkedése (változatlan).

## Rögzített döntések
1. Új modul `server/studio/topic-focus.ts`:
   - `validateTopicFocus(concepts, raw)`: a modell `{ focusIds: string[] }` válaszából csak ismert `localId`-k maradnak;
     ha nincs közte `core` fogalom, vagy MINDEN fogalmat tartalmaz → `null` (nincs szűkítés).
   - `applyTopicFocus(map, focus)`: a fókuszon kívüli `core`/`supporting` fogalom `extra` lesz a visszaadott
     MÁSOLATBAN; `null` fókusz → változatlan térkép.
   - `decideTopicFocus(instruction, concepts, call)`: egy olcsó osztályozó hívás (a `gateHelper` szerep modellje,
     `callStepModel`); bármilyen hiba → `null` + figyelmeztetés a naplóban (a gyártás a teljes térképpel megy tovább).
2. `runOneStepCore` (`lesson-pipeline-routes.ts`): a `correctMapFromOwner` után, CSAK ha van tanári kérés,
   `decideTopicFocus` → `startJobFromMap(..., { instruction, corrections, topicFocus })`; a futás részletei közt:
   „Témafókusz: N/M fogalom a kért témához”.
3. `startJobFromMap`: `output.topicFocus` mentése; a pedagógus-hash a fókuszált térképből számol.
4. `step-runner.ts`: a job három térkép-betöltési pontja (lépés `:427`, kapu `:1042`, vázlat-jóváhagyás `:1214`)
   `applyTopicFocus(map, job.output?.topicFocus)`-szal dolgozik — a pedagógus, a szerző, a lektor és a kapu
   ugyanazt a fókuszált térképet látja.

## Edge case-ek
- Nincs tanári kérés → nincs osztályozó hívás, nincs fókusz.
- A modell ismeretlen azonosítót ad → kiszűrve; ha így nem marad core → nincs fókusz.
- A modell mindent kiválaszt → nincs fókusz (felesleges extra-jelölés nélkül).
- Régi jobok (`topicFocus` nélkül) → változatlan viselkedés.
- A lektor és a kapu a fókuszált térképpel mér, így a kimaradt témák nem lesznek „coverage_gap/core” blokkolók.

## Elfogadás (EARS)
- **E1** Tanári kérés esetén a rendszer SHALL a kéréshez nem tartozó fogalmakat az adott jobban `extra`-nak tekinteni.
- **E2** A fókuszált job vázlat-ellenőrzése és kapuja SHALL NOT követelni a fókuszon kívüli fogalmak lefedését.
- **E3** A közös `km_concepts` SHALL NOT változni.
- **E4** Osztályozó-hiba vagy érvénytelen válasz esetén a rendszer SHALL a teljes térképpel folytatni.
- **E5** Kapuk zöldek; az új tesztek a javítás előtti kódon buknak.
- **E6** Élő próbagyártás („Oszthatóság 3-mal és 9-cel”): a vázlat fejezeteinek többsége a 3-mal/9-cel való
  oszthatóságról szól, és a lecke `done`, visszaolvasva, böngészőben ellenőrizve.
