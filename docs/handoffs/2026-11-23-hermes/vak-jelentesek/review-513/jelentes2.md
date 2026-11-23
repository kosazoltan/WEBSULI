# Független review — fix/merge-kapu-rest (#513)
Fej: ccb0ce331ef8cef3257ce436c497cfab6983258c
## Ítélet: NEM

A helyi kapu elavult kötelező CI-listával is zöldet adhat, és egy régebben indult futás felülírhatja az újabb futás bukott bizonyítékát. A meglévő célzott tesztek zöldek, de egyik sorrendet sem próbálják ki.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — blokkoló: 403 után a kapu elavult kötelező CI-listával dönt.** `scripts/qa/gates/pre-merge-gate.mjs:285–294,329,339`. A helyi orkesztrátornak van érvényes fejre szóló ítélete, de a közvetlen védelmi végpontot a `gh`-hoz használt jogosultsága nem olvashatja. A korai ág-válaszban csak `A` kötelező, `A` sikeres. Mialatt a kapu fut, a karbantartó `B`-t is kötelezővé teszi, commitváltozás nélkül. A késői ág-válasz már `[A,B]`-t ad, de abból a gyűjtő csak a SHA-t olvassa ki, és az első válaszból vett `[A]`-t adja át a döntésnek. Ellenőriztem a lehetséges második védelmet: a C-61 azonos SHA mellett PASS, a PR `CLEAN` állapota korábbi olvasat, a hook pedig nem ellenőrzi újra a kötelező listát (`scripts/qa/hooks/check-quality-gates.mjs:430–439`). Így a kapu zöld lehet, holott `B` még nem futott; a GitHub saját merge-védelmének eredményéről ez nem állítás. **Javítás:** a tartalék listát abból a késői ág-válaszból vedd, amelyből a main SHA-t is, vagy változás esetén bukj. A teszt két ág-válaszában változzon a `contexts`, a SHA maradjon azonos; ellenőrizze a CI-lépés bukását is.
- **L2 — blokkoló: egy korábban indult futás visszaírhatja a zöldet egy frissebb bukás után.** `scripts/qa/gates/pre-merge-gate.mjs:362,367–383`. Két helyi terminálban ugyanarra a változatlan fejű PR-ra fut a kapu. A már lezárt szálakat látó A futás a valós idejű státuszra vár. Közben az ellenőr újranyit egy szálat; B elindul, látja a nyitott szálat, és `ok:false`-t ír. A ezután visszakapja a státuszát, a korábban gyűjtött `threads` alapján dönt, és ugyanabba a fájlba `ok:true`-t ír. Az induláskori érvénytelenítés nem fogja meg ezt: a végső írás nem ellenőrzi, hogy indult-e frissebb futás. Az időbélyeg az íráskor készül (`scripts/qa/gates/pre-push-gate.mjs:253–256`), ezért a hook ugyanarra a fejre friss zöldként olvassa; nem kell hozzá új commit vagy sérült JSON. A felülíró mentés a korábbi kódban is létezett; az új érvénytelenítés nem zárja be a most garantáltnak mondott rést. **Javítás:** PR-enként szinkronizáld az érvénytelenítést és a bizonyíték közzétételét, például futásazonosítóval és zárolt, feltételes végső írással; csak a legutóbb indított futás tehessen közzé zöldet. Teszteld vezérelt A-indul, B-indul, B-bukik, A-befejeződik sorrenddel.
- **L3 — közepes: ismételt check-run rekord pótolhat hiányzó rekordot a számlálóban.** `scripts/qa/gates/pre-merge-gate.mjs:206–213,294`. Helyi `gh`-futásnál, ha egy hibás lapozott válasz kétszer adja a régi sikeres `A` futást (`id:10`), de kihagyja az újabb bukott `A`-t (`id:11`), a `total_count:2` védelem átenged: két sor van, de csak egy futás. A `requiredChecks` (`:14–29`) a régi sikert választja; a teljes listával a nagyobb ID-jű bukást választaná. Ez kód szerint ellenőrzött hibás válaszalak, az élő GitHub/proxy előfordulása **UNVERIFIED**. A `changed_files`-nál alkalmazott egyediség- és pontos darabszám-ellenőrzés itt hiányzik. **Javítás:** ellenőrizd a futásazonosítókat, utasítsd el az ismétlést, az összes oldal számlálóját egyeztesd, és a várt darabszámot pontosan követeld meg. A negatív tesztben a sorszám egyezzen, de az egyik ID ismétlődjön.
- **L4 — közepes: hibás típusú REST-mezőből `OPEN, CLEAN` készül.** `scripts/qa/gates/pre-merge-gate.mjs:147–149,251,266–283`. Ha a proxy vagy egy hibás válasz `state:["open"]`-t, illetve `mergeable_state:["clean"]`-t ad a helyi kapunak, a `String()` mindkettőből ugyanazt állítja elő, mint az érvényes szövegből. Az utóbbi esetben az újrakérés felismeri, hogy az alak nem szöveg, de a próbálkozások végén a leképező mégis `CLEAN`-t állít elő. A `draft` típusvédelme ettől független, a `decideMerge` már az elveszített típusinformáció nélkül PASS-t ad. Ez nem állítás arról, hogy az élő GitHub tömböket adna. A `mergeable` logikai mezőt a kód egyáltalán nem vizsgálja; azt nem igazoltam, hogy az élő végpontnál `clean` mellett lehet-e `null` vagy `false`. **Javítás:** ne konvertálj más JSON-típusokat állapot-szöveggé; ismeretlen vagy ellentmondó merge-állapot ne lehessen `CLEAN`. A negatív tesztek a teljes gyűjtő → PR-lépés utat járják be.
- **L5 — közepes: nulla beolvasott REST-oldal is igazolhatja, hogy nincs nyitott szál.** `scripts/qa/gates/pre-merge-gate.mjs:221–225,318–322`. GraphQL-hiba után a `--slurp` már feldolgozott `[]` külső tömbjét a kapu összemossa a `[[]]`-vel (egy ténylegesen üres adatoldal). Ha a kommentlekérés nulla oldalt ad, a CCR egy üres oldallal igazolás nélkül PASS-t eredményez; fordítva, egy üres kommentoldal mellett a nulla CCR-oldal is PASS. A W2 védelem a kilapított lista hosszát látja, nem a beolvasott oldalak számát. Az eset a gyűjtő bemeneti határán ellenőrzött; hogy az éles CLI/proxy milyen hibánál adhat ilyen sikeres kimenetet, **UNVERIFIED**. Helyi ítélet nélkül ez a teljes kaput nem teszi zölddé. **Javítás:** mindkét olvasatnál legyen kötelező legalább egy érvényes oldal; külön tesztben `[[]]` + `[[]]` mehessen át, `[]` bármelyik oldalon bukjon.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba (L3–L5).** A REST-adatok normalizálása és lapozása veszít információt. A pozitív `open/clean/draft:false` és a helyes fájlnév-leképezés tesztje zöld; csonka, többletes és duplikált PR-fájlnévre van negatív teszt (`pre-merge-gate.test.mjs:147–158,379–392`). A CI-oldalakra nincs hasonló duplikációs ellenőrzés.
2. **Biztonság és adatvédelem — talált fail-closed hiba (L1–L2); szivárgást nem találtam.** Az új GitHub-olvasások argumentumaiban repo, PR-szám, SHA és lapozási adatok vannak, nincs token vagy PR-szöveg. A `gh` shell nélkül fut, stderrje és a kapu kiírása szűrt (`pre-merge-gate.mjs:228–231`, `lib.mjs:15–29,48–64,199–213`). CSRF/origin és GET-mellékhatás itt nem alkalmazható: nem új webes író végpont, a GraphQL művelet is olvasás.
3. **Regresszió — talált hiba az új tartalékútban (L1); a meglévő PR/push út megtörése nem sikerült.** A diffben a `decideMerge` változatlan, V1 dokumentáltan csak a merge-ítélet forrását váltja. A PR/push és `record-review` regressziós tesztkör zöld. A termék névtelen, bejelentkezett és Stúdió-folyamatait a diff nem érinti.
4. **Időzóna/dátumhatár — nem alkalmazható.** A bizonyíték ISO-időpontot használ, a hook eltelt ezredmásodpercekből számít életkort (`pre-push-gate.mjs:253–256`, `check-quality-gates.mjs:437–438`), nem budapesti naptári napból. L2 eseménysorrendi, nem időzónahiba.
5. **Migráció, indítás/cron/leállítás, e2e-mód — a migráció, cron és termék e2e nem alkalmazható.** A CLI indítás/leállítás releváns: az érvénytelenítés csak induláskor történik, a végén nincs futások közti védelem (L2). A futásőr nem változott.
6. **Versenyhelyzet, ismétlés, megszakítás, időtúllépés — talált hiba (L1–L2).** A `gh` hívásonkénti időkorlátja 60 s a `ghJson`-ban; ez a hibakód ágat védi, nem a különböző időpontokból összeállított adatot és a bizonyítékot felülíró párhuzamos futást.
7. **Tesztminőség — talált lefedettségi rés.** A védelemváltó tesztben a két `branches/main` olvasat védelmi listája végig ugyanaz (`pre-merge-gate.test.mjs:367–376`); az érvénytelenítési teszt egymás utáni, nem átfedő műveleteket mér (`:347–365`). A check-run teszt tipikus csonkulást, de nem azonos darabszámú duplikációt ad (`:239–247`). A diffben nem láttam meglévő teszt törlését vagy gyengítését. V1 és a hiányzó `resolved` viselkedésváltozása dokumentált. A mutációt nem tudtam lefuttatni a futtató korlátja miatt; az állítások lefedettsége kódolvasásból származik.
8. **REST/GraphQL és EARS — részben igazolt, talált hiba.** A tiltott GraphQL → CCR lánc és a lapozási kapcsolók injektált `gh`-val zöldek. A `clean/open/nem draft` pozitív és a zárt/draft/`UNKNOWN` negatív tesztek zöldek; hibás JSON-típusokra L4. A `resolved:false` FAIL, a hiányzó `resolved` a későbbi K1 szerint adatgyűjtési FAIL; W2 teszteli a törölt gyökérre adott megmaradt választ. Az `outdated` önmagában nem zárja le a szálat a döntésben: mindkét adapter csak a felbontási jelzőt viszi tovább. A V1 helyi bizonyíték nélküli FAIL, valamint a W1 sima rekord FAIL / egyező modellű futtatórekord PASS tesztje zöld. Az élő felhőbeli lépéstábla és a CCR tényleges jelentése **UNVERIFIED**.
9. **Egyéb — talált hiba a bizonyíték fogyasztójánál látható eredményben (L2).** A hook visszaolvassa a PR jelenlegi fejét, de sem a generációt, sem az időközben újranyitott szálat nem vizsgálja. A GitHub-oldali merge valódi engedélyezését nem vizsgáltam.

