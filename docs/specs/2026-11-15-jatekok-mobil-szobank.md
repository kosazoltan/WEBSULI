# Spec: Játékok mobilos színvonalra emelése és központi nyelvi szóbank

> Dátum: 2026-11-15 · Szerző: Claude (orkesztrátor) · Állapot: JÓVÁHAGYVA (tulajdonosi kérés és döntések 2026-11-15)
> Szabály: háromfázisú munka (`docs/agent-haromfazisu-munka.md`). A végrehajtás külön fájl.
> Munkarend (tulajdonosi utasítás 2026-11-15): az orkesztrátor csak tervez, kioszt, összefűz és ellenőriz;
> minden megvalósítást alügynök végez, a feladat nehezéhez illő modellel (Opus: motor, 3D, nagy fájlok,
> ellenőrzés; Sonnet: tartalomgyártás, felmérés, ismétlődő átalakítás).

## 1. Cél

A Websuli mind a hét játéka telefonon élvezhető, mai mobiljáték-színvonalú legyen grafikában, vezérlésben és
működésben, hogy a diákok valóban használják és játszva tanuljanak. A nyelvi kérdések egy új, nagy, központi
szó- és kifejezésbankból jöjjenek (angol 2500, német 2000, francia 2000 bejegyzés), úgy, hogy a szavak és
kifejezések se egy játékon belül, se játékok között, se egymást követő futásokban ne ismétlődjenek, amíg a
bank az adott szinten el nem fogy.

A hét játék (HEAD `3e9df145`, mind `source/client/src/pages/` alatt, útvonal `/games/<id>`):

| # | Játék | Oldal | Azonosító |
|---|---|---|---|
| 1 | Szökőár szökés | `TsunamiEscapeEnglish.tsx` | `tsunami-english` |
| 2 | Szólétra | `WordLadderHuEn.tsx` | `word-ladder-hu-en` |
| 3 | Kockavadász kvíz | `BlockCraftQuiz.tsx` | `block-craft-quiz` |
| 4 | Gyors matek sprint | `SpeedQuizMath.tsx` | `speed-quiz-math` |
| 5 | Brain Rot Lopás | `BrainRotSteal.tsx` | `brain-rot-steal` |
| 6 | Galaktikus Aszteroida | `SpaceAsteroidQuiz.tsx` | `space-asteroid-quiz` |
| 7 | Tornado Hunter 200 | `TornadoHunter200.tsx` | `tornado-hunter-200` |

## 2. NEM cél (out of scope)

- Az éles adatbázis leckéinek (köztük a nyelvleckék szószedetének) módosítása. Tulajdonosi döntés: csak
  központi szóbank készül, az élő leckék tartalma nem változik.
- A leckegyártás (Stúdió), a pontozó, a kupon- és jutalompolitika, a pontszám-API szerződése és a DB-séma.
  Migráció nem készül.
- Új játék készítése, meglévő játék törlése vagy átnevezése, a játékazonosítók és útvonalak megváltoztatása.
- A meglévő, kézzel írt kérdésbankok törlése (`data/wordLadder/*`, `gradeQuizBank`, a játékokba égetett
  bankok). Ezek megmaradnak, a szóbank melléjük kerül.
- A matek-, magyar-, természet- és történelemkérdések tartalma (csak a nyelvi kérdések forrása változik).
- Meglévő tesztek gyengítése, törlése vagy kihagyása.
- Új külső játékmotor vagy nagy függőség (Phaser, Pixi stb.) bevezetése. A játékok three.js + React alapon maradnak.

## 3. Érintett területek

Új:
- `source/client/src/data/vocabBank/`: típusok, témalista, nyelvenként és szintenként egy adatfájl, betöltő,
  validátor.
- `source/client/src/game-engine/vocab/`: kérdésgenerátor, tartós ismétlés-napló, játék-adapter.
- `source/client/src/game-engine/mobile/`: közös mobilos játékkeret (keret, HUD, eredményképernyő,
  szünet, rezgés, érintés-észlelés, tájolás, méretezés).
