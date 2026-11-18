# Szólétra — olvasható, nyugodt tempó és kiemelt célszó (terv)

**Dátum:** 2026-11-17 · **Kanban:** #89 · **Ág:** `fix/szoletra-olvashatosag` · **Végrehajtás:**
[`2026-11-17-szoletra-olvashatosag-vegrehajtas.md`](2026-11-17-szoletra-olvashatosag-vegrehajtas.md)
**Előzmény:** [`2026-11-16-jatekok-jatekelmeny.md`](2026-11-16-jatekok-jatekelmeny.md) 5.2 (Szikla-verseny), 4.1/4, 4.2;
végrehajtás J2a, K.2–K.5 (KSZ-11, KSZ-16), J0c-b.

## 0. A tulajdonos visszajelzése (élesből, 2026-11-17, szó szerint)

> „A Szólétra túl gyors, el sem tudom olvasni, illetve a kérdezett szót emeld ki jobban, mert nagyon nehéz megtalálni a
> feladványban. Adj több időt a versenyzőknek, játékosoknak a Szólétrában.”

Ezt egy FELNŐTT írta: ha neki gyors és olvashatatlan, egy 3–4. osztályosnak sokkal inkább. A cél nem apró hangolás,
hanem érezhetően nyugodtabb, olvasható játék.

## 1. Cél

1. **Több idő (A):** a válaszablak olvasásalapú és bőkezű — tájékozódás + a TELJES olvasnivaló (prompt + mind a négy
   kapaszkodó) az évfolyam lassú olvasási sebességével + döntési idő; legalább a mostani kétszerese; az óra csak a kérdés
   és a fogások teljes megjelenése után indul (≥ 400 ms előjelzés, KSZ-11).
2. **Nyugodtabb tempó (B):** a rivális lassabb, a kérdés alatt alig halad (a közös `slowMo` 0,35), a szintenkénti
   gyorsulás szelídebb; az időcsík az utolsó másodpercekig nyugodt (nincs „kevés idő” csíkozás); hibás válasz után a
   megoldás tovább (3 mp) látszik.
3. **Tempó-beállítás (C):** „Tempó: Nyugodt / Normál / Gyors” a kezdőképernyőn és a szünet menüben; alapérték NYUGODT;
   a választás megmarad (`websuli.wordladder.tempo`, a nyelvválasztó mintájára); a „Gyors” a mostani tempó.
4. **Kiemelt célszó (D):** a kérdezett szó / kifejezés / hiányos mondat külön „kártyán”, a keretszövegnél legalább
   1,6-szor nagyobb, vastag, sötét betűvel világos alapon (WCAG AA nagy szövegre); a keretszöveg kisebb és halványabb; a
   hiány helye vastag, színes kerettel jelölt; szó közepén nem törik, 360 px-en is kifér. A kiemelés a kérdés ADATÁBÓL jön.
5. **Mérés és bizonyítás:** mért ELŐTTE / UTÁNA számok és képek; szimuláció emberi olvasási idővel; e2e valódi érintéssel.
6. **Az ingadozó `tests/word-ladder-play.spec.ts`** determinisztikussá tétele (a mérce lazítása nélkül).

## 2. Nem cél