## Mit próbáltam megtörni, és nem sikerült

- A követett tesztekkel: PR-szövegben lévő `IGEN` helyi bizonyíték nélkül; más fejre szóló ítélet; szigorú módban sima rekord vagy eltérő modell. Egyik sem lesz elfogadott ítélet.
- A követett tesztekkel: GraphQL-lapozási jelző hiánya, el nem fogyó GraphQL-oldalak, GraphQL után 404-es CCR, ismeretlen `resolved`, illetve valóban üres CCR megmaradt válaszkomment mellett. A próbák tartalékútra vagy kivételre futottak, nem néma PASS-ra.
- A követett tesztekkel: elavult vagy bukott bizonyíték a hookban, továbbá szekvenciális újrafuttatásnál a PR korábbi zöld fájljának érvénytelenítése. Ezek működtek; az átfedő futás más eset (L2).

## Mit NEM vizsgáltam

- Élő `gh`-t a felhős és a helyi környezet hitelesítő adataival, tényleges branch protection-, check-run- és CCR-válaszokat, valamint éles futásőrt és státuszvégpontot. A proxy és a CLI pontos hálózati viselkedése, illetve az EARS élő próba **UNVERIFIED**. Nem írtam a GitHubra, nem kértem merge-et, és nem hívtam éles szolgáltatást.
- A saját injektált ellenpróba és a mutáció végrehajtását: a futtató Node v24.22.3 alatt nem tudja a saját szkript hálózatát kizárni, ezért megtagadta a futást. Az L1–L5 bizonyítása a forrás és a tényleges hívási lánc követésén alapul; nem futtatásos reprodukció. A párhuzamos CLI-folyamatokat nem mértem élőben.
- Böngésző, képernyőkép, eldobható adatbázis: a változás CLI-kapu, nem a helyi webalkalmazás vagy az adatbázis útvonala. Ezek a futtatók nem mérik a `gh` subprocess vagy a GitHub proxy viselkedését.

