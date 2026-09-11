# Éles előnézet: elérhető tanulási lapok

## Cél és gyökérok

Az a5c2d26 kiadás éles képi ellenőrzése megmutatta: a /preview oldal fix felső eszközsávja a nulla felső pozíción tapadó fúziós lapfülek elé kerül. A külön megjelenítő próbája nem tartalmazta ezt a külső keretet. A HTML/iframe számára korlátozott magasságú tartó a hosszú, közvetlen DOM-leckéhez sem megfelelő.

A strukturált leckénél az előnézeti eszközsáv a dokumentum természetes része legyen, a tanulási lapfülek maradjanak tapadók. A lecke tartója természetesen nőjön a tartalommal. A HTML/PDF keret méretezése és biztonsági beállítása nem változik.

Érintett: source/client/src/pages/Preview.tsx; source/tests/preview-navigation.spec.ts; kiadási bizonyíték. Nem cél a tananyag újbóli gyártása, adatbázisírás vagy minden oldal fejlécrendszerének átalakítása.

## Elfogadás

- Amikor a tanuló a tényleges előnézetben lapot vált, mind a négy lapfül látható és a középpontja egérrel/érintéssel ténylegesen elérhető, nem takarja másik elem.
- 390×844, 844×390 és 1440×900 méretben nincs vízszintes túlcsordulás. A kvíz lezáró gombja a képernyőn belül marad; álló/fekvő teljes képernyős kép szükséges.
- A HTML/PDF továbbra is a rögzített eszközsáv alatti iframe-ben nyílik meg.
- A strukturált lecke Újratöltés gombja valóban újra lekéri a lecke JSON-ját; az Új tab a lecke előnézetét nyitja, nem a HTML-helyőrzőt. Abszolút iframe-origin esetén sem fűzhet két origint egymás mögé.
- Típusellenőrzés, lint, célzott Chrome-próba, zöld PR CI, merge/deploy és éles visszaellenőrzés.

## Kiadás

Kis frontend-javítás az a5c2d26 kiadás fölött. Adatváltozás nincs. Visszaállási pont az a5c2d26 programverzió; a mentett és alkalmazott lecke változatlan. Az éles font- és adatellenőrzés már sikeres, az éles megjelenítési eredmény csak az átfedés javítása után teljes.
