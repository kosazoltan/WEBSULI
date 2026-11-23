# Független review — TGM S5b, 3. visszaellenőrző kör
Fej: dd124c7d634054cd4501bd125870475485b89cb7
## Ítélet: IGEN, FELTÉTELLEL
Nem igazoltam blokkolót. A nyitás kiosztását és a bank folytatását érintő eltérések külön jegyre mennek. Bázis: `dfe2ac50348a43f7b027bd11865121fff641e451`; a kör új változása `9c67d3a7` → `dd124c7d`.

## Az előző kör leleteinek sorsa
- **Korábbi blokkoló:** a kapott előző jelentésben nem volt.
- **L6 — nem szűnt meg.** A `carryVarietyMarker` továbbra is a szerzői nyitásszerződéstől függetlenül számítja újra a formát; az alkalmazás is ezt a segédet hívja. A követett teszt megerősítette a 3 → 12 átszámítást, a böngészős próba megmutatta a két eltérő címet ugyanahhoz a próbaszöveghez.
- **L7 — részben megszűnt.** A forma nélküli lektor már nem kér számon nem létező kiosztást; ezt a #534 teszt ellenőrzi. A régi szerzői szabály és a lektori mondatszám továbbra sem egyezik.
- **L5 — nem szűnt meg.** A V12 továbbra is a mentéskori kapcsolót nevezi meg. A kód helyesen a zárolt leckéből indul; az eltérő jelölő visszaolvasási tesztje zöld.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)
- **L6 — közepes: évfolyamváltáskor akkor is új fejléc kerülhet a régi nyitás fölé, ha a szerző nem kap új formát.** `source/shared/lesson-feedback-openers.ts:157–158`. A tulajdonos az asztali adminfelületen a külön nyitókapcsoló KI állapotában egy jelölt harmadikos leckét 12. osztályra igazíttat, a nyitás megtartásával. A `source/server/studio/step-io.ts:556` nem küld nyitásszerződést, de az előnézet és a zárolt alkalmazás új formát számol (`source/server/studio/structured-improvement.ts:258,321`). Az `m1`, 3 → 12 ágat a `source/tests/lesson-variety-paths.test.ts:284–293` ellenőrzi; a két szimulált jelölő `Helyzet`, illetve `Megfigyelés` fejlécet adott azonos próbaszöveghez. A teljes admin → DB út **UNVERIFIED**. **Javítás:** csak a szerzőnek ténylegesen átadott új formát vigyék át a hitelesített előnézetből az alkalmazásba; egyébként a zárolt eredeti formája maradjon.
- **L7 — közepes: a v1 javítás szerzője pontosan öt mondatot kap, a lektor már 3–6-ot ellenőriz.** `source/shared/lesson-opener.ts:236`. Nyitókapcsoló BE mellett a tulajdonos egy `valtozatossag-1` leckét javíttat. A forma nélküli jelölőhöz a `repairVarietyOption` nem ad kiosztást (`source/server/studio/structured-improvement.ts:45–46,198`), ezért a szerző `PONTOSAN 5`-öt kap (`lesson-opener.ts:74,172`). A lektor a jelölő miatt BE hatókörben fut (`structured-improvement.ts:258`, `step-io.ts:687`): már nem kér számon kiosztást, de a bázis ötmondatos szabályát 3–6-ra cseréli. A tényleges modelljegyzet **UNVERIFIED**; az `age` jegyzet egyébként nem blokkol (`source/server/studio/lektor.ts:68–70`). **Javítás:** a lektor a tényleges szerzői nyitásszerződést kövesse, a bank/visszajelzés BE állapotától külön.
- **L8 — közepes, új: folytatáskor és javításkor ugyanaz a formaazonosító más korosztály leírását adhatja a lektornak.** `source/shared/lesson-opener.ts:144`. A tulajdonos elindít egy 12. osztályos, `m2` térképes BE gyártást, az a szerző után megszakad, majd a Stúdióban folytatja. Az FNV-1a és a mulberry32 kézi újraszámítása 0-tól számítva a 2. indexet adta: a szerző az `older` csoport „Szakmai vagy erkölcsi dilemma…” leírását kapja (`lesson-opener.ts:119,148–151,171`). A checkpoint csak az `id`-t tárolja. Visszaolvasáskor az `openingFormById` az első egyezést adja (`source/server/studio/single-run/engine.ts:765–769`), így a lektor a `middle` csoport „Döntés két út között…” szövegét kapja (`lesson-opener.ts:114`, `source/server/studio/step-io.ts:687`). A két javító út is ezt a keresést használja (`source/server/studio/lesson-variety-flag.ts:40–42`). A böngészőben a magot és a keresési sorrendet önállóan számoltam, nem a szerverláncot futtattam; a modellreakció **UNVERIFIED**. A `9c67d3a7` és a bázis még nem adott visszaolvasott konkrét leírást a lektornak. **Javítás:** a checkpoint tárolja a kiosztott korcsoportot vagy a konkrét leírást is; javításkor a tárolt nyitás a saját évfolyamcsoportjában oldódjon fel.
- **L9 — közepes, új: kész bankkal folytatva kimarad az új kapuszám- és sorrendszabály.** `source/server/studio/single-run/engine.ts:945–948`. Tesztkörnyezetben a tulajdonos egy korábbi BE gyártást folytat, amely kész bankkal, a lektornál szakadt meg. A mentett `experience` miatt a motor közvetlenül a lektorhoz ugrik (`engine.ts:497–502,635–638`); a #534 felső korlátja és a végső rendezés csak a banképítőben fut (`source/server/studio/experience-builder.ts:607,930`). Egy három különböző kapukérdést tartalmazó, egyébként megfelelő kész bankot a publikálási ellenőrzés nem utasít el emiatt (`source/shared/lesson-experience.ts:287–294`); a régi sorrend is megmarad. A J5 teszt igazolja a banképítő kihagyását, a konkrét BE háromkapus közzététel **UNVERIFIED**. A bázisban az átvétel szándékos volt; az új szabály hatóköre nem fedi le ezt az ágat, a meglévő KI viselkedés nem romlik. **Javítás:** a kész bank szabályát verziózzák; a régi checkpoint megőrzése vagy újraellenőrzése legyen külön döntés, kész bankos folytatási teszttel.
- **L5 — kicsi: a V12 a futási invariánstól eltérő forrást nevez meg.** `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md:214–216,226–227`. Ha a tulajdonos az előnézet és alkalmazás közti telepítéskor kapcsolót vált, V12 szerint a jelölő a mentéskori kapcsolót követné. A kód helyesen a zárolt leckéből indul (`source/server/studio/structured-improvement.ts:305–306,315–321`). **Javítás:** a két tervhely a tárolt állapotot nevezze meg, a hitelesített új nyitás esetét külön rögzítve.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — talált hiba (L6/L8/L9).** A modelljelölő felülírását nem tudtam megtörni: a gyártás és a javítás memóriatáros tesztjei forrásvizuál BE mellett is eldobják.
2. **Biztonság/adatvédelem — próbáltam, nem találtam diff okozta hibát.** A nyilvános címke ismert szótári saját kulcsra és szövegtípusra korlátozott (`source/shared/lesson-block-label.ts:94–96`). A visszaolvasás a jelölttel való összevetésből veszi ki a `variety`-t, de a mentett sor teljes tranzakciós hash-e továbbra is kötelező (`source/server/workflows/apply.ts:22–25`). A hash- és tartalomeltérés tesztje zöld. Új éles URL, token, origin-szabály vagy GET-írás nincs a diffben.
3. **Regresszió — talált hiba a javítási és folytatási úton (L6–L9).** A mért KI promptok és kvóták egyeztek. A `/preview/s5b-v1` szimulált tárolt v1 válaszra „A lecke célja”, „Mese” fejlécet adott; a jelöletlen visszajelzés követett tesztje a régi kimenetet igazolta.
4. **Europe/Budapest — nem alkalmazható.** A módosított kiosztás nem olvas órát vagy dátumot; a javítás meglévő 30 napos határa nem változott.
5. **Migráció/indítás/cron/leállítás/e2e — migráció és ütemezés nem alkalmazható; az e2e-módot próbáltam.** Meglévő JSON mezők utaznak; a típusellenőrzés zöld. A teszt build probe-ja és a nyilvános előnézet betöltődött.
6. **Párhuzamosság és megszakadás — talált hiba (L8/L9).** A mentett BE/KI értékkel ellentétes környezetben futtatott folytatás zöld; a párhuzamos bankteszt zöld eltérő befejezési sorrend és hibás egység melletti mentés esetén is.
7. **Tesztminőség — talált hiány.** A friss job tesztje a checkpoint és a lecke formaazonosítóját hasonlítja, nem a tényleges szerzői promptot; kész bankos folytatást sem mér (`source/tests/lesson-variety-paths.test.ts:303–327`). A lektorteszt közvetlenül ad át leírásobjektumot, az L8 útját nem futtatja (`source/tests/lesson-opening-forms.test.ts:153–161`). A `nyitomese-2` → `-3` dokumentált; a régi bájtteszt maradt. A „Peti” csere miatti összehasonlítás a teljes módszersort kihagyja, bár a diffben a csere célzott. Mutációs futás nem volt.
8. **V8–V12 — V8: mért KI utak egyeznek; V9: a 100 magos forma- és névteszt zöld, javítás/folytatás L6–L8; V10: 50 magon és friss futásban zöld, kész banknál L9; V11: mért fejléc és fallback; V12: visszaolvasás zöld, dokumentáció L5.** A görgetett képeken a Gondolatkísérlet, Megfigyelés és Helyzet fejléc teljesen látható; a dokumentum `scrollWidth` / `clientWidth` értéke rendre 360/360, 844/844, 1280/1280 px.
9. **Egyéb — próbáltam, nem találtam új hibát.** Hibás alakú forma (`null`, szám, tömb, objektum) mellett zöld a régi címke tesztje. Ismeretlen szöveges formával a böngészős próba is megőrizte a régi címet.

