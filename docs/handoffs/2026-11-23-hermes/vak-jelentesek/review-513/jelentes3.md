# Független review — fix/merge-kapu-rest
Fej: 87ccd6c3eb5fd26c3370a91c37c874111a6710f7
## Ítélet: NEM

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — Blokkoló: a megszakadt vagy íráshibás futás után a hook még elfogadhatja a régi ZÖLD-et
**Hely:** `scripts/qa/gates/pre-merge-gate.mjs:213–218`; fogyasztó: `scripts/qa/hooks/check-quality-gates.mjs:430–439`.

**Forgatókönyv:** A helyi orkesztrátornak még érvényes ZÖLD bizonyítéka van az aktuális PR-fejre. Újraindítja a kaput. Az új futásazonosító kiírása után, de a régi rekord felülírása előtt a futás megszakad; ugyanez előáll, ha a mappába az új futásjelölő írható, de a régi rekord felülírása jogosultsági hibát ad. A kapu bukik vagy nem fejeződik be, de a hook a változatlan fejhez továbbra is az előző `ok: true` rekordot találja.

**Evidencia / cáfolati kísérlet:** A két művelet külön írás (`:216–217`), és a `startMergeRun` a `main` adatgyűjtési `try` blokkja előtt van (`:410–414`). A PR-zár kizárja a másik **írót**, de a fogyasztó sem a zárat, sem a futásjelölőt nem nézi: a PR-szám, a fej, az `ok` és a kor alapján enged. A feltételes publikálás nem segít, mert a hibás futás odáig sem jut. A `check-quality-gates.test.mjs:165–166` meglévő engedési esete futásjelölő nélkül is elfogad friss zöld rekordot; a `pre-merge-gate.test.mjs:404–417` csak sikeres indítással és írással vizsgálja a futások sorrendjét. A fájlírási hiba célzott próbáját a homokozó nem indította el; a lelet közvetlen kódnyomon alapul, nem tényleges összevonáson.

**Javítás:** Az érvénytelenítés és a fogyasztói ellenőrzés egyetlen érvényességi protokollt alkosson. Például a hook az indítási kritikus szakasz alatt tiltson, utána pedig csak a jelenlegi futásazonosítójú, atomikusan publikált rekordot fogadja el. A régi formátum kezelését és a beragadt zár feloldását is fail-closed módon kell megtervezni. Ehhez a hookot érintő tervhatárt külön egyeztetni kell. Regressziós teszt: a régi rekord felülírása hibát dob, a tényleges bizonyítékfogyasztó pedig tilt.

### L2 — Közepes, jegyre: a késői kötelezőlista-ellenőrzés csak a tartalékúton működik
**Hely:** `scripts/qa/gates/pre-merge-gate.mjs:376`; első olvasás `:327–338`, döntés `:94–97`.

**Forgatókönyv:** Helyi futáskor az adminjogú védelmi végpont HTTP 200-zal az `A` kötelező ellenőrzést adja. A check-runok vagy review-szálak lapozása közben az admin `B`-t is kötelezővé teszi, a PR-fej és a main SHA-ja változatlan. `A` sikeres, `B` nem futott. A késői `branches/main` már `[A, B]`-t ad, de a kapu csak `[A]`-t ellenőriz, így a kötelező CI-lépés PASS; ha a többi lépés zöld, maga a kapu is ZÖLD.

**Evidencia:** A késői válasz mindkét ágon megérkezik (`:373`), de a lista csak `requiredFromBranch` mellett cserélődik. Az egyébként azonos 403-as eset FAIL, és ezt a `pre-merge-gate.test.mjs:395–402` teszt ténylegesen fedi. A GitHub saját védelme ettől még blokkolhatja a merge-et; a lelet a kapu hamis ítélete. A korai olvasás már a base-ben is létezett, de az új késői ellenőrzés csak az egyik ágat védi, a lapozás közben pedig változhat a védelem.

**Javítás:** Mindkét forrásnál a gyűjtés végén olvasd a kötelező listát, illetve észlelt ellentmondásnál bukj vagy kérj új adatgyűjtést. Ugyanazt a versenytesztet futtasd sikeres védelmi végponttal és 403-as tartalékúttal is.

