# Internetes tananyagkészítés valódi befejezése

## Cél és bizonyított hiba
A keresési összefoglaló után a program készítse el az ellenőrzött négyoldalas tananyagot, mentse el, és adjon megnyitható hivatkozást. A Chrome-ban reprodukált végállapot: 17 forráshivatkozás, „Készül a tananyag”, nincs előnézet, a mentés tiltott. A `web-research-routes.ts` HTML és marker nélküli modellválasz után is `complete` eseményt küld; a kliens a lezárt streamet eredményellenőrzés nélkül elfogadja. A korábbi szolgáltatói stop_reason/token/idő napló még nem hozzáférhető, a képből idő- vagy tokenkorlát nem állapítható meg.

## Hatókör
- `source/server/studio/web-research-agent.ts`, `web-research-routes.ts` és szükség esetén külön, tesztelhető futtató: egyértelmű készítési szerződés, korlátos automatikus folytatás, teljes forráskontextus, valódi terminális eredmény és mérhető diagnosztika.
- `source/client/src/components/studio/WebResearchAgentPanel.tsx` és közös stream-feldolgozó: régi eredmény leválasztása, hiányos lezárás látható hibája, ellenőrzött HTML automatikus mentése, mentési hiba újrapróbálása.
- Célzott unit és Chrome regressziók; `docs/lesson-improvement.md` folyamatleírás.

## Nem cél
Feltöltéses Studio pipeline, régi tananyagok vagy bankok tömeges átírása, modellcsere, kapuk lazítása, új adatbázisséma. A keresőtalálat önmagában nem bizonyít forrásolvasást. Szeptemberi országosan kötelező angol témasort nem állítunk bizonyíték nélkül.

## Elfogadás és szélső esetek
- Ha a modell összefoglalóval lezárja a választ, a készítés korlátosan folytatódik; az ismételten hiányzó tananyag explicit hiba, soha siker.
- A pause_turn megőrzi a teljes eszközkontextust. Csonka, elutasított vagy hibás bankú kimenet nem menthető. A kapu konkrét hibái korlátos javító körbe jutnak.
- Hálózati megszakadás vagy terminális esemény nélküli EOF látható hiba, a források/értelmes szöveg megmarad. Egy új kérés nem mentheti a korábbi eredményt.
- Érvényes HTML után a mentés szervervisszaigazolással és hivatkozással zárul. Mentési hiba esetén a jelölt megmarad és mentése újrapróbálható.
- Azonos angolos kérés valós szolgáltatói futásával ellenőrizzük a forrásokat, a teljes tananyagot, a négy lapot, a szóbeli/írásos feladatot, kvízt, pontozást, magyar ékezeteket és a mobil álló/fekvő elrendezést.
- Unit, lint, typecheck, build és célzott böngészőteszt PASS; kiadáskor zöld PR CI, külön önreview, pontos éles revision és publikált tartalom visszaolvasása.

## Kiadás és visszaállítás
Feature branch → PR → zöld CI → merge → frontend/backend éles revision ellenőrzése. Előtte ellenőrzött adatmentés és aktív készítések vizsgálata. Visszaállás: előző ellenőrzött commit/deploy; korábbi tananyagot nem írunk felül. A teszt új tananyagát csak azonosított, bizonyított saját adatként lehet kezelni. Titok/nyers környezet soha nem kerül naplóba vagy commitba.

## Mért ellenőrzések
- A bejelentett Chrome-állapot az adminlapon is látható: 17 forrás, csak összefoglaló, tiltott mentés. A régi kód kétféle befejezetlenséget is elfedett: `end_turn` dokumentum nélkül és stream-EOF terminális esemény nélkül. A konkrét régi szolgáltatói stop_reason nem áll rendelkezésre, ezért ezt nem tekintjük mért idő-/tokenhibának.
- Az eredeti rendszerprompt és azonos angolos kérés külön szolgáltatói ismétlése: 348863 ms, 31580 kimeneti token a 64000 keretből, `end_turn`; 62133 karakter. A változatlan minőségkapu PASS, 4. évfolyam, 8 módszer, 12 nyílt feladat, 24 kvíz. Ez mért sikeres referencia, nem az eredeti hibás futás naplója és még nem éles publikáció.
- A regresszió a bevezetés előtt hiányzó feldolgozó miatt FAIL; implementáció után 30/30 célzott unit PASS. A régi forrásmintázat-assertionök az áthelyezett döntési kaput követik; a kapu működési követelményeit a külön regresszió ténylegesen futtatja.
- `npm.cmd run verify`: lint, alkalmazás- és teszttípusellenőrzés, 1131 unit, build PASS. Későbbi apró mentési státuszjavítás után lint és ismételt Chrome-teszt PASS. A 4 valódi Chrome-regresszió 390×844, 844×390 és 1440×900 nézetben vizsgálta a hibajelzést, automatikus mentést, mentés újrapróbálását és megszakadt streamet. A teszt API-fixture-öket használ; a szolgáltatói és éles mentési próba külön bizonyíték.
- Maradó platformkorlát: a keresőág továbbra is egy nyitott böngészőkérésen dolgozik, lapbezárás megszakítja. A javítás ezt láthatóvá teszi, nem állít tartós háttér-jobot. A fájlfeltöltéses Studio-job útvonalat nem módosítja.

Szolgáltatói szerződés: https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons — az `end_turn` nem alkalmazásszintű eredményigazolás; a `pause_turn` teljes tartalmát vissza kell adni.
