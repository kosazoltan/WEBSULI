# Mintaválasz és értékelési rubrika célzott egyeztetése

## Cél és bizonyíték
Az éles újragyártás már megtartotta a 2/5/10 tételt, de egy mintaválasz a javítás után sem adott teljes pontot. A banképítő visszajelzése csak a hiányzó csoportok számát mondja meg; a modell nem kapja meg, pontosan melyik szinonimacsoportot nem ismeri fel ugyanaz az értékelő. A rövid magyar szavak ragozását az értékelő nem általánosan oldja fel. A konkrét éles hibás válasz nem mentődött, ezért az aktuális tanításból izolált visszajátszás készül.

## Módosítás
- `source/shared/lesson-experience-score.ts`: azonos illesztési szabályból lekérdezhető hiányzó kötelező szinonimacsoportok. A lent reprodukált hibás, rubrikán kívüli szót követelő feltétel megszüntetése; a fogalom-, hossz-, tagadás- és mondatkapcsolati ellenőrzés megmarad.
- `source/server/studio/experience-builder.ts`: pontos csoportlista a javítómodellnek, előzetes instrukció a mintában ténylegesen szereplő alakokról. A javítás megtartja a korábbi tételazonosítókat és minden minőségkaput.
- `source/tests/lesson-experience.test.ts`: rövid, ragozott magyar szavakkal tényleges hibareprodukció; javító-visszajelzés és teljes bank ellenőrzése.
- `docs/lesson-improvement.md`: rubrikadiagnosztika követelménye.

## Nem-cél
Nincs kulcsszó automatikus törlése, mintaválasz automatikus elfogadása, többlet modellhívási kör vagy tokenemelés. A helyes, nyelvtanilag összekapcsolt választ nem büntetjük azért, mert minden tartalmas szava szerepel a rubrikában. A régi publikált lecke érintetlen marad.

## Elfogadás
Ha a minta pontszáma hibás, a javítómodell a konkrét nem illeszkedő csoportokat kapja meg; a javítás után ugyanaz az értékelő teljes pontot ad. Hibás/csonka/idegen fogalmú eredmény továbbra sem menthető késznek. Célzott és teljes ellenőrzés, valódi növényes modellpróba, CI, mentés, kiadás, új gyártás és tényleges publikáció/böngészőpróba szükséges.

Új, bizonyítékkal indokolt értékelési követelmény: a minden fogalmat tartalmazó természetes mondat teljes pont, a puszta kulcsszólista részpont; a opcionális bonus-csoport bővítése önmagában nem csökkentheti a pontszámot. A saját megfogalmazás eredetisége szókincs-eltérésből nem állapítható meg. A helyi pontszám továbbra is heurisztika, nem szemantikai tanári ítélet.

## Visszaállítás
Review-kiegészítés: a javítóválasz nem törölhet kötelező szinonimacsoportot vagy korábbi elfogadott alakot, és két kötelező csoportot sem vonhat össze egyetlen VAGY-csoporttá. Átrendezés és új alternatívák hozzáadása megengedett. A javító kör helyettesítés helyett bővítéssel igazítja a rubrikát; ha az első rubrika tartalmilag hibás, a javítás nem rejtheti el ezt követelménycsökkentéssel. A pozitív részlegesjavítás-tesztek mesterséges, kitalált kötelező fogalma helyett hibás mintaválaszt használunk: továbbra is hibás teljes csomagból kell teljes javított csomagot készíteniük. Külön regresszió ellenőrzi a valódi mag/magra esetet, a törlés/összevonás elutasítását és az eredeti alak megőrzését.

Kiinduló kód: adc30e6. A félbeszakadt új futás és a régi publikált tananyag megmarad; adatmentés a kiadás előtt. Új sémát vagy végpontot nem vezetünk be.

## Reprodukció és helyi ellenőrzés
Az új tanítással kapott első modellválasz mintájában „vízre”, illetve „magra” szerepelt; a required csoportokban csak „víz”, illetve „mag”. A meglévő értékelő e rövid, ragozott alakokat nem azonosítja. Az eredeti éles második válasz nem maradt meg, ezért annak pontos megfogalmazását nem állítjuk rekonstruáltnak. Az új regresszió a tényleges magyar szóalak-eltérést, a pontos csoportdiagnosztikát és a változatlan pontozást igazolja. Célzott teszt: 44/44 PASS. Teljes `npm.cmd run verify`: PASS, 1109 teszt, 0 kihagyott; lint, típusellenőrzés, build PASS. A teljes valós bankpróba a kiadás előfeltétele.

A teljes próba ötödik fejezeténél az eredeti és a javított mintaválasz is: „A takarólevelek kívülről védik a porzót és a termőt.” Minden kötelező fogalom illeszkedik, a minimális hossz és a mondatkapcsolat is teljesül. Az `ownWord` feltétel mégis elutasítja, mert a mondat összes tartalmas szava required vagy bonus. Ez helyes válaszra adott téves részpont, és a bonus bővítésével korábban még csökkenteni is lehetett a pontszámot. Az `ownWord` eltávolítása valódi specifikációjavítás; a meglévő teszteket nem gyengítjük. A pontos mintával, átrendezett helyes mondattal, kulcsszólistával, hiányzó fogalommal és tagadással új regresszió szükséges.

Végső helyi ellenőrzés: 1111/1111 teszt PASS, lint/typecheck/build PASS. Az izolált teljes növényes bank az öt korábbi, újraellenőrzött csomagból és két friss modellválaszból elkészült: 14 módszer, 35 feladat, 70 kvíz; a két új hívás 98,8 másodperc, normál stop, 4711 és 4731 kimeneti token. A végleges kóddal a teljes ellenőrzőpont újraellenőrzése 0 modellhívással PASS. Ez bankpróba, nem éles publikálás: az utóbbit a kiadás után külön vissza kell olvasni.
