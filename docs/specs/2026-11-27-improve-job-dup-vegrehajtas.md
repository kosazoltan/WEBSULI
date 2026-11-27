# IMPROVE-JOB-DUP — egy leckére egyszerre egy javítás (végrehajtás, 2026-11-27)

Forrás: review #640 (sourcery) — a `registerImprovementRoutes` az aktív javítást külön lépésben ellenőrzi, és utána
külön lépésben hoz létre jobot. Két egyszerre érkező kérés mindkettőnél „nincs aktív job”-ot lát, mindkettő jobot indít:
dupla modellhívás, dupla jelölt, a tanárnak két eredmény.

## Döntés

A foglalás atomikus: a job-sor beszúrása egy tranzakcióban, `pg_advisory_xact_lock`-kal a tananyag azonosítójára
(`hashtextextended(originalFileId, 0)`). A zár alatt újraellenőrzi az aktív (`processing`) jobot; ha van, nem szúr be.
A régi, 15 percnél (leckénél 60 percnél) régebbi `processing` sor a zár alatt hibára zárul (a szerver-újraindítás után
beragadt job eddigi viselkedése megmarad). A hívó a `null` visszatérésnél a meglévő 409-et adja.

## Elfogadás

- RED: a `improve-job-single` teszt a régi, zár nélküli beszúráson bukik.
- Párhuzamos kérésnél legfeljebb egy `processing` sor jön létre tananyagonként.
- A lejárt `processing` sor továbbra is hibára zárul, és az új job létrejön.