## Mit próbáltam megtörni, és nem sikerült
A futás rögzített BE/KI állapotát ellentétes környezettel folytatáskor és tárolt lecke alapján javításkor; a modelljelölő átcsúszását forrásvizuál BE mellett; a KI promptlenyomatot és kvótát; a v1 nyitófejlécet; a hosszú jelölt fejlécet álló és fekvő nézetben; a visszaolvasást eltérő jelölővel és hibás teljes hash-sel. Ezek a mért esetekben nem törtek el.

## Mit NEM vizsgáltam
Nem hívtam fizetős modellt: a ténylegesen megírt nyitás és a téves lektori elvárás modellhatása **UNVERIFIED**. Nem futtattam a teljes admin-javítás/apply utat valódi Postgresen, éles jogosultsággal vagy telepítésváltással, illetve kész BE checkpoint teljes folytatását. A saját Node-próbát a futtató a Node 24 hálózati homokozó-korlátja miatt nem engedte elindítani; a szerverkód-mutáció és az L6–L9 saját szerverintegrációs próbája elmaradt. A nyilvános v1 próba API-szimuláció, nem tárolási teszt. A `9c67d3a7` óta változatlan és korábban nem kifogásolt ágakat nem vizsgáltam újra teljes körűen.

## Megcáfolt gyanúk
A KI hatókör `false` értéke nem esik vissza a környezetre (`??`, nem `||`). Régi, forma nélküli, de BE szerző utáni checkpoint folytatásakor nem kerül utólag forma a jelölőbe (`assignedForm = null`; a memóriatáros teszt zöld). Az első böngészős mérés üres címlistája rossz CSS-szelektorból adódott; javítva a címkék megjelentek.