- Tesztek: `source/tests/vocab-*.test.ts`, `source/tests/game-mobile-*.test.ts`, `source/tests/game-mobile-quality.spec.ts`.

Módosul:
- a hét játékoldal és a hozzájuk tartozó jelenetek (`game-engine/scenes/*`, `components/MathTowerScene3D.tsx`,
  `tornado/*`, `lib/tornado/*`, `lib/spaceAsteroid/*`);
- `game-engine/VirtualJoystick.tsx`, `HoldButton.tsx`, `QuizFeedbackCard.tsx`, `hooks/useCoarsePointer.ts`;
- `pages/Games.tsx` (játéklista) és `components/HomePracticeGames.tsx` csak annyiban, amennyit a közös
  arculat megkíván;
- `source/client/src/index.css` csak a közös játék-változókkal (biztonsági sáv, méretezés).

## 4. Rögzített döntések és kényszerek

### 4.1 Tulajdonosi döntések (2026-11-15)
- D1: Központi szóbank; élő leckék tartalma nem változik.
- D2: Szállítás szeletenként: ág → PR → zöld CI és review → merge a `main`-re. Merge előtt az aktív
  gyártási futások őre fut (`memory/no-deploy-during-active-runs`).
- D3: Bankméret: angol 2500, német 2000, francia 2000 bejegyzés.
- D4: Az orkesztrátor nem kódol; minden megvalósítás alügynöké.

### 4.2 Szóbank adatmodell
Egy bejegyzés egy sor, TypeScript-objektum:

```ts
type VocabLevel = 0 | 1 | 2 | 3 | 4;            // 0=A1, 1=A1–A2, 2=A2, 3=B1, 4=B2 (egyezik a Szólétra szintjeivel)
type VocabKind = "word" | "phrase";
type VocabEntry = {
  id: string;          // "<nyelv><szint>-<téma>-<nnn>", pl. "en0-family-001"; nyelven belül egyedi, végleges
  term: string;        // az idegen nyelvű szó vagy kifejezés (német főnév névelővel: "der Hund")
  hu: string;          // a magyar jelentés
  kind: VocabKind;
  level: VocabLevel;
  topic: VocabTopic;   // a rögzített témalista egyik eleme
  pos: "noun" | "verb" | "adj" | "adv" | "prep" | "pron" | "conj" | "num" | "interj" | "phrase";
  example: string;     // idegen nyelvű példamondat, amely szó szerint tartalmazza a term-et (vagy a tövét, lásd alt)
  exampleHu: string;   // a példamondat magyar fordítása
  alt?: string[];      // elfogadott további alakok / a példában szereplő ragozott alak
};
```

- Témalista (24 téma, rögzített, a `nyelvi-tanmenet.json` témáihoz igazítva): `family`, `school`, `food`,
  `home`, `city`, `time`, `body`, `clothes`, `weather`, `freetime`, `animals`, `nature`, `travel`,
  `shopping`, `health`, `feelings`, `work`, `technology`, `sports`, `culture`, `numbers`, `colors`,
  `everyday`, `communication`.
- Szintenkénti minimum: angol 500 / 550 / 550 / 500 / 400; német és francia 400 / 450 / 450 / 400 / 300.
- Nyelvenként legalább 30% `phrase`. Témánként és nyelvenként legalább 40 bejegyzés.
- Egyediség: nyelven belül a normalizált (`NFC`, kisbetű, szóköz-összevonás) `term` egyszer szerepelhet,
  szintek között is. Azonos magyar jelentés több term-nél megengedett (szinonimák), de a generátor az
  ilyeneket nem teszi egymás mellé válaszlehetőségnek.
- Fájlok: `data/vocabBank/<nyelv>/level-<0..4>.ts`, nyelvenként lusta betöltéssel (dinamikus import), hogy a
  kezdő csomag mérete ne nőjön.
