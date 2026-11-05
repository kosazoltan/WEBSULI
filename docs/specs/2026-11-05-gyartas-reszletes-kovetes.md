# Futó gyártás részletes követése kilépés után (2026-11-05)

Tulajdonosi kérés (2026-11-05, Z Fold képernyőkép): „ha véletlenül kilépek a tananyagkészítés folyamatából és visszalépek,
utána már nem mutatja részletességgel, hogy hol tart a folyamat, csak a három állomást. Lehessen látni a teljes
tananyagkészítési sort, vissza lehessen lépni, látni lehessen, ahol készíti a tananyagot.”

## Mért ok

- A részletes folyamatábra (`WorkflowMonitor` → `WorkflowGraph`: forrás, tudásbank, terv, írás, animátor, lektor, kapu…)
  csak a Készítés fülön, a `SourceUploadForm`-ban jelenik meg, és csak akkor, ha a böngészőlap `sessionStorage`-a még
  őrzi a futás azonosítóját (`websuli.studio.oneStepRunId`). Új lap / alkalmazás-újraindítás / másik eszköz után ez üres.
- A Tananyagok fül „Tananyag draftok” listája (`DraftLessons`) csak a három összevont szakaszt (`CreationProgress`) mutatja.
  A szerver lista (`ownerDrafts`) a futás azonosítóját nem is adja vissza.

## Cél

- G1: a draftlistában a futó (és a megállt) tételnél a teljes készítési sor (folyamatábra, lépésenkénti részletek,
  korábbi lépések kiválasztása) megnyitható; futó tételnél alapból nyitva.
- G2: a draftlista futó tételénél „Vissza a készítéshez” gomb: a Készítés fülre visz, és ott a futás élő követése folytatódik.
- G3: a Készítés fül visszalépéskor (üres `sessionStorage` mellett is) magától a saját, épp futó egylépéses gyártáshoz csatlakozik.

## Nem-cél

- A gyártási folyamat, a workflow-motor és a folytatás/újragyártás logikája nem változik. Új adatbázisoszlop nincs.

## Érintett fájlok

- `source/server/studio/lesson-pipeline-routes.ts` — `OwnerDraft.runId`; `GET /api/studio/lessons/one-step/active`.
- `source/client/src/components/studio/DraftLessons.tsx` — folyamatábra + „Vissza a készítéshez”.
- `source/client/src/components/studio/SourceUploadForm.tsx` — automatikus visszacsatlakozás; közös tárolókulcs.
- `source/client/src/pages/admin.tsx` — fülváltás a draftlistából.
- `source/tests/admin-draft-lessons.spec.ts` — e2e.

## Edge case-ek

- A futáshoz még nincs workflow-napló: a `WorkflowMonitor` meglévő üzenete jelenik meg.
- Nincs `runId` (régi job): a folyamatábra a job azonosítójával kér (`/workflows/:id` a `resource_id` alapján is talál).
- A tanár a Készítés fülön „Bezárás”-t nyom: az automatikus visszacsatlakozás egy csatolás alatt csak egyszer fut, nem
  nyitja újra.
- Más készítő futása nem csatolható (a végpont tulajdonosra szűr).
- Megállt tételnél a folyamatábra csak kérésre töltődik (200 tételnél sem indul 200 lekérdezés).

<!-- acceptance-checklist -->
- [x] A1: futó drafttételnél a teljes folyamatábra (`workflow-graph`) alapból látszik a draftlistában.
- [x] A2: megállt drafttételnél a folyamatábra egy gombnyomásra kinyílik, előtte nem kér le semmit.
- [x] A3: futó tételnél a „Vissza a készítéshez” gomb a Készítés fülre visz, és ott ugyanaz a futás látszik.
- [x] A4: a Készítés fül üres tárolóval is a saját futó gyártáshoz csatlakozik (`/lessons/one-step/active`).
- [x] A5: a futó tételen nincs folytatás / törlés gomb (változatlan szabály); 322–860 px-en nincs vízszintes túlcsordulás.
