# Végrehajtás
1. Csak a HTML template-literalokban lévő logger-hívásokat cseréld böngészős console hívásokra; a szerver loggert ne módosítsd.
2. A HTML/PDF preview külső kerete dinamikus viewport magas flex oszlop legyen, normál folyamban levő fejléc és maradék helyre méretezett iframe. A strukturált LessonView működése maradjon meg.
3. A tényleges template-literalból olvasott helperrel tesztelj Chrome-ban, szerverindítás és éles adatbázis nélkül. Ellenőrizd az opaque-origin tárolási fallbacket és a normál módot is.
4. Célzott browser/typecheck/lint, majd teljes CI. Ellenőrizd a mentett éles tananyag pontozását és a kiadás után a hibamentes megjelenést. A kész tananyagot ne generáld újra.
