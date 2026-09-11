# Tananyagmódszer-fúzió — végrehajtás és bizonyíték

Kapcsolat: [specifikáció](2026-09-10-lesson-method-fusion.md), [végrehajtás](2026-09-10-lesson-method-fusion-vegrehajtas.md), [kötelező módszer](../lesson-improvement.md).

## Megvalósított szintézis

A Studio tanítási blokkjai, kurált forrása és automatikus évfolyama megmaradt. Közös, verziózott adatréteg adja a Tananyag/Módszerek/Feladatok/Kvíz lapokat, tízféle tanulási módszert, 45/15 nyílt és szóbeli feladatot, 75/25 kvízkérdést, mérési eredményt és hat eltérő palettát. A régi adatok tovább olvashatók; új fúziós anyagot hiányos bankkal nem lehet késznek minősíteni.

A gyökérok a Studio korábbi kifejezett kivétele, az ehhez elégtelen séma/runtime, az HTML-helyőrzőből dolgozó javító és a túl kicsi vagy figyelmen kívül hagyott kimenetkeret együttese volt. A feltöltés, a teljes és célzott javítás, illetve a webes HTML-generálás most ugyanazt a pedagógiai szerződést kapja. A bank hét ellenőrzött részben készül. A tanítás hibája még a bankokra költés előtt megállítja a javítást.

Fő fájlcsoportok: `source/shared/lesson-experience*`, `lesson-html-data.ts`, `lesson-repair.ts`; `source/server/studio/experience-builder.ts`, `structured-improvement.ts`, `step-runner.ts`, `step-io.ts`; `source/client/src/lesson-runtime/`; HTML-generátorok, javító/tároló és admin-előnézet; a két helyi tananyag-skill és a közös módszerdokumentum.

## Lefuttatott ellenőrzések

| Ellenőrzés | Eredmény | Mit bizonyít |
| --- | --- | --- |
| `npm.cmd run verify` a `source` könyvtárban | PASS: typecheck, lint, teszt-típusellenőrzés, 1054/1054 unit, build | Séma, értékelő, kapuk, hibakörök és meglévő regressziók; fordítható alkalmazás. |
| `npx.cmd playwright test --config playwright.lesson-fusion.config.ts` | PASS: 9 Chrome-teszt | 320/390/844/1440/2560 px, négy lap, pontozás, rossz válasz rögzítése, megőrzés/új kör, hat paletta, kapuk, érintéses sorrendezés, mikrofon nélküli használat, nyelvi felolvasási beállítás. |
| `npm.cmd run check:test` az ellenőrző eszköz hozzáadása után | PASS | A valódi modellpróba eszköze is a projekt típusellenőrzésében van. |
| `LESSON_LIVE_BROWSER=1`, azonos Playwright-konfiguráció | PASS: 3 Chrome-teszt, 390×844 / 844×390 / 1440×900 | A tényleges, 13 fogalmas modelljelölt négy lapja; a kisorsolt 15 saját mintaválasz 15/15, 25 helyes kvízválasz 25/25 pont, nincs JavaScript-hiba vagy vízszintes túlcsordulás. |
| `npx.cmd playwright test --list` | PASS: 124 teszt / 14 fájl gyűjthető | Az alap E2E-gyűjtés nem függ helyi, privát mintaleckétől. A teljes 124-es E2E-kör nem futott. |

Valós Chrome-képernyőképek: `D:/repo/WEBSULI/tmp/lesson-fusion/browser-fixture/`. A mobil és asztali képet külön vizuálisan is ellenőriztem. A fülváltáskor visszajátszott belépő animációt és a globális sima görgetésből eredő elcsúszást javítottam; a navigáció visszaállása azonnali. A hosszú tananyag függőlegesen görgethető, vízszintes túlcsordulás nincs a mért nézetekben.

## Valódi modellpróba és korlátai

Az eszköz: `source/scripts/lesson-fusion-live.ts`. Neonból explicit `BEGIN READ ONLY` tranzakcióban olvas, majd lezárja az adatbázis-kapcsolatot. A modellek a tényleges közös javítási/banképítési/lektorálási útvonalon dolgoznak; a jelölt és a bizonyíték kizárólag helyi, Gitből kizárt fájlokba kerülnek. Éles adatírás: **0**.

A referenciának kiválasztott háromszöges lecke 13 kurált fogalmat és a program korábbi 7. osztályos besorolását használja. A valódi próba az eredeti tanításban is talált forrástól eltérő levezetést és hiányos példaláncot; ezeket a bankellenőrzés önmagában nem tudta bizonyítani. A külön lektor ezért szükséges maradt. A hibás jelölteket nem alkalmaztam.