- A tartalom iskolás korosztálynak való: nincs trágár, erőszakos, szexuális, alkohol- vagy dohányreklám
  jellegű szó; nincs márkanév; a példamondatok hétköznapiak, 3–14 szó hosszúak.

### 4.3 Kérdésgenerálás
- A bankból a játékok a meglévő `FourChoiceQuiz` alakú kérdést kapnak (`client/src/types/gameQuiz.ts`), így a
  játékok kérdésmegjelenítése nem változik.
- Kérdéstípusok: (1) magyar → idegen, (2) idegen → magyar, (3) hiányos példamondat (a `term` helyén kihagyás),
  (4) példamondat jelentése (csak `phrase`, 2. szinttől).
- A három rossz válasz ugyanabból a nyelvből, azonos `kind`-ból, a kérdés szintjéből vagy a szomszéd
  szintből jön, elsőként azonos `pos`-ból; nem lehet a helyes válasz szinonimája (azonos `hu` vagy `term`).
- A helyes válasz helye egyenletesen véletlen. A magyarázat sablonból készül, 30–300 karakter, megnevezi a
  helyes választ és idézi a példamondatot; sorrendre nem hivatkozik.
- A generátor determinisztikus, ha kap véletlenmagot (tesztelhetőség).

### 4.4 Ismétlés-szűrés
- Tartós napló a böngészőben: `localStorage` kulcs `websuli.vocabSeen.v1`, nyelvenként a látott
  bejegyzés-azonosítók időbélyeggel. A napló **közös mind a hét játékra**.
- Választás: a kért szintből és (ha van) témából olyan bejegyzés, amely nincs a naplóban. Ha a szint
  elfogyott: szomszéd szint (előbb a könnyebb). Ha az egész nyelv elfogyott: a legrégebben látott.
- A napló mérete nyelvenként legfeljebb a bank mérete; sérült vagy elérhetetlen `localStorage` esetén a
  szűrés futáson belüli memóriára esik vissza, hiba nélkül.
- A meglévő kézi bankok (`WORD_LADDER_*`, `gradeQuizBank` angol része, játékokba égetett angol kérdések)
  megmaradnak; a generált kérdés és a kézi kérdés között a meglévő tartalmi duplikátum-szűrő
  (`dedupeTiersByContent` / `uniqueQuizContent` mintája) dönt, és a kézi kérdés helyes válasza is bekerül a
  naplóba normalizált kulccsal, hogy ugyanaz a szó ne jöjjön vissza a bankból.
- A tananyagból indított játék (`useMaterialQuizzes`, `?lessonId=`) elsőbbsége megmarad: előbb a lecke
  kérdései, utána a szóbank.

### 4.5 Közös mobilos játékkeret
Egy közös réteg adja minden játék mobilos alapjait; a játékok ezt használják, nem saját megoldást:
- **Képernyő:** teljes képernyős, görgetés nélküli játéktér (`100dvh`), `env(safe-area-inset-*)` minden
  HUD-ra és vezérlőre, álló és fekvő tájolás kezelése (ahol a játék csak az egyikben jó, forgatási kérés).
- **Érintés:** minden játék közbeni érintési cél legalább 48×48 CSS-képpont; a vezérlők mérete a
  képernyőhöz igazodik (`clamp`), nem fix képpont; érintés-észlelés `any-pointer: coarse` és
  `maxTouchPoints` alapján (érintős laptop is kap érintővezérlést); asztali gépen, érintés nélkül az
  érintővezérlők nem látszanak.
- **Olvashatóság:** játék közben nincs 12 képpontnál kisebb szöveg; a kérdés és a válaszok legalább 16
  képpontosak telefonon.
- **Visszajelzés:** rezgés jó/rossz válaszra és találatra (`navigator.vibrate`, csak ha támogatott, nincs
  némítva, és nincs csökkentett mozgás beállítva); hang a meglévő `audioEngine`-ből; részecske- és
  képernyőrázás-effektek a `three-look` költségkeretén belül; `prefers-reduced-motion` mindenhol érvényes.