### L3 — Közepes, jegyre: ismétlődő check-run elfedheti a hiányzó rekordot
**Hely:** `scripts/qa/gates/pre-merge-gate.mjs:250–255`; fogyasztás `:19–24,338`.

**Forgatókönyv:** Helyi futásban a lapozott REST-válasz `total_count: 101` mellett 100 különböző rekordot hoz az első oldalon, a második oldalon pedig egy már megkapott ID-t. Az első oldalon ott van `A` régebbi sikeres futása; a hiányzó rekord `A` újabb bukott futása. A lapok egyesítése 100 + 1 rekordot számol, de csak 100 az egyedi ID. A kapu átengedi a listát, majd a megmaradt régi sikert értékeli. Ez a kapu bemeneti ellenpéldája; élő GitHubon a lapok tényleges ismétlődését nem mértem.

**Evidencia:** Csak az első oldal számlálója és a nyers elemszám alsó korlátja számít; nincs ID-ellenőrzés. Ha a hiányzó rekord a listában lenne, a változatlan `requiredChecks` a magasabb ID-t választaná és FAIL-t adna. Ez különbözik az egyszerűen túl rövid listától, amelyre van kivétel és teszt (`pre-merge-gate.test.mjs:242–247`).

**Javítás:** Lapozás után ellenőrizd az ID-k alakját és egyediségét, valamint a számlálók konzisztenciáját és az egyedi darabszámot. Eltérésnél korlátos teljes újraolvasás vagy FAIL. Negatív teszt: helyes nyers darabszám, ismételt ID, kimaradt újabb bukott futás.

### L4 — Közepes, jegyre: hibás REST-mezőtípusból `OPEN / CLEAN` lehet
**Hely:** `scripts/qa/gates/pre-merge-gate.mjs:149–151,293,308–325`.

**Forgatókönyv:** A helyi kliens szerkezetileg hibás, de sikeres JSON-választ kap: `state: ["open"]`, `mergeable_state: ["clean"]`, `draft: false`, minden egyéb mező érvényes. A kapu ezt elfogadja, ha az újrakérések is ugyanazt adják, és a PR-állapot PASS lesz. A külön-külön hibás mező ugyanígy átmegy.

**Evidencia:** Az egyelemű tömb `String(...)` alakja az elem szövege. A `mergeableKnown` az ilyen értéket csak újrakérésre jelöli; a ciklus után nincs kötelező típusellenőrzés. A szigorú `draft`-ellenőrzés ettől független. A leképezés után a változatlan `decideMerge` két érvényesnek látszó stringet kap (`:89–92`). A lelet hibás 200-as válasz esetére szól, nem állítja, hogy az élő GitHub ilyen formát küldött.

**Javítás:** Az adatgyűjtés végén csak string állapotot fogadj el; a hiányzó/null `mergeable_state` maradjon `UNKNOWN`, a többi hibás típus ne válhasson `CLEAN`-né. Legyen teszt az ismételten hibás mezőtípusra az adatgyűjtőn át.

### L5 — Kicsi, jegyre: a terv ugyanarra az adatra két különböző szerződést ad
**Hely:** `docs/specs/2026-11-18-merge-kapu-rest.md:34–37,54–62,71–77,109–111`.

**Forgatókönyv:** A terv alapján egy karbantartó a REST-es PR-kommentek lekérését vagy a hiányzó `resolved` mező döntési lépésig továbbengedését írja meg, mert ezt kéri a Megoldás és az EARS. A későbbi V1/K1 viszont már tiltja a kommenteket mint ítéletforrást, és alaki hibánál adatgyűjtési FAIL-t kér. A retry-leírás is három *újrakérést* ír, a kód kettőt végez (egy kezdeti kérés + két újrakérés, a megadott két várakozással).

