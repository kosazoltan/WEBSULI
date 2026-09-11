# Tananyaggyártás: egységes forrásátirat és tartós futásjelzés

## Cél és bizonyíték
A tulajdonos legutóbbi „A virágos növények testfelépítése és a virág, termés” futása 2026-09-11 04:16 UTC-kor `parked` állapotba került: 14 függő kulcsfogalom, job és lecke nélkül. Az adatbázis olvasható, nem kapcsolatvesztés történt. A kivonatoló külön olvasta a képeket, miközben az idézetellenőrzés egy másik modell tárolt OCR-átiratát használta. Például a „szár” idézetbe bekerült egy, az átiratból hiányzó „és”. A futásazonosító csak React-állapotban maradt; navigáláskor elveszett a visszajelzés. A korábbi kész lecke nem volt az új futás eredménye.

## Hatókör
- `source/server/studio/run-extraction.ts`, `extractor.ts`, új tiszta `source-transcript.ts`: a modell és a determinisztikus ellenőrzés ugyanazt az átiratot használja; hibás idézetre korlátozott gépi javítás.
- `source/client/src/components/studio/SourceUploadForm.tsx`, `LessonStudioPanel.tsx`: futás visszaállítása, lekérdezési hiba, megállási ok és elérhető forrásellenőrzés; publikáláskor tananyaglisták frissítése.
- célzott unit és valódi böngészős regressziós tesztek; folyamatleírás, végrehajtási bizonyíték.
- az eredeti négy növényes kép újbóli beadása a javított automatikus gyártónak; teljes eredmény visszaolvasása.

## Nem-cél
Nincs adatmodell-migráció, régi tananyag törlése vagy vak felülírása. Nincs idézetellenőrzés lazítása, fogalomelhagyás, minőségkapu megkerülése. Nincs más játék vagy teljes adminfelület refaktorálása.

## Döntések és szélső esetek
- Minden forráshoz saját, pontos átirat; a képek továbbra is elérhetők vizuális kontextusként, de az idézet csak az átiratból származhat.
- Az idézetjavítás csak a hibás idézetet változtathatja, forráshelyet, fogalomazonosítót, definíciót, súlyt és kézi döntést nem. Az eredményt újra ellenőrizzük; kitalált vagy továbbra is nem igazolható idézet nem válik elfogadottá.
- Üres OCR esetén egyértelmű hiba; nincs üres átiratra fizetett gyártás. A gyorsítótár verziója változik, a régi hibás jegyzék nem mérgezi az új feldolgozást.
- Hibás/hiányzó futáslekérdezés látható és újrapróbálható; a `done` állapot megnyitható publikált tananyagot jelent.
- Megállás és hiba navigálás után is megmarad, amíg az admin bezárja vagy új futást indít. A feltöltés fájljai csak sikeres publikáláskor ürülnek.

## EARS elfogadás
1. Amikor OCR-forrás készül, a kivonatoló és az idézetellenőr azonos szöveget kapjon; a szár/virágos növény regressziós példák igazolható idézettel folytatódjanak.
2. Ha a gépi javítás nem talál pontos bizonyítékot, az ellenőrzési kapu maradjon zárt, látható okkal és elérhető forrásellenőrzéssel.
3. Ha a felhasználó elnavigál és visszatér, a gyártás állapota és eredményhivatkozása maradjon elérhető.
4. Ha a futás elkészült, a négylapos lecke, módszerek, szóbeli feladatok, kvíz és pontozás ténylegesen működjön, és az új anyag automatikusan jelenjen meg a listában.
5. Lint, típusellenőrzések, tesztek, build, PR CI, merge és mindkét éles komponens ellenőrzött telepítése szükséges.

## Kockázat és visszaállás
A szigorú forráskapu valódi bizonytalanságot továbbra is jelezhet. A javítás többlet modellhívása két körre korlátozott. Az éles újrapróbálás új anyagot hoz létre; régi anyagot nem módosít. Kiadás előtti Git-revízió: `5f653b6ef8d1c8e61e668030b010cdbe185fb82e`; adatbázis-mentés a kiadás előtt, csak figyelmesen kiválasztott új próbaeredmény vonható vissza.
