# Ciklusos felülvizsgálat — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-21-regi-anyag-ciklusos-felulvizsgalat.md`. Ág: `feat/regi-anyag-ciklus` (a #351-re épül).

1. **`server/studio/legacy-migration.ts`:**
   - `LEGACY_BATCH_LIMIT = 100` (a pillanatnyi sorelemszám: új anyag nem indul);
   - tiszta `batchRoom(total, limit)`;
   - az új foglalás a tranzakcióban az ÖSSZES sorelem számát is ellenőrzi.
2. **`server/studio/pipeline-store.ts` célág:** ha `target.classroom === 0`, a frissítés `classroom: 0` (a lecke JSON-ja változatlan).
3. **Teszt:** `batchRoom`, a kategória-döntés tiszta része (`legacyClassroom(target, detected)`).
4. **Ciklus** (minden PR):
   - a legutóbbi 5 anyag mérése (`scratchpad/legacy-audit.sh` + telemetria):
     - költség, idő;
     - javítókörök állomásonként, `answerKeyFails`, `lektorRemoved`, hibák;
   - a legnagyobb pazarlás javítása;
   - memória- és kanban-bejegyzés;
   - a korlát +5;
   - összevonás csak AKTIV=0 mellett.
