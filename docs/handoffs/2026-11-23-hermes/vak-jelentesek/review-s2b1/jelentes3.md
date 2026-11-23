# Független review — feat/tgm-s2b1-v2 (3. kör)
Fej: dd4e8ba7fb4ad83dae142946d5c23813204ff73d

## Ítélet: IGEN, FELTÉTELLEL

Mindkét korábbi blokkoló megszűnt. Egy kisebb DOM-hibára javaslok jegyet: a tisztító által generált SVG-háttér azonosítója kártyánként megismétlődik. Ez nem okozott hibás kirajzolást a vizsgált leckében.

## Az előző kör leleteinek sorsa

- **L2 — megszűnt.** `source/client/src/lesson-runtime/blocks/tree-cards.tsx:64–74` → `source/shared/illustration-svg.ts:163,251–257`. A `/preview/review-cards` útvonalon, 844×390-es Chromiumban, API-határon adott szintetikus tárolt leckével próbáltam. Mindkét rajz azonos `paint0` definícióból indult: az első `url(#paint0)`, a második `url( #paint0 )` alakot használt. A DOM-ban rendre `svpr0-paint0` és `svpr1-paint0` lett az ID és a kitöltés célja. Az `1-svg-fixed-844.jpg` képen a piros és a zöld téglalap is látszik. A kontrollképen a második hivatkozást az előző kör hibás alakjára állítva a zöld kitöltés eltűnt.
- **L6 — megszűnt.** `source/shared/illustration-svg.ts:253–258` a tisztított DOM attribútumain dolgozik, a szövegcsomópontokon nem. Ugyanazon előnézetben a `<text>` értéke és a képen olvasható példa egyaránt `fill=url(#paint0)` maradt. A korábbi szövegcserét visszaállítva `fill=url(#svpr1-paint0)` látszik. Mindkét kontrollmódosítás a rendes mérés után történt, az `1-svg-mutated-844.jpg` képen; a normál próba a kliensvalidációt és a lejátszót nem módosította.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L7 — kicsi, jegyre menő: minden képes kártya ugyanazt az SVG-háttér-ID-t kapja.** `source/shared/illustration-svg.ts:251` kihagyja a `PAPER_ID`-t a névterezésből; a 102. sor minden rajzhoz hozzáadja. Egy tanuló 844×390-es fekvő nézetben megnyit egy normál, kétkártyás leckét. A két háttérútvonal egyaránt `id="websuli-paper"`: a rendes előnézeti DOM-ban a próba 2 ilyen elemet és 1 különböző azonosítót mért. A base tisztítójában már megvolt a háttérjelölő, de nem volt képeskártya-megjelenítő; az előző kör `693660f9` névterezője a háttér-ID-t is átírta. A mostani javítás a kártyákon újra duplikált dokumentumazonosítót eredményez. A háttér és a gradiensek ettől még helyesen rajzolódtak ki; nem találtam tanulói hatást, ezért nem blokkoló. **Javítás:** a kártyában beillesztett SVG-ben a háttérjelölőt is tedd egyedivé, vagy használj erre külön, újratisztításkor felismert attribútumot. Az előtag nélküli, régi illusztrációs út maradjon érintetlen; a böngészős teszt a teljes kártyablokkban mérje az ID-k egyediségét.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — próbáltam, nem sikerült megtörni.** V29: a követett teszt a pontosan négyszintű, az egyágú és a 14 csomópontos fát, valamint a kilenc kártyát elutasítja; a határon érvényes fát elfogadja (`source/tests/lesson-tree-cards.test.ts:21–47,137–143`). V31: a fedettségi teszt mindkét blokkra `shown` eredményt ad (67–77. sor).
2. **Biztonság és adatvédelem — próbáltam, nem sikerült megtörni a vizsgált esetekkel.** V29 SVG-rész: a követett SVG-tisztító tesztek és a kártya renderpróbája zöldek; a tisztítás megelőzi a névterezést és a DOM-ba illesztést (`illustration-svg.ts:118–125,155–163`, `tree-cards.tsx:65–74`). A módosult út nem ad új URL-t, végpontot vagy naplózást. Ez nem teljes körű biztonsági audit.
3. **Regresszió — próbáltam, nem sikerült megtörni.** V30: a `source-visuals-flag.test.ts` lenyomatpróbái egyező KI gyártáskéréseket, sémaeredményt és hibaüzenetsorrendet mérnek, és régi leckealakokat is ellenőriznek. A promptkatalógus négy tesztje zöld; az általános illusztrációs hívók nem adnak előtagot, az illusztráció- és kontrasztregressziók zöldek. A tárolt új blokk a rendes előnézeten megjelent.
4. **Europe/Budapest — nem alkalmazható.** A vizsgált base…head változásban nincs dátum- vagy időzónalogika. A merge e-mailes változásai már a megadott base részei.
5. **Migráció, Drizzle, életciklus, e2e — az előbbiekre nincs diff; az e2e-módot nem sikerült megtörni.** A követett Playwright-spec az eldobható PostgreSQL-es futtatóval 0 kóddal zárt. Ez nem külön migráció- vagy leállításpróba.
6. **Párhuzamosság, ismétlés — találtam azonosító-ütközést (L7).** Az együtt megjelenő rajzok `paint0` azonosítói és hivatkozásai elkülönültek, a generált háttereké nem. A javított kódrész szinkron, nem indít új kérést vagy időzítőt.
7. **Tesztminőség — a konkrét L2/L6 állításokat nem sikerült gyengének bizonyítani.** A javító commit a régi, tetszőleges SVG-stringen futó próbát a valódi tisztítót hívó próbára cseréli; a szóközös hivatkozásra és a változatlan szövegre külön állítás van (`source/tests/lesson-tree-cards.test.ts:91–120`). A két hibás állapotot DOM-kontrollal visszaállítva a várt képi különbség megjelent. Ez nem a követett teszt mutált forráskódon futtatása. A javítás megközelítést cserél, nem elfogadási célt.
8. **Felület, akadálymentesség és CSS — a mért mintákon nem sikerült megtörni.** V32: a Playwright-próba mérte a két levél közös listaszülőjét és a három nézetet. A saját képeken 360×640 és 1280×800 világos, 844×390 sötét nézetben szemrevételeztem a fát és a kártyákat. A dokumentum `scrollWidth` és `clientWidth` értéke rendre 360/360, 844/844, 1280/1280 px. A 13 csomópontos fa saját keretében sem mért a próba vízszintes többletet. 360×640-en két PageDown a statikus fa mellett 1750 → 2310 → 2870 px-re vitte a függőleges helyzetet. A kártyarajzok `role="img"`-jéhez a külső kártyacímke ad nevet; a próbában megvolt mind a nyolc címkézett kép. A `.sv-pcard*` és `.sv-card*` külön szelektor; a követett spec mindkét ábrafajtát gyakorolta.
9. **Egyéb — találtam.** A tisztító saját, nem a modelltől származó dokumentumazonosítója kimarad a névterezésből (L7).

