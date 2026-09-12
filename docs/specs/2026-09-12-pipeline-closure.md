# Pipeline lezárás: megőrzött HTML-kvíz és éles átvétel

Cél: a generált HTML-kvíz a minták, első válaszok és eredmény megőrzését ellenőrzött közös futtatóra bízza. Újratöltés nem sorsol új kört. A feltöltési és webes teljes folyamat lezárása külön éles bizonyítékot igényel.
Nem cél: tanítás átírása, tömeges adatbázis-módosítás, eredmények utólagos kitalálása.
Érintett: shared/lesson-interactions.ts; client/src/lesson-interactions.tsx; új közös HTML-kvíz; ai/lesson-html-spec.ts; célzott böngészőteszt.
Elfogadás: első válasz marad; üres=0; újratöltés megőrzi kérdéseket/válaszokat/lezárást; új kör explicit megerősítés; bankváltozás új tárolási kulcs; hibás vagy tiltott tárolás mellett érthető jelzés; 320/844/1366 px használható. Régi HTML tanítása érintetlen, bank nélküli HTML érintetlen.
Kockázat: közös megjelenítő cseréli a fúziós HTML kvízpaneljét. Visszaállás: Git előző kiadás; tárolt tananyag változatlan. Éles adatcserét ez a szelet nem végez.

Tulajdonosi kiegészítés: minimum 15 szöveges és 15 kvízkérdés minden új készítésnél/javításnál. Új fusion-7.4-3 verzió, régi -1/-2 olvasható marad. A forráshűség és különböző kérdések kötelezők; bankminimum nem rövidkör-méret. Szöveges és kvíz pontozás és visszaállítás közös komponenssel.
