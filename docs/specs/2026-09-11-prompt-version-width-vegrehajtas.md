# Végrehajtás

1. A pipeline-teszthez add hozzá a promptverzió és a tényleges Drizzle prompt_version oszlop hosszának összevetését. Futtasd a tesztet a hibás 33 karakteres konstanssal; elvárt FAIL.
2. Rövidítsd a verziónevet 32 karakter alá, megtartva az egyedi új promptazonosságot. Ne módosítsd az adatbázissémát.
3. Futtasd újra a célzott tesztet, a visszagörgetett adatbázis-indítási próbát, majd a teljes verify kört és diff-ellenőrzést. PR, zöld CI, merge és mindkét kiszolgáló revíziójának visszaolvasása szükséges.
4. Az ugyanazon négy fotóból Chrome-on indított új gyártásnál ellenőrizd a job létrejöttét, majd folytasd az új lecke tényleges publikációjáig és megjelenítéséig.