**Javítás:** A jelenlegi szerződés legyen a Megoldás és az EARS szövege is: nincs PR-komment-lekérés ítélethez; hiányzó `resolved` → adatgyűjtési FAIL; legfeljebb három kérés összesen. A felülírt változat csak történetként maradjon meg a végrehajtási dokumentumban.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — talált hiba.** L3–L4. A REST fájllista külön ellenőrzi a `changed_files`-t, az egyedi fájlneveket és a pontos darabszámot (`pre-merge-gate.mjs:238–244,319–325`); a check-run szerződés nem ilyen szigorú. A V1 ítéletbekötése `texts: []`, az egzakt fejhez kötés a közös `lib.mjs:264–272`-ben megvan.
2. **Biztonság és adatvédelem — talált hiba a helyi bizonyíték érvényességénél (L1).** Az új GH-hívások lekérdezések, a GraphQL-törzs query; nem találtam GitHub-módosítást vagy közvetlen URL-be tett hitelesítőt. A GH-stderrt szűri a `ghJson`, a kapukimenet a `redact`-on megy át (`pre-merge-gate.mjs:270–273`, `lib.mjs:15–29,199–205`). CSRF/origin nem alkalmazható a helyi CLI-ra. Az alap helyi ítéletmód önigazolási kockázata a tervben ismert korlát.
3. **Regresszió — talált hiba a kapu útvonalain (L2–L4); alkalmazásfolyamatokra nem alkalmazható.** A base-diffben a `decideMerge` törzse és küszöbei változatlanok. A közös `resolveVerdict` és a hook nem változott; a regresszió az átadott adatoknál, illetve a már meglévő hook és az új író közötti szerződésnél van. Névtelen/bejelentkezett felhasználó, régi anyag és Stúdió-lecke útvonalát a diff nem érinti.
4. **Europe/Budapest — nem alkalmazható.** A rekord `toISOString()`-ot tárol (`pre-push-gate.mjs:253–256`), a hook időbélyegek különbségéből számol percet (`check-quality-gates.mjs:437`); nincs helyi napváltási döntés.
5. **Migráció, indítás, cron, e2e — migráció/cron/e2e nem alkalmazható; CLI-indításnál talált hiba (L1).** Csak dokumentáció és a merge-kapu modulja/tesztje változott. A kapu a bizonyíték futásának indítását az adatgyűjtés előtt végzi, és nem indít összevonást.
6. **Párhuzamosság, ismétlés, megszakítás — talált hiba (L1, L2, L3).** A sikeres soros indítások mellett a régebbi késői publikálását a futásazonosító ténylegesen védi. A fogyasztó nem vesz részt ebben a védelemben; a lapozott lekérdezések pedig nem azonos pillanatból származnak.
7. **Tesztminőség — talált lefedettségi és specifikációs hiány.** Az eredeti döntési tesztek nem lettek gyengítve. Az új tesztek valódi viselkedést mérnek, de a sikeres indítási sorrend nem fedi L1-et, a késői listát csak 403-mal mérik, a darabszámot pedig ismételt ID nélkül. A V1/W2 módosítás dokumentált, de maradtak vele ellentmondó korábbi pontok (L5). Kód alapján a W1 egyszerű rekordos negatív állítása érzékeny a szigorú mód elhagyására; mutációt nem tudtam lefuttatni.
8. **REST/GraphQL és EARS — részben igazolt, talált hibák L2–L4.** (a) GraphQL 403 után az injektált CCR-út gyűjt, helyi ítélet nélkül a döntési teszt FAIL-t ad; a két rész működését a teszt külön méri. (b) `open/clean/false` → PASS; `draft: true`, zárt, `unknown`/null → FAIL. (c) `resolved: false` → FAIL; hiányzó mező a későbbi K1 szerint már az adatgyűjtésnél FAIL. Az `outdated` nem feloldási jel, a kód nem szűri ki az ilyen szálakat; tényleges CCR-válaszminta UNVERIFIED. (d) A követett leképezőtesztek zöldek. (e) Az élő felhős elfogadás UNVERIFIED. (f) W1: szigorú módban sima rekord FAIL, futtató-rekord egyező modellel PASS, eltérő modellel FAIL (`pre-merge-gate.test.mjs:224–237`).
9. **Egyéb — talált hiba (L5).** A végrehajtási dokumentum korábbi része szintén a már felülírt PR-szöveges ítéletet és kommentlekérést említi; a későbbi V1 helyesbítés megvan, de nem az elsőként olvasott szerződésben.

## Mit próbáltam megtörni, és nem sikerült

