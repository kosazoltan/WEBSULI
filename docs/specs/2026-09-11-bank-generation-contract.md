# Feladatbank-gyártás hibájának javítása

## Cél
A feltöltött növényes forrásból teljes, négy tanulási lapot és forrásfedő módszer-, nyíltfeladat- és kvízbankot tartalmazó új tananyag készül, automatikus közzététellel. A már publikált régi lecke érintetlen.

## Ellenőrzött kiindulás
A legutóbbi mentett futás 36/36 igazolt fogalom után az első fejezet bankjánál hibázott: a várt 2 módszer, 5 feladat, 10 kvíz darabszáma nem teljesült. A tanítás hat fejezete mentve van. A `callStepModel` a hosszkorláttal lezárt és nem JSON-választ külön elutasítja. A hibás bank tényleges válasza és tokenhasználata nem maradt meg; ezért a token/idő ok egyelőre nem bizonyított.

## Hatókör
- `source/server/studio/experience-builder.ts`: elsődleges és javító csomagszerződés, mérhető hibadiagnosztika.
- `source/server/studio/run-step.ts`, `step-runner.ts`: szükség esetén modellválasz-metaadat, mentett csomagdiagnosztika és hibás futás helyreállítása.
- `source/tests/lesson-experience.test.ts` és célzott pipeline-tesztek: tényleges hibaalakból regressziós esetek.
- `docs/lesson-improvement.md`: bizonyított készítési/javítási szabály.
- Ignorált helyi diagnosztika: az éles mentett bemenet izolált újrajátszása; korlátozott modellhívás, adatbázisírás nélkül.

## Nem-cél
Nincs darabszám/fedettség/forráshűség-kapu gyengítés, mesterséges bankfeltöltés, új témák, modellcsere bizonyíték nélkül, adatbázis-migráció vagy Chrome-engedély módosítása.

## Elfogadás
1. Ha a modell üres/hiányos/túlméretes vagy hibás csomagot ad, a rendszer a pontos tényleges és várt értékekkel célzottan javít; csak validált csomag menthető késznek.
2. Ha a válasz csonka vagy időtúllépés történik, az ok elkülönül a tartalmi/darabszámhibától; nincs csendes siker.
3. Ha egy csomag már megfelelő és azonos a forrása/szerződése, nem fizetünk érte újra.
4. A növényes tananyag ténylegesen elérhető új publikált leckeként; régi lecke hash-e változatlan. Mind a négy lap, magyar ékezetek, szóbeli feladat, pontozás, mobil álló/fekvő és asztali nézet ellenőrzött.
5. Lint, típusellenőrzés, releváns tesztek, build és CI PASS; merge után mindkét éles komponens az új revíziót futtatja.

## Kockázat / visszaállítás
Kiinduló revízió: `57754d4`. A diagnosztika csak olvas, a modellhívások időben és számban korlátozottak. Éles újragyártás/deploy előtt visszaállítható adatmentés; kizárólag az új gyártás módosíthat adatot. A régi publikáció és más futások megőrzendők.

## Reprodukált gyökérok
Az eredeti banképítővel és az éles futás mentett növényes tanításával reprodukálva: első válasz 35 798 ms, 3984 kimeneti token, 2/5/10 megfelelő darabszám. Egy szóbeli mintaválasz rubrikája nem adott teljes pontot. A második válasz 10 246 ms, 822 kimeneti token, 0/1/0 darabszám: csak a javított feladatot adta vissza. Mindkét lezárás `stop`; a konfigurált keret 24 000 token / 180 000 ms. A program a javítási deltát teljes új csomagként értelmezte. A korábbi éles hibás válasz nincs meg, de azonos hibát azonos mentett bemeneten előállítottuk. Nem HTML-hossz-, token- vagy timeout-hiba a reprodukált ok.

Javítás: alakilag teljes, egyedi ID-jú csomagnál a második válasz meglévő tételeket cserél ID szerint, a többit megőrzi. Ismeretlen/ismétlődő ID elutasítva. Alakilag hiányos első csomagnál teljes új válasz kell. Az egyesített eredmény minden korábbi séma-, fogalom-, rubrika- és ismétlődéskapun átmegy. Csak ez menthető kész ellenőrzőpontként.

A nyelvi leckék szószedeténél az üres vagy hiányzó javítólista szintén megtartást jelent. Nem üres glossary esetén teljes szószedetcsere történik, utólagos teljes bankellenőrzéssel. A felülvizsgálatban jelzett üres-szószedet esetet előbb bukó teszttel reprodukáltuk, majd javítottuk; a célzott kör 43/43 teszt PASS.

## Ellenőrzött eredmény a kiadás előtt
- A teljes izolált bankgyártás ugyanazon mentett növényes tanításon elkészült: 7 csomag, 14 módszer, 35 nyílt feladat, 70 kvízkérdés; 12 modellhívás, 342 066 ms. Öt részleges javítás után is megmaradtak a megfelelő tételek. Minden csomag és az összesített bank a változatlan ellenőrzési kapukon ment át.
- A korábbi tanítás 35 fogalmat rendelt a fejezetekhez; a víz általi virágporszállítás nem szerepelt a banktervben. Ez a régi mentett tanítás fedettsége, nem az új csomagkezelés eredménye. Az éles újragyártás fedettségét külön vissza kell olvasni.
- `npm.cmd run verify`: PASS; a szószedet-regresszióval együtt 1108/1108 teszt, 0 kihagyott; lint, alkalmazás- és teszttípusok, build PASS. `git diff --check`: PASS. A négy célzott Chrome készítési/helyreállítási E2E-teszt is PASS.
- Teljes éles adatmentés készült, 37 tábla. Visszaállítás izolált PostgreSQL 17-ben PASS (176 anyag, 13 lecke); éles adatírás nem történt.
- A publikálási és valódi böngészős elfogadás az éles újrafuttatás után igazolható; a helyi siker önmagában ezt nem helyettesíti.
