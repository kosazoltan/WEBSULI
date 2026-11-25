# Végrehajtás — `/maps/extract` tulajdonos-kötés (terv: `docs/specs/2026-11-23-maps-extract-tulajdonos.md`)

1. RED: `source/tests/lesson-draft-db.integration.ts` — új teszt „#264: a kinyerés gyorsítótára nem adja vissza más felhasználó
   térképét”: a `draft-other` gazdájú térkép a régi (tartalmi) és az új (gazda-kötött) lenyomattal is létezik; a `draft-owner`
   hívására az eredmény SHALL NOT `{ mapId: idegen, cached: true }` (modellkulcs nélkül a hívás elutasul, fizetős hívás nincs).
   Futtatás: `cd source && env -u DATABASE_URL npm run test:learning-db` → a javítás előtt BUKIK.
2. `source/server/studio/single-run/live.ts`: új `ownerMapHash(contentHash, ownerId)`; az `extractMapSingleRun` keresése
   `input_hash = gazda-kötött` VAGY (`input_hash = tartalmi` ÉS `created_by = ownerId`); mentés a gazda-kötött lenyomattal.
3. Ugyanabban a tesztfájlban: a gazda saját, gazda-kötött lenyomatú térképe visszajön (`cached: true`); a meglévő S4a-teszt (régi
   lenyomat, saját térkép) zöld marad.
4. GREEN: `npm run test:learning-db` zöld; `npm run gate:stage`, `npm run gate:push`, helyi review, `gate:pr`.

## Végrehajtási napló

- 2026-11-23 — RED: `npm run test:learning-db` 260/259, a #264-teszt bukott (az idegen térkép azonosítója jött vissza, `cached`).
  GREEN a javítás után: 261/261 (a meglévő S4a-teszt — régi lenyomatú saját térkép — is zöld).
