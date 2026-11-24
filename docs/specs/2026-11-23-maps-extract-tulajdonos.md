# Terv — a `/maps/extract` gyorsítótára csak a hívó saját térképét adhatja vissza (Kanban #11, nyilvántartás #264)

Forrás: review #209 lelete, `memory/projects/websuli/BACKLOG.md` („`inputHash`-alapú térkép-keresés más felhasználó térképét is
visszaadhatja”).

## Tény (kódból, 2026-11-23)

- `POST /api/studio/maps/extract` (`source/server/studio/routes.ts`) → `extractMapSingleRun` (`source/server/studio/single-run/live.ts`).
- A kinyerés a tartalmi lenyomatot (`singleRunMapHash(files, title)`) a `knowledge_maps.input_hash` oszlopban keresi, a gazdára
  szűrés NÉLKÜL: ha egy másik tanár ugyanazokat a fájlokat ugyanazzal a címmel már feltöltötte, a hívó az ő térképének azonosítóját
  kapja vissza (`cached: true`), és a további hívások (fogalom-szerkesztés, jóváhagyás, gyártás) arra a térképre hatnak.
- A térkép gazdája: `knowledge_maps.created_by` (a `saveSingleRunMap` az `ownerId`-t írja bele). A hívó: `req.user!.id`.
- Az `input_hash` oszlop egyedi (`unique`), ezért a gazdára szűrés egymagában nem elég: a második tanár beszúrása ütközne.

## Döntés

- A tárolt lenyomat gazda-kötött: `ownerMapHash(tartalmi lenyomat, ownerId)` = sha256(JSON `["owner-map-1", ownerId, tartalmi]`).
  Az új térkép ezzel kerül mentésre, így két tanár ugyanarra a tartalomra két külön térképet kap (nincs egyedi-kulcs ütközés).
- Visszafelé kompatibilitás: a javítás előtt mentett (gazda nélküli lenyomatú) térkép csak akkor jön vissza, ha `created_by` a hívó.
- A `singleRunMapHash` változatlan (a prompt-ujjlenyomat teszt rögzíti az értékét).
- Idegen térkép esetén nincs 403/404: a hívó saját, új kinyerést kap (a végpont nem azonosítót kap, hanem tartalmat).

## Nem-cél

- A többi admin-végpont (`GET /maps`, `/maps/:id`, approve, recheck) tulajdonos-szűrése: ma minden admin minden térképet lát
  (közös tanári tár) — ezt a kivonatolás javítása nem változtatja.
- Migráció: nincs (a régi sorok érintetlenek).

## Elfogadás (EARS)

- [x] E1 WHEN egy másik felhasználó ugyanazokból a fájlokból már kinyert térképet THEN `extractMapSingleRun` SHALL NOT az ő térképét
  visszaadni.
- [x] E2 WHEN a hívó saját, korábban (régi vagy új lenyomattal) mentett térképe létezik THEN SHALL azt adni vissza `cached: true`-val,
  modellhívás nélkül.
- [x] E3 THE `singleRunMapHash` értéke SHALL változatlan maradni.
- [x] E4 (PR #550 review, Sourcery) WHEN ugyanannak a gazdának két átfedő kinyerése ugyanarra a tartalomra fut THEN a második SHALL NOT
  502-vel bukni az egyedi `input_hash` miatt: az egyedi-kulcs ütközésekor a már mentett saját térkép jön vissza (`cached: true`), és egy
  folyamaton belül az egyidejű második kérés a futó munkához csatlakozik (egy modellmunka). Teszt: `lesson-draft-db.integration.ts` „PR #550”.