- Futtattam a követett negatív eseteket: csonka fájllista, hibás `draft`, hiányzó GraphQL-lapozási jelző, GraphQL-korlát után sikertelen CCR, hiányzó CCR `resolved`, üres CCR megmaradt válaszkomment mellett. Ezek a fixture-ök nem adtak hamis zöldet.
- V1/W1: a tulajdonosi fiókkal írt szöveges ítélet és a másik fej bizonyítéka nem jut át; egyszerű helyi rekord szigorú módban nem elég. A lib többi hívójának korábbi PR-szöveges viselkedését nem írja át a merge-kapu.
- A futások egyszerű felcserélési esete (A indul, B indul, B bukik, A utána zöldet próbál írni) nem írja felül B-t. Ez nem védi az L1 szerinti részben megtörtént indítást.

## Mit NEM vizsgáltam

- **UNVERIFIED:** élő felhős proxy, valódi CCR-válasz/-lapozás, és fejlesztői gépen a `gh` verzió- és jogosultsági mátrixa. Következmény: a terv élő EARS-pontja nem igazolt; az ismert V5 darabszám-korlátot nem minősítettem új leletként.
- **UNVERIFIED futtatással:** saját fájlírási megszakítás, az új negatív REST-fixture-ök és mutáció. A futtató a saját fájlok végrehajtását a Node v24.22.3 homokozó hálózattiltási korlátja miatt elutasította. A leletekhez ezért nem tulajdonítok saját futási evidenciát. Nem hívtam éles GitHub-módosítást, merge-et vagy telepítést.
- Nem futtattam Playwrightot, adatbázisos tesztet vagy RT-kérést éles szerverre: a diff CLI/adatgyűjtési jellegű, nincs érintett képernyő vagy DB-séma. A teljes repókapu helyett a célzott Node-teszteket futtattam.

## Megcáfolt gyanúk

- A hiányzó `draft` önmagában nem teheti nem-piszkozattá az éles adatgyűjtésben: a tiszta leképező `Boolean` hívása előtt az adatgyűjtő explicit logikai mezőt követel.
- A hiányzó `hasNextPage` nem listavég, és törölt gyökér megmaradt válasza mellett a nulla gyökér nem igazol üres CCR-t. Mindkettőre van zöld negatív teszt.
- A sikertelen **késői hálózati gyűjtés** sikeresen befejezett indítás után nem hagyja meg a régi zöldet: az indítás addigra már érvénytelenítette. L1 az indítás saját megszakadásáról/íráshibájáról szól.

## Mit futtattam (parancs + eredmény)

- `git_diff` (stat és fájldiffek), `git_show` (base), `git_log`, célzott fájlolvasás és híváslánc-keresés: 5 változott fájl; a döntési függvény törzse változatlan.
- `node --test scripts/qa/gates/pre-merge-gate.test.mjs scripts/qa/gates/lib.test.mjs` → 34 PASS, 0 FAIL, exit 0.
- `node --test scripts/qa/hooks/check-quality-gates.test.mjs` → 27 PASS, 0 FAIL, exit 0.
- `node .blind-review-tmp/gate-rest-probe.mjs` és `node .blind-review-tmp/gate-evidence-probe.mjs` → a futtató mindkettőt elutasította, a szkriptek nem futottak le.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 0 | 0 | 0 |
| közepes | 3 | 3 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) Az indítás megszakadásakor a hook elfogadhatja a régi ZÖLD-et — `scripts/qa/gates/pre-merge-gate.mjs:217` — hivatkozás igazolt
- **L2** (közepes) A késői kötelezőlista csak a tartalékúton számít — `scripts/qa/gates/pre-merge-gate.mjs:376` — hivatkozás igazolt
- **L3** (közepes) Az ismétlődő check-run elfedheti a hiányzó rekordot — `scripts/qa/gates/pre-merge-gate.mjs:254` — hivatkozás igazolt
- **L4** (közepes) A hibás REST-es állapottípus átmehet PR-állapotként — `scripts/qa/gates/pre-merge-gate.mjs:151` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 10 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2649
- tokenek: 560392 bemeneti (ebből gyorsítótárból: 474026, gyorsítótárba írva: 86336), 11331 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 85.8%; becsült megtakarítás: 1.7150 USD
- költség (a tényleges usage alapján): 0.3766 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