- A közös `questionDirector.ts` (`windowMsFor`, `WINDOW_MAX_MS`), a `reading.ts`, a `questionUi.ts` szerződésének
  módosítása (más játékok is használják; a #483 épp módosítja) — a Szólétra a saját paramétereivel és a presentation
  burkolásával oldja meg.
- A többi játék lapja, magja, kérdés-sávja (Szökőár, Kockavadász, Brain Rot, Aszteroida, Tornado, Matek).
- J2b (hulló kövek, Szélsas, hallás utáni kérdés, kötél-turbó).
- A szerver-bank (`/api/games/quiz-bank`) és a tananyag-kvízek célszó-adata (nincs ilyen mezőjük; kiemelés nélkül, a
  mostani megjelenéssel jönnek — 5. szakasz, maradó kockázat).
- A `scripts/qa/gates/*`, `AGENTS.md`, `docs/agent-csapdak.md` módosítása (csapda-javaslat a zárójelentésbe, C-48).

## 3. Mért kiinduló állapot (2026-11-17, kódból és mérésből)

Mérőszkript: a scratchpad `measure.mts` (a valódi angol kézi bank + a központi szóbank generált kérdései a játék
évfolyamának szintjén, a lap képletével: `min(9000, max(windowMsFor(prompt, évf, 4500), readingMsFor(prompt, opciók, évf)))`).
„Teljes olvasás” = prompt + mind a négy opció teljes súllyal a közös `readingWpm` szerint (90 / 120 / 150 / 180 szó/perc).

| Évf. | Kérdésfajta (példa) | Ablak medián | Teljes olvasás medián | Döntésre marad |
|---|---|---|---|---|
| 3. | szó → angol („„alma” angolul:”) | 5,6 s | 4,7 s | 1,0 s |
| 3. | angol → magyar („Mit jelent: „raise your hand”?”) | 5,6 s | 5,3 s | 0,3 s |
| 3. | hiányos mondat („Our _____ is on the first floor.”) | 6,2 s | 6,0 s | 0,2 s |
| 3. | hétköznapi helyzet (kézi) | 9,0 s | 10,7 s | **−2,2 s** |
| 5. | szó → angol | 4,5 s | 3,0 s | 1,5 s |
| 5. | hiányos mondat | 5,5 s | 5,0 s | 0,5 s |
| 8. | mondat jelentése („Mit jelent ez a mondat? „…””) | 9,0 s | 12,4 s | **−3,4 s** |
| 8. | angol → magyar | 4,5 s | 3,2 s | 1,3 s |
| 11. | mondat jelentése | 9,0 s | 12,7 s | **−3,7 s** |
| 11. | szó → angol | 4,5 s | 2,3 s | 2,2 s |

- **Mikor indul az óra:** a director `startedAtSimMs`-e a kérés pillanata; a kérdés-kártya 180 ms-os beúszása és a
  fogások megjelenése (a következő React-render) alatt az óra már jár; a fogások azonnal élesek (nincs előjelzés).
- **Lejáratkor:** „timeout” — a kombó nullázódik, fok nem vész (`core.answer`), 2 mp megoldás-kijelzés „Lejárt az idő.
  A jó válasz: …” felirattal; a tétel a menet közbeni ismétlési sorba kerül, és a „Gyakorold még” listába.
- **A rivális:** 6,3 s / fok az 1. pályán, pályánként −0,1 s (10. pálya: 5,4 s); az első 30 s-ban 0,55× → 1×; a kérdés
  alatt TELJES sebességgel mászik (`slowMo: 1`); tempó-ingadozás 0,85–1,15, áramlat 0,9–1,1, gumiszalag ±10%.
  Lépéstartáshoz a gyereknek 6,3 s-onként nettó +1 fok kell; 75%-os pontossággal (nettó ~0,73 fok / kérdés) ez kérdésenként
  ~4,6 s, a 0,9 s-os kijelzés után **~3,7 s alatti válasz**.
- **Kérdések közt:** jó válasz után 0,9 s, hibás / lejárt után 2 s kijelzés; a következő kérdés azonnal.
- **Sürgető jelek:** az időcsík 35% alatt borostyán csíkozásra vált; „N mp” számláló; előzéskor felirat + figyelmeztető
  hang; megcsúszáskor rázás.
- **Emberi olvasóval mérve (szimuláció, 20 seed, 1. pálya, valódi tételek):** a mostani tempón a „lassú olvasó” a
  kérdések **0%-át**, az „átlagos” **3–7%-át**, még az „erős” olvasó is csak **39–48%-át** tudja végigolvasni és megválaszolni
  az ablakon belül (ha mind a négy kapaszkodót elolvassa); a riválist az átlagos olvasó 0/20 menetben győzi le.
- **A célszó megjelenése:** a prompt egyetlen 17 px-es (360–390 px), 800-as vastagságú, fehér sor; a célszó csak
  idézőjelben („„Alma” angolul:”) vagy a kettőspont után áll, a keretszöveggel azonos méretben és színben; a hiányos
  mondatnál az `_____` sima aláhúzásjel. Képek: `docs/measurements/jatekok-jatekelmeny/J2-olvashatosag/elotte-*.jpg`.
- **Élesben** (websuli.vip, 390×844, csak olvasva): ugyanez — „Mit jelent: „by train”?” 17,9 px, a fogások 17,2 px,
  „6 mp” ablak (évfolyam nélkül a 4. évfolyam képletével).

## 4. Döntések

### A — Több idő (olvasásalapú ablak, előjelzés)

- `L/wordLadder/pacing.ts` `ladderWindowMs`: „Gyors” = a mostani közös ablak; „Nyugodt” / „Normál” =
  `tájékozódás + teljes olvasás (prompt + minden opció, teljes súllyal) / (readingWpm × szorzó) + döntés`, legalább a közös
  ablak `floorFactor`-szorosa, legfeljebb `capMs`. Paraméterek: Nyugodt — szorzó 0,45 (3–4. évf. 40,5 szó/perc),
  tájékozódás 1,5 s, döntés 4,5 s (3–4. évf. 5 s), padló 2×, plafon 40 s; Normál — 0,65, 1 s, 3 s (3,5 s), 1,4×, 25 s.
  A szorzót a mérés adta: 0,6-tal a „lassú olvasó” csak 82%-ban végzett az ablakon belül (cél ≥ 95%), 0,45-tel 99%.
- A közös director 9 s-os plafonja (`WINDOW_MAX_MS`, `READING_WINDOW_CAP_MS`) gátolná: a lap a director presentation-jét
  burkolja (`paceDirector`: `startedAtSimMs + LEAD_IN_MS`, `windowMs = ladderWindowMs`); a director maga, a `questionUi` és a
  közös függvények változatlanok. **ORKESZTRÁTOR-KÉRÉS:** ha más játék is olvasásalapú, 9 s feletti ablakot kap, a közös
  `DirectorConfig`-ba egy opcionális `windowFor` kampó tisztább lenne.
- **Előjelzés:** `LEAD_IN_MS = 600` — a kérdés és a fogások látszanak, az óra áll, a fogás nem éles (koppintás / 1–4
  billentyű hatástalan). Ez véd a véletlen (olvasás nélküli) válasz ellen is (átmeneti kapu 3(a)).
- A director saját ablaka (≤ 9 s) csak a közös áramlat-jel „gyors válasz” küszöbében marad (nyugodt tempón kevesebb
  „gyors” jel → a rivális áramlat-szorzója inkább 0,9 felé — a nyugodt szándékkal egyező); a menet-statisztika valós időt mér.

### B — Nyugodtabb tempó

- Rivális (s / fok az 1. pályán, évfolyam-sávonként 3–4 / 5–6 / 7–8 / 9–12): Nyugodt 7,5 / 7 / 6,6 / 6,8 (pályánként
  −0,08 s), Normál 6,9 / 6,6 / 6,4 / 6,5 (−0,08 s), Gyors 6,3 (−0,1 s, a mostani). (A Nyugodt tempó névleges értéke a
  `slowMo` 0,35 miatt a gyakorlatban kb. kétszer lassabb rivális-haladást jelent.)
- A kérdés alatt (előjelzéssel együtt) a világ `slowMo`-val lép: Nyugodt 0,35 (a terv 4.1/3 minimuma — „alig halad”),
  Normál 0,5, Gyors 1. **SPEC-VÁLTOZÁS** a végrehajtás J2a 4. pontjához (`slowMo: 1` — „a rivális a kérdés alatt is mászik”):
  a tulajdonos friss visszajelzése az erősebb; a rivális a kérdés alatt is halad (≥ 0,35×, terv 4.1/3 teljesül), csak lassan.
- A fal Nyugodt tempón 0,55×, Normálon 0,75× (`ladderWallRungs`, legalább 8 fok): percenként kevesebb kérdés fér a menetbe,
  így a menet percben a 2–5 perces sávban marad (terv J9).
- Hibás / lejárt válasz után a megoldás 3 s-ig látszik (a közös sáv `revealWrongMs`-e, a régi 2 s helyett) — minden
  tempón, mert a közös `usePlayQuestion` a kérdés-sávot laponként egyszer hozza létre (menet közben nem váltható).
- **Review K6:** a megoldás-kijelzés alatt is a tempó `slowMo`-jával lép a világ (Nyugodt 0,35, Normál 0,5, Gyors 1 — a
  régi viselkedés), hogy a gyerek ne akkor veszítsen teret, amikor a megoldást olvassa. A lap az időskálát maga állítja
  (`!canAsk()` = nyitott kérdés vagy kijelzés); a közös sáv változatlan; a sim ugyanígy.
- Szabad fogás (kérdés nélkül) ütemezése a tempóval arányos (`ladderFreeGripMs`), hogy kérdés nélkül ne legyen könnyebb.
- Az időcsík a Szólétrában az utolsó pillanatig a nyugodt színátmenet (a közös „kevés idő” csíkozás a lap stílusában
  felülírva); a gumiszalag marad ±10% (KSZ-16).

### C — Tempó-beállítás és pont

- Választó a `StartScreen` `settings`-ben és a `PauseMenu`-ben (`data-testid="wl-tempo-<calm|normal|fast>"`,
  `aria-pressed`); tárolás `websuli.wordladder.tempo` (hibás / ismeretlen → Nyugodt); szünetben váltva a KÖVETKEZŐ
  kérdéstől érvényes (ablak), a rivális / fal a következő menettől.
- **Pont:** a menet-XP a helyes válaszok XP-jéből és a győzelmi jutalomból áll; a rövidebb nyugodt falon kevesebb kérdés
  van, ezért a menet-XP-t a fal-szorzóval normáljuk (helyes válaszonként `xpForCorrect × 1 / wallFactor`, a győzelmi
  jutalom változatlan) — így a nyugodt mód nem „büntetés” a ranglistán. **DÖNTÉS (tulajdonos):** (1, ajánlott) így marad;
  (2) a ranglista tempónként külön; (3) nincs normálás (a gyors tempó menetenként több XP-t ad).
- **TULAJDONOSI DÖNTÉS (2026-11-18):** a lassabb („Nyugodt”) tempón is UGYANANNYI XP jár. A kód ezt a MENET szintjén
  teljesíti: a teljes falnyi helyes fogás XP-je tempótól függetlenül ~ ugyanannyi (a helyes válasz XP-je × 1 / fal-szorzó:
  Nyugodt ×1,82, Normál ×1,33, Gyors ×1; teszt: `T/word-ladder-pacing.test.ts` „B/C”; a független ellenőr mérése szerint
  őszinte játéknál a menet-XP Nyugodton −10…−15% a Gyorshoz képest, szándékos nyújtással +32–36%). Nyitott értelmezési
  kérdés: ha a döntés KÉRDÉSENKÉNT azonos XP-t jelent (nem menetenként), akkor a szorzót el kell hagyni — ekkor viszont a
  rövidebb nyugodt falon a menet-XP ~45%-kal kevesebb (a terv C (3) változata).

### D — Kiemelt célszó (adatból)

- Szóbank (`GE/vocab/questionGenerator.ts`): ÚJ opcionális `VocabQuiz.focus` — a prompt célrésze a kérdéstípusból:
  magyar → cél: a magyar szó; cél → magyar: a célnyelvi szó; mondat-jelentés: a mondat; hiányos mondat: a mondat a hiánnyal.
- Kézi bank (`data/wordLadder/{en,de,fr}.ts`): ÚJ opcionális `LadderItem.focus` (a prompt rész-szövege) — egyszeri,
  áttekintett adatgenerálással beírva; a helyzetleírós kérdéseknél (pl. „Mit mondasz, ha …?”) nincs külön célszó, ott a
  prompt a mostani módon jelenik meg. Őr: `tests/word-ladder-validate.test.ts` (a `focus` a prompt rész-szövege, nem üres,
  hiányos mondatnál tartalmazza a hiányt; minden idézőjeles / kettőspontos kérdésnek van `focus`-a).
- A lap a célrészt kérdés-azonosító szerint tartja (a `speakText` mintájára), és a közös sávnak adja.
- Közös `InlineQuestion` (KIVÉTELES, visszafelé kompatibilis): ÚJ opcionális `promptFocus?: string | null`. Ha nincs
  megadva (minden más játék): a megjelenés bitre változatlan. Ha megadva és a prompt tartalmazza: a prompt két sorra bomlik —
  keretsor (16 px, a törzsszöveggel azonos erős szín — review A4: a feladat típusa és a zárójeles adat a megoldáshoz kell;
  a célrész helyén „…”) és célkártya (`data-testid="<promptTestId>-focus"`, világos alap, sötét, vastag, szónál ≥ 1,6×
  (26–32 px), mondatnál 26–28 px, `overflow-wrap: normal`, a hiány `.play-question-blank` vastag narancs keretben).
- **Review K2:** a célkártya nem takarhatja a fogásokat (álló nézet) és nem lóghat ki (fekvő nézet): a lap a rendelkezésre
  álló magassághoz kicsinyíti a kártya betűjét (legfeljebb 20 px-ig = a keretsor 1,25-szöröse), a megoldás-kijelzés sorának
  helyét előre fenntartva. Mondatnál így a betűarány ≥ 1,25 (helyhiánykor), szónál ≥ 1,6. A lépcsők: (1) tanító sor rejtve,
  (2) célkártya 22 px-ig, (3) tömör fogás-panel (16 px, a fogás ≥ 48 px), (4) mondat 20 px-ig, (5) megoldás-kijelzéskor rövid
  jelzés a hosszú megoldás-sor helyett (lásd a DÖNTÉST lent). **Review Ú1:** a kijelzés tartaléka a kártya lábának AKTUÁLIS
  magasságával csökken (hiba utáni kérdésnél az előző „Miért?” gomb már ott van — a hely nem foglalódik kétszer). A gomb
  eltűnésekor NINCS visszanagyítás: az a gyerek olvasása közben történne (a szöveg mozgása olvasás közben zavaróbb, mint a
  kissé kisebb, de álló betű); az e2e azt méri, hogy hiba után ugyanakkora a célkártya, mint rendes kérdésnél.
- **DÖNTÉS (tulajdonos; review Ú2) — a megoldás-sor helyhiánykor:** ha a megoldás-kijelzéskor a kártya a 4. lépcső után sem
  fér a fogások fölé, a hosszú „A jó válasz: …” sor helyett rövid jelzés látszik: „A jó válasz zölden világít” (hibás
  fogásnál) / „Lejárt az idő — a jó válasz zöld” (lejáratnál); a helyes fogás zölden, pipával, teljes felirattal látszik, a
  képernyőolvasó a teljes sort kapja. Helyes válasznál (rövid dicséret) nincs rejtés. Hány tételnél lép életbe: a
  `k2-kartya-fogas-meres.txt` „rejtett-megoldássor” oszlopa. Javasolt (1) így marad; (2) a megoldás-sor mindig látszik, és
  inkább a célkártya / fogás-panel kicsinyedik tovább; (3) a megoldás-kijelzéskor a célkártya összecsukódik.
- **Review K1:** a kézi bank célrésze azonosító szerint is kereshető (`L/wordLadder/focus.ts`), így a menetek közötti
  ismétlésből (a közös sor pillanatképéből) visszatérő tétel is kiemelve jön.
- **Review A1/A2:** a célrész nem lehet feladat-utasítás (helyzetleírásnál elhagyható), és a célnyelvi kérdő mondat záró
  „?”-e a célrésszel marad — a validátor mindkettőt fogja (`de4-060` célrésze törölve, 16 angol tétel javítva). A prompt teljes
  szövege (`innerText`) olvasható marad a meglévő tesztekhez; `aria-label` a teljes prompt.
- A felolvasás változatlanul a választ el nem áruló `speakText` (cél → magyar: a célszó; hiányos mondat: a mondat).

### E — Egyéb (a mérés alapján)

- A fogás-feliratok 16 px-ről legalább 17 px-re (360 px-en is), a tanító sor marad.
- Az eredmény- és a többi képernyő változatlan.

### F — Az ingadozó `word-ladder-play.spec.ts` (main CI 44028107372)

- **Gyökérok 1 (versenyhelyzet):** a ciklus elején `result.isVisible()` még hamis, de a menet aszinkron véget érhet (a
  rivális felér → a nyitott kérdés megszakad, nincs kijelzés → azonnal eredményképernyő, `role="dialog"`), mielőtt a ciklus
  végi `[role="dialog"]` számlálás lefut → `Expected 0, Received 1`.
- **Gyökérok 2 (időtúllépés):** a menet falióra-hossza nincs korlátozva: a világ képkockánként legfeljebb 5 fix lépést
  (83 ms) tesz, így lassú CI-n (szoftveres WebGL, < 12 fps) a rivális a falióránál lassabban halad, a 24–35 fokos menet 300 s
  fölé nyúlik → `Test timeout of 330000ms`.
- **Javítás:** (1) a „nincs blokkoló párbeszédablak” egyetlen `page.evaluate` (C-64): az eredményképernyőn
  (`[data-game-result]`) kívüli `role="dialog"` száma 0, és ha az eredmény már látszik, a ciklus kilép; (2) a teszt
  rögzített seeddel és rövid fallal fut: ÚJ `?wall=<n>` (csak teszt-kampós / fejlesztői buildben, mint a `?seed=`), így a
  menet játékidőben korlátos; a mérce (valódi érintés, mászás, megcsúszás, eredmény, „Gyakorold még”, nincs automatikus
  újraindítás, visszavágó) változatlan.
- **Bizonyíték:** a #484 (futás 44067540915, job 133985792633) naplója szerint mindhárom próbálkozás `Test timeout of
  330000ms` a ciklusban (az eredmény 300 s alatt nem jött el) — a 2. gyökérok; a main 44028107372 naplójában a
  „Received: 1” párbeszédablak — az 1. gyökérok. Helyben 6× CPU-lassítással, 10 egymás utáni futással: a Nyugodt tempón
  10-ből 1 még 330 s fölé nyúlt; a Gyors tempóval próbálva 10-ből 1 jó fogás nélkül veszített (kevés kérdés jutott a rövid
  menetre). A harmadik ok tehát a teszt „játékosának” saját lassúsága volt: körönként ~10 automatikusan váró lokátorhívás
  (lassú gépen kérdésenként több másodperc). Javítás: körönként két `page.evaluate` (állapot; megoldás-kijelzés), a lap alap
  (Nyugodt) tempóján.

## 5. Edge case-ek

- Tétel célszó-adat nélkül (szerver-bank, tananyag, helyzetleírás) → a mostani prompt-megjelenés (a nagyobb ablak igen).
- A `focus` nem rész-szövege a promptnak (adathiba) → kiemelés nélkül (biztonsági háló + validátor-őr).
- Hosszú célszó / kifejezés (a bank leghosszabbjai) → szó közepén nem tör, 360 px-en kifér (e2e méri).
- Tempóváltás szünetben → a nyitott kérdés ablaka nem változik; a következőtől érvényes.
- Előjelzés alatti koppintás / 1–4 billentyű → hatástalan (nem válasz, nem hiba).
- Lejárt kupon / szünet / „Miért?” / kibontott kérdés alatt az óra és az előjelzés is áll (a kérdés-óra szünetben áll).
- Kérdés nélkül (üres forrás, 8.1) → szabad fogás, a tempóval arányos ütemben.
- Csökkentett mozgás → nincs új animáció (a célkártya statikus).

## 6. Elfogadás (EARS)

<!-- acceptance-checklist -->
Bizonyíték (2026-11-17): SZ-1, SZ-3, SZ-8 — `T/word-ladder-pacing.test.ts`; SZ-2 — `T/word-ladder-readability.spec.ts`
(képkockánként) + sim; SZ-4 — readability-spec; SZ-5 — readability-spec, 3 nyelv × 3 nézet, kérdés- és megoldás-állapot
(`k2-kartya-fogas-meres.txt`); SZ-6 — `T/game-play-inline-focus.test.ts` forrás-őr + a közös mobil mérő / meta-mérő / play-lab
zöld; SZ-7 — `T/word-ladder-sim.test.ts` (a gyengék vesztes menetének hossza és az alap tempó nehézsége TULAJDONOSI DÖNTÉSRE
vár: végrehajtási fájl „Mért számok”); SZ-8 — böngészőben csak a ≥ 1,8 s mért (`T/game-explanation-pause.spec.ts`), a 3 s az
állandó és a sim szintjén; SZ-9 — 10/10 zöld 6× CPU-lassítással (nem kizárólagos gépen); SZ-10 — a végrehajtási fájl
ellenőrzőlistája. Nyitott tulajdonosi döntések: XP tempónként (C), alap tempó nehézsége / menethossz-plafon (K3), a
megoldás-sor helyhiánykor (D, Ú2).
- [x] SZ-1 WHEN a Szólétra kérdést mutat Nyugodt tempón THEN the system SHALL az ablakot ≥ tájékozódás + a teljes
  olvasnivaló (prompt + minden opció) az évfolyam nyugodt olvasási sebességével + döntés értékre állítani, ≥ 2× a mostani
  ablak, 3–4. évfolyamon egy átlagos szókérdésnél ≥ 12 s; az ablak monoton nő a szöveg hosszával és nem nő az évfolyammal.
- [x] SZ-2 WHEN egy kérdés megjelenik THEN the system SHALL az órát csak ≥ 400 ms előjelzés után indítani, és addig a
  fogás / billentyű nem számít válasznak (képkockánként mérve, C-65).
- [x] SZ-3 WHEN a kérdés nyitva van Nyugodt tempón THEN the system SHALL a riválist ≤ 0,35× sebességgel léptetni; a rivális
  alaptempója és szintenkénti gyorsulása lassabb a mostaninál; a Gyors tempó a mostani.
- [x] SZ-4 WHEN a játékos tempót választ (Nyugodt / Normál / Gyors) THEN the system SHALL azt tárolni és újratöltés után
  visszaállítani; alapérték Nyugodt.
- [x] SZ-5 WHEN a kérdés célszó-adatot hordoz THEN the system SHALL a célrészt külön kártyán, a keretszöveg ≥ 1,6-szeres
  (mondatnál helyhiánykor ≥ 1,25-szörös) betűméretével, ≥ 3:1 kontraszttal, kilógás, a fogások / HUD takarása és szó
  közbeni törés nélkül mutatni mindhárom nézetben (360×640, 390×844, 844×390), kérdés- és megoldás-állapotban, az angol,
  német és francia bank leghosszabb célszavaival és a hiányos mondatos típussal is; a hiány helye kiemelt; a keretsor
  ≥ 16 px, ≥ 4,5:1 kontraszttal, nem halványított.
- [x] SZ-6 WHEN egy másik játék használja az `InlineQuestion`-t `promptFocus` nélkül THEN the system SHALL a mostani
  megjelenést adni (a közös mobil mérő, a meta-mérő és a többi játék kérdés-sávos tesztjei zöldek).
- [x] SZ-7 WHEN a szimuláció emberi olvasási idővel fut Nyugodt tempón THEN the system SHALL: a „lassú olvasó” a kérdések
  ≥ 95%-át az ablakon belül végigolvassa és megválaszolja; a 3–4. évfolyamos átlagos olvasó kérdéssel ≥ 12/20 menetet nyer;
  a nyerési arány a pontossággal monoton; kérdéssel ≥ kérdés nélkül; a menet medián 2–5 perc a referencia-pályán.
- [x] SZ-8 WHEN a hibás / lejárt válasz megoldása látszik THEN the system SHALL azt ≥ 3 s-ig mutatni.
- [x] SZ-9 WHEN a `word-ladder-play.spec.ts` a CI-azonos úton fut THEN the system SHALL determinisztikusan, a régi mércével
  zöld lenni (nincs versenyhelyzet a menetvég és a párbeszédablak-ellenőrzés között; a menet játékidőben korlátos).
- [x] SZ-10 WHEN a véletlen-válasz ellenőrzőlista (átmeneti kapu 3(a)–(f)) fut THEN the system SHALL mindegyikre zöld
  tesztet mutatni (a hosszabb ablak és az új elrendezés nem nyit olvasás nélküli választ).

## 7. Spec-változások (dokumentált, nem lazító)

| Hol | Régi | Új | Ok |
|---|---|---|---|
| Végrehajtás J2a 4. `slowMo: 1` | a rivális a kérdés alatt teljes sebességgel mászik | Nyugodt 0,35 / Normál 0,5 / Gyors 1 | tulajdonosi visszajelzés |
| Terv 6.2 / J2 „Szólétra ≥ 10 kérdés / perc” | minden tempón | a Gyors (régi) tempón ≥ 10; Nyugodt tempón emberi olvasóval mérve, alsó korlát ≥ 4 / perc | a több idő kevesebb kérdést jelent percenként |
| `T/word-ladder-sim.test.ts` 50–80% nyerés (SIM_AVERAGE) | 6. pálya, régi tempó | Gyors tempón SIM_AVERAGE 50–80%; Nyugodt tempón az emberi olvasó-profilokkal (SZ-7) | az olvasási idő nélküli bot a nyugodt tempót nem méri |
| `T/word-ladder-sim.test.ts` arany lenyomat | régi | új (előjelzés, 3 s kijelzés, meghajtó) | a menet időzítése változott |
| `T/word-ladder-validate.test.ts` „helyes tétel” minta | célrész nélkül | `focus: "Kutya"` | az idézőjeles kérdés célrésze kötelező |
| `T/word-ladder-readability.spec.ts` betűarány | minden célrész ≥ 1,6× (14 px keretsor → ≥ 22,4 px) | szó ≥ 1,6× (16 px keretsor → ≥ 26 px), mondat helyhiánykor ≥ 1,25× (≥ 20 px) | review K2 + A4: a keretsor 16 px lett, és a hosszú mondat különben a fogásokra lógna |
| `T/game-explanation-pause.spec.ts` (d) várakozás | 30 s | 60 s (a feltétel ugyanaz) | a nyugodt ablak hosszabb |
| `T/word-ladder-play.spec.ts` | 24+ fokos fal, versenyhelyzetes ellenőrzés | `?seed&wall=` rövid fal, egyetlen `evaluate` | determinisztikussá tétel (F) |

## 8. Kockázatok

- A nyugodt tempó kevesebb kérdést ad percenként (mért: ~5 / perc a régi ~7–10 helyett) — a tulajdonos kifejezett kérése.
- A „lassú olvasó” (65% pontosság) nyugodt tempón is ritkán nyer (mért a végrehajtási fájlban) — a vereség nem büntet,
  visszavágó van; a lassú, de pontos olvasó esélyes.
- A kézi bank adatfájljai nagy (gépies) diffet kapnak (`focus` mező soronként) — a validátor-őr védi.
- Valódi telefonon (érintés, betűkészlet) nem próbáltuk; a mérés Playwright-emulációval és szoftveres WebGL-lel készült.