Az automatikus tanításjavítás után egy, magasságot állító puszta háromszögkörvonal még fennakadt a kapun. A helyi referencia folytatásához ezt az egy blokkot külön átnézve, ténylegesen megjelenített lépésábrára javítottam, és a tanítás összes kapuját újra lefuttattam. Ez **ellenőrzött tanítási mentésből folytatott próba**, nem teljesen beavatkozásmentes siker. Az előző sikertelen próbák költsége nem része egyetlen későbbi futás tokenösszesítésének.

A hét bankrészből összeállított jelölt: **11 módszerelem, 45 nyílt feladat (10 szóbeli), 75 kvíz**, 13 fogalom, 7. osztály. A banképítő és az első teljes lektor körében 9 modellhívás, 106 691 bemeneti és 41 060 kimeneti token, 566 másodperc szerepel a futásmérésben. Ez csak ez a kör, nem az összes korábbi próbálkozás költsége. Szerkezet-/mintaválasz-hiba: 0; az akkori lektor megállapítása: 0.

A külön önellenőrzés ettől függetlenül észrevette a forrás számainak geometriai ellentmondását: `a=12 cm, m_a=25 cm, m_b=15 cm` algebrailag `T=150 cm², b=20 cm` eredményt ad, de `m_a > b` és `m_b > a`, ezért ilyen háromszög nincs. A lektorprompt általános megvalósíthatósági ellenőrzést kapott. Az új lektorkör ezt forráseredetű adminjegyzetként visszaigazolta, és egy kvíz rossz válaszának hibás magyarázatát is megtalálta. A forrásszámokat nem írtam át; a `q39` utolsó visszajelzését helyileg, mentés után a helyes `b=2·45/10=9 cm` levezetésre javítottam. A bankséma és a böngészőpróba ezután is sikeres. Ez a második külön átnézett rész a helyi mintában; a próba nem bizonyít teljes beavatkozásmentességet.

A mintalecke képei: `D:/repo/WEBSULI/tmp/lesson-fusion/browser-real/`. A Chrome-próba a rövid, még kapuval lezárt Módszerek lapnál a dokumentum tényleges görgetési tartományát veszi figyelembe: ha a fejléc és a teljes lap elfér, nem követel lehetetlen további görgetést. Hosszú lapnál a navigáció a nézet tetejére áll. A pillanatnyi görgetési köztes képet két képkocka kivárásával kizárja a képernyőkép-készítésből.

**Lezárt tartalmi visszaellenőrzés:** a javított kvízmagyarázat után az új teljes lektori kör 0 blokkoló hibát és 1 forráseredetű adminjegyzetet adott. Ez az utolsó kör 1 hívás, 39 098 bemeneti és 10 284 kimeneti token, 166 másodperc. Az előző, hibát találó ismételt lektor külön 39 070/16 619 token és 278 másodperc volt. Az utolsó fájl-összehasonlítás igazolta, hogy a két jelölt között csak az előre kijelölt egy kvízmagyarázat változott, a bankséma és mintaválasz-ellenőrzés továbbra is PASS. A végső jelölt ugyanazon három mobil/asztali Chrome-próbája ismét PASS (11,7 s). Éles adatírás továbbra is 0.

A teljes `verify` az utolsó szerverkód-változtatás után is PASS: 1054/1054 teszt, typecheck, lint, teszt-típusellenőrzés, build (frontend 8,18 s). Összesen 12 külön Chrome-teszteset sikeres; a fenti ismétlések nem növelik ezt a darabszámot. A titokszűrés és a diff whitespace-ellenőrzése sikeres. A módosítások helyi commitokban a `codex/lesson-method-fusion` ágon vannak.

## Nem futtatott vagy szűkebben bizonyított részek

- Önálló teljes HTML-t nem gyártottam újabb fizetős webes keresésből. Ezen az útvonalon a közös prompt, kimenetkeret, csonkolás- és szerkezeti/adatkapu tesztelt; egy konkrét jövőbeli HTML-lecke működését külön böngészőpróbának kell igazolnia. A statikus kapu nem bizonyítja minden generált JavaScript teljes működését.
- Éles javításalkalmazás/visszaállítás nem futott. A tranzakciós kód és az előállapot-/forrás-/metaadat-ellenőrzés tesztelt; tényleges adatbázisos írás-visszaállítási próbát külön, izolált adatokon kell elvégezni a kiadás előtt.
- Tényleges mikrofonfelvétel és hallható beszédminőség nem ellenőrzött. A böngészős próba a felhasználói indítást, nyelvet, sebességet, hívásokat és a tartalék működést ellenőrizte.
- A nyílt válaszok pontozása helyi heurisztika, nem szemantikus vizsgáztató. Ezt a felület jelzi. A mérés gyakorló eredmény, nem hitelesített iskolai osztályzat.
- Nincs tömeges tananyagátírás, push, merge vagy deploy. A helyi módszer bevezetése önmagában nem frissíti a nyilvános honlapot. A korábban külön kezelt domain/adatbetöltési incidens ettől független.