## Megcáfolt gyanúk

- Nem veszik el a második, szabályosan jelzett GraphQL-oldal: a követett tesztben a második, nyitott szál megjön. Hiányzó `hasNextPage` nem minősül szabályos listavégnek.
- A nem logikai vagy hiányzó `draft` nem válik `false`-szá a produkciós gyűjtőn át: a leképező előtti ellenőrzés megállítja. Ez a védelem nem terjed ki a másik két állapotmezőre (L4).
- Az új main-csúcs nem vész el a C-61 összehasonlításból: a követett tesztben a második ág-válasz SHA-ja kerül a compare végpontra. A védelem listáját viszont ugyanebből a friss válaszból nem veszi át a kód (L1).

## Mit futtattam (parancs + eredmény)

- `git diff --stat base...head`, célzott diffek, `git log`, `git show`, valamint a változott fájlok és a kapcsolódó döntési, bizonyíték- és hook-útvonal olvasása.
- `node --test scripts/qa/gates/pre-merge-gate.test.mjs scripts/qa/gates/lib.test.mjs scripts/qa/hooks/check-quality-gates.test.mjs` — 59/59 PASS, kilépés 0, a futtató szerint 7,0 s.
- `node --test scripts/qa/gates/pre-pr-gate.test.mjs scripts/qa/gates/record-review.test.mjs scripts/qa/gates/pre-push-gate.test.mjs` — 19/19 PASS, kilépés 0.
- `node .blind-review-tmp/merge-rest-proba.mjs` — a futtató elutasította a futást a Node-homokozó korlátja miatt; nincs próbakimenet.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 2 | 2 | 0 | 0 | 0 |
| közepes | 3 | 3 | 0 | 0 | 0 |
| kicsi | 0 | 0 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) 403 után elavult kötelező CI-listával dönt a kapu — `scripts/qa/gates/pre-merge-gate.mjs:292` — hivatkozás igazolt
- **L2** (blokkoló) Régebben indult futás felülírhatja az újabb bukott bizonyítékát — `scripts/qa/gates/pre-merge-gate.mjs:383` — hivatkozás igazolt
- **L3** (közepes) Ismétlődő CI-rekord eltakarhat egy hiányzó futást — `scripts/qa/gates/pre-merge-gate.mjs:212` — hivatkozás igazolt
- **L4** (közepes) Hibás típusú REST-mezőből OPEN / CLEAN állapot áll elő — `scripts/qa/gates/pre-merge-gate.mjs:149` — hivatkozás igazolt
- **L5** (közepes) A nulla beolvasott oldalt a CCR-tartalékút üres adatoldalként fogadja el — `scripts/qa/gates/pre-merge-gate.mjs:222` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 13 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3851
- tokenek: 772527 bemeneti (ebből gyorsítótárból: 685218, gyorsítótárba írva: 87270), 11913 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 89.6%; becsült megtakarítás: 2.5166 USD
- költség (a tényleges usage alapján): 0.4059 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