## Mit próbáltam megtörni, és nem sikerült

Megpróbáltam újra eltüntetni a szóközös SVG-kitöltést és átíratni a hivatkozásnak látszó feliratot két érvényes ábra egyidejű megnyitásával. A fej mindkettőt helyesen kezelte; a korábbi hibás DOM-állapotot visszaállító kontroll eltérő képet adott. Egyik vizsgált viewporton sem jelent meg oldalszintű vízszintes görgetés; KI állapotban a követett próbákban nem csúszott át új modellfajta.

## Mit NEM vizsgáltam

- Nem futott valódi modellhívás, éles vagy bejelentkezett Stúdió-publikálás. A KI-szerződést követett tesztek, az olvasást API-fixture mögötti böngésző mérte; a valódi tárolási és szolgáltatói integráció nincs újramérve.
- Nem futott Safari/VoiceOver, Firefox, fizikai eszköz vagy minden sáv és téma kombinációja. A Chromium-beli billentyűs görgetés és a DOM-szemantika nem igazolja a képernyőolvasós listanavigációt. Az előző körben nem kifogásolt és azóta változatlan részeket nem vizsgáltam teljes terjedelmükben újra.
- A saját, memóriában forrást mutáló Node-próbát a futtató Node-verzió miatti sandboxkorlát elutasította; helyette böngészős DOM-kontroll futott. Nem végeztem teljes SVG-szintaxislefedést, hálózati időtúllépés-/terheléspróbát vagy külön DB-integrációs kört.

## Megcáfolt gyanúk

- A szóközös `url( #paint0 )` továbbra is névtér nélkül marad: a böngészőben a helyes helyi definícióra mutat, a zöld kitöltés látszik.
- A névterezés még mindig átírja a látható SVG-szöveget: a DOM és a kép az eredeti oktatási példát mutatta.
- A közös tisztító új opciója előtag nélküli hívásnál is átnevez: a base-diff szerint az átnevezést az `idPrefix` feltétele őrzi; a követett próba előtag nélkül az eredeti ID-t és hivatkozást kapta.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/lesson-tree-cards.test.ts source/tests/source-visuals-flag.test.ts source/tests/illustration-svg.test.ts source/tests/svg-contrast.test.ts` — 49/49 zöld; a tesztfolyamat naplózott DB-kapcsolati figyelmeztetést. `npx tsx --test source/tests/studio-author-catalog.test.ts` — 4/4 zöld.
- `npx tsc --noEmit` — 0.
- `run_e2e source/tests/source-visuals.spec.ts` — 0; eldobható DB és repó-e2e-futtató.
- `run_browser_scenario .blind-review-tmp/round3-published.json` — megjelent mindkét helyes szín és az érintetlen felirat, a DOM-kontroll visszahozta a régi tüneteket; kimérte a duplikált háttér-ID-t. `run_browser_scenario .blind-review-tmp/round3-views.json` — három viewport, hat megnézett kép; `run_browser_scenario .blind-review-tmp/round3-keyboard.json` — két sikeres billentyűs lapozás. Mindhárom futás 0; az összevont, nyolcképes forgatókönyvet a futtató még indulás előtt elutasította a képlimit miatt.
- `node .blind-review-tmp/round3-mutation.mjs` — a sandbox nem engedte elindítani, nem számít futtatott tesztnek.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 0 | 0 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 1 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
(nincs)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 19 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3370
- tokenek: 1231150 bemeneti (ebből gyorsítótárból: 1139064, gyorsítótárba írva: 92029), 15353 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 93.2%; becsült megtakarítás: 4.2364 USD
- költség (a tényleges usage alapján): 0.4976 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
