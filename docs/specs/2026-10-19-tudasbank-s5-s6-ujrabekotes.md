# Tudásbank S5/S6 újrabekötése az egyfutásos gyártásba (kanban #1120)

Állapot: tulajdonosi jóváhagyás 2026-10-19 („bekössem őket újra, alapból kikapcsolva? … igen”). A fizetős A/B mérés külön lépés.

## Probléma
- **A két funkció korábban:**
  - S6 — tantárgyi katalógus (`docs/specs/2026-10-06-s6-katalogus-bekotes.md`): a lecke saját tantárgyi bankjának mintái és
    szó szerint átvehető kvízei a tervezőnek, a szerzőnek és a gyakorlóbanknak.
  - S5 — tantárgyi memória (`docs/specs/2026-10-06-s5-tantargyi-memoria.md`): a tantárgy visszatérő hibáiból karbantartott
    szabálysorok.
  - Mindkettő kapcsoló mögött volt bekötve a régi lépésgépbe.
- **Az S4b (d9e9c8e9) óta:** a lépésgéppel együtt törlődött a bekötés is (`server/catalog/s6-context.ts`, a betöltők, a
  promptba fűzés).
  - Az egyfutásos motor (`server/studio/single-run/engine.ts`) a `buildLessonExperience`-nek sem `catalog`-ot, sem `memory`-t
    nem ad.
  - A `STUDIO_CATALOG_S6` és a `STUDIO_SUBJECT_MEMORY` kapcsoló így hatástalan.
  - Az élő rögzítés (a memóriakártyák képzése) közben fut.

## Cél
Ugyanaz a viselkedés, mint az S4b előtt, az egyfutásos motorban, változatlan kapcsolókkal, **alapból kikapcsolva**.

- **`STUDIO_CATALOG_S6=1`:**
  - a lecke tantárgyának aktív katalógus-tételeiből pool készül;
  - a pool jobonként egyszer töltődik, és a `job.output.catalog`-ba kerül; folytatáskor ugyanaz, téma- vagy évfolyamváltásnál
    újratöltődik;
  - a tervező (2. állomás) és a szerző (3. állomás) kérése a `planningContextBlock`-ot kapja (tantárgyi skill +
    katalógus-minták);
  - a bank a `catalog`-ot kapja.
- **`STUDIO_SUBJECT_MEMORY=1`:**
  - a tantárgy nyitott memóriakártyáiból pillanatkép készül, jobonként egyszer, a `job.output.subjectMemory`-ba;
  - a tervező a `pedagogue`, a szerző az `author`, a bank a `bank` szerep blokkját kapja (`snapshotPromptBlock`).
- **Fail-open:** ismeretlen vagy kétértelmű tantárgynál, betöltő nélkül vagy betöltési hibánál a gyártás a funkció nélkül fut,
  és ez naplózódik.

## Nem-cél
- A fizetős A/B mérés. Külön tulajdonosi lépés, mert a kapcsoló bekapcsolása valódi gyártási költséggel jár.
- A katalógus és a memória képzésének, illetve az admin felületnek a módosítása.
- Az alapértelmezés megváltoztatása (bekapcsolás élesben).

## Érintett fájlok
- **Visszaállítva:** `server/catalog/s6-context.ts` (a d9e9c8e9^ változat).
- **`server/studio/pipeline-store.ts`:** két opcionális betöltő (`loadCatalogRows`, `loadSubjectMemory`) a típusban és a
  Drizzle-megvalósításban.
- **`server/studio/single-run/engine.ts`:** a két `ensure…` segéd, valamint a 2. és 3. állomás kérése és a bank.
- **Tesztek:** `tests/single-run-knowledge.test.ts` (új).

## Edge case-ek
- **Kikapcsolt kapcsolók:** a betöltő nem hívódik, a 2. és 3. állomás kérése bájtra azonos a mostanival, a bank opciói
  változatlanok.
- **Bekapcsolt kapcsoló, üres pool / nincs nyitott kártya:** üres blokk → semmi nem kerül a promptba (nincs üres fejléc).
- **Folytatás:** a mentett pool / pillanatkép újrahasznosul. A betöltő nem fut újra, ha a tantárgy, az évfolyam és a téma
  egyezik.
- **Betöltési hiba:** a gyártás megy tovább, `[EGYFUTÁS]` naplósor.
- **Jóváhagyott tervvel induló futás:** a tervező nem fut, a szerző és a bank ugyanúgy kapja a blokkot.

## Elfogadás (EARS)
- **Kikapcsolva:** HA egyik kapcsoló sincs bekapcsolva, AKKOR a betöltők nem hívódnak, és a 2. és 3. állomás kérésének szövege
  azonos a kapcsoló nélküli futáséval.
- **S6 bekapcsolva:** HA a `STUDIO_CATALOG_S6=1`, AKKOR:
  - a 2. és 3. állomás kérése tartalmazza a „TANTÁRGYI KATALÓGUS — MINTÁK” blokkot;
  - a bank megkapja a poolt;
  - a pool a jobra mentődik, és a betöltő egyszer fut.
- **S5 bekapcsolva:** HA a `STUDIO_SUBJECT_MEMORY=1` ÉS van nyitott kártya, AKKOR a 2. és 3. állomás kérése tartalmazza a
  „TANTÁRGYI MEMÓRIA” blokkot, és a pillanatkép a jobra mentődik.
- **Betöltési hiba:** HA a betöltő hibát dob, AKKOR a futás közzétesz, és a hiba naplózódik.
