# Erőforrás-optimalizálás S2b — felesleges induló mentés, a futás→job keresés kicsomagolás nélkül

Állapot: tulajdonosi jóváhagyás 2026-10-19 (az erőforrás-elemzés minden javaslata, szeletenként). Előzmény: S1 (#324), S2a (#325).

## Mérés (2026-10-19, éles, csak olvasva + eldobható Postgres)
- **Induló mentés minden kitelepítéskor.**
  - A Render-szolgáltatásnak nincs tartós lemeze (`/v1/disks` → üres), ezért minden indulás üres `backups` mappával kezd
    („Created backups directory”).
  - A 24 órás induló-mentés őr (kanban #187) így SOSEM véd: ma 06:17, 06:34, 07:23, 07:51, 08:19, 09:57, 13:15 … mind teljes
    exportot csinált.
  - Egy export ≈ 12 MB adatbázis-olvasás (`html_files` 9,1 MB + `material_views` 2 MB + …). Napi 6–31 kitelepítésnél ez
    70–370 MB Neon-forgalom, és a fájl a következő kitelepítéskor elvész. (Az adatbázis valódi mentése a Neon PITR.)
- **A futás→job keresés.**
  - A piszkozatlista, a söprések és a jogosultság-ellenőrzés 11 helyen `w.id = j.id OR w.snapshot->>'resourceId' = j.id`
    feltétellel keres.
  - Éles mérés (`EXPLAIN ANALYZE`, csak a darabszám-lekérdezés): 145 ms, 45 742 buffer. Jobonként a teljes futástábla
    pillanatképe kicsomagolódik (186 sor, 41,5 MB), és a költség a futások × jobok számával nő.
  - **Eldobható Postgres, azonos méretarány.** A tervező ezt a ~230 kB-os pillanatképekre és mérettípusokra beállítva mérte:
    - csak egy `(snapshot->>'resourceId')` index mellett: a tervező NEM használja (kis tábla), 774 ms → 696 ms;
    - tárolt generált `resource_id` oszlop + index mellett: **0,9 ms**, 199 buffer.
    - A migráció 186 soron 0,86 s.
- **Megőrzés (törlés):** egyetlen futás vagy job sem régebbi 60 napnál (a legrégebbi 09-05) — most nincs mit törölni, ezért ez a
  szelet nem töröl éles adatot.

## Cél
1. **Az induló mentés kihagyása a Renderen** (a `RENDER=true` környezeti változó a Render minden szolgáltatásán jelen van):
   - ott a tartós lemez nélküli induló mentés csak felesleges teljes adatbázis-olvasás;
   - a napi 02:00-s ütemezett mentés és az eseményalapú mentés változatlan.
2. **Új migráció `0036_workflow_resource_id.sql`:**
   - `ALTER TABLE lesson_workflow_runs ADD COLUMN IF NOT EXISTS resource_id varchar GENERATED ALWAYS AS (snapshot->>'resourceId') STORED`;
   - `CREATE INDEX IF NOT EXISTS lesson_workflow_resource_id ON lesson_workflow_runs(resource_id)`.
3. **A kódbeli lekérdezések:** mind a 10 előfordulás (`server/studio/lesson-pipeline-routes.ts` 8, `server/workflows/store.ts` 2)
   `w.resource_id`-t használ.
   - A generált oszlopot a Postgres írja, a meglévő `INSERT`-ek (explicit oszloplista) változatlanok.

## Nem-cél
- **Megőrzési törlés:** most nincs 60 napnál régebbi sor. Ha lesz, külön döntés, mentéssel.
- **A mentés formázásának megváltoztatása** (pretty-print): nem adatbázis-forgalom; a befejezettség-ellenőrzés
  (`isCompleteBackupTail`) erre épül.
- **`studio_jobs(status)` index:** 99 sor, a tervező nem használná.
- **Drizzle-séma:** a `lesson_workflow_runs` csak SQL-migrációs tábla (`0019`), nincs a `shared/schema.ts`-ben.

## Kockázat és visszaállítás
- **Zárolás:** a migráció ~1 s-ig zárolja a táblát. A kitelepítés csak akkor indul, ha az aktív-futás őr 0-t mutat.
- **Visszaállítás:**
  - `DROP INDEX lesson_workflow_resource_id; ALTER TABLE lesson_workflow_runs DROP COLUMN resource_id;`
  - és a kód revertje (a régi kód az oszlop nélkül is működik).

## Elfogadás (EARS)
- **Induló mentés:** HA a szerver a Renderen indul, AKKOR nem készül induló mentés; a napi ütemezett mentés megmarad.
- **Keresés:** HA a piszkozatlista / söprés / jogosultság-ellenőrzés futást keres a jobhoz, AKKOR a `resource_id` oszlopon szűr
  (a pillanatkép kicsomagolása nélkül).
- **Integritás:** HA egy futás pillanatképének `resourceId`-je változik, AKKOR a `resource_id` vele változik (generált oszlop).
- **Régi viselkedés:** a meglévő DB-integrációs tesztek (piszkozat, workflow) zöldek eldobható Postgresen.