- **Folyamat:** egységes kezdőképernyő (legfeljebb két érintés a játék indulásáig), szünet menü (folytatás,
  újrakezdés, hang, kilépés), automatikus szünet, ha a lap háttérbe kerül, egységes eredményképernyő
  (csillagok 1–3, pontszám, legjobb eredmény, jó válaszok aránya, „Újra” és „Vissza a játékokhoz”).
- **Teljesítmény:** a meglévő `three-look/tier` szintek maradnak; alacsony szinten a képpontarány 1, az
  utófeldolgozás ki van kapcsolva; a játékciklus a lap háttérbe kerülésekor megáll.
- **Arculat:** közös színek, lekerekítés, betűméretek és gombok a játékokban, a játéklistán és a főoldali
  játékkártyákon.

### 4.6 Játékonkénti elvárás
Mindegyik játék megkapja a 4.5 keretet és a 4.3–4.4 szerinti nyelvi kérdéseket (ahol van nyelvi kérdés), továbbá:
1. **Szökőár:** érintővezérlés csak érintős eszközön; a „könnyű grafika” az eszköz képességétől függjön, ne az
   ablak szélességétől; látványosabb hullám, part és futó; ismétlés-szűrés a teljes futásra.
2. **Szólétra:** nagy, hüvelykujjal elérhető válaszgombok; látványos lépés- és zuhanás-animáció; a három
   nyelv bankja a központi szóbankból bővül; a német és a francia is kap bővített kérdéskészletet.
3. **Kockavadász:** nagyobb akciógombok (ugrás, bányászás, lerakás ≥ 56 képpont), kétujjas vezérlés
   (bal: mozgás, jobb: körbenézés), olvasható HUD.
4. **Gyors matek sprint:** érintésre szabott, nagy válaszrács, időcsík, sorozat- és kombó-visszajelzés,
   csökkentett mozgás támogatása. Nyelvi kérdés nincs.
5. **Brain Rot Lopás:** a lények mérete és élettartama a képernyőhöz és az évfolyamhoz igazodjon (kisebb
   gyereknek nagyobb, lassabb cél); a 3D háttér mellett a lények is látványosabbak.
6. **Galaktikus Aszteroida:** képernyőhöz méretezett joystick és tűzgomb, automatikus célzássegéd
   érintésnél, látványosabb robbanások.
7. **Tornado Hunter:** érintővezérlés csak érintős eszközön; minden gomb ≥ 48 képpont (kilépés is); a HUD
   apró (9–11 képpontos) szövegei olvasható méretre; fekvő tájolás ajánlása.

### 4.7 Munkaszervezési kényszerek
- Szeletek és sorrend: a végrehajtási utasítás szerint (S0–S13). Egy szelet = egy ág = egy PR.
- Az adatszeletek (szóbank-tartalom) sormérete meghaladja a 400 soros irányelvet; ez adatfájl, a PR
  leírása ezt jelzi.
- Minden szelet előtt kanban-jegy; minden szelet végén a szelet saját ellenőrzőköre és bizonyíték.
- A szóbank-tartalom minden adagját a gyártótól független „vak megoldó” alügynök ellenőrzi (helyes-e a
  fordítás, egyértelmű-e, korosztálynak való-e, a példamondat helyes-e).
- Az utolsó szelet összevonása előtt az egész funkció átfogó reviewja PR-kommentként (AGENTS.md).

## 5. Edge case-ek

