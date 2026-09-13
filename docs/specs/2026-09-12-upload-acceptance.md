# Új feltöltés éles átvétele

Cél: a tulajdonos kérésére normál adminfelületről új forrás feltöltése, automatikus besorolás, teljes gyártás, közzététel, visszaolvasás; az új tesztlecke mentett javításának ellenőrzése. Alapkiadás: ffffaff7737c38d50c08edd8bf3ace12f3eb9aba.

Forrás: tmp/workflow-acceptance/teszt-haromszog-terulete.txt. Cím: TESZT – Új feltöltés és 15/15 pontozás. A forrás képletei és példái ellenőrzöttek; évfolyamot a program állapít meg.

Nem cél: meglévő tananyagok tömeges átírása, auth vagy böngészőengedély megkerülése, kézzel pótolt kész tananyag. Kódmódosítás csak bizonyított alkalmazáshiba után, külön célzott specifikációval.

Elfogadás: a fájl ténylegesen bekerül; futásazonosító követhető; újratöltés ugyanahhoz a futáshoz tér vissza; kész és visszaolvasott lecke legalább 15 szöveges és 15 kvízkérdéssel; négy lap, valódi pontozás; javítójelölt alkalmazása előtti mentés és utáni azonosító/tartalom-ellenőrzés.

Edge case: fájlválasztó jogosultsághiba, AI-hiba, forrásellenőrzésre várás, hiányos bank, párhuzamos változás. Ezek nem minősülnek sikernek. Új tesztadat keletkezhet élesben; korábbi anyag nem változik. Javítás előtt az alkalmazás visszaállítható mentése szükséges. A futó éles szolgáltatást megszakítási teszt miatt nem állítjuk le.
