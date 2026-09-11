# Promptverzió adatbázis-hosszkorlátja

Cél: az új tananyag-job a tényleges adatbázisba beírható legyen. Az éles indulás a modellhívás előtt megállt; visszagörgetett valódi INSERT reprodukció: PostgreSQL 22001, varchar(32) túl hosszú. A promptverzió 33 karakteres, a studio_jobs.prompt_version legfeljebb 32.

Hatókör: step-runner.ts verziókonstansa; lesson-pipeline-runner.test.ts regressziója a meglevő Drizzle-oszlopszélességhez. Nincs séma-migráció, modellváltás vagy minőségkapu-módosítás.

Elfogadás: a jelenlegi konstanssal előbb bukó, majd javítás után zöld szélességteszt; valódi startJobFromMap tranzakciós próba sikeres és visszagörgetett; verify és CI sikeres. Éles kiadás után normál Chrome-indítás ténylegesen létrehozza a munkát, majd a korábbi teljes publikációs ellenőrzés folytatódik.

Visszaállítás: d2fe956 kódpont, meglévő teljes visszaállítással kipróbált adatmentés. Jelenleg nincs futó növényes job, csak lezárt indítási hiba. A kiadás nem szakíthat aktív gyártást.

Bizonyíték: a regresszió előbb 33 > 32 miatt bukott. A javított név 25 karakter; a valódi adatbázison a startJobFromMap INSERT és output-mentés sikeres, a próba ROLLBACK-kel zárult. A célzott pipeline 30/30, a teljes egységteszt 1117/1117 (0 kihagyott) PASS. A vizsgálat nem hívott tananyagot készítő modellt, és nem módosította a régi publikált leckét.
