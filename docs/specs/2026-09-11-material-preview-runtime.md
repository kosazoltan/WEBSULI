# Az elkészült internetes tananyag előnézetének javítása

## Tények és cél
Az éles internetes készítés 338171 ms, 29994 kimeneti token után elsőre elkészült és automatikusan elmentődött. A publikus API és az adatbázis tartalma azonos, a szigorú kapu hibamentes (4. osztály, 8 módszer, 12 feladat, 4 szóbeli, 24 kvíz).
Az éles Chrome-próba még két előnézeti hibát talált: a szerver által HTML-be illesztett segédscript a böngészőben nem létező `logger` változót használja; 844×390 nézetben a minimum 400 px magas iframe kilóg a képernyőből.

## Szerződés
- Érintett: server/routes.ts injektált böngészős naplóhívásai; client/src/pages/Preview.tsx iframe-kerete; tests/preview-navigation.spec.ts.
- A böngészős segédprogramok működjenek elérhető és blokkolt localStorage esetén, szerveroldali logger nélkül. A szerver naplózása változatlan.
- HTML/PDF előnézetnél a tényleges fejléc után fennmaradó képernyőt az iframe tölti ki. Álló/fekvő mobilon és asztali nézetben külső görgetés, alsó kilógás és levágott fejléc nélkül.
- Nem cél: a generált tananyag átírása, bankok módosítása, sandbox-jogok bővítése vagy új generálás.
- Elfogadás: tényleges beillesztett segédscript Chrome-próbája mindkét tárolási módban; három viewport keretpróbája; az éles tananyag négy lapja, üres/teljes/részpontozása és kvízválaszzárolása; teljes CI és kiadás utáni ismételt próba.

## Kiadás
Nincs adatbázismódosítás. Visszaállási pont: a8c1c2e1a1971677c0165bb03f61e76fa24dce45 és az előzőleg visszaállítással ellenőrzött adatmentés. Aktív generálás ellenőrzése kiadás előtt.

## Ellenőrzés
- 8 célzott Chrome-teszt PASS: strukturált lecke navigációja változatlan; HTML-keret három méreten; normál és opaque-origin localStorage hiba nélkül.
- Teljes helyi verify PASS (típusok, lint, unit, build).
- Önreview: sandbox-engedélyek változatlanok, csak a beillesztett script használ console-t; a szerver logger-hívásai megmaradtak. A tényleges fejlécméretből számolt maradék hely megszünteti a minimum magasság és a dupla levonás hibáját.
