# Spec: Játékélmény — a hét tanulójáték valódi telefonos játékká alakítása (J0–J9), közös többjátékos mód, párbaj és játékos-fiók (JM0–JM11, JB)

> Dátum: 2026-11-16 · Szerző: Claude (vezető játéktervező + szoftverarchitekt szerep) · Állapot: JÓVÁHAGYVA (tulajdonosi
> felhatalmazás az önálló végigvitelre, 2026-11-16; orkesztrátori döntések 2026-11-16, 13. szakasz). A többjátékos rész
> a négy kutatási bemenet alapján véglegesítve (10. szakasz). Tulajdonosi döntések: diákok saját regisztrációja (D11),
> admin-elválasztás (D12). Kötelező tulajdonosi teendő nincs (opcionális: közvetlen aldomain, 10.3).
> Kutatási bemenetek (a session scratchpadjában, a koordinátor átadta; a felhasznált állításokat a kódból szúrópróbával
> ellenőriztük, a nem igazoltak UNVERIFIED-ként szerepelnek): `kutatas/1-fiok-es-pontok.md`, `2-parbaj-mechanikak.md`,
> `3-csoportos-technika.md`, `4-jatekfejlesztoi-gyakorlat.md`. A felhasznált tartalmuk a 10. szakaszba és a végrehajtási
> fájl K.4 / K.5 / JM-fejezetébe került (a fájlok maguk nem részei a repónak).
> Szabály: `docs/agent-haromfazisu-munka.md`. Végrehajtás: `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`.
> Kiindulás: `main` HEAD `86a39ae2` (#438). Minden `fájl:sor` hivatkozás ezen az állapoton, a kódból ellenőrizve
> (Grep + részolvasás, 2026-11-16). A sorszám tájékoztató: eltérésnél a megnevezett függvény / konstans / testid alapján
> kell újra megkeresni. Ahol nincs bizonyíték: UNKNOWN / UNVERIFIED.
> Előzmény: `docs/specs/2026-11-15-jatekok-mobil-szobank.md` (S0–S13, mobilkeret + szóbank), retro:
> `docs/handoffs/2026-11-16-jatekok-mobil-szobank-retro.md`, csapdák: `docs/agent-csapdak.md` C-30…C-34.

Rövid útvonal-jelölés a dokumentumban: `P/` = `source/client/src/pages/`, `GE/` = `source/client/src/game-engine/`,
`L/` = `source/client/src/lib/`, `T/` = `source/tests/`, `S/` = `source/server/`.

## 0. A tulajdonos kérése (cél-mondatok, a követhetőség alapja)

| Jel | Cél-mondat (a tulajdonos szavaival, rövidítve) |
|---|---|
| **G1** | „valóban effektív telefonos játékként működjenek” |
| **G2** | „a gyermek tanulók figyelmét a játék kösse le” |
| **G3** | „közben dobálja fel neki a kérdéseket; ne a kérdések legyenek a cél, hanem a valós játék” |
| **G4** | „pontokat gyűjtsenek, élvezzék” |
| **G5** | „legyőzhessenek benne ellenfeleket (ami épp az adott játék)” |
| **G6** | „pszichológiailag teljesen vonja be a játékba a gyereket, és ebből vezesse le a tanítási mechanizmust” |
| **G7** | „kőkeményen, ezer lépésen keresztül, de legyen megvalósítva” (teljes végigvitel) |
| **G8** | (kiegészítés) „a barátaikkal is játszhassák ezen a felületen … többen is tudják játszani ugyanazt a játékot” |
| **G9** | (kiegészítés) e-mailes regisztráltak együtt játszhassanak; kis játékos-fiók, amely gyűjti és TÁROLJA a pontokat |
| **G10** | (kiegészítés) párbaj: a helyesen / gyorsabban válaszoló győzi le a másikat; csoportos játék végén győzteshirdetés |
| **G11** | (biztonsági követelmény, 2026-11-16) „Az admin felülethez senki nem férhet hozzá, csak az adminok”; a játékhoz rendelt Google-hozzáférés csak a nyilvános játékoldalakra vonatkozik, és játékos-fiókot hoz létre |

A G6-ot két irányban értelmezzük: a bevonódás erős, de **etikus** (gyerekek!) — 3.3 szakasz. A követhetőségi táblázat
(cél-mondat → elfogadási pont → szelet) a 12. szakaszban.

## 1. Cél

A hét játék (Szökőár szökés, Szólétra, Kockavadász, Gyors matek sprint, Brain Rot Lopás, Galaktikus Aszteroida,
Tornado Hunter 200) mindegyike **önmagában, kérdések nélkül is szórakoztató, ügyességre és döntésre épülő mobiljáték**
legyen, saját témájában legyőzhető ellenfelekkel (hullámok, minibossok, főellenfél), 2–5 perces menetekkel. A kérdés
**játékmechanika**: a jó válasz a játék világában hat (lőszer, pajzs, turbó, kapu, gyenge pont, a válasz maga a
célpont), a játék a kérdés alatt NEM áll meg (legfeljebb lelassul). A tanulási hatás mérhetően nem csökken: a
percenként megválaszolt kérdések száma és a tételek változatossága legalább a mostani; a hibázott tétel térközös
ismétléssel visszatér; a nehézség (játék és kérdés) a teljesítményhez igazodik. Közös, újrahasznosítható „kérdés a
játékban” réteg, ismétlési sor, kombó-, hullám- és meta-fejlődési rendszer készül. A közös, szerveren összekapcsolt
többjátékos mód (online szoba 2–4 főre, párbaj, győzteshirdetés), a diákok saját e-mailes játékos-fiókja és a szerveroldali
pontgyűjtés (G8–G11) a 10. szakasz szerint, az egyjátékos szeletekre építve és flag mögött kiadva.

## 2. NEM cél (out of scope)

- A szerveroldali pontszám-szerződés (`POST /api/games/score` zod-sémája, `S/routes.ts:1298-1304`; `game_scores` tábla,
  `source/shared/schema.ts:470-500`) **nem változik** az egyjátékos (J) szeletekben. A JM0 egy **opcionális** `runId`
  mezővel bővíti (visszafelé kompatibilis), a JM8 új pontkönyv-táblákat ad additív migrációval (10.6). A
  játék-azonosítók (`gameId`, útvonalak `/games/<id>`) nem változnak.
- A játékidő-/kuponkorlát (`GE/CouponHud.tsx`, `GE/useCouponSession.ts`, `GE/coupon-clock.ts`,
  `S/rewards/coupons.ts:50-62`), a szülői / tanári keretek, az évfolyamválasztás (`L/classroomStore.ts`) érintetlenek.
- A szóbank-tartalom (EN/DE/FR bejegyzések, `source/client/src/data/vocabBank/`) és a tananyag-gyártás nem változik;
  a szóbank-motor szerződése (előző végrehajtás K.7.2) csak **bővülhet** (additív `questionFor`, J0), nem változhat.
- Nincs fizetős elem, véletlen jutalomdoboz, hirdetés, nyilvános idegen-párosítás, szabad szöveges csevegés.
- Nincs új nehéz függőség (fizikai motor, játékmotor-keretrendszer, ECS); a meglévő `three` + saját kód marad (egyetlen
  indokolt kivétel a Socket.IO, 4.3 / 10.3).
- Nyilvános (idegenekkel való) párosítás, nyilvános ranglista alapértelmezésként, szabad szöveges csevegés, fotó-avatar,
  valós idejű fizika-szinkron (közös aréna predikcióval) — a többjátékos MVP-ből kimarad (10. szakasz).
- Nem cél a régi „kvíz-fázis” teljes képernyős modáljának megtartása a játékmenetben (lásd 4. és 9. szakasz).

## 3. Felmérés — a jelenlegi állapot őszintén (kódból)

Közös jellemzők (mind a hét játékban):

- A kérdés-választás forrásrendje egységes: tananyag (`pickUnseenMaterial`, `GE/gradeQuiz.ts:108`) → szóbank
  (`useVocabQuizSource`, `GE/vocab/useVocabQuizSource.ts:22`) / évfolyam-bank (`pickGradeQuiz`, `GE/gradeQuiz.ts:75`;
  `pickGradeSlotWithVocab`, `:152-169`) → kézi bank. Ez jó alap, megtartjuk.
- **Térközös ismétlés nincs.** A szóbank „látott” naplója (`websuli.vocabSeen.v1`, `GE/vocab/seenHistory.ts:10`) csak
  „utoljára látva” időbélyeget tárol, helyességet nem; a `next()` a feltevéskor naplóz (`GE/vocab/vocabSource.ts:129`).
  Az évfolyam-bank „látott” halmaza futáson belüli (`GradeQuizSeen`, `GE/gradeQuiz.ts:15`). A hibázott tétel ezért
  **kiesik** ahelyett, hogy visszatérne (Szökőár: `P/TsunamiEscapeEnglish.tsx:844-848`; Szólétra:
  `P/WordLadderHuEn.tsx:614-619, 780`).
- **Adaptív nehézség van** (`GE/difficulty.ts:28-37, 57`; `GE/adaptiveSession.ts:10-34`; `GE/gradeLevels.ts:11-31`), de
  csak a kérdés-sávot és egy-két tempóparamétert mozgatja; a játék intenzitását alig.
- **Hibás válasznál blokkoló magyarázókártya** (`GE/QuizFeedbackCard.tsx`, z 90), amelyet kézzel kell bezárni; a
  `T/game-feedback-wiring-guard.test.ts` ezt a viselkedést rögzíti (G-1 őr, 33–41., 79–110. sor).
- **Meta-fejlődés:** csak összeadódó `totalXp` (`L/achievements.ts:43-59`, `Profile.tsx:109`), jelvények
  (`recordRun`, `L/achievements.ts:250`), napi kihívás (`L/dailyChallenge.ts:107-143`), játékonként 10 pálya
  (`GE/gradeLevels.ts:43`), legjobb pont (`GE/mobile/bestScore.ts:12`). XP → szint, gyűjtemény, kozmetika nincs.
  A játéklista kártyáin nincs legjobb pont / szint / csillag (`P/Games.tsx:87-95, 344-370`).
- **Hang:** kizárólag szintetizált WebAudio (`L/audioEngine.ts:2-4, 116-128`). **TTS** létezik (`L/tts.ts:42`
  `speak(text, lang)`), de a játékok nem használják.
- **Szerver:** `POST /api/games/score` csak felső határokat vág (`S/routes.ts:1298-1304`, `S/gameScoreService.ts:92-140`);
  futás-token, hihetőségi ellenőrzés nincs.

### 3.1 Játékonként

| Játék | Alaphurok most | Kvíz most | Játék : kvíz idő (becslés) | Kérdés/perc (becslés) |
|---|---|---|---|---|
| Szökőár szökés | egy tengelyen (balra-jobbra) a zöld zónában állni, a víz emelkedik (`P/TsunamiEscapeEnglish.tsx:1108-1212, 1131-1135`) | 6–11 mp-enként **teljes képernyős, megállító** kvíz (`:1172-1181`, `:1827`); győzelem = 6/8/10 jó válasz (`:1289`) | ~50 : 50 | ~4 |
| Szólétra | nincs játék: 4 gomb, jó = +1 fok, rossz = −1 fok, 0 alá nem esik (`L/wordLadderLogic.ts:88-96`); 900+620 ms kötelező animáció (`P/WordLadderHuEn.tsx:82-84, 717-761`) | maga a játék a kérdéssor; nem lehet veszíteni, nincs idő | ~0 : 100 | ~9–12 |
| Kockavadász | voxel-világ, joystick + körbenézés (`P/BlockCraftQuiz.tsx:2996-3050`); a mobok dekoráció (`L/voxelcraft.ts:229-250`), nincs sebzés | **minden blokk** (fű is) teljes képernyős, megállító kvízt nyit (`P/BlockCraftQuiz.tsx:1578-1597, 3104-3183`) | ~15 : 85 (optimális játék: egy helyben ásni) | ~6–10 |
| Gyors matek sprint | nincs játék: 4 számgomb, dekoratív torony (`P/SpeedQuizMath.tsx:2014, 2088-2135`) | folyamatos; kérdésidő akár 45 mp (`GE/speedQuizTiming.ts:56-59`); retry a megoldás mutatása után is célba számít (`P/SpeedQuizMath.tsx:1534-1546, 1716-1723`) | 0 : 100 | ~8–12 |
| Brain Rot Lopás | koppintás lassú úszó lényre (`P/BrainRotSteal.tsx:563-576`, `L/brainRotTuning.ts:34-36`) | **minden elkapás** után teljes képernyős, megállító kvíz (`P/BrainRotSteal.tsx:568-573, 1290-1310`); a „90 mp” óra kvíz alatt áll (`:810-824`); hiba után ugyanaz a kérdés felfedett válasszal, és elkapásnak számít (`:586-590, 661`) | ~15–20 : 80–85 | ~7–10 |
| Galaktikus Aszteroida | valódi lövöldözős: kitérés, célzás, bomba, ellenféltípusok, 12. hullámban boss (`P/SpaceAsteroidQuiz.tsx:1541-1840, 1626-1700, 1854-1930`) | indításkor, minden hullám végén és **minden ütközéskor** teljes képernyős kapu-kvíz (`:1258, 1803-1820, 2153-2187, 3017`); rossz válasz = új kérdés, végtelen próbálkozás (`:1263-1269`); 360 mp óra vs. 12 hullám ütközik (`:206`) | ~70–80 : 20–30 | ~2–3 |
| Tornado Hunter 200 | vezetés tornádóhoz, horgonydobás a sávban (`P/TornadoHunter200.tsx:1949-2173, 1680-1700`) | véletlenszerű „roam” kvíz **megállítja a világot** (`:1977, 1985, 2079-2088, 2307-2308`; a `:1894` komment ellentmond); horgonykérdés rossz pozícióból is (`:1694-1699`); a fejlesztések nagy része hatástalan (`:2018-2019` vs. `:690-694`) | ~80–90 : 10–20 | ~2–3 |

A becslések a fenti kódhelyek időzítési konstansaiból számolt közelítések (nem mérés). A J0 szelet
alapvonal-mérést végez (J0.8), és a J-pontok küszöbei a lenti, a becslések **felső** értékéhez igazított,
szigorúbb számok (6.2).

### 3.2 Kíméletlen összegzés

- **Feladatlap játéknak öltöztetve:** Szólétra, Gyors matek sprint (100% kvíz), Brain Rot és Kockavadász (a „játék”
  1 mp-es koppintás, ami tesztlapot nyit). A Szökőárban a győzelem 100%-ban a kvízen múlik.
- **Megszakítás, nem mechanika:** mind a hét játékban a kérdés teljes képernyős vagy blokkoló, és megállítja a
  világot és az órát — így a válasznak nincs játékbeli feszültsége, a kérdés a „játék szünete”.
- **Nincs valódi ellenfél** öt játékban (Szökőár: csak a víz; Szólétra, Matek, Brain Rot, Kockavadász: semmi). Az
  Aszteroidában van, de a kvíz kapuként és büntetésként (ütközés = élet − 1 ÉS kvíz) rontja.
- **Hibás ösztönzők:** Kockavadász — a jó válasz csökkenti a hátralévő időt (`P/BlockCraftQuiz.tsx:2422-2425`); Brain
  Rot / Matek — a felfedett válasz visszakoppintása célba számít; Aszteroida / Kockavadász / Tornado — a tippelgetés a
  leggyorsabb stratégia (végtelen újrapróba).
- **Adathibák:** Aszteroida `recordRun` a kilőtt ellenfeleket küldi `correctAnswers`-ként, `wrongAnswers: 0`
  (`P/SpaceAsteroidQuiz.tsx:2633-2634`); Kockavadász `runStreak` a pillanatnyi sorozat (`P/BlockCraftQuiz.tsx:2562`);
  Tornado `runStreak` = összes jó válasz (`P/TornadoHunter200.tsx:1766`); Szólétra HUD az összes XP-t mutatja
  (`P/WordLadderHuEn.tsx:1104-1107`); Tornado `MATH_4` angol kérdéseket tartalmaz (`L/tornado/questions.ts:356-366`).
  Ezeket a játékszeletek javítják (a szerver-sémát nem érintik).

## 4. Rögzített döntések és kényszerek

### 4.1 Tervezési elvek (a megvalósító nem dönti újra)

1. **A játék az elsődleges hurok.** Minden játéknak van kérdés nélkül is működő, ügyességre / döntésre épülő
   alaphurka, világos céllal, legyőzhető ellenfelekkel, és legalább egy főellenféllel menetenként.
2. **A kérdés játékmechanika.** A kérdés a játék világában jelenik meg (célpont, kapu, kapaszkodó, kristály, útjelző,
   ketrec), 3–4 nagy válaszcéllal; a jó válasz játékbeli előnyt ad, a rossz játékbeli (nem megalázó, nem megállító)
   hátrányt. A helyes megoldás hibánál ≥ 1,8 mp-ig jól láthatóan megjelenik a játéktérben, a tétel ismétlési sorba kerül.
3. **A játék a kérdés alatt fut.** A szimuláció sebessége a kérdés alatt ≥ 0,35× (lassítás megengedett, megállás nem).
   Megállás csak: szünet menü, a játékos által kért „Miért?” magyarázat, kuponlejárat, háttérbe kerülés.
4. **Rövid mikro-döntések.** A válaszablak 2,5–6 mp rövid kérdésnél; hosszú szövegű tételnél (prompt > 60 karakter)
   olvasási pótlék 0,05 mp/karakter, legfeljebb 9 mp, és az ablak alatt a játék akadálysűrűsége csökken („kapu-pillanat”).
   3–4. évfolyamon a szorzó 1,25 (lassabb olvasás).
5. **Tananyag-elsőbbség megmarad.** A forrásrend: (1) nem látott tananyag-kérdés, (2) esedékes ismétlés, (3) szóbank /
   évfolyam-bank új tétel, (4) kézi bank. A tananyag-kérdés gyakran hosszú: ezek a „kapu-pillanat” mechanikát kapják.
6. **Adaptív áramlat-csatorna.** Egy közös képesség-becslő (J0 `FlowController`) a válaszok helyessége és ideje, valamint
   a játékbeli teljesítmény (sérülés, halál, idő) alapján két kimenetet ad: kérdés-sáv (`band`, 0,15–0,95, a meglévő
   `GE/difficulty.ts` padlójával) és játék-intenzitás (0–1). Cél-sikerarány a kérdéseknél 70–85%.
7. **Rövid menetek, „még egy kör”.** Menet 2–5 perc; az eredményképernyő mutatja a fejlődést (csillag, rekord, új
   feloldás, „a következő célod”), automatikus újraindítás nincs.
8. **Közös réteg, ahol valóban közös:** kérdés-életciklus, ütemező, ismétlési sor, áramlat, kombó, hullám-forgatókönyv,
   meta-fejlődés, menet-statisztika. Játékspecifikus marad: a megjelenítés (skin), a fizika, a pályák, az ellenfelek.
9. **Minden játék tiszta, determinisztikus magot kap** (`L/<játék>/core*.ts` vagy meglévő `lib/` modul bővítése):
   a pacing / ütemezés / pontozás tiszta függvény, `seed`-elhető RNG-vel (`GE/game-test-hooks.ts` `mulberry32`), hogy a
   node-szimuláció (J0 `game-sim`) mérni tudja a J-pontokat. A React-lap csak összeköt és rajzol.

### 4.2 Etikai keret (gyerekek — kötelező, minden szeletre)

**Megengedett bevonódási eszközök:** áramlat (adaptív kihívás), kompetencia (látható fejlődés, csillagok, saját rekord),
autonómia (választható út / karakter / fejlesztés / kozmetika), kíváncsiság (feloldható új ellenfelek, világok,
gyűjtemény), bőséges azonnali visszajelzés (részecskék, mértékletes képernyőrázás, hang, rezgés, számlálók), rövid
menetek lezárással, napi kihívás **jutalommal, büntetés nélkül**.

**TILOS (dark patterns):**
- veszteségkerüléssel zsarolás: sorozat / jutalom elvesztésével fenyegető szöveg vagy visszaszámláló („elveszíted”,
  „megszakad”, „ne hagyd ki”, „csak ma”); a napi sorozat kijelezhető, de lejárata nem jár figyelmeztető üzenettel;
- mesterséges sürgetés és FOMO a menün kívül (időkorlátos ajánlat, eltűnő jutalom);
- véletlen jutalomdoboz / szerencsekerék / gacha (a jutalmak determinisztikusak: teljesítményhez kötött feloldás);
- fizetős elem, hirdetés, valódi pénzre váltható pont;
- végtelen, megállás nélküli hurok: minden menetnek vége van, és a következő csak a gyerek koppintására indul;
- mások megszégyenítése (nyilvános „legrosszabb” lista, kigúnyoló szöveg); a ranglista meglévő formája
  („Keresztnév V.”, `S/gameScoreService.ts:67-90`) marad;
- a hibás válasz megalázása: a visszajelzés szövege bátorító, a hiba ára játékbeli, sosem „buta vagy”-típusú.

**Kötelező:** a kuponkorlát és a lejárati réteg (`GE/CouponHud.tsx:59-150`, z 95) mindenek fölött marad; 20 perc
folyamatos játék után az eredményképernyőn szelíd „Tarts egy kis szünetet!” javaslat (nem kényszer, nem
visszaszámláló); csökkentett mozgásnál nincs rázás / villogás (`GE/useReducedMotion.ts:27, 57`); a hang némítható
(`L/audioEngine.ts`), a rezgés a meglévő szabály szerint (`GE/mobile/haptics.ts:13-41`).
**Őr:** `T/game-ethics-guard.test.ts` (J0) a hét játéklap és a közös komponensek felhasználói szövegein tiltott
kifejezés-listát keres, és ellenőrzi, hogy a jutalom-kiosztó kód nem hív `Math.random`-ot (csak seedelt RNG a
játékmenetben, a jutalom determinisztikus).

### 4.3 Technikai korlátok

- A közös mobilkeret (`GE/mobile/*`: `GameShell`, `GameHud`, `PauseMenu`, `ResultScreen`, `StartScreen`, `modalLayer`),
  a `--game-*` CSS-változók (`source/client/src/index.css:389-412`) és a z-rétegek (overlay 80, feedback 90, kupon 95)
  megmaradnak. Új fedőréteg a `useModalLayer`-t használja (C-34).
- A közös mobil mérő (`T/support/game-mobile-quality.ts`, M1–M11) és a játékonkénti M12 próbák zöldek maradnak; a mérő
  esetfájljai (`T/game-mobile-cases/*.ts`) a „kvíz-állapotot” az új, nem blokkoló kérdés-állapotra cserélik (9. szakasz,
  dokumentált spec-változás — a mérés nem lazul: M2/M3 a kérdés-állapotban is mér).
- Teljesítmény: three-look költségkeret (`GE/three-look/tier.ts:27-43`), cél ≥ 30 fps low-tier emuláción; új részecske a
  meglévő `SparkleField`-del (`GE/three-look/particles.ts`), csökkentett mozgásnál `motionScale` szerint.
- A `vocab-*` darabok lustán töltődnek (`source/client/src/data/vocabBank/loader.ts:8-28`) — ez marad.
- Névtelen és bejelentkezett tanuló is működik; a szerverre küldés a meglévő `syncEligibility` feltétel szerint.
- Pontszám-szerződés változatlan (2. szakasz). A `runXp` értelmezése játékonként a menet-pont; a `runStreak` mindenhol a
  menet **legjobb** sorozata (a Kockavadász / Tornado hibáját a szelet javítja). A `difficulty` mező a meglévő
  értékkészlet (`easy|normal|hard`).
- Nincs új függőség az egyjátékos szeletekben. Egyetlen indokolt kivétel a többjátékos részben: `socket.io` (szerver) és
  `socket.io-client` (kliens, csak a többjátékos képernyőkön, lusta importtal), mindkettő MIT — indoklás a 10.3-ban. ECS-
  (bitECS: MPL), fizikai motor, hangkönyvtár nem kerül be; hangfájl csak CC0 licenccel és licencnaplóval
  (`source/client/public/audio/LICENSES.md`), CC BY-NC tilos.
- **Determinizmus és rétegzés (minden átírt játékra):** szimuláció (tiszta TS, `L/<játék>/` mag: nincs DOM, three, React,
  `Math.random`, `Date.now`, `performance.now`) → three-nézet (a sim-állapotot olvassa, interpolál) → React UI (menü, HUD
  legfeljebb 10 Hz-es pillanatképpel, kérdés-sáv). Egyetlen seedelt RNG a szimulációban (`shared/game-rng.ts`, sfc32 +
  xmur3 seedelés), fix 1/60 s-os lépés akkumulátorral, képkockánként legfeljebb 5 lépés, interpolált rajz
  (`GE/play/loop.ts`). Őr: `T/game-sim-determinism-guard.test.ts` (J0a). Ez a párbaj, a napi kihívás és a botos
  egyensúly-teszt előfeltétele.

## 5. Az új alaphurkok játékonként

Minden játéknál: **0–10 mp** (első érintés, azonnali akció), **10–60 mp** (a hurok kibontakozik, első kérdés-mechanika,
első ellenfél), **1–5 perc** (hullámok, miniboss, főellenfél, menet vége). A kérdés-mechanikák (Q) mind nem blokkolók.
„Marad” = ami a mostani kódból megtartandó. Konkrét létező kereskedelmi játék neve, pályája, grafikája nem másolható:
a műfajok általános mechanikáira (sávfutó, mászó, túlélő-bányász, toronyvédő, aréna, lövöldözős, vezetős) építünk.

### 5.1 Szökőár szökés → „Hegyre fel!” háromsávos menekülő-futás

- **0–10 mp:** a figura azonnal fut egy hegyi úton, mögötte a hullám. Húzás balra / jobbra = sávváltás (3 sáv), felfelé
  = ugrás. Első akadály 3 mp-nél, első kagyló-gyűjtés 5 mp-nél.
- **10–60 mp:** akadályok (uszadékfa, kerítés, felborult kocsi), gyűjthető kagyló (pont) és „szó-buborék”. A hullám
  távolsága a HUD-on sávként; ütközés = botlás, a hullám közelebb ér.
- **1–5 perc:** szakaszok (tengerpart → falu → erdő → hegyoldal); minden szakasz végén **miniboss: „Örvény”** (gyors
  kapukérdés-sor, 3 egymás után, közben akadályok). Menet vége: a hegytetői menedék elérése (pályánként 2–4 perc
  távolság) = győzelem; a hullám utolérése = vége (mentőöv-kérdés után).
- **Ellenfél:** a hullám (üldöző, tempója az áramlat szerint), szakaszvégi Örvény, a végén a **„Nagy Hullám”** főellenfél
  (4 kapukérdés gyorsuló ütemben; mind jó = hullám visszaverve, nagy bónusz).
- **Q1 Kapukérdés:** 3–4 mp-cel előre a három sávban három kapu jelenik meg a válaszokkal (a 4 opciós tételből a
  helyes + 2 elterelő, seedelt választással). Átfutás a helyes kapun = turbó + a hullám hátrébb kerül; rossz kapu =
  botlás (0,8 mp lassulás), a helyes kapu felvillan, a tétel ismétlési sorba. A prompt a képernyő felső sávjában.
- **Q2 Mentőöv:** amikor a hullám utolérné a játékost, egyszer menetenként 0,35×-es lassításban egy kérdés 4 nagy
  gombbal: jó = pajzs + menekülés, rossz = menet vége (a helyes válasz megjelenik).
- **Q3 Hallott szó (nyelvi tárgynál):** a szó-buborék felvételekor a TTS kimondja az idegen szót (`L/tts.ts:42`
  `speak(term, "en-GB" | "de-DE" | "fr-FR")`, a `readAloudEnabled` kapuval és némíthatóan, D4); a következő kapukérdés
  ennek jelentését kérdezi. Ha a felolvasás nem elérhető, a buborék a szót kiírja.
- **Kérdés/perc:** kapukérdés 8–12 mp-enként + Örvény-sorok → cél ≥ 5/perc.
- **Marad:** forrásrend (`pickQuiz`, `P/TsunamiEscapeEnglish.tsx:828-908`), tantárgyválasztó, nehézségi preset
  (`:484-506`), pályák (`levels.complete`, `:1021-1026`), `POST /api/games/score` (`:1347-1361`), XP-kulcsok (`:72-73`),
  3D jelenet (`GE/scenes/TsunamiScene3D.tsx`) — a futáshoz bővítve.

### 5.2 Szólétra → „Szikla-verseny” függőleges mászás riválissal

- **0–10 mp:** a mászó a sziklafal alján; mellette a rivális mászó (AI) indul. Felfelé húzás / koppintás a kapaszkodóra =
  mászás. Az első kapaszkodó-választás 2 mp-nél.
- **10–60 mp:** két mászási mechanika váltakozik: (a) szabad kapaszkodók (gyors koppintás-ritmus, ügyesség), (b)
  szó-kapaszkodók (Q1). Hulló kövek: balra / jobbra húzással kitérni (ügyesség); találat = 1 fok csúszás.
- **1–5 perc:** tájszakaszok (Rét, Erdő, Felhők, Csillagok — meglévő mérföldkövek, `L/wordLadderLogic.ts:31-68`), a
  rivális gumiszalag-tempóval (rubber-band: a játékos előnye / hátránya szerint ±15%). A csúcson **főellenfél: a
  „Szélsas”** — 3 gyors szó-kapaszkodó egymás után, közben szélrohamok. Győzelem: a zászló elérése a rivális előtt;
  vereség: a rivális ér fel előbb („Majdnem! 2 fok hiányzott.”).
- **Q1 Szó-kapaszkodó:** a prompt a fal tetején, 4 kapaszkodó a válaszokkal; a helyesre koppintás = +1 fok és lendület
  (kombó ×2-től +2 fok); rossz = a kapaszkodó letörik, 1 fok csúszás, a helyes kapaszkodó felvillan, ismétlési sor.
  A 900 + 620 ms kötelező animáció (`P/WordLadderHuEn.tsx:82-84`) megszűnik: a lépés 250 ms, a következő kérdés azonnal.
- **Q2 Hallott szó:** minden 4. kérdés hallás utáni (TTS kimondja, a kapaszkodókon magyar jelentés) — a
  `hu-to-target` / `target-to-hu` típusok (`GE/vocab/questionGenerator.ts:10`) mellé hangalapú megjelenítés.
- **Q3 Kötél-turbó:** 3 jó egymás után = kötél: a következő helyes válasz +3 fok.
- **Kérdés/perc:** cél ≥ 10/perc (a mostani ~9–12 felső része).
- **Marad:** nyelvválasztó (EN/DE/FR), szóbank-készlet (`P/WordLadderHuEn.tsx:404-433`), 10 pálya és hossza
  (`L/wordLadderLevels.ts:14-56`), `LadderScene3D` (bővítve riválissal, kövekkel), eredmény és jelvények (`:886-912`).

### 5.3 Kockavadász → „Rúnabánya” túlélő-bányászat nappal–éjjel ciklussal

- **0–10 mp:** a játékos a felszínen; a sima blokk **tartással** bányászható kérdés nélkül (0,4–1,2 mp blokktípustól
  függően), az első fa-blokk azonnal. Cél-jelző: „Gyűjts 3 rúnaércet a jelzőtűzhöz!”.
- **10–60 mp:** rúnaércek (vas / arany / gyémánt) a közelben, a pálya ütemezője (J0 `QuestionDirector`) garantálja, hogy
  a célrés szerint (~8 mp, a 7 kérdés/perc küszöbhöz) és legkésőbb 15 mp-en belül legyen elérhető rúnaérc. Kraft-asztal: jobb csákány / kard.
- **1–5 perc:** nappal (90 mp) → alkony → **éjszaka (60 mp)**: a mobok valódi ellenfelek (zombi közelít, csontváz lő,
  pók ugrik), sebeznek (3 szív). A második nappal után **főellenfél: „Kő-gólem”** (gyenge pontjai rúnák — Q3). Győzelem:
  jelzőtűz megépítése (N rúnaérc) és a gólem legyőzése; vereség: 0 szív.
- **Q1 Rúna-zár:** a rúnaérc körül 3–4 lebegő, válasszal feliratozott rúnakő jelenik meg; a helyes kiütése = dupla érc;
  rossz = az érc kisebb zsákmánnyá törik, a helyes rúna felvillan, ismétlési sor. A mobok közben mozognak.
- **Q2 Kraft-kérdés:** a kraft-asztalnál a recept 2 inline kérdés (nem blokkoló panel a képernyő alján, a világ fut);
  mindkettő jó = jobb eszköz; egy jó = alap eszköz.
- **Q3 Gólem-rúnák:** a főellenfél 3 gyenge pontja egy-egy válasz; a helyes rúna ütése = sebzés ×4, rossz = visszalökés.
- **Marad:** voxel-motor (`L/voxelcraft.ts:104-264, 335-450`), vezérlők (`P/BlockCraftQuiz.tsx:2996-3050`), 5 bánya-pálya
  szerkezete átnevezve szakaszokká, tárgy-körforgás (`L/blockCraftSubjects.ts:34`). **Megszűnik:** kvíz minden blokkra
  (`tryMineAt`, `:1578-1597`), a jó válasz időcsökkentése (`:2422-2425`).
- **Kérdés/perc:** cél ≥ 7/perc.

### 5.4 Gyors matek sprint → „Neon védőtorony” (műfajváltás, döntési pont D1)

- **0–10 mp:** a torony tetején a feladat (pl. 7 × 8), alulról / oldalról 3–4 neon drón közelít, mindegyiken egy szám.
  A helyes drónra koppintás = lézer, a drón felrobban. Az első feladat 1,5 mp-nél.
- **10–60 mp:** a drónok sebessége és száma az áramlat szerint nő; a rossz drónra koppintás = a drón felrobban, de a
  torony pajzsa −1; ha a helyes drón eléri a tornyot, pajzs −1. Kombó ×1…×5.
- **1–5 perc:** hullámok (5 hullám), a 3. után **miniboss: „Hibagyár”** (két feladat egyszerre, két drónsorral), az 5.
  után **főellenfél: „Zéró-robot”** — páncélját 3 láncolt feladat töri (az előző eredménye a következő operandusa).
  Győzelem: a főellenfél legyőzése; vereség: a pajzs 0.
- **Q1 Drón-célpont:** a válasz maga a célpont (ügyesség + tudás).
- **Q2 Számlánc:** ×3 kombótól a következő feladat az előző eredményére épül (mentális lánc, bónusz).
- **Q3 Becslő-bomba:** 20 mp-enként gyors kétválaszos „melyik nagyobb?” — jó = bomba, minden drón eltűnik.
- **Marad:** a feladatgenerátor (`generatedTaskForGrade`, `P/SpeedQuizMath.tsx:592`; `TEACHER_BANK` 68%, `:1319-1330`;
  `pickFreshTask`, `GE/no-repeat.ts:113-133`), évfolyam- és pályarendszer, `MathTowerScene3D` (a torony központi elem
  marad, drónokkal bővítve). **Megszűnik:** 45 mp-es kérdésidő, a megoldás-mutatás utáni célba számító retry, a „Tanári
  bank / Generált” felirat (`:2036-2038`).
- **Kérdés/perc:** cél ≥ 10/perc.

### 5.5 Brain Rot Lopás → „Lény-aréna” mozgásos gyűjtés riválissal

- **0–10 mp:** felülnézetes aréna, joystick = mozgás, a lények szétszaladnak. Rávezetés (érintés) = elkapás. Az első
  lény 2 mp-en belül elérhető.
- **10–60 mp:** a **rivális tolvaj** (AI, „Tolvaj” karakter, saját arcképpel — nem létező márka) is gyűjt; a lények
  menekülnek (egyszerű menekülési viselkedés). Valós 90 mp-es óra, **kérdés alatt is jár** (a mostani „álló óra” hazugság
  megszűnik, `P/BrainRotSteal.tsx:810-824`).
- **1–5 perc:** 3 forduló (90 mp, 60 mp, 60 mp) között fejlesztés-választás (sebesség / ketrec-mágnes / kitartás);
  a 3. forduló végén **főellenfél-forduló: a Tolvajkirály** (aki a játékos ketreceiből lop, Q2-vel lehet visszalopni).
  Győzelem: több lény, mint a riválisnak; döntetlen = hosszabbítás 15 mp.
- **Q1 Ketrec-zár:** az elkapott lény küszködik; az aréna négy pontján 4 ketrec jelenik meg a válaszokkal; a helyes
  ketrecbe futás 4–6 mp alatt = a lény megmarad + kombó; rossz ketrec = a lény a riválishoz szökik, a helyes ketrec
  felvillan, ismétlési sor.
- **Q2 Visszalopás-párbaj:** ha a rivális a közelben elkap egy lényt, 0,35×-es lassításban gyors kérdés: jó = a lény a
  játékosé.
- **Q3 Arany lény:** ritka, nagyobb értékű, nehezebb sávú kérdéssel (kockázat–jutalom döntés).
- **Megszűnik:** a felfedett válasz visszakoppintása mint elkapás (`:586-590, 661`); teljes képernyős kvíz.
- **Kérdés/perc:** cél ≥ 8/perc.

### 5.6 Galaktikus Aszteroida → folyamatos lövöldözős, kérdés-kristályokkal

- **0–10 mp:** azonnal akció (a mostani induló kvíz, `P/SpaceAsteroidQuiz.tsx:1258`, megszűnik); első sziklák 1 mp-nél.
- **10–60 mp:** hullámok folyamatos átmenettel (nincs hullám-kapu). Q1 kristályok 12–15 mp-enként.
- **1–5 perc:** 8 hullám (a 4. után miniboss „Ufó-anyahajó”), a 8. után **főellenfél** (a meglévő 3 fázisú boss,
  `:1854-1884`) gyenge pontokkal (Q2). Menet 3–5 perc; az idő-limit (`ROUND_LIMIT_SEC` 360, `:206`) helyett életalapú
  vég — a 360 mp vs. 12 hullám ütközés megszűnik.
- **Q1 Kristály-válasz:** a prompt a felső sávban; 3–4 feliratozott kristály-aszteroida lebeg be; a helyes kilövése =
  fejlesztés (hármas lövés / pajzs / bomba, az áramlat szerint), rossz kristály = apró sziklákra hasad (veszély), a
  helyes felvillan, ismétlési sor.
- **Q2 Gyenge pont:** a boss 3–4 feliratozott gyenge pontja; a helyes találat sebzés ×5, rossz találat visszaverődő lövés.
- **Q3 Mentő-pajzs:** az utolsó élet elvesztésekor egyszer menetenként 0,35×-es lassításban kérdés: jó = pajzs.
  **Megszűnik:** ütközés = élet − 1 ÉS kötelező kvíz (`:2153-2187`), a hamis „Megúsztál egy kvízt!” felirat (`:2195`).
- **Javítás:** `recordRun` valódi kérdés-statisztikával (`:2633-2634`).
- **Kérdés/perc:** cél ≥ 4/perc (a mostani ~2–3 fölött).

### 5.7 Tornado Hunter 200 → üldözéses vezetés kérdés-útjelzőkkel

- **0–10 mp:** azonnal vezetés, a tornádó a horizonton, irányjelző.
- **10–60 mp:** a tornádó pályája zaj-alapú, kiszámíthatatlanabb (a fix körpálya, `P/TornadoHunter200.tsx:2047-2050`,
  helyett seedelt zajgörbe), törmelék-akadályok. Q1 útelágazások 15–20 mp-enként.
- **1–5 perc:** a horgony-szakasz Q2-vel; nehezebb szinteken a tornádó kettéválik (két cél, döntés). Menet vége: sikeres
  mérés = győzelem, a tornádó elhal / kidobó szél = vereség. **Főellenfél** (szintenként): a „szupercella” — a mérési
  sáv szűkül, a szél erősödik.
- **Q1 Útelágazás:** 3 útjelző tábla a válaszokkal; a helyes úton rövidítés + turbó, rossz úton kerülő (idő), a helyes
  tábla felvillan, ismétlési sor. A vezetés nem áll meg.
- **Q2 Műszer-kalibrálás:** horgony csak a sávban dobható (a `:1694-1699` hiba megszűnik); utána 3 gyors inline kérdés,
  miközben a sávban kell maradni (kormányzás + válasz); mindhárom jó = 100% adatminőség, egy rossz = 66% stb.
- **Q3 Turbó-töltés:** a turbópadon szó / feladat; jó = nitró.
- **Javítás:** minden fejlesztés hat (`tires`, `chassis`, `anchor`, `instruments`, `stability`, jelenleg csak a
  garázsban, `:690-694`); a pont-bontás (`L/tornado/scoring.ts:157-169`) az eredményképernyőn; `MATH_4` angol tételek
  átsorolása (`L/tornado/questions.ts:356-366`); `runStreak` = legjobb sorozat.
- **Kérdés/perc:** cél ≥ 4/perc.

## 6. Közös réteg (J0 = J0a determinizmus + J0b tanulási mag + J0c UI) és mérőszámok

### 6.1 Modulok (`source/client/src/game-engine/play/`)

| Modul | Felelősség | Közös / játékspecifikus |
|---|---|---|
| `types.ts` | `PlayQuestion`, `QuestionOutcome`, `QuestionSourceKind`, közös típusok | közös |
| `questionDirector.ts` | mikor jöjjön kérdés (min / max rés, kérdés/perc cél, „kapu-pillanat”), forrásrend, `QuestionPresenter`-hívás; tiszta, seedelt | közös |
| `reviewQueue.ts` | térközös ismétlés (Leitner, 5 doboz), menet közbeni visszahozás 3–6 kérdésen belül; `websuli.gameReview.v1` | közös |
| `flow.ts` | `FlowController`: képesség-becslés → `band` + `intensity` | közös |
| `combo.ts` | kombó-szorzó ×1…×5, lecsengés, eseményei | közös |
| `waves.ts` | hullám-forgatókönyv (költségvetés, miniboss, boss), seedelt | közös (adat játékonként) |
| `runStats.ts` | menet-statisztika (kérdések, helyes, egyedi, ismétlés, kérdés/perc, leghosszabb kérdés nélküli rés) | közös |
| `InlineQuestion.tsx` | nem blokkoló kérdés-sáv (prompt + időcsík + opcionális 4 gomb), skinelhető, `aria-live`; NEM modális | közös |
| `WhyButton.tsx` | „Miért?” — szünetet kér és a `QuizFeedbackCard`-ot nyitja a legutóbbi hibához | közös |
| `ResultReview.tsx` | az eredményképernyőn „Amit ma tanultál / gyakorold még” lista (hibázott tételek a helyes válasszal) | közös |
| `meta.ts` | játékos-szint az összes XP-ből, feloldások, gyűjtemény; `websuli.meta.v1` | közös (J8) |
| `source/shared/game-rng.ts` | seedelt RNG (sfc32, xmur3-seedelés), `seedFrom(...parts)` — kliens ÉS szerver (párbaj, napi kihívás) használja | közös (J0a) |
| `loop.ts` | fix 1/60 s lépés akkumulátorral, ≤ 5 lépés / képkocka, `alpha` az interpolációhoz, szünet / lassítás szorzó | közös (J0a) |
| `feel.ts` | trauma²-alapú képernyőrázás (lecsengés 0,5–1,5/s, plafon a képmagasság 1%-a), hitstop (40–120 ms valós idő, 150 ms-on belül nem ismétlődik), easing / tween, csökkentett mozgásnál 0 rázás | közös (J0a) |
| `director.ts` | „mini-Director” intenzitás-fázisok (felépülés → csúcs → lecsengés → pihenő); a kérdés-ütemező a pihenő / lecsengés fázist részesíti előnyben | közös (J0a), a `flow.ts`-sel együtt |
| játékonként | a válaszcélok megjelenítése (kapu, kapaszkodó, drón, ketrec, kristály, rúna, útjelző), ellenfelek, fizika | specifikus |

A pontos TypeScript-interfészek a végrehajtási fájl J0 fejezetében (szerződés, eltérni csak orkesztrátori jóváhagyással).

### 6.2 Mérőszámok és mérési módjuk

| Mérőszám | Küszöb | Mivel mérjük |
|---|---|---|
| Szimuláció a kérdés alatt | szimulációs idő / valós idő ≥ 0,35, soha 0 (szünet, „Miért?”, kupon kivételével) | Playwright: `__websuliGame.probe().simTime` két mintája 1 mp különbséggel nyitott kérdés mellett; egységteszt a mag `step()`-jén |
| Kérdés/perc (szimulált átlagos játékos) | Szökőár ≥ 5, Szólétra ≥ 10, Kockavadász ≥ 7, Matek ≥ 10, Brain Rot ≥ 8, Aszteroida ≥ 4, Tornado ≥ 4; hét játék átlaga ≥ 6,8 (a küszöbök átlaga 6,86; a mostani becsült átlag ~6,6) | node-szimuláció (`T/support/game-sim.ts`, játékonként `T/<játék>-sim.test.ts`), 20 seed × 180 mp, medián |
| Leghosszabb kérdés nélküli összefüggő játék | Szökőár ≤ 15 mp, Szólétra ≤ 8, Kockavadász ≤ 15, Matek ≤ 6, Brain Rot ≤ 12, Aszteroida ≤ 20, Tornado ≤ 20 (a menet első 10 mp-e kivétel) | ugyanaz a szimuláció (`runStats.maxGapSec`) |
| Legrövidebb rés két kérdés-indítás között | ≥ 1,5 mp (kivétel: boss-sor, ott ≥ 0,8 mp) | szimuláció |
| Hibázott tétel visszatérése (ismétlés, külön mérve) | menet közben az ismétlések aránya ≤ 30% (legfeljebb minden 3. kérdés), egy tétel menetenként legfeljebb 2-szer tér vissza; a `SIM_AVERAGE` (75%) játékosnál a hibázott tételek ≥ 95%-a a 3.–6. következő kérdésként, a többi ≤ 10 kérdésen belül; a `SIM_WEAK` (45%) játékosnál ≥ 60%-a ≤ 10 kérdésen belül, a maradék a következő menet első 10 kérdésében; helyes ismétlés után a térköz nő (box 0 → 1: 1 nap, majd 3, 7, 21 nap) | `T/game-review-queue.test.ts` (térköz) + szimuláció (arányok) |
| Tételváltozatosság (csak az ÚJ, nem ismétlésként adott kérdéseken) | az ismétlésnek nem minősülő kérdések sorozatában bármely 40-es ablakban nincs duplikátum (40/40 különböző), ha az új tétel-forrás ≥ 200 tételt ad (kevesebbnél: ≥ 90% különböző) | szimuláció (`runStats.freshWindow40Distinct`) |
| Tananyag-elsőbbség | elérhető tananyag-tétel esetén az első kérdés tananyag; a tananyag elfogyása után szóbank / évfolyam-bank (nem ismétlődő tananyag) | `T/game-question-director.test.ts` szimulációs teszt (C-34 H1 tanulság) |
| Válaszablak | rövid tételnél 2,5–6 mp (3–4. évf. ×1,25 → 3,1–7,5 mp), hosszú tételnél olvasási pótlékkal, de mindig ≤ 9 mp | `T/game-question-director.test.ts` |
| Adaptivitás | kiinduló sáv 0,40; 95%-os szimulált játékosnál a `band` 30 kérdésen belül ≥ 0,75 és az `intensity` nő; 45%-osnál a `band` ≤ 0,35 és az `intensity` csökken; a 75%-os játékosnál 60 kérdés után a csúszó (utolsó 20) sikerarány 65–90% között | `T/game-flow.test.ts` (seed 1–20) |
| Menethossz | szimulált átlagos játékosnál medián 2–5 perc; nincs automatikus újraindítás | szimuláció + Playwright (eredményképernyő után 5 mp-ig nincs állapotváltás) |
| Hibás válasz nem blokkol | hibás válasz után legfeljebb 2,5 mp-en belül a játék a teljes sebességen fut, kártya nélkül; a „Miért?” megnyomására a kártya megnyílik és az óra áll | Playwright `T/game-inline-question.spec.ts` |
| Teljesítmény | low-tier (`?look=low`) + 4× CPU-lassítás mellett a játékmenetben medián ≥ 30 fps | Playwright CDP `Emulation.setCPUThrottlingRate`, `probe().fps` (J9) |
| Etika | tiltott szöveg-minták 0 találat; jutalom-kód seedelt | `T/game-ethics-guard.test.ts` |
| Szerződés | a score zod-séma változatlan | `T/game-score-contract-guard.test.ts` (J0) |

**Szimulációs paraméterek (minden 6.2 küszöbhöz, ahol „szimuláció” a mérés):** játékosmodellek (`T/support/game-sim.ts`):
`SIM_AVERAGE` helyes arány 75%, reakcióidő log-normális (medián 2,8 mp, σ = 0,35), ügyességi siker 80%; `SIM_YOUNG` 75%,
3,5 mp, 70% (3–4. évf.); `SIM_STRONG` 95%, 1,8 mp, 90%; `SIM_WEAK` 45%, 4,0 mp, 60%. Ha a reakció a válaszablakon túl
esik: időtúllépés. Seedek: `seedFrom("sim", gameId, i)`, i = 1…20; menet 180 mp (menethossznál a menet végéig, legfeljebb
600 mp); lépés 1/60 s; az eredmény a 20 futás mediánja (a „legfeljebb / legalább” küszöböknél a 20 futás mindegyike, ha a
sor így írja). A küszöbök összhangja ellenőrizve (review #440): kérdés/perc vs. ütemezés — a director célrése a
kérdés-indítások között `60000 / (targetPerMin × 1,1) × (1 − 0,25 × intensity)`, így alacsony intenzitáson is ~10%-kal a
küszöb fölött marad, és minden célrés ≤ a játék kérdés nélküli maximuma; ismétlés vs. változatosság — az ismétlések
külön mérőszámot kapnak (75%-os játékosnál 40 kérdésből ~10 hiba → ~10–12 ismétlés, ezért a régi „40-ből ≥ 34 különböző”
küszöb teljesíthetetlen volt); válaszablak vs. kérdés nélküli rés — a válaszablak kérdéssel töltött idő, nem rés;
menethossz — a pályahosszakat a szelet a `SIM_AVERAGE` mediánjára hangolja (pl. Szólétra 14 fok: nettó +0,5 fok /
kérdés → ~28 kérdés ≈ 2,8 perc 10 kérdés/perc mellett); bónuszplafon — a sávos gyorsasági bónusz legfeljebb 2,5 / 10 = 25%.

## 7. Adat- és mentésszerkezet

| Kulcs | Új / meglévő | Tartalom | Verzió, migráció |
|---|---|---|---|
| `websuli.gameReview.v1` | új (J0) | `{ v: 1, items: Record<reviewKey, ReviewItem> }`, legfeljebb 400 tétel; a legrégebben esedékes / legrégebben látott dobódik | ismeretlen `v` → üres; sérült JSON / tárolóhiba → memória (a `seenHistory.ts:77-107` mintája) |
| `websuli.meta.v1` | új (J8) | `{ v: 1, cosmetics: Record<gameId, string[]>, equipped: Record<gameId, string>, collection: Record<gameId, string[]>, stars: Record<gameId, Record<grade, number[]>> }` | a játékos-szint NEM tárolt: a `websuli.lifetime-stats.totalXp`-ből számolt (`L/achievements.ts:43-59`) → migráció nélkül visszamenőleg érvényes; csillagok a meglévő `websuli.levels.<gameId>.<grade>`-ből kiindulva |
| `websuli.vocabSeen.v1` | meglévő | változatlan | — |
| `websuli.gameBest.v1`, `websuli.achievements`, `websuli.lifetime-stats`, `websuli.daily`, `websuli.levels.*`, `websuli.audio`, `websuli.classroomGrade` | meglévő | változatlan szerkezet | — |
| `websuli-tsunami-en-xp`, `websuli-tsunami-en-best-streak`, `websuli-wordladder-xp`, `websuli-wordladder-streak`, `websuli.wordladder.lang`, `websuli.spaceQuiz.grade` | meglévő | változatlan | — |
| `websuli.tornado.v1` | meglévő | a fejlesztések értelmezése változik (hatnak), a szerkezet nem | nincs migráció; a mentett szintek érvényesek |
| `websuli.gameSettings.v1` | új (J0) | `{ v: 1, tts: boolean }` (felolvasás a nyelvi játékokban; alap: be, ha `speechSupported()`) | ismeretlen `v` → alapérték |

`ReviewItem` mezői a végrehajtási fájl J0-ban. A tétel-tartalom tárolása: szóbanknál csak `vocabId` (újragenerálás
`VocabSource.questionFor`-ral), évfolyam-banknál `gradeId`, tananyagnál és kézi banknál a `FourChoiceQuiz` pillanatképe
(prompt ≤ 300, opció ≤ 120, magyarázat ≤ 400 karakterre vágva). Szerverre nem kerül.

## 8. Edge case-ek

1. **Nincs elég tétel** (pl. kevés tananyag, szóbank még tölt): a `QuestionDirector` kézi bankra esik vissza; ha
   semmi nincs, a játék kérdés nélkül fut, és az eredményképernyő ezt jelzi (nem hiba).
2. **A szóbank lusta betöltése késik** (első kérdés): a mostani viselkedés (kézi bank) marad (`P/WordLadderHuEn.tsx:535-540`).
3. **localStorage kivétel / megtelt / privát mód:** minden új kulcs memóriában folytatja, kivétel nélkül.
4. **Gyors koppintás két célpontra egyszerre** (multitouch): az első érvényes válasz számít, a többi eldobódik
   (`QuestionDirector.answer` idempotens a kérdés-azonosítóra).
5. **Szünet / háttérbe kerülés kérdés közben:** a kérdés ablaka és a szimuláció együtt áll; visszatéréskor a maradék
   idővel folytatódik (`GE/mobile/autoPause.ts:21-45`).
6. **Kuponlejárat kérdés közben:** a kupon-réteg nyer (z 95); a kérdés kimenete „megszakítva” (nem hiba, nem kerül
   ismétlési sorba). Kupon módban csak tananyag-kérdés jön (meglévő szabály, pl. `P/BrainRotSteal.tsx:443`).
7. **Kupon-bónusz kérdés** (`claimCouponBonus`, `GE/claimCouponBonus.ts:9-31`): a szerver által kiadott tétel a
   kérdés-mechanikán át is beváltható; a `pickedIndex` a valós választás (a hármas kapuknál az eredeti indexre
   visszaképezve).
8. **3 opciós megjelenítés** (sávfutó, útelágazás): a 4 opciós tételből seedelt választással a helyes + 2 elterelő;
   az eredeti `correctIndex` / `pickedIndex` megőrződik a statisztikához és a kuponhoz.
9. **Nagyon hosszú prompt** (> 140 karakter, tananyag): „kapu-pillanat” 9 mp-ig, alacsony akadálysűrűség; ha a
   megjelenítés a képernyőn nem fér el (360×640), a prompt görgetés nélkül két sorra vágódik + „Mutasd” gomb, ami
   szünetet kér.
10. **Csökkentett mozgás:** lassítás és visszajelzés rázás nélkül; a felvillanás helyett keret-kiemelés.
11. **Nem érintős eszköz:** a válaszcélok billentyűvel (1–4 / nyilak) is választhatók, a meglévő billentyű-kezelés
    mintájára; M5 marad.
12. **Fekvő tájolás (Tornado) és álló (többi):** a `RotateHint` szabály marad (C-34).
13. **Szinkronizálatlan óra a kérdés alatt** (dt-ugrás lassú telefonon): `dt` legfeljebb 0,05 s (a meglévő minta,
    `P/SpaceAsteroidQuiz.tsx:1500-1511`), a válaszablak játékidőben mérve.
14. **Névtelen tanuló:** minden helyben működik; a szerverre küldés a meglévő `syncEligibility` szerint.
15. **Régi mentés:** a meglévő kulcsok változatlanok; az új kulcsok hiánya = üres állapot.

## 9. Spec-változások a meglévő tesztekben (dokumentált, nem lazító)

A G-1 őr (`T/game-feedback-wiring-guard.test.ts`) és az `T/game-explanation-pause.spec.ts` a **blokkoló** kártyát
rögzíti. Ez a terv a tulajdonos G3 céljával ütközik (a kérdés ne megszakítás legyen). Az új követelmény **nem lazább**:

- a helyes válasz hibánál a játéktérben ≥ 1,8 mp-ig megjelenik (eddig: a kártyán);
- a tétel ismétlési sorba kerül és visszatér (eddig: kiesett) — erősebb tanulási garancia;
- a teljes magyarázókártya (`QuizFeedbackCard` + `buildFeedback`) továbbra is a lapon marad: a „Miért?” gombbal bármikor
  megnyitható (ilyenkor az óra áll — a „magyarázat olvasása közben áll az óra” követelmény megmarad), és az
  eredményképernyő „Gyakorold még” listája minden hibázott tételhez megmutatja.

A tesztváltozás minimalizálására két rögzített szabály: (1) **a meglévő testid-ek maradnak** — a nem blokkoló
kérdés-sáv játékonként a régi azonosítókat hordozza (`ts-quiz`, `ts-prompt`, `ts-option-<i>`, `ts-quiz-pause`,
`wl-prompt`, `wl-option-<i>`, `bc-quiz`, `bc-prompt`, `bc-quiz-pause`, `sq-answers`, `br-quiz`, `br-quiz-pause`,
`tornado-quiz`, `sa-quiz-pause`), a sávban saját szünetgombbal; (2) a `forceState({ phase: "quiz" })` minden átírt
játékban **kompatibilis álnév**: azonnal nyit egy kérdést (a `forceState({ question: true })` mellett). Így a
`T/game-mobile-cases/*.ts`, a `T/game-win-paths.spec.ts` és a forrás-őrök (pl. `T/blockcraft-mobile.test.ts:70`,
`T/s13-review-guards.test.ts:55`, `T/space-asteroid-mobile.test.ts:89`, `T/tsunami-mobile.test.ts:109`,
`T/word-ladder-3d-wiring.test.ts:34-36`, `T/speed-quiz-mobile.test.ts:38-52`, `T/tornado-mobile-shell.test.ts:97`)
változatlanul zöldek maradnak.

Ami a **blokkoló** viselkedést rögzíti, az az adott játékszeletben `SPEC-VÁLTOZÁS 2026-11-16
(docs/specs/2026-11-16-jatekok-jatekelmeny.md 9.)` megjelöléssel az új, fenti követelményt ellenőrző tesztre cserélődik
(kódból azonosítva, 2026-11-16):

| Teszt (fájl:sor) | Mit rögzít most | Szelet |
|---|---|---|
| `T/game-feedback-wiring-guard.test.ts:77-116` | Matek: a hibás ág nem léptet, a kártya alatt áll az óra, 0 életnél nincs „Újrapróbálom” | J4a |
| `T/game-feedback-wiring-guard.test.ts:120-133` | Szólétra: a kártya bezárása indítja a lépés-láncot | J2a |
| `T/game-explanation-pause.spec.ts` | Szólétra: a kártya alatt a kérdés nem cserélődik | J2a |
| `T/remaining-learning.spec.ts:39-106` | Aszteroida: a hibás válasz kártyája olvasható, bezárva új kvíz (`Mini-teszt` dialógus) | J6a |
| `T/remaining-learning.spec.ts:123-133` | Szökőár: időtúllépés → kártya `data-outcome="timeout"`, a kérdés-óra áll | J1a |
| `T/learning-flow.browser.ts:148-175` | Aszteroida: háromválaszos lecke-kérdés a `Mini-teszt` dialógusban, magyarázattal | J6a |
| `T/coupon-lesson.browser.ts:4-43` | Aszteroida kupon-módban: valós válasz, `quiz-feedback` | J6a |
| `T/coupon-expired-layer.browser.ts:117-126` | Brain Rot: rossz válasz → `quiz-feedback`, a kupon-réteg fölötte | J5a |
| `T/game-viewport-experience.spec.ts:120-146` | Matek: 0 életnél kártya „Újrapróbálom” nélkül | J4a |
| `T/blockcraft-two-finger.spec.ts:134-142` | Kockavadász: kvízréteg szünetgombbal, jó válasz után eltűnik | J3a (várhatóan változatlan zöld a két szabály miatt; ha nem, csere) |

A csere elve mindegyiknél: a „Miért?” megnyomása után a `quiz-feedback` megjelenik (a megfelelő `data-outcome`-mal), és
a `probe().simTime` nem nő; a „Miért?” nélkül nincs `[role="dialog"]`, a helyes válasz `data-state="correct"` legalább
1,8 mp-ig látszik, és a tétel az ismétlési sorba kerül. A kupon-réteg fölérendeltsége (`--game-z-coupon-expired` 95)
minden cserében megmarad. Az import- és JSX-jelenlét esetek (`buildFeedback`, `<QuizFeedbackCard`) változatlanok.
Egyéb meglévő teszt nem gyengülhet (AGENTS.md „Teszt-integritás”).

## 10. Közös többjátékos mód, párbaj, játékos-fiók és pontgyűjtés (JM0–JM11, JB)

> Véglegesítve 2026-11-16 a négy kutatás (`kutatas/1–4`), az orkesztrátori döntések és a tulajdonosi döntés (diákok saját
> regisztrációja, 13. szakasz D11) alapján. A kutatások állításait a kódból szúrópróbával ellenőriztük (lent [T] =
> kódból igazolt, fájl:sor); ami nem igazolt, UNVERIFIED, felderítési lépéssel a megfelelő szeletben.

### 10.1 Célok (G8–G10)

Barátokkal / testvérekkel / osztálytársakkal ugyanazt a játékot közösen játszani ezen a felületen, a szerveren
összekapcsolva (online szoba 2–4 főre); párbaj, ahol a helyesen (és kisebb súllyal a gyorsabban) válaszoló győz; a
csoportos játék végén győzteshirdetés; e-maillel regisztrált diák saját kis játékos-fiókja, amely a pontokat a szerveren
gyűjti és tárolja. Vendég (regisztráció nélkül) egyedül játszhat, és szobakóddal csatlakozhat generált becenévvel; a
pontgyűjtés, barátok, ranglista és párbaj-mérleg a regisztráltaké.

### 10.2 A kódból felmért tények (2026-11-16)

- **Valós idejű csatorna nincs.** A `ws` függőség (`source/package.json:139`), de nincs importálva; SSE csak a Stúdióban
  (`S/studio/web-research-routes.ts:67`). HTTP-szerver: `S/routes.ts:4240` (`createServer(app)`), indítás `S/index.ts:678`;
  saját `upgrade`-kezelő nincs (csak a dev Vite HMR, `S/vite.ts:28`); a CSP élesben engedi a `wss:`-t (`S/index.ts:141-142`).
- **Telepítés:** a kliens a Vercelen; az `/api/*`, `/auth/*` rewrite-tal a Renderre megy (`source/vercel.json`), a Vercel
  minden `/api/*` kérésre `x-websuli-proxy-secret` fejlécet tesz. Render: egyetlen `starter` web-szolgáltatás
  (`render.yaml:2-10`; a kutatás szerint 0,5 CPU / 512 MB — Render-dokumentáció), példányszám nincs megadva (→ 1,
  UNVERIFIED a dashboardon). Vercel-dokumentáció (context7, `vercel.com/docs/limits`): a külső célra mutató rewrite
  („proxied request”) legfeljebb **120 s**-ig dolgozhat egy HTTP-kérésen. Hogy a külső rewrite WebSocket-upgrade-et
  továbbít-e: **UNVERIFIED** (a dokumentáció nem mondja ki).
- **Azonosítás:** `express-session` + `connect-pg-simple` (`S/auth.ts:36-65`), `saveUninitialized: false` → vendégnek
  nincs munkamenete; Passport local (e-mail + jelszó, csak meglévő fiókra) és Google OAuth (első belépéskor fiókot hoz
  létre) (`S/auth.ts:70, 94-131`); regisztrációs végpont NINCS (kutatás 1, grep). `users` tábla: `source/shared/schema.ts:27-40`
  (nincs becenév, e-mail-megerősítés). Tiltás: `isBanned` (`S/auth.ts:174-185`). Tanulói profil: `learners`
  (`source/shared/schema.ts:1218-1233`, nincs `user_id`), HMAC-token (`S/lib/learner-token.ts:14-32`, `S/learners.ts:83-121`).
- **Pontok:** `game_scores` összesítő (`source/shared/schema.ts:470-500`) csak Google-fiókos, e-mail-listás felhasználónak
  (`S/gameScoreService.ts:44-54`); a `POST /api/games/score` (`S/routes.ts:1298-1338`) **sebességkorlát nélkül** (az
  `S/index.ts` limiter-bekötései között nem szerepel — grep, 0 találat) és idempotencia nélkül.
- **Adatvédelmi hibák [T]:** a ranglista „Keresztnév V.” alakú valódi nevet mutat (`S/gameScoreService.ts:56-61, 74-75`);
  e-mail-cím kerül info-naplóba (`S/auth.ts:72, 86, 96, 105`; `S/routes.ts:1510`).
- **A helyes válasz ma is a kliensnél van [T]:** a szerveres bank kiküldi a `correctIndex`-et (`S/routes.ts:1158-1166`), a
  statikus bankok a bundle-ben.
- **Determinizmus [T]:** a játékok `Math.random`-ot hívnak a játékmenetben; a Tornado futás-seedje is `Math.random`-ot
  kever (`P/TornadoHunter200.tsx:1924`); seedelt opció-keverő van (`source/shared/option-order.ts`); a `readGameSeed()`
  csak tesztben él. → két kliens ma nem kap azonos kérdéssort.
- **Évfolyam-bank [T]:** évfolyamonként 90 tétel (`grep -c "prompt:"` a `grade-03/07/12.ts`-en: 90/90/90) → tárgy × sáv
  cellánként ~6 tétel: visszavágóhoz kevés (JB szelet).
- **Szerveroldali bank-import [T]:** az esbuild a szervert bundle-öli (`source/build-server.js:10` `bundle: true`); a
  `source/client/src/data/*` importálhatósága a szerverből: a kutatás szerint igen (`tsconfig.json` include, és van rá
  példa) — a JM2 első lépése igazolja.
- **QR:** `qrcode` (`source/package.json:124`), `PairQr` (`source/client/src/components/LearnersPanel.tsx:23-42`).
- **Védelem:** `express-rate-limit` IP-kulccsal (`S/index.ts:362-460`, `S/lib/client-ip.ts`), CSRF `csrf-sync`
  (`S/routes.ts:765-821`), origin-allowlist (`S/lib/origin-guard.ts:35`, `S/lib/allowed-origins.ts`).
- **Leállítás / e2e:** SIGTERM-lánc (`S/index.ts:685-729`), e2e-mód `isE2eMode()` (`S/lib/e2e-mode.ts:7`).
- **Memóriabeli TTL-minta:** `ViewDedup` (`S/lib/view-dedup.ts:10`). **Migrációk:** utolsó `source/migrations/0039_*.sql`
  → a következő `0040`.

### 10.3 Csatorna-döntés (orkesztrátori 6. pont): Socket.IO a meglévő `/api` útvonalon

A két kutatás eltért (`ws` + saját aldomain vs. Socket.IO). Döntés: **Socket.IO** a meglévő Express / `http.Server`
mellett, `path: "/api/rt/"` beállítással. Indoklás, bizonyítékkal:

1. **Működik tulajdonosi DNS-lépés nélkül.** A Socket.IO HTTP hosszú lekérdezéses (long-polling) szállítása sima
   GET/POST kérés; a `/api/rt/` út a meglévő `/api/:path*` Vercel-rewrite alá esik (`source/vercel.json`), így a
   `vercel.json` sem változik. A long-poll kérés legfeljebb a `pingInterval` (alap 25 s, Engine.IO forrás —
   context7 `/socketio/socket.io`) ideig várakozik, ez bőven a Vercel 120 s-os proxy-korlátja alatt van.
2. **Egy példányon nem kell ragadós munkamenet.** A Socket.IO dokumentáció szerint a sticky-session követelmény a
   **több csomópontos** telepítésre vonatkozik (context7 `/socketio/socket.io`, „Disconnection detection”); a Render-
   szolgáltatás egy példányos (10.2).
3. **Ugyanaz az eredet → a session-süti megy.** A polling a böngésző szemében `https://websuli.vip/api/rt/…`, így a
   meglévő munkamenet-süti és a Vercel proxy-titka (valódi kliens-IP) is megérkezik; a regisztrált játékos a szerveren a
   munkamenetből azonosítható, a vendég egy belépőjeggyel.
4. **WebSocket-gyorsítás, ha elérhető.** A kliens a pollingról WebSocketre próbál frissíteni (Socket.IO alapviselkedés);
   ha a Vercel-rewrite nem engedi (UNVERIFIED), a kapcsolat pollingon marad, hibátlanul. Opcionális javítás (nem
   előfeltétel): `MP_DIRECT_URL` (pl. egy tulajdonos által beállított `jatek.websuli.vip` Render custom domain) — ekkor a
   kliens közvetlenül oda csatlakozik WebSocket-tel, a belépőjegy a Socket.IO `auth` mezőjében megy.
5. **Iskolai hálózat [K]:** a sima HTTPS-kérésekből álló polling ott is átmegy, ahol egy proxy a WebSocket-upgrade-et
   tiltja; a `ws`-alapú saját megoldásnál ehhez nekünk kellene tartalék-szállítást írnunk.
6. **Belépőjegy soha nem URL-ben és nem egyéni fejlécben.** A böngésző WebSocket API-ja nem tud egyéni fejlécet küldeni a
   kézfogáskor, ezért a 3. kutatás „jegy fejlécben / `Sec-WebSocket-Protocol`-ban” javaslata helyett a jegy a Socket.IO
   `auth` mezőjében (a csatlakozási csomagban) megy.
7. **Költség:** két új MIT-függőség (`socket.io`, `socket.io-client`); a kliens csak a többjátékos képernyőkön, lusta
   importtal töltődik (a csomagméretet a JM2 méri és a PR-ba írja — UNVERIFIED pontos méret). Szobák, nyugták,
   újracsatlakozás (`connectionStateRecovery`, memóriabeli adapterrel támogatott — kutatás 4, [F16a]) készen vannak.

**Bekapcsolás:** szerverkapcsoló `MP_MODE=off|admin|on` (alap `off`; `admin` → csak `isAdmin` hozhat létre szobát; a
repó vészfék-mintája szerint, pl. `LESSON_CLIPS=0`, `S/index.ts:563-564`); a kliens a `GET /api/rt/status`
`enabled` mezője szerint mutatja a többjátékos gombokat. A main ágon így semmi félkész nem látszik.

### 10.4 Játékos-azonosság, fiók és admin-elválasztás (tulajdonosi döntések D11, D12)

**Admin-jog ma (kódból, 2026-11-16):** az admin-jog egyetlen forrása a `users.is_admin` oszlop
(`source/shared/schema.ts:35`, alapértéke `false`); a Google-stratégia **új** felhasználónál az `ADMIN_EMAIL` env pontos
egyezéséből állítja, meglévőnél megtartja (`S/auth.ts:112-124`); az `ADMIN_EMAILS` csak értesítési lista, jogot nem ad
(`S/lib/material-result.ts:95-97`). Ellenőrzők: `isAuthenticated` (`S/auth.ts:256-261`, csak
bejelentkezés) és `isAuthenticatedAdmin` (`S/auth.ts:264-274`, 401 / 403); a `deserializeUser` minden kérésnél újraolvassa
a felhasználót és a tiltottat elutasítja (`S/auth.ts:174-185`). **Végpont-felmérés:** minden admin-jellegű végpontot
router-szintű vagy útvonalankénti `isAuthenticatedAdmin` véd — `/api/studio` routerek (`S/studio/routes.ts:51`,
`S/studio/lesson-pipeline-routes.ts:219`, `S/studio/web-research-routes.ts:15`, `S/workflows/routes.ts:14`),
`/api/admin` (`S/routes.ts:4182` `app.use('/api/admin', isAuthenticatedAdmin, adminRouter)`), `/api/admin/catalog`
(`S/catalog/admin-routes.ts:13`), `/api/admin/subject-memory` (`S/memory/admin-routes.ts:12`), és útvonalanként a
`/api/html-files*` írásai (`S/routes.ts:1621, 1790, 1851, 1914, 1950`), `/api/extra-emails*` (`:2006, 2019, 2044`),
`/api/admin/daily-reminders/*`, `parent-dashboard*`, `email-diagnostics`, `generate-quiz` (`:1187`),
`/download-source-static` (`:3868`), `/api/static-audit` (`S/routes/static-audit.ts:12`). **Csak bejelentkezést vagy
semmit nem ellenőrző admin-végpontot a felmérés NEM talált.** Megfigyelések: (a) a nem admin Google-belépés ma is
lehetséges és `users` sort hoz létre `is_admin=false`-szal (a `/games`-ből induló tanuló — `S/auth.ts:134-136` LS-0a;
erre épül a kupon / gyakorlás: `S/rewards/practice-router.ts:9`, `review-router.ts:13`); (b) a Google-fiók e-mail-egyezés
esetén meglévő (jelszavas) fiókhoz kapcsolódik (`S/storage.ts:252-254`), a Google `email_verified` mezőjének ellenőrzése
UNVERIFIED; (c) a kliens `/admin/stats` oldalán nincs kliensoldali őr (`source/client/src/pages/AdminStats.tsx:35-50`),
a szerver ettől még 403-at ad; (d) átfogó jogosultsági mátrix-teszt nincs (csak pontszerű:
`T/static-audit-guard.test.ts`, `T/catalog-bank.test.ts:70`).

**Modell — szerkezeti elválasztás, „deny by default”:**

- **Külön tábla, külön munkamenet-kulcs.** A játékos-fiók a `player_accounts` táblában él (NEM a `users`-ben), saját
  azonosítóval; nincs `is_admin` mezője, így szerkezetileg sem kaphat admin-jogot. A munkamenetben külön kulcs:
  `req.session.player = { id }` — a Passport `req.user`-t (az admin / meglévő felhasználói utat) a játékos-belépés **soha
  nem állítja** (nem hív `req.login`-t). Az `isAuthenticatedAdmin` így játékos-munkamenettel 401-et ad. Új middleware:
  `requirePlayer` (csak `req.session.player`), új végpontok a `/api/player/*` alatt.
- **Belépési utak a játékosnak:** (1) e-mail + 6 jegyű kód + rövid életű link (jelszó nélkül; egyben e-mail-megerősítés);
  (2) **külön** Google-út a játékoldalakról: `/auth/player/google` (külön Passport-stratégianév, külön callback), amely
  `player_accounts` sort keres / hoz létre a Google által megerősített e-mailből, és csak `req.session.player`-t állít.
  Ha egy admin e-mail-címe lép be ezen az úton, játékos-munkamenetet kap — admin-jogot nem. Az admin a meglévő
  `/login` oldalról és a meglévő `/auth/google` úton marad admin.
- **A meglévő nem admin `users` út** (a)-pont: változatlan marad (kupon / gyakorlás függ tőle), admin-jogot nem ad; a
  játékoldalak „Belépés” gombja a JM7 után a játékos-utat használja. (Döntés: D12.)
- **Regisztráció:** e-mail-kód beváltása → `player_accounts` sor `email_verified_at`-tel; becenév (szabad, szűrővel:
  trágárság, e-mail- / telefonszám- / URL-szerű minta, foglalt név; ütközésnél `#1234` utótag) és avatar (előre gyártott
  készletből). Életkor, születési év, valódi név NEM kerül bekérésre és tárolásra. A Google-profil neve nem tárolódik.
- **Kapcsolat a tanulói profillal (opcionális):** `player_accounts.linked_learner_id` (nullable); a bejelentkezett
  játékos a már párosított eszközén (`websuli.learnerToken`, `L/learnerProfile.ts:8`) egy gombnyomással összekapcsolhatja
  (`POST /api/player/link-learner`, a token szerveroldali ellenőrzésével, `S/learners.ts:83`).
- **Tiltás:** `player_accounts.banned_at`; az admin a meglévő admin-felületen (Felhasználók fül mellett „Játékosok”)
  tilthat; a `requirePlayer` a tiltottat 403-mal utasítja el.
- **Vendég:** generált becenév (szópár két listából, `shared/nicknames.ts`), helyi pontok; szobához belépőjeggyel csatlakozik.
- **Fiókoldal (`/profile` utódja):** becenév, avatar, szint, összpont, tudás-pont, heti pont, rekordok, jelvények,
  párbaj-mérleg, barátok, ranglista-fülek; „Adataim letöltése (JSON)” és „Fiók törlése” (saját kezű, kaszkádos).
- Az e-mail-cím személyes adat: ezért adattakarékosság (e-mail + becenév + avatar + játékadat), törlési és letöltési
  lehetőség, és tilalom: e-mail soha nem látszik más felhasználónak, nem kerül URL-be és naplóba. További jogi feltétel a
  szeletek előtt nincs (D11).
- **Kötelező őrök a regisztráció megnyitása ELŐTT (JM7a, ugyanabban a szeletben):** (a) szerveroldali jogosultsági
  mátrix-teszt — az admin végpontok listáját a route-regisztrációból generálja (az Express router-verem bejárásával, az
  admin előtagok: `/api/admin`, `/api/studio`, és a fent felsorolt útvonalankénti admin-végpontok), × {vendég,
  e-mail-kódos játékos, Google-os játékos, tiltott játékos, admin} → csak az admin kap 2xx-et (vagy a végpont saját
  validációs 4xx-ét), a többi 401 / 403; (b) a kliens admin-útvonalai (`/admin`, `/admin/stats`, `/admin/help`)
  játékos-munkamenettel átirányítanak, és nem kérnek admin-adatot (az `AdminStats.tsx` őrhiánya pótolva); (c) e2e: frissen
  regisztrált játékos közvetlen URL-lel sem éri el az admin felületet; (d) regressziós őr: új route az admin előtagok alatt
  csak `isAuthenticatedAdmin`-nal regisztrálható (a router-verem statikus bejárása a tesztben bukik, ha nincs).

### 10.5 Párbaj-szabály (orkesztrátori 4. pont; tiszta TS a `source/shared/duel/` alatt)

- **Pontosság-elsődleges, életerő-sáv + sebzés:** minden játékos 100 életerővel indul; a helyes válasz az ellenfél(ek)
  életerejéből `10` alapsebzést vesz le, plusz **sávos** gyorsasági bónuszt legfeljebb **25%**-ig (a saját válaszablakhoz
  viszonyított arány: ≤ 25% → +2,5, ≤ 50% → +1,5, ≤ 75% → +0,5, egyébként 0); rossz válaszért **nincs levonás** és nincs
  sebzés. 2–4 főnél a sebzés a többi játékos között egyenlően oszlik (a kerekítés a sajátodat nem csökkenti).
- **Menet:** 7 kérdés (vagy amíg egy játékos kivételével mindenki életereje 0); győztes a legtöbb életerővel maradó;
  **döntetlennél legfeljebb 2 döntő kérdés**, utána **közös győzelem**.
- **Vegyes évfolyam:** mindenki a saját évfolyamának kérdését kapja, **azonos nehézségi sávból** (`pickGradeQuiz` a
  közös `band`-del, `GE/gradeQuiz.ts:75`); a válaszablak a saját évfolyamhoz igazított (J10 szabály).
- **Igazságos gyorsaság késés mellett — a szerver mérése az elsődleges (review #440):** `serverRtMs` = a válasz
  beérkezése − a `round:open` kiküldése (szerveróra). A kliens által mért `clientRtMs` csak LEFELÉ, korlátozott mértékben
  térhet el tőle: `slack = min(MAX_LATENCY_SLACK_MS (400), medián RTT a kapcsolat utolsó 5 ping-mintájából)`;
  `accepted = clamp(clientRtMs, max(0, serverRtMs − slack), serverRtMs)`; hiányzó, nem véges, 0 vagy negatív `clientRtMs`
  → `accepted = serverRtMs`. Emberi alsó határ: `accepted < HUMAN_MIN_MS (200)` → a válasz helyes marad, de gyorsasági
  bónusz nem jár, és a kör „gyanús” jelölést kap (statisztikához). 200 ms-on belüli különbség holtverseny; a sávos bónusz
  miatt néhány tíz ms nem dönt. A kliens állítása így sosem tehet gyorsabbá, mint a szerver mérése mínusz a mért késés.
- **A kliens többi állítása is hitelesítés nélküli (review #440):** az `optionIndex` egész és a saját kérdés opciószámán
  belül; a `round` csak az aktuális kör (különben `ROUND_CLOSED`); a `reactionId` csak a `REACTIONS` listából; a
  `room:create` beállításai zárt értékkészletből (körszám 3–10, mód enum); a párhuzamos módú `run:progress` pontja
  monoton és a `game-score-rules.ts` másodpercenkénti plafonja alatt (túllépés → a plafon, „gyanús”); a párbaj eredményét
  a pontkönyvbe a szerver írja a saját köreiből, nem a kliens jelentéséből.
- **Szerver a tekintély online:** a kérdést a szerver választja a seedelt RNG-vel, a `round_open` csak `{prompt,
  options}`-t küld, a helyes index csak a `round_reveal`-ban; játékosonként az első válasz számít.
- **Kommunikáció:** csak előre megírt reakciók (`shared/duel/reactions.ts`: „Szép volt!”, „Gratulálok!”, „Visszavágó?”,
  👏, 🎉, 😮), szabad szöveg nincs.
- **Győzteshirdetés:** dobogó (1v1: győztes + ezüst), játékosonként pontosság, helyes válaszok, leggyorsabb helyes válasz (az
  elfogadott, szerver által korlátozott időből; a `suspicious` kör nem számít bele),
  legjobb sorozat; a nem dobogós a saját statisztikáját látja, rangsor-szégyenítés nincs; „Visszavágó” gomb (új
  kérdések, a `seen` meccsek között megmarad).
- **Pont:** győztes és vesztes is gyűjt (helyes válaszonként azonos tudás-pont), a győztes kis plusz (+20%), negatív pont
  nincs.

### 10.6 Pontgyűjtés (orkesztrátori 3. pont)

- **Szerveroldali menet-napló (pontkönyv):** `game_runs` (1 sor = 1 befejezett menet, PK = `runId` → idempotens),
  `player_game_stats` (játékonkénti örök összesítő), `player_weekly` (heti, hétfő 00:00 Europe/Budapest), additív
  `0040` / `0041` migráció, visszaállás: flag `PLAYER_POINTS=off` → a régi `game_scores` út él tovább.
- **Futás-azonosító és hihetőség:** `POST /api/games/runs/start` → szerver által aláírt `runId` + szerveridő; `finish`
  csak saját, nyitott runra; a menet hossza a szerver két időbélyegéből; játékonkénti plafon és XP/perc ütemkorlát
  (`shared/game-score-rules.ts`); a helyes válaszok száma nem lehet több a kiadott kérdéseknél; gyanús menet `ranked=false`
  (a játékos előzményeiben látszik, ranglistára nem kerül, nem bélyegezzük meg).
- **Két szám:** játék-XP (szórakozás) és **tudás-pont** (helyes válaszok); a heti ranglista a tudás-pontot és a játék-XP
  kombinációját rangsorolja.
- **Ranglisták:** heti baráti / csoport ranglista, „körülötted” nézet; **nyilvános ranglista alapból KI** (a meglévő
  `GET /api/games/leaderboard` becenévre áll át, JM0).
- **Helyi haladás átvétele:** egyszer, fiókonként és eszközönként, plafonnal (5000 XP), `kind='import'`, ranglistán kívül.
- **Neon-takarékosság:** menetenként 1 tranzakció (1 insert + 2–3 upsert), szobánként csak a meccs végén írás;
  megőrzés: `game_runs` 180 nap, `player_weekly` 12 hét (takarító a meglévő napi cronban).

### 10.7 Módok játékonként (eredeti módok a műfaj általános mechanikáira; konkrét létező játék nem másolható)

| Játék | Online párbaj / csoportmód (2–4) | Megvalósítás |
|---|---|---|
| Párbaj aréna (játékfüggetlen) | 1v1 egy eszközön osztott képernyővel (JM1), majd online 2–4 (JM3) | a szabálymotor kérdés-körei |
| Gyors matek sprint | „Toronyverseny”: mindenki a saját évfolyamú feladatát lövi a saját tornyánál; a helyes válasz sebez | kvíz-kör híd (JM4a) |
| Szólétra | „Ikerlétra”: egymás melletti létrák, mindenki a saját nyelvi szintjének szavát kapja | kvíz-kör híd (JM4b) |
| Szökőár szökés | „Két part”: azonos seedű pálya és kapukérdés-sor, élő állás-sáv; a kapukérdés a közös körből jön | kvíz-kör híd + azonos seed (JM4c) |
| Kockavadász, Aszteroida, Brain Rot, Tornado | azonos seedű párhuzamos futás (mindenki a saját gépén), 1 Hz-es élő állás-sáv, a végpont dönt | azonos seed + `progress` üzenet (JM5a–d) |
| mind a hét | aszinkron kihívás-link („győzd le a futásomat”: seed + eredmény, aláírt token, név nélkül) | REST, állapotmentes (JM6) |
| Osztálytermi mód | csoport csatlakozó kóddal, kivetíthető állás (tábla-nézet), csapatkupa (a csapat pontossága átlagolva) | JM10 |

### 10.8 Szobák, meghívás, korlátok

- Szobakód: 6 karakter, összetéveszthetetlen ábécé (nincs 0/O/1/I), + megosztható link (`/jatek/szoba/<kód>`, a kód nem
  személyes adat) + QR (`qrcode`). Váróterem, készenléti jelzés, gazda indít (≥ 2 kész játékos), gazda-váltás kilépéskor
  (a legrégebben csatlakozott aktív játékos), újracsatlakozás 60 s türelmi idővel (teljes állapot-pillanatkép), az eltűnt
  játékos körei üresen járnak le; egyedül maradt játékos → „az ellenfél kilépett” zárás.
- Korlátok (alapértékek, env-vel állíthatók): 2–4 fő / szoba; `MP_MAX_ROOMS=50`; 20 üzenet/s/kapcsolat; üzenet ≤ 4 KB;
  szobanyitás 5/perc/IP; belépőjegy 10/perc/IP; egy játékos egyszerre egy szobában; LOBBY TTL 15 perc, FINISHED után 5 perc.
- **Gyártási futások elsőbbsége (orkesztrátori 10. pont):** ha aktív tananyag-gyártás / -javítás fut, az új szobák
  plafonja `MP_MAX_ROOMS_DURING_RUNS=10` (a futó meccsek nem szakadnak meg). Az aktív futások számát a szerver a
  meglévő leállítási logika forrásából olvassa (UNVERIFIED függvénynév — JM2 felderíti: `grep -n "active" S/index.ts` a
  `gracefulShutdown` környékén).
- **Telepítés-őr:** `GET /api/rt/status` → `{ enabled, activeRooms, activeMatches }`; a merge előtti „nincs deploy aktív
  futás közben” őr (memória) az `activeMatches > 0`-t is figyeli (JM11 frissíti a memória-bejegyzést és a runbookot).
- **Leállítás:** `drain(deadline)` a `gracefulShutdown` elején: új szoba / csatlakozás tiltva, a futó meccsek legfeljebb
  240 s-ig kifuthatnak, utána részeredmény „megszakítva” jelöléssel, majd a kapcsolatok zárása. Az e2e-módban a réteg
  fut (a két böngészőkontextusos teszthez), DB-írás csak az eldobható DB-be.
- **Kapacitás:** indulás a mostani `starter` csomagon; a JM11 terheléses füsttesztje (400 szimulált kapcsolat / 100 szoba
  helyben) méri a heapet és az eseményhurok-késést; döntés a csomagról mérés után.

### 10.9 Gyermekvédelem és adatvédelem (kötelező, minden JM-szeletre)

Nincs szabad szöveges csevegés (előre megírt reakciók); becenév szűrővel, valódi név soha más játékosnak; nincs
nyilvános idegen-párosítás (csak szobakód / link / barátkód / csoport); barátság kölcsönös elfogadással, tiltással;
személyes adat (e-mail, valódi név) nem kerül URL-be, naplóba, szobakódba, Socket.IO-üzenetbe; a szobák memóriában élnek
TTL-lel; a tanulási eredmény (látott szavak, hibázott tételek, ismétlési sor) többjátékosban is játékosonként rögzül
(helyben, a J0 szerint); a lecke-eredmény e-mail szabály (memória „Eredmény e-mailben”) a játékokra nem vonatkozik és nem
változik; adatletöltés és fióktörlés a fiókoldalról.

### 10.10 Szeletek és sorrend (részletek a végrehajtási fájl JM-fejezetében)

| Szelet | Tartalom | Függ | Flag |
|---|---|---|---|
| **JM0** | adatvédelmi javítás: ranglistán becenév / „Játékos #xxxx” a valódi név helyett; e-mail ki a naplókból; `POST /api/games/score` sebességkorlát + opcionális idempotens `runId` (memóriabeli TTL-dedup, séma nélkül) | — (azonnal) | nincs |
| **JM1** | `source/shared/duel/` szabálymotor + `shared/game-rng.ts` használata + egyeszközös „Párbaj aréna” (osztott képernyő) | J0a, J0b | nincs (kliensoldali, önálló) |
| **JM2** | Socket.IO réteg: `/api/rt/`, belépőjegy, szoba-állapotgép (shared), regisztráció, korlátok, drain, status, gyártási elsőbbség, szerveroldali kérdéssor | JM1 | `MP_MODE` (alap off) |
| **JM3** | online szoba UI: váróterem, kód / link / QR, készenlét, újracsatlakozás, győzteshirdetés (dobogó), visszavágó, reakciók; Párbaj aréna online; `MP_MODE=admin` → ellenőrzés → `on` | JM2 | `MP_MODE` |
| **JM4a/b/c** | kvízjátékok bekötése: Matek sprint, Szólétra, Szökőár | JM3 + J4 / J2 / J1 | játékonkénti engedélylista `MP_GAMES` |
| **JM5a–d** | azonos seedű párhuzamos futás + élő állás-sáv: Kockavadász, Aszteroida, Brain Rot, Tornado | JM3 + J3 / J6 / J5 / J7 | `MP_GAMES` |
| **JM6** | aszinkron kihívás-link (aláírt, állapotmentes) mind a hét játékra | J1–J7 | nincs |
| **JM7a/b** | JM7a: admin-jogosultsági mátrix-teszt + regressziós őr + kliens admin-őrök, `player_accounts` (0040), külön játékos-munkamenet, e-mailes kód + link belépés/regisztráció; JM7b: külön játékos Google-út, becenév + avatar, tanulói profil összekapcsolása, fiókoldal alap, adatletöltés / törlés, admin „Játékosok” tiltás | JM0 | `PLAYER_ACCOUNTS` (bevezetési flag; ellenőrzés után élesben `on`) |
| **JM8a/b** | pontkönyv: `game_runs` / `player_game_stats` / `player_weekly` (0041), `runs/start|finish`, hihetőség, tudás-pont; kliens `useRunReporter` a 7 játékban; helyi átvétel | JM7 | `PLAYER_POINTS` |
| **JM9** | barátok (barátkód / meghívólink / szobából, kölcsönös, tiltás), heti baráti / csoport ranglista, párbaj-mérleg a fiókoldalon; párbaj-eredmény mentése a pontkönyvbe | JM8 + JM3 | `PLAYER_ACCOUNTS` |
| **JM10** | osztálytermi mód: csoport csatlakozó kóddal (`play_groups`), kivetítős tábla-nézet, csapatkupa | JM9 | `MP_MODE` |
| **JM11** | terheléses füstteszt, megfigyelhetőség, deploy-őr bővítése (`activeMatches`), átfogó review, retro | JM1–JM10 | — |
| **JB** | évfolyam-bank bővítése: évfolyamonként 90 → ≥ 270 tétel (tárgy × sáv cellánként ≥ 18), gyártó → vak megoldó → audit folyamattal | J0 (független) | nincs |

## 11. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->

Közös (J-pontok, mind a hét játékra, ahol a 6.2 játékonkénti küszöböt ad, ott azzal):
- [ ] J1 WHEN egy kérdés látható THEN the system SHALL a játék szimulációját legalább 0,35-szörös sebességgel futtatni (a
  szünet, a „Miért?”, a kuponlejárat és a háttérbe kerülés kivételével). Mérés: Playwright `probe().simTime`.
- [ ] J2 WHEN a szimulált átlagos játékos 180 mp-et játszik (20 seed, medián) THEN the system SHALL legalább a 6.2
  játékonkénti kérdés/perc küszöböt teljesíteni, és a hét játék átlaga ≥ 6,8 legyen.
- [ ] J3 WHEN a játék fut (a menet első 10 mp-e után) THEN the system SHALL nem hagyni a 6.2 szerinti játékonkénti
  maximumnál hosszabb kérdés nélküli összefüggő szakaszt, és két kérdés-indítás között ≥ 1,5 mp-et (boss-sorban ≥ 0,8)
  tartani.
- [ ] J4 WHEN a játékos hibásan válaszol THEN the system SHALL a helyes megoldást a játéktérben ≥ 1,8 mp-ig megmutatni,
  a tételt az ismétlési sorba tenni, és a 6.2 ismétlési sorában szereplő arányokkal (75%-os játékosnál ≥ 95%-ban a 3.–6.
  következő kérdésként; az ismétlések aránya ≤ 30%; menetenként ≤ 2 visszatérés; különben a következő menet első 10
  kérdésében) újra feltenni; helyes ismétlés után a térköz nő.
- [ ] J5 WHEN a játékos hibásan válaszol THEN the system SHALL legfeljebb 2,5 mp múlva teljes sebességgel, blokkoló kártya
  nélkül folytatni; WHEN a „Miért?”-re koppint THEN the system SHALL szünetet tartani és a magyarázókártyát mutatni.
- [ ] J6 WHEN az ismétlésnek nem minősülő (új) kérdések sorozatából bármely 40-es ablakot vizsgáljuk THEN the system SHALL
  duplikátum nélkül (40/40 különböző) kérdezni, ha az új tétel-forrás ≥ 200 tételt ad (kevesebbnél ≥ 90% különböző).
- [ ] J7 WHEN elérhető nem látott tananyag-tétel van THEN the system SHALL a menet első kérdését abból adni, és a
  tananyag elfogyása után szóbankból / évfolyam-bankból folytatni (szimulációs teszt).
- [ ] J8 WHEN a szimulált játékos 95%-os THEN the system SHALL a kérdés-sávot 30 kérdésen belül ≥ 0,75-re és a
  játék-intenzitást növelni; WHEN 45%-os THEN a sávot ≤ 0,35-re és az intenzitást csökkenteni; 60 kérdés után a
  sikerarány 65–90%.
- [ ] J9 WHEN egy menet indul THEN the system SHALL azt (szimulált átlagos játékosnál) 2–5 perces mediánnal lezárni,
  az eredményképernyőn megállni, és új menetet csak a játékos koppintására indítani.
- [ ] J10 WHEN a válaszablak kezdődik THEN the system SHALL rövid tételnél 2,5–6 mp-et (3–4. évfolyamon ×1,25, azaz 3,1–7,5
  mp-et), hosszú tételnél olvasási pótlékkal, de minden esetben legfeljebb 9 mp-et adni.
- [ ] J11 WHEN a játék low-tier grafikán és 4× CPU-lassítással fut THEN the system SHALL a játékmenetben medián ≥ 30 fps-t
  elérni; WHEN csökkentett mozgás van beállítva THEN rázás és villogás nélkül futni.
- [ ] J12 WHEN a kód változik THEN the system SHALL a `POST /api/games/score` zod-sémáját és a `gameId`-kat változatlanul
  hagyni a J-szeletekben (őr-teszt; a JM0 csak opcionális `runId` mezőt ad), és a `runStreak`-et minden játékban a menet legjobb sorozataként küldeni.
- [ ] J13 WHEN a felhasználói szövegeket és a jutalom-kódot az etikai őr vizsgálja THEN the system SHALL 0 tiltott mintát
  és csak seedelt RNG-t találni (4.2).
- [ ] J14 WHEN nyelvi tárgyú kérdés jön, a felolvasás be van kapcsolva és a `readAloudEnabled` kapu
  (`L/tts.ts:19-21`: támogatott, nincs csökkentett mozgás) enged THEN the system SHALL a célnyelvi szót a megfelelő nyelvi
  kóddal felolvasni (Szólétra, Szökőár) — csak a játékos már megtörtént koppintása (indítás) után, némítható beállítással.
- [ ] J15 WHEN a meglévő M1–M11 mérő és a játékonkénti M12 próbák futnak THEN the system SHALL zöld maradni (a 9. szakasz
  szerinti esetfájl-frissítéssel), és `npm run verify` zöld a `main`-en az utolsó szelet után.
- [ ] J16 WHEN egy menet véget ér THEN the system SHALL az eredményképernyőn megmutatni a hibázott tételeket a helyes
  válasszal („Gyakorold még”), a csillagokat, a rekordot és a következő célt.

Játékonként (mindegyiknél: legalább egy legyőzhető főellenfél, legalább 2 nem blokkoló kérdés-mechanika, kérdés nélkül is
játszható alaphurok — utóbbit a szimuláció „kérdés nélküli” módja igazolja: a menet végigjátszható, és van vesztési feltétel):
- [ ] J-TS WHEN a Szökőár fut THEN the system SHALL háromsávos futást, Kapukérdést, Mentőövet és Nagy Hullám főellenfelet
  adni, és a győzelmet a távolság / menedék (nem a jó válaszok száma) adja.
- [ ] J-WL WHEN a Szólétra fut THEN the system SHALL riválist, hulló köveket, szó-kapaszkodót, hallás utáni kérdést és
  Szélsas főellenfelet adni; a kötelező 900 + 620 ms animáció megszűnik; vereség lehetséges.
- [ ] J-BC WHEN a Kockavadász fut THEN the system SHALL a sima blokkot kérdés nélkül bányászni engedni, Rúna-zárat,
  Kraft-kérdést, sebző éjszakai mobokat és Kő-gólem főellenfelet adni; a jó válasz nem csökkenti az időt.
- [ ] J-SQ WHEN a Gyors matek sprint fut THEN the system SHALL drón-célpontos feladatot, Számláncot, Becslő-bombát,
  Hibagyár minibosst és Zéró-robot főellenfelet adni; a megoldás mutatása utáni retry nem számít a célba.
- [ ] J-BR WHEN a Brain Rot fut THEN the system SHALL mozgásos gyűjtést, rivális tolvajt, Ketrec-zárat, Visszalopás-párbajt
  és Tolvajkirály-fordulót adni; az óra a kérdés alatt is jár; felfedett válasz visszakoppintása nem számít elkapásnak.
- [ ] J-SA WHEN az Aszteroida fut THEN the system SHALL hullám-kapu és ütközés-kvíz nélkül, Kristály-válasszal, Gyenge
  pont-mechanikával és Mentő-pajzzsal futni; a `recordRun` valós kérdés-statisztikát kap.
- [ ] J-TH WHEN a Tornado fut THEN the system SHALL útelágazás-, műszer-kalibrálás- és turbó-kérdést adni a vezetés
  megállítása nélkül; horgony csak a sávban; minden fejlesztés hat; a pont-bontás látszik; a `MATH_4` tárgysorolása helyes.

Meta és lista (J8 szelet):
- [ ] J17 WHEN a játékos XP-t gyűjt THEN the system SHALL a meglévő összes XP-ből számolt játékos-szintet mutatni a
  játéklistán és az eredményképernyőn, migráció nélkül.
- [ ] J18 WHEN a játékos teljesítményt ér el THEN the system SHALL determinisztikus feloldást (kozmetika, gyűjtemény-elem,
  új ellenfél / világ) adni, véletlen jutalom nélkül, és a játéklista kártyáin a legjobb pontot, a csillagokat és a
  szintet mutatni.

Determinizmus és minőség (J0a + minden játékszelet):
- [ ] J19 WHEN a szimulációs mag (`L/<játék>/` sim-fájljai, `source/shared/game-rng.ts`, `source/shared/duel/`) fut THEN the
  system SHALL `Math.random`, `Date.now`, `performance.now`, DOM-, three- és React-hivatkozás nélkül futni (grep-őr), és azonos
  seed + bemenetsor ugyanazt a végállapotot adni (arany visszajátszás játékonként).
- [ ] J20 WHEN egy játékszelet elkészül THEN the system SHALL a végrehajtási fájl K.4 30 pontos minőségi kapuját és K.5 20
  kódszabályát a PR-ban bizonyítékkal kitöltve tartalmazni.

Többjátékos, párbaj, fiók, pontok (JM, JB szeletek):
- [ ] JM-A1 WHEN a ranglista válaszol THEN the system SHALL valódi nevet nem tartalmazni (becenév vagy „Játékos #xxxx”), és a
  szerver naplója e-mail-címet nem tartalmazni (a `S/auth.ts:72, 86, 96, 105` és `S/routes.ts:1510` sorok javítva; őr-teszt).
- [ ] JM-A2 WHEN a `POST /api/games/score` 15 percen belül a korlátnál többször érkezik egy IP-ről THEN the system SHALL 429-et
  adni; WHEN ugyanazzal a `runId`-vel kétszer érkezik THEN the system SHALL egyszer írni (a második 200, írás nélkül).
- [ ] JM-A3 WHEN két játékos egy eszközön Párbaj arénát játszik THEN the system SHALL a 10.5 szabályai szerint (pontosság-
  elsődleges, sávos ≤ 25% gyorsaság, nincs levonás, ≤ 2 döntő kérdés, majd közös győzelem; vegyes évfolyamnál saját
  évfolyam azonos sávból) dönteni — a `source/shared/duel/` egységtesztjei és egy Playwright-próba igazolja.
- [ ] JM-A4 WHEN `MP_MODE=off` THEN the system SHALL a többjátékos gombokat nem mutatni és a `/api/rt/` kapcsolatot
  `FEATURE_DISABLED`-del elutasítani; WHEN `admin` THEN csak admin hozhat létre szobát; WHEN `on` THEN bárki (vendég is).
- [ ] JM-A5 WHEN két böngészőkontextus ugyanabba a szobába lép (kód / link / QR) THEN the system SHALL váróteremmel,
  készenléttel, közös körökkel és győzteshirdetéssel (dobogó, pontosság, leggyorsabb helyes válasz, legjobb sorozat,
  visszavágó) lezárni a meccset; WHEN az egyik kapcsolat megszakad és 60 s-on belül visszatér THEN the system SHALL teljes
  állapot-pillanatképpel folytatni (Playwright `context.setOffline`).
- [ ] JM-A6 WHEN a szerver a kört megnyitja THEN the system SHALL a helyes indexet csak a `round_reveal`-ban küldeni, és
  játékosonként csak az első választ elfogadni; WHEN üzenet-korlát / méretkorlát sérül THEN `RATE_LIMITED` / bontás.
- [ ] JM-A7 WHEN aktív tananyag-gyártás fut THEN the system SHALL legfeljebb `MP_MAX_ROOMS_DURING_RUNS` új szobát engedni, és
  a `GET /api/rt/status` `activeMatches` értékét a telepítés előtti őr figyelni.
- [ ] JM-A8 WHEN SIGTERM érkezik THEN the system SHALL új szobát / csatlakozást tiltani, a futó meccseket legfeljebb 240 s-ig
  kifuttatni, utána részeredménnyel zárni.
- [ ] JM-A9 WHEN a Matek sprint, a Szólétra, a Szökőár online szobában fut THEN the system SHALL a szerver kérdés-köreit a
  játék saját mechanikáján át megjeleníteni; WHEN a Kockavadász, az Aszteroida, a Brain Rot, a Tornado fut THEN azonos
  seedű pályát és 1 Hz-es élő állás-sávot adni.
- [ ] JM-A10 WHEN egy játékos kihívás-linket oszt meg THEN the system SHALL aláírt, név nélküli tokennel ugyanazt a seedet
  adni a megnyitónak, és a végén összevetni a két eredményt.
- [ ] JM-A11 WHEN egy diák e-mail-címmel regisztrál THEN the system SHALL 6 jegyű kóddal / rövid életű linkkel megerősíteni,
  becenevet (szűrővel) és avatart kérni, életkort / valódi nevet nem kérni; a kódkérésre és a beváltásra sebességkorlát és
  kódonként 5 próbálkozás vonatkozik; az e-mail sehol nem látszik más felhasználónak.
- [ ] JM-A12 (tulajdonosi biztonsági követelmény) WHEN bármely admin végpontot (a route-regisztrációból generált lista)
  vendég, e-mail-kódos játékos, Google-os játékos vagy tiltott fiók hív THEN the system SHALL 401 / 403-at adni, és csak
  az admin kap 2xx-et; WHEN játékos-munkamenettel a kliens `/admin*` útvonalát nyitják THEN átirányítani admin-adat kérése
  nélkül; WHEN új route kerül az admin előtagok alá `isAuthenticatedAdmin` nélkül THEN a regressziós őr bukjon; játékos-
  belépés (e-mail vagy Google) soha nem állít `req.user`-t és nem ad admin-jogot.
- [ ] JM-A13 WHEN a játékos menetet fejez be (regisztráltként) THEN the system SHALL a pontkönyvbe idempotensen, hihetőség-
  ellenőrzéssel írni, a játék-XP-t és a tudás-pontot külön számolni, a gyanús menetet `ranked=false`-szal tárolni.
- [ ] JM-A14 WHEN két regisztrált játékos barátkóddal / meghívólinkkel / közös szobából barát lesz (kölcsönös elfogadás)
  THEN the system SHALL heti baráti ranglistát és párbaj-mérleget mutatni; a nyilvános ranglista alapból ki; tiltás után a
  kód nem működik.
- [ ] JM-A15 WHEN a játékos a fiókoldalon „Adataim letöltése” / „Fiók törlése” gombot nyom THEN the system SHALL JSON-t adni /
  a fiókot és a pontkönyvét kaszkádosan törölni.
- [ ] JM-A16 WHEN osztálytermi csoport indul THEN the system SHALL csatlakozó kóddal, kivetíthető tábla-nézettel és csapatkupával
  (pontosság-átlag) működni, tanár-szerepkör nélkül.
- [ ] JM-A17 WHEN a terheléses füstteszt 400 kapcsolatot / 100 szobát futtat helyben THEN the system SHALL a heapet és az
  eseményhurok-késést mérni és dokumentálni (`docs/measurements/`), a küszöbök túllépésekor a plafont csökkenteni.
- [ ] JB-A1 WHEN az évfolyam-bank bővítése elkészül THEN the system SHALL évfolyamonként ≥ 270 tételt, tárgy × sáv
  cellánként ≥ 18-at tartalmazni, vak megoldós jegyzőkönyvvel és audittal (C-31 tanulságai szerint).

Folyamat:
- [ ] P1 Minden szelet a végrehajtási fájl K-része szerint: zöld kapuk, valós mobil képernyőképek, három-fázis OK.
- [ ] P2 Az utolsó játékszelet előtt és a JM11-ben átfogó review PR-kommentként (AGENTS.md „Review guidelines”); a JM11
  reviewjának kötelező szempontja az admin-elválasztás (JM-A12).
- [ ] P3 Retro, kanban, csapda-katalógus, memória és munkafa-higiénia a futás végén.
- [ ] P4 Minden összevont PR után az éles oldal működik, a főágon félkész funkció nem látszik (flag: `MP_MODE`,
  `MP_GAMES`, `PLAYER_ACCOUNTS`, `PLAYER_POINTS`).

## 12. Követhetőség (cél-mondat → elfogadási pont → szelet)

| Cél | Elfogadási pont(ok) | Szelet(ek) |
|---|---|---|
| G1 effektív telefonos játék | J11, J15, J19, J20, J-* (alaphurok), J9 | J0a–J0c, J1–J7, J9 |
| G2 a játék kösse le a figyelmet | J3, J9, J-* (ellenfelek, szakaszok), J16 | J1–J7 |
| G3 kérdés a játékban, nem cél | J1, J5, J10, J-* (Q-mechanikák) | J0b, J0c, J1–J7 |
| G4 pontgyűjtés, élvezet | J12, J16, J17, J-* (kombó, pont-bontás), JM-A13 | J0a (`combo`), J1–J7, J8, JM8 |
| G5 legyőzhető ellenfelek | J-* (főellenfél, rivális), JM-A3, JM-A5 | J1–J7, JM1, JM3 |
| G6 bevonódás → tanítás (etikusan) | J2, J4, J6, J7, J8, J13, J14, J18, JB-A1 | J0b, J1–J7, J8, JB |
| G7 teljes végigvitel | P1–P4, J15 | minden szelet, J9, JM11 |
| G8 barátokkal ugyanazt a játékot, a szerveren összekapcsolva | JM-A4, JM-A5, JM-A6, JM-A9, JM-A10, JM-A16 | JM2, JM3, JM4a–c, JM5a–d, JM6, JM10 |
| G9 e-mailes regisztráltak együtt; kis fiók, pontok tárolása | JM-A11, JM-A13, JM-A14, JM-A15 | JM7a, JM7b, JM8a, JM8b, JM9 |
| G10 párbaj (helyes / gyorsabb nyer), győzteshirdetés | JM-A3, JM-A5, JM-A6 | JM1, JM2, JM3, JM4 |
| G11 (tulajdonosi biztonsági követelmény) admin felület csak adminoknak; játékos-Google csak játékoldalra | JM-A12 | JM7a (a regisztráció megnyitása előtt), JM11 review |
| (adatvédelem, a fiókhoz kötött) | JM-A1, JM-A2, JM-A7, JM-A8, JM-A17 | JM0, JM2, JM11 |

## 13. Döntési pontok (javasolt alapértelmezéssel végigvive)

| # | Kérdés | Opciók | Javaslat (alapértelmezés) és indok |
|---|---|---|---|
| D1 | A Gyors matek sprint műfajváltása | (a) **„Neon védőtorony”: a válasz a lelőendő drón** · (b) megtartott kvíz + díszítés · (c) teljesen új játék új azonosítóval | **(a)** — a G3 / G5 csak így teljesül; az azonosító, a feladatgenerátor és a pályák maradnak, így a ranglista és a mentések érvényesek. |
| D2 | Hibás válasznál blokkoló kártya | (a) **nem blokkoló: a megoldás a játéktérben + ismétlés + „Miért?” + eredmény-lista** · (b) blokkoló marad · (c) blokkoló csak 3–4. évfolyamon | **(a)** — a G3 követelménye; a tanulási garancia az ismétléssel erősödik (9. szakasz). |
| D3 | Hangeffektek forrása | (a) **szintetizált WebAudio bővítése** · (b) hangfájlok · (c) mindkettő | **(a)** — nincs licenc- és csomagméret-kockázat; ha később hangfájl kell: csak CC0, licencnaplóval, CC BY-NC tilos (orkesztrátori 8. pont). |
| D4 | Felolvasás (TTS) alapértéke a nyelvi játékokban | (a) **be, ha a `readAloudEnabled` kapu enged (támogatott, nincs csökkentett mozgás); egy koppintással némítható** · (b) alapból ki | **(a)** — a kiejtés-gyakorlás tanulási érték (memória „Diktálás / TTS”). Az `L/tts.ts:1-10` LS-4 szabálya (csak felhasználói gesztusból; csökkentett mozgásnál nincs beszéd) a játékban is érvényes: automatikus felolvasás csak az indító koppintás után, és a 🔊 gomb mindig kéznél. A Web Speech hang minősége eszközfüggő (UNKNOWN). |
| D5 | Szerveroldali pontszám-szerződés | (a) **változatlan a J-szeletekben; JM0: opcionális `runId`; JM8: új pontkönyv additív migrációval** · (b) azonnali séma-csere | **(a)** — visszafelé kompatibilis, a régi út flaggel tartható (`PLAYER_POINTS`). |
| D6 | Ismétlési sor helye | (a) **helyben (localStorage)** · (b) szerveren | **(a)** — vendégnél is működik, Neon-keretet nem terhel; fiókos szinkron későbbi bővítés. |
| D7 | 3 opciós megjelenítés (sávfutó, útelágazás) | (a) **3 opció a 4-ből (helyes + 2 seedelt elterelő)** · (b) 4 sáv / 4 út | **(a)** — álló mobilon 3 sáv kényelmes; a tippelés ára játékbeli + ismétlés. |
| D8 | A Szólétrában vereség bevezetése | (a) **igen: a rivális előbb ér fel → „Majdnem!”** · (b) nincs vereség | **(a)** — tét nélkül nincs bevonódás (G5). |
| D9 | (lezárva, D11 váltja ki) szülői regisztráció / jogi kapu | — | Nem releváns: a tulajdonos 2026-11-16-án a diákok saját regisztrációjáról döntött (D11). |
| D10 | Osztálytermi mód | (a) **bármely regisztrált játékos indíthat csoportot / kivetítős szobát, tanár-szerepkör nélkül** · (b) tanár-szerepkör (séma) | **(a)** — nincs fölösleges szerepkör-rendszer (D11 szellemében). |
| **D11** | **LEZÁRT TULAJDONOSI DÖNTÉS (2026-11-16): diákok saját regisztrációja** | — | A diák a saját e-mail-címével, jelszó nélkül (6 jegyű kód + rövid életű link = e-mail-megerősítés), becenévvel és avatarral regisztrál; nincs szülői fiók, szülői jóváhagyás, életkor-kapu, jogászi kapu. Indok (tulajdonos): szűk kör (saját gyerekei, barátaik, testvéreik), nincs reklám, csak becenév és e-mail kerül rögzítésre. Az e-mail-cím személyes adat, ezért az adattakarékosság és a törlési / letöltési lehetőség a tervben marad; további jogi feltétel nincs a szeletek előtt. A `PLAYER_ACCOUNTS` csak bevezetési flag: a szelet ellenőrzése után élesben bekapcsoljuk. |
| **D12** | **TULAJDONOSI BIZTONSÁGI KÖVETELMÉNY (2026-11-16): admin-elválasztás** | (a) **külön `player_accounts` tábla + külön munkamenet-kulcs + külön játékos Google-út (deny by default)** · (b) közös `users` tábla szerepmezővel | **(a)** — a játékos-belépés szerkezetileg sem állíthat `req.user`-t és nem kaphat `is_admin`-t; a meglévő nem admin `users`-út (kupon / gyakorlás) változatlan, admin-jogot nem ad. A mátrix-teszt és a regressziós őr a JM7a-ban, a regisztráció megnyitása előtt. |
| D13 | Valós idejű csatorna | (a) **Socket.IO a `/api/rt/` úton (polling a Vercel-rewrite-on át, WebSocket-frissítés ha lehet; opcionális közvetlen aldomain)** · (b) `ws` + kötelező aldomain · (c) SSE + POST · (d) külső szolgáltató | **(a)** — tulajdonosi DNS-lépés nélkül működik élesben (10.3); egy példányon nem kell ragadós munkamenet; iskolai hálón robusztus. Két új MIT-függőség (indokolt kivétel). |
| D14 | Párbaj-szabály | (a) **pontosság-elsődleges, életerő + sebzés, sávos ≤ 25% gyorsaság, nincs levonás, ≤ 2 döntő, közös győzelem; vegyes évfolyam: saját évfolyam azonos sávból** · (b) Kahoot-szerű ≤ 50% gyorsaság · (c) csak pontosság | **(a)** — orkesztrátori 4. pont; a kutatás (2.) szerint ez kíméli a tanulást és a gyengébbet. |
| D15 | Sorrend | (a) **JM0 → JM1 (aréna) → JM2–JM3 (online szoba) → JM4 kvízjátékok → JM5 3D → JM6 aszinkron → JM7–JM9 fiók / pont / barátok → JM10 osztály → JM11** · (b) aszinkron előbb | **(a)** — orkesztrátori 5. pont: az online közös játék nem maradhat későbbi bővítés. |
| D16 | Kapacitás | (a) **a mostani `starter` csomagon, `MP_MAX_ROOMS=50`, gyártás alatt 10; mérés a JM11-ben** · (b) azonnali csomagváltás | **(a)** — orkesztrátori 10. pont. |
| D17 | Könyvtárak | (a) **nincs új nehéz függőség (kivétel: Socket.IO); bitECS (MPL) nem; fizikai motor nem; hang csak CC0 licencnaplóval** | orkesztrátori 8. pont. |
| D18 | Évfolyam-bank bővítése | (a) **JB szelet: ≥ 270 tétel / évfolyam, gyártó → vak megoldó → audit** · (b) csak szóbank és tananyag | **(a)** — a visszavágókhoz ~6 tétel / cella kevés (10.2). |
| D19 | Nyilvános ranglista | (a) **alapból KI; heti baráti / csoport; „körülötted” nézet** · (b) nyilvános top 50 | **(a)** — orkesztrátori 3. pont; az alsó helyezettek motivációját védi. |

## 14. Kockázatok / visszavonási terv

- **Nagy egyfájlos játéklapok (1400–3300 sor):** a mag kiemelése (4.1/9.) regressziós kockázat. Kezelés: játékonként 2–3
  al-szelet, a meglévő e2e és M-mérő kötelezően zöld, szeletenként szimulációs teszt.
- **Szimuláció ≠ valódi gyerek:** Kezelés: J9-ben valódi böngészős bot-futás és éles próba; maradó kockázat: valódi
  gyerekes játszhatósági teszt nincs.
- **Teljesítmény gyenge telefonon:** Kezelés: `LOOK_BUDGET`, pool, J11 mérés CPU-lassítással; valódi eszközös mérés nincs.
- **Tanulási hatás csökkenése:** Kezelés: J2, J3, J6 küszöbök a szimulációban kapuzva, J16 eredmény-lista.
- **Etikai csúszás:** Kezelés: 4.2 tiltólista + őr-teszt + review-szempont.
- **Polling-késés a Vercel-láncon (Vercel → Cloudflare → Render):** a gyorsasági bónusz sávos, a holtverseny 200 ms →
  néhány tíz–száz ms nem dönt; ha mérve túl lassú, az opcionális közvetlen aldomain (tulajdonosi DNS-lépés) javít.
- **Közös 512 MB-os példány a gyártási futásokkal:** szoba-plafon, gyártás alatti szűkítés, mérés (JM11), szükség esetén
  csomagváltás (D16).
- **Deploy megszakítja a meccset:** drain + részeredmény + telepítés-őr az `activeMatches`-re.
- **A helyes válasz a kliens-bundle-ben:** baráti párbajban elfogadott; a szerver maga állapítja meg a helyességet.
- **Admin-jog szivárgása a fiókokkal:** szerkezeti elválasztás (D12), mátrix-teszt + regressziós őr a JM7a-ban, review-szempont.
- **Visszavonás:** szeletenként `git revert`; a többjátékos és fiók-rész flag mögött (`MP_MODE`, `MP_GAMES`,
  `PLAYER_ACCOUNTS`, `PLAYER_POINTS` → `off` azonnali vészfék); a migrációk (`0040`, `0041`) additívak, a régi
  `game_scores` út él tovább — rollbackhez elég a flag, az új táblák üresen maradhatnak.
- **Éles futások:** merge előtt az aktív gyártási futások és a futó meccsek őre (memória „Nincs deploy futás közben”).

## 15. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`
