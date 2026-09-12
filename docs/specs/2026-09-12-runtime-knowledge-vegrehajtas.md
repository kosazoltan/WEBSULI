# Végrehajtás

1. `shared/lesson-skill.ts`: opcionális runtime-verzió a snapshotban, rögzített védekező promptinjekció-szabály; régi snapshot kompatibilitás.
2. `shared/runtime-knowledge.ts`: verziózott identitás, mód szerinti runbook, saját adatból származtatott dokumentumok, kereshető index, mért számlálók és javítási állapotok. Csak kódban karbantartott szöveg kerülhet utasításba.
3. `workflows/learning.ts`: új snapshot hash tartalmazza a runtime-verziót; injekciós hibajelzés osztályozása nyers szöveg mentése nélkül.
4. `workflows/engine.ts`: új runtime-verziós futás tényleges promptjába runbook; régi futáshoz változatlan kimenet.
5. `workflows/routes.ts`: admin és tulajdonosi védelem mögött saját runtime JSON és dokumentumexport, korlátos keresőkifejezés.
6. Unit és valódi DB/HTTP regresszió: `node --import tsx --test tests/lesson-skill.test.ts tests/runtime-knowledge.test.ts`, `npm.cmd run test:learning-db`, majd `npm.cmd run verify`. Elvárt: nulla hiba, más tulajdonos adatai kizárva, régi prompt változatlan.
7. Dokumentáció frissítés, diff-review, atomi commit; az előző kért kiadási folyamat folytatása a zöld CI és visszaállási pont után. Éles táblák/API olvasási ellenőrzése, fennmaradó böngészős akadályok valós jelentése.