- `localStorage` nem elérhető, megtelt vagy sérült JSON-t tartalmaz → futáson belüli memória, nincs hiba.
- A kért szinten/témában kevesebb mint 4 azonos fajtájú bejegyzés van → rossz válaszok a szomszéd szintről.
- A bank nyelvi fájlja nem tölthető be (hálózati hiba) → a játék a meglévő kézi bankból megy tovább.
- Német névelős főnevek és francia írásjelek (nem törő szóköz `?!:;` előtt) a hiányos mondatos kérdésben.
- A `term` ragozott alakban szerepel a példamondatban → az `alt` adja meg a kihagyandó alakot.
- Érintős laptop, tablet, összehajtható telefon, 360×640-es kis telefon, 844×390-es fekvő nézet, notch.
- Tájolásváltás és lap-háttérbe kerülés játék közben → szünet, a vezérlők nem ragadnak be.
- `navigator.vibrate` hiánya (iOS Safari) → csendes kihagyás.
- Csökkentett mozgás → nincs képernyőrázás, nincs villogás; a játék játszható marad.
- Névtelen látogató (nincs pontszám-szinkron) → helyi mentés működik, az eredményképernyő nem hibázik.
- Leckéből indított játék (`?lessonId=`) és kupon-HUD → változatlanul működik.
- Gyenge eszköz (low tier) → a játék indul és irányítható marad.

## 6. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->

Szóbank:
- [ ] A1 WHEN a szóbank validátora fut THEN the system SHALL angolból ≥ 2500, németből ≥ 2000, franciából
  ≥ 2000 érvényes bejegyzést találni, a 4.2 szerinti szint-, téma- és kifejezésarány-minimumokkal.
- [ ] A2 WHEN a validátor fut THEN the system SHALL nulla hibát jelenteni: egyedi azonosító és term, kitöltött
  `hu`, `example`, `exampleHu`, a példamondat tartalmazza a term-et vagy egy `alt` alakot, érvényes téma és szint.
- [ ] A3 WHEN a generátor kérdést készít THEN the system SHALL pontosan 4 különböző választ adni, egy helyessel,
  szinonima nélkül, 30–300 karakteres magyarázattal.
- [ ] A4 WHEN egy játékos egymás után 10 futást játszik ugyanazon a nyelven és szinten (szimuláció, futásonként
  20 kérdés) THEN the system SHALL nem adni kétszer ugyanazt a bejegyzést, amíg a szint el nem fogy.
- [ ] A5 WHEN két különböző játék ugyanazt a naplót használja THEN the system SHALL a másik játékban látott
  bejegyzést is látottnak tekinteni.
- [ ] A6 WHEN a `localStorage` hibát dob THEN the system SHALL futáson belüli szűréssel, kivétel nélkül működni.
- [ ] A7 WHEN a Szólétra német vagy francia nyelven fut THEN the system SHALL a központi bankból is kérdezni.
- [ ] A8 WHEN a Szökőár, a Kockavadász, a Brain Rot, az Aszteroida vagy a Tornado angol kérdést ad THEN the
  system SHALL a központi bankból és a közös naplóval választani (a tananyag-kvíz elsőbbsége mellett).
- [ ] A9 WHEN a tartalom elkészült THEN the system SHALL adagonként független vak megoldós ellenőrzés
  jegyzőkönyvével rendelkezni (`docs/measurements/`), a talált hibák javításával.

Mobilos játékélmény (mind a hét játékra, 360×640, 390×844 és 844×390 nézetben, érintéses eszközprofillal):
- [ ] M1 WHEN a játék fut THEN the system SHALL nem mutatni vízszintes vagy függőleges oldalgörgetést.
- [ ] M2 WHEN a játék fut THEN the system SHALL minden látható, kattintható elemet legalább 48×48 képpontosra rajzolni.
- [ ] M3 WHEN a játék fut THEN the system SHALL nem megjeleníteni 12 képpontnál kisebb számított betűméretű szöveget.
- [ ] M4 WHEN az eszköznek biztonsági sávja van THEN the system SHALL a HUD-ot és a vezérlőket azon belül tartani.
- [ ] M5 WHEN az eszköz nem érintős (finom mutató, `maxTouchPoints` 0) THEN the system SHALL elrejteni az érintővezérlőket;
  WHEN érintős (akár másodlagos mutatóként) THEN the system SHALL megjeleníteni őket.
