# Független review — fix/kapu-spec-valasztas-szohatar (3. kör)
Fej: e4136b2f4e26e975b12cea59b2020649cc580aad
## Ítélet: IGEN, FELTÉTELLEL
A visszaellenőrzött változásban nem találtam új blokkolót. L3 és L4 továbbra is külön jegyre menő, kicsi lelet.

## Az előző kör leleteinek sorsa
- **Korábbi blokkoló nem volt.** Az `e4136b2f` merge első szülőjéhez (`983e0a3e`) képest a két kapufájl és a két tervdokumentum változatlan. A beolvasztott főági változás nem érinti a kaput vagy a `source/tests/*.spec.ts` fájlokat (`git show head`). Ezért a korábban nem kifogásolt változatlan részeket nem vizsgáltam újra teljes körűen.
- **L3 — nem szűnt meg.** A két határ továbbra is `\p{N}`-t használ (`scripts/qa/gates/pre-pr-gate.mjs:40`); a Chromium-próba reprodukálta az eltérést.
- **L4 — nem szűnt meg.** A teszt továbbra is `new URL(s, dir)`-t ad az olvasónak (`scripts/qa/gates/pre-pr-gate.test.mjs:95`); a Chromium-próba reprodukálta a csonka útvonalat.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L3 — Kicsi: a törtjel is megszünteti az azonosítóhatárt
`scripts/qa/gates/pre-pr-gate.mjs:40`. Ha egy fejlesztő módosítja a `sync.ts`-t, és egy változatlan böngészős próba egyetlen tőemlítése a `// sync½` megjegyzés, azt a helyi kapu nem választja ki. A base részszókeresése megtalálja, a fej mintája nem; a terv viszont számjegyet ír (`docs/specs/2026-11-23-kapu-spec-valasztas-szohatar.md:19`), aminek a `½` nem felel meg. Izolált Chromium-próba: `sync½: base=true, head=false, Nd=true; sync７: head=false, Nd=false`. Jelenlegi, emiatt ténylegesen kimaradó specet nem igazoltam; nem blokkoló. **Javítás:** mindkét határban `\p{Nd}`, a törtjelre regressziós teszt a teljes szélességű számjegyes eset mellett.

### L4 — Kicsi: a QA-teszt URL-ként értelmezi a listázott fájlnevet
`scripts/qa/gates/pre-pr-gate.test.mjs:95`. Ha egy fejlesztő `sync#retry.spec.ts` néven vesz fel próbát, a QA-egységteszt a `sync` nevű fájlt próbálja megnyitni; ha az nincs, az olvasás hibával megáll. Izolált Chromium-próbában `file:///repo/source/tests/` alappal az útvonal `/repo/source/tests/sync`, a `#retry.spec.ts` pedig fragmentum lett. Ez a CI-ban is futó egységteszt olvasója (`.github/workflows/ci.yml:32–33`); a termelési kiválasztó ezzel szemben `join`-t használ (`scripts/qa/gates/pre-pr-gate.mjs:159–160`). Az ilyen fájlt tartalmazó CI-futást nem mértem; nem blokkoló. **Javítás:** a könyvtár-URL-t egyszer `fileURLToPath`-tal útvonallá alakítani, majd `join`-nal hozzáfűzni a listázott nevet.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — talált hiba a tesztben (L4).** A `readdirSync` által visszaadott név fájlnév, nem URL-referencia. A tényleges kapu a neveket fájlútvonallal olvassa és `tests/<név>` argumentummá alakítja (`pre-pr-gate.mjs:102–105,159–171`); az ezt mérő követett teszt zöld.
2. **Biztonság, adatvédelem — nem alkalmazható a változásra.** A diff a helyi spec-szöveg egyezését módosítja; nem vezet be HTTP-kérést, hitelesítési adatot, új naplómezőt vagy GET-mellékhatást.
3. **Regresszió — a célzott próbákat nem sikerült megtörni.** A követett teszt valódi fájlszövegekkel továbbra is kiválasztotta az `admin-korszerusites`, `home-views` és `curriculum-order` speceket, a szintetikus Stúdió-példa is zöld (`pre-pr-gate.test.mjs:35–40,91–101`). Ez a kiválasztást igazolja, nem az alkalmazásfolyamatok végigjárását.
4. **Europe/Budapest — nem alkalmazható.** A megváltozott feltételben nincs óra, dátum vagy időzóna.
5. **Migráció, indítás, cron, leállítás, e2e-mód — nincs változás ezeken az ágakon.** A base-összevetés szerint a csomagoló konfig, az indító argumentumok és a DB-ág változatlan; a konfigot és az argumentumokat vizsgáló követett teszt zöld. Konténer-életciklust nem mértem.
6. **Versenyhelyzet, megszakítás, időtúllépés — nem találtam új aszinkron lépést a módosított ágban.** A szűrés és olvasás szinkron (`pre-pr-gate.mjs:64,160`); a kapu és a Playwright időkerete nincs a diffben. Párhuzamos kapufuttatást és tényleges futásidőt nem mértem.
7. **Tesztminőség — a régi szabály elbukik az új elváráson.** A követett teszt pontos bemenetével (`pre-pr-gate.test.mjs:82–88`) a Chromium-ellenpróba a régi `includes` szabállyal a két csak `async`-ot tartalmazó specet is visszaadta, így a lista nem egyezett; a fej szabályával egyezett. Ez izolált szabálycsere, nem a mutált Node-modul futtatása. A korábbi assertokat a diff nem gyengíti; a határszabály dokumentált a tervben. A teszt fájlnév-olvasási hibája L4.
8. **Feladat-specifikus/K1–K4 — K1 és K3 a célzott teszteken átment; K2-nél L3; K4 teljes mérése UNVERIFIED.** K1: `async` nem egyezik `sync`-re. K2: az útvonal, az aláhúzás, a kötőjel és a pontos kis-/nagybetűs alak próbái zöldek; a `foo[+]$.-bar` csak szó szerint egyezett az izolált mintapróbában. K3: a változott spec kiválasztása, a játékágak és a nulla találatos figyelmeztetés zöldek (`pre-pr-gate.test.mjs:22–40,82–88`), a játékág kódja azonos a base-ével. K4: a valódi korpuszon a csak `sync.ts`-t átadó követett teszt a specek felénél kevesebbet választott; ez nem a teljes adventi PR-C fájllistájának mérése.
9. **Egyéb — nem találtam új blokkolót a merge-ben.** Külön a futtatási argumentumok előállítását és a teszt/termelés eltérő fájlolvasóját néztem meg; az eltérés következménye L4.