## Mit futtattam (parancs + eredmény)
- `npx tsx --test source/tests/lesson-variety-paths.test.ts source/tests/lesson-opening-forms.test.ts source/tests/lesson-bank-plan-seed.test.ts source/tests/source-visuals-flag.test.ts source/tests/apply-readback.test.ts` — 53/53.
- `npx tsx --test source/tests/lesson-feedback-openers.test.ts source/tests/lesson-variety-flag.test.ts source/tests/bank-item-ref.test.ts source/tests/lesson-opener.test.ts source/tests/repair-bank-reuse.test.ts source/tests/parallel-bank.test.ts source/tests/elakadas-r1.test.ts` — 50/50.
- `npx tsx --test source/tests/single-run-engine.test.ts` — 52/52. A `DATABASE_URL` hiányára vonatkozó háttérnapló nem tesztbukás, de DB-integrációt nem igazol.
- `npx tsc --noEmit -p tsconfig.test.json` — 0.
- `run_browser_scenario .blind-review-tmp/s5b-round3.json` — hibás szelektor; `run_browser_scenario .blind-review-tmp/s5b-visual.json` — javítva három nézetben, képek megtekintve. Egyes erőforrásokra 404 naplózott, a mért fejléc és szöveg megjelent.
- `run_browser_scenario .blind-review-tmp/s5b-readback.json` — hiányzó viewport miatti elutasítás után javítva: v1 publikus fallback és `m2` mag-ellenpróba sikeres.
- `node .blind-review-tmp/s5b-round3.ts` — a futtató elutasította, nem futott.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 4 | 4 | 0 | 1 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L6** (közepes) Évfolyamváltáskor új fejléc kerülhet a megtartott nyitás fölé — `source/shared/lesson-feedback-openers.ts:158` — hivatkozás igazolt
- **L7** (közepes) A v1 javítás szerzője és lektora eltérő mondatszámot kap — `source/shared/lesson-opener.ts:236` — hivatkozás igazolt
- **L8** (közepes) A mentett formaazonosítót más korosztály leírására oldhatja fel a lektor — `source/shared/lesson-opener.ts:144` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)
- **L9** (közepes) Kész bankkal folytatva kimarad az új kapuszám- és sorrendszabály — `source/server/studio/single-run/engine.ts:945` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 29 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 4623
- tokenek: 3180721 bemeneti (ebből gyorsítótárból: 3004044, gyorsítótárba írva: 176590), 20001 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.9%; becsült megtakarítás: 11.2388 USD
- költség (a tényleges usage alapján): 0.9421 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