- [ ] M6 WHEN a lap háttérbe kerül THEN the system SHALL szünetet tartani, és visszatéréskor szünet menüt mutatni.
- [ ] M7 WHEN a játék véget ér THEN the system SHALL az egységes eredményképernyőt mutatni (csillagok, pontszám,
  legjobb, „Újra”, „Vissza”).
- [ ] M8 WHEN a játékos a játéklistáról indul THEN the system SHALL legfeljebb két érintéssel játékba juttatni.
- [ ] M9 WHEN csökkentett mozgás van beállítva THEN the system SHALL képernyőrázás és villogás nélkül futni.
- [ ] M10 WHEN jó vagy rossz válasz érkezik THEN the system SHALL hang- és (támogatott eszközön) rezgés-visszajelzést adni.
- [ ] M11 WHEN a hét játék bármelyike elindul a mobil profilban THEN the system SHALL konzolhiba és WebGL-hiba nélkül
  játszható állapotba jutni, és a győzelmi út (`game-win-paths.spec.ts`) zöld maradni.
- [ ] M12 a 4.6 játékonkénti elvárásai mind teljesülnek (játékonként külön sorolva a végrehajtási utasításban).

Folyamat:
- [ ] P1 `npm run verify` zöld a `main`-en az utolsó szelet után; a meglévő tesztek közül egy sem gyengült.
- [ ] P2 Minden szeletről valós, mobil nézetű böngészős képernyőkép készült.
- [ ] P3 Az utolsó szelet előtt átfogó review készült PR-kommentként.
- [ ] P4 Retro, kanban, memória és munkafa-higiénia a futás végén.

## 7. Tesztterv

- Egységtesztek (`node --test`): `vocab-bank-validate.test.ts` (A1, A2), `vocab-question-generator.test.ts`
  (A3), `vocab-seen-history.test.ts` (A4–A6, 2000 futásos szimulációval), `vocab-game-wiring.test.ts`
  (A7, A8 – statikus bekötés-őr a hét oldalra), `game-mobile-shell.test.ts` (rezgés-, érintés-, méretezés-logika).
- Playwright: `game-mobile-quality.spec.ts` – mind a hét játék, három nézet, érintős profil: M1–M7, M9, M11
  mérése a DOM-ból (túlcsordulás, cél- és betűméret, biztonsági sáv emulált `env()` értékkel, láthatóság-váltás).
  A meglévő `game-viewport-experience`, `game-win-paths`, `games-touch-controls`, `games-pointer-controls`
  változatlan mércével zöld marad.
- Kézi jellegű, de alügynök által végzett böngészős próba: játékonként mobil nézetű képernyőképek a PR-ba.
- Tartalom: vak megoldós jegyzőkönyv adagonként (A9).

## 8. Kockázatok / visszavonási terv

- **Nagy, egyfájlos játékoldalak (1300–2850 sor):** regresszió veszélye. Kezelés: játékonként külön szelet és
  PR, a meglévő e2e-tesztek kötelezően zöldek, minimális szerkezeti átrendezés.
- **Tartalmi hibák a szóbankban (rossz fordítás, kétértelmű kérdés):** vak megoldós ellenőrzés, validátor,
  anyanyelvi szintű átnézés nem biztosított → maradó kockázat, a jegyzőkönyv jelzi.
- **Csomagméret:** nyelvenkénti lusta betöltés; a build-kimenetben ellenőrizni kell, hogy a szóbank külön
  darabba került.
- **Teljesítmény gyenge telefonon:** valódi eszközös mérés nincs (csak emulált nézet) → maradó kockázat.
- **Párhuzamos szeletek ütközése közös fájlokon:** a közös réteg (S1, S2) előbb kerül be; a játékszeletek
  csak a saját oldalukat és jeleneteiket módosítják.
- **Visszavonás:** szeletenkénti `git revert` a merge-commitra. A szóbank bekötése játékonként egy helyen
  kapcsolható ki (az adapter hívása), a kézi bankok érintetlenül megmaradnak. DB-változás nincs.
- **Éles futások:** merge előtt az aktív gyártási futások őre; aktív futásnál várakozás.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md`