## Mit próbáltam megtörni, és nem sikerült
- A régi `async`-hamis találatot a követett teszt adataival: az új szabály csak az explicit `advent/sync` említést és a kötelezően hozzáadott változott specet hagyta meg.
- Reguláris metakaraktereket tartalmazó tővel a minta szó szerinti egyezését: az izolált próbában `foo[+]$.-bar` egyezett önmagára, `foo+-bar`-ra nem; kivételt nem kaptam.
- A három valódi `admin-tabs` / `home-views` / `curriculum-order` próba kiválasztását, a játékágakat és az üres találati lista figyelmeztetését: a követett tesztek zöldek.

## Mit NEM vizsgáltam
- A teljes adventi PR-C fájllistája nem állt rendelkezésre; a tervben szereplő **83 → 27** számot és az e2e időkereten belüli befejezést nem igazoltam (K4: UNVERIFIED).
- A saját Node-ellenpróbát és a mutált modul tényleges tesztfuttatását az eszköz a Node 24-es homokozó hálózati korlátja miatt nem engedte elindítani; a helyettesítő Chromium-próbák izoláltak. Nem futtattam teljes `gate:pr`-t, speciális fájlnévvel CI-t, Playwright-specet, adatbázisos vagy párhuzamos kapufutást; ezek üzemeltetési viselkedésére nincs futási bizonyítékom.
- Nem végeztem teljes komponens–spec függőségi felmérést az előző kör óta változatlan korpuszon. Nem készült álló/fekvő alkalmazásképernyőkép: a merge nem módosít megjelenítést, a böngésző itt csak a szövegmintát és az URL-feloldást futtatta.

## Megcáfolt gyanúk
- A kötőjel vagy aláhúzás miatt kimaradnak az ismert képfájlnévben vagy próbaútvonalban megnevezett komponensek: a valódi fájlokon futó teszt mindhárom elvárt specet megtalálta.
- A teljes szélességű `７` karaktert a javasolt `Nd` javítás tévesen határnak venné: az izolált próba mindkét mintával elutasította a `sync７`-et.
- Az új teszt zöld lenne a régi részszókereséssel is: az elvárt két név helyett a régi szabály négyet adott a követett teszt bemenetén.

## Mit futtattam (parancs + eredmény)
- `git_diff` (stat és teljes diff), `git_log`, `git_show` (`base`, `head`, `983e0a3e`) — base és előző kör összevetése; a merge nem módosította a négy felülvizsgált fájlt.
- `node --test scripts/qa/gates/pre-pr-gate.test.mjs` — 9 sikeres, 0 bukott.
- `node .blind-review-tmp/kor3.mjs`, `node .blind-review-tmp/regi-szabaly-mutacio.mjs` — a futtató elutasította; a szkriptek nem futottak.
- `run_browser_scenario .blind-review-tmp/kor3-browser.json` — 3 izolált Chromium-eset, sikeres kiértékelés; a régi szabály elbukott a listaelváráson.
- `run_browser_scenario .blind-review-tmp/kor3-bizonyitek.json` — az első, viewport nélküli leírás nem futott; a javított leírás mindkét izolált esete reprodukálta L3-at és L4-et.

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
| kicsi | 2 | 2 | 0 | 2 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
(nincs)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 16 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 1309
- tokenek: 676039 bemeneti (ebből gyorsítótárból: 612305, gyorsítótárba írva: 63686), 8462 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 91.6%; becsült megtakarítás: 2.2631 USD
- költség (a tényleges usage alapján): 0.3052 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
