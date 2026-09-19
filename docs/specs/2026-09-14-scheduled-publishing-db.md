# Időzített publikálás — közös adatbáziskapcsolat

## Bizonyított ok és cél
A valós localhost PostgreSQL17 próba naplójában az időzítő `https://api.0.0.1/sql` címmel hibázott. A scheduledPublishing.ts saját neon(DATABASE_URL)/neon-http kapcsolatot hoz létre, miközben server/db.ts már node-postgres poolt használ, DEV_DATABASE_URL prioritással. A Neon hivatalos dokumentációja szerint a HTTP driver helyi PostgreSQL-hez külön proxyt igényel. A megoldás a meglévő közös db használata, nem proxy vagy tesztkivétel.

## Szerződés
- Előfeltétel: alkalmazás közös db konfigurációja és scheduled_jobs séma.
- Amikor development módban DEV_DATABASE_URL létezik, az időzítő ugyanazt az adatbázist használja, akkor is, ha DATABASE_URL nincs vagy másik címre mutat.
- Ha esedékes publish_material job érvényes user/material párral létezik, változatlan SQL szerint átáll a user_id és completed státusz/idő; jövőbeli vagy már befejezett job változatlan.
- Invariáns: nincs második kapcsolat/új driver, nincs SQL/payload/sorrend/jutalom/auth változtatás.
- Hibakezelés: meglévő sikertelen job/lekérdezés naplózás változatlan; ez a szelet nem javítja a párhuzamos claimet vagy a régi fallback user üzleti logikáját.
- Nincs távoli írás, éles deploy vagy futó eredeti szerver újraindítás.

## Érintett fájlok és elfogadás
server/scheduledPublishing.ts: közös db, ugyanazon időzítő callback külön exportált futtatási függvényként. tests/scheduled-publishing-db.integration.ts: új, csak saját eldobható PostgreSQL-en futó regresszió (esedékes/ismételt/jövőbeli/DEV-only). real-learning-harness.local.mts: regressziós fájl futtatása külön folyamatban, DEV és DATABASE eltérő értékkel. Elvárt: valódi SQL PASS, Chrome50válasz PASS, typecheck/lint/build PASS, own cleanup0.

## Források
- https://orm.drizzle.team/docs/get-started-postgresql
- https://neon.com/docs/serverless/serverless-driver#developing-locally-with-the-neon-serverless-driver
- https://github.com/neondatabase/serverless/blob/main/CONFIG.md#neon-function
- Context7 Drizzle docs: Unauthorized, közvetlen gyártói dokumentáció használva.

## Verifikáció
2026-09-14 16:23Z: új valódi PostgreSQL regresszió1PASS/0FAIL/0skip (eltérő DATABASE/DEV cím, esedékes completed+user_id, ismétlés változatlan, jövőbeli pending, DATABASE_URL törlés utáni működés). A DEV-only rész már inicializált poolt vizsgál; külön DEV-only hidegindítás NOT RUN. Utána teljes Chrome50válasz/15szöveges/riport/cleanup PASS. Typecheck, lint, build és diff-check PASS; külön adverszariális review új bizonyított finding nélkül. Eredeti futó szerver nem restartolt, nincs deploy.