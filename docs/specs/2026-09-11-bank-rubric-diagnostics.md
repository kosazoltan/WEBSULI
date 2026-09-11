# Mintaválasz és értékelési rubrika célzott egyeztetése

## Cél és bizonyíték
Az éles újragyártás már megtartotta a 2/5/10 tételt, de egy mintaválasz a javítás után sem adott teljes pontot. A banképítő visszajelzése csak a hiányzó csoportok számát mondja meg; a modell nem kapja meg, pontosan melyik szinonimacsoportot nem ismeri fel ugyanaz az értékelő. A rövid magyar szavak ragozását az értékelő nem általánosan oldja fel. A konkrét éles hibás válasz nem mentődött, ezért az aktuális tanításból izolált visszajátszás készül.

## Módosítás
- `source/shared/lesson-experience-score.ts`: azonos illesztési szabályból lekérdezhető hiányzó kötelező szinonimacsoportok; a pontozás eredménye nem változik.
- `source/server/studio/experience-builder.ts`: pontos csoportlista a javítómodellnek, előzetes instrukció a mintában ténylegesen szereplő alakokról. A javítás megtartja a korábbi tételazonosítókat és minden minőségkaput.
- `source/tests/lesson-experience.test.ts`: rövid, ragozott magyar szavakkal tényleges hibareprodukció; javító-visszajelzés és teljes bank ellenőrzése.
- `docs/lesson-improvement.md`: rubrikadiagnosztika követelménye.

## Nem-cél
Nincs pontozási engedmény, kulcsszó automatikus törlése, mintaválasz automatikus elfogadása, többlet modellhívási kör vagy tokenemelés. A régi publikált lecke érintetlen marad.

## Elfogadás
Ha a minta pontszáma hibás, a javítómodell a konkrét nem illeszkedő csoportokat kapja meg; a javítás után ugyanaz az értékelő teljes pontot ad. Hibás/csonka/idegen fogalmú eredmény továbbra sem menthető késznek. Célzott és teljes ellenőrzés, valódi növényes modellpróba, CI, mentés, kiadás, új gyártás és tényleges publikáció/böngészőpróba szükséges.

## Visszaállítás
Kiinduló kód: adc30e6. A félbeszakadt új futás és a régi publikált tananyag megmarad; adatmentés a kiadás előtt. Új sémát vagy végpontot nem vezetünk be.

## Reprodukció és helyi ellenőrzés
Az új tanítással kapott első modellválasz mintájában „vízre”, illetve „magra” szerepelt; a required csoportokban csak „víz”, illetve „mag”. A meglévő értékelő e rövid, ragozott alakokat nem azonosítja. Az eredeti éles második válasz nem maradt meg, ezért annak pontos megfogalmazását nem állítjuk rekonstruáltnak. Az új regresszió a tényleges magyar szóalak-eltérést, a pontos csoportdiagnosztikát és a változatlan pontozást igazolja. Célzott teszt: 44/44 PASS. Teljes `npm.cmd run verify`: PASS, 1109 teszt, 0 kihagyott; lint, típusellenőrzés, build PASS. A teljes valós bankpróba a kiadás előfeltétele.
