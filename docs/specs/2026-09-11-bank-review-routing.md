# A lektori javítás visszavezetése a feladatbankhoz

## Cél és bizonyíték
Az éles növényes futás első teljes bankja 14 módszert, 35 feladatot és 70 kvízt tartalmazott. A lektor két bankhibát és egy bankbeli nyelvi hibát talált. A `step-runner.ts` a banképítőnek nem ad lektori jegyzetet; a szerző csak kapuhiba esetén kapja az előző leckét. Így a javítás újraírásra támaszkodik, és az azonos tanításhoz tartozó hibás bank akár változatlanul újrahasználható.

## Változtatás és hatókör
- `source/server/studio/experience-builder.ts`: lektori bankjegyzetek feloldása az ellenőrzött bank tételéből fogalomazonosítókra; az érintett csomag promptjába és hash-ébe beépül a visszajelzés és az eredeti tétel. Fel nem oldható bankhivatkozás minden csomaghoz eljut. Admin-only forrásvélemény nem módosít tananyagot.
- `source/server/studio/step-runner.ts`: a jelentés körének mentése; az előző lecke és az aktuális javítandó jegyzetek átadása a szerzőnek; bankhivatkozások feloldása az előző lecke felülírása előtt, továbbítás ugyanannak a javítókörnek az animátor/bank lépéséhez.
- `source/tests/lesson-experience.test.ts`, `source/tests/lesson-pipeline-runner.test.ts`: tartalmi feedback, célzott cache-érvénytelenítés, újrafuttatás, téves/elavult hivatkozás, teljes útvonal regresszió.
- `docs/lesson-improvement.md`: a javítási útvonal követelménye.

## Nem-cél és korlát
Nem emelünk token-, idő- vagy körkeretet. Nem engedünk át hibás mintát, csonka bankot vagy lektori blokkolót. Nincs séma-migráció, általános refaktor vagy kurált forrás automatikus átírása. A régi publikált lecke megmarad. A most futó éles gyártás alatt nem indítunk kiszolgáló-újraindítással járó kiadást.

## EARS elfogadás
1. Ha a lektor a bank egy tételét hibásnak találja, a következő banképítő hívás megkapja a konkrét jegyzetet és a korábbi tételt akkor is, ha a tanítás változatlan.
2. Ha egy csomag nem érintett és a tanítása változatlan, a bankazonosítói és tartalma modellhívás nélkül megmaradnak. Ugyanazon javítás megszakítás utáni folytatása az új hash ellenőrzőpontját használja.
3. Ha egy hivatkozás feloldhatatlan vagy általános, nem veszhet el csendben. Ha a jegyzet admin-only vagy korábbi körből maradt vissza, nem vezérelhet új tananyag-módosítást.
4. Ha a szerző javítókörbe lép, megkapja az előző leckét kapuhiba hiányában is. A tételindexek még az előző bankra oldódnak fel.
5. A változatlan teljes bank-, fedettségi és lektori ellenőrzések után a tényleges éles új lecke automatikusan publikálódik; ez külön adat-visszaolvasással és böngészőpróbával igazolandó.

## Ellenőrzés és kiadás
Célzott teszt, teljes verify, diff önellenőrzés, PR és zöld CI. Éles futás lezárulása után friss adatmentés és kiadás; visszaállítási kódpont: 1f123c9. Az adatmentést és valódi eredményeket az állapotnaplóban rögzítjük.

## Megvalósítás és helyi bizonyíték
Az éles régi kódú futás utolsó hibája: a teljes darabszámú bank egyik mintája a minimális szószám alatt maradt a javítás után is. A javítás diagnosztikája ezért az értékelő azonos normalizálásából számolt tényleges és minimális szószámot is megadja. Nem csökkenti automatikusan a küszöböt; regresszió igazolja a bővített minta változatlan küszöb melletti elfogadását.
A javított csomag hash-ét a tanítás alap-hash-éhez tartozó ellenőrzőpont-hivatkozás őrzi: egy későbbi, másik hibát javító kör nem hozhatja vissza az elutasított alapcsomagot. Az aktuális jegyzetek körszűrése változatlan. A szerző az előző tanítást kapja meg, a teljes bank szövegét nem küldjük neki újra; a bankmodell csak a rá vonatkozó korábbi tételeket kapja.

51 célzott teszt PASS. Teljes `npm.cmd run verify`: lint, típusellenőrzés, 1116/1116 teszt (0 kihagyott), build PASS. `git diff --check` PASS. Önellenőrzés: régi kör, admin-only információ, feloldhatatlan cél és későbbi cache-visszaesés kezelve; az éles gyártás futása közben nem történt deploy.

A korábbi ellenőrzőpontra épülő tartalmi javítás kizárólag a lektor által megjelölt tételeket cserélheti. Csak ezek hibás kérdése/rubrikája változhat tartalmilag; a mintaválasz puszta illesztési hibájának javítása továbbra is megőrzi a korábbi kötelező csoportokat. Ugyanazon csomag második lektori javítása megtartja az első javítását. Régi, reportRound nélküli munkáknál az adatbázisból az adott kör minden lektori jegyzete betöltődik, nem csak a blokkolók.

Valódi szolgáltatós visszajátszás a növényes első kör teljes ellenőrzőpontjával: 3 célzott modellhívás, összesen 23 276 ms, mindhárom normál `stop` végjellel. Eredmény: 14 módszer, 35 feladat, 70 kvíz; három kifogásolt feladat javult. A tanulói értékelő és a teljes bankkapu PASS. Ez elkülönített bankpróba; a teljes éles új tananyag automatikus publikációját még külön kell igazolni.
