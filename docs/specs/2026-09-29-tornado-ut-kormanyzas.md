# Tornado Hunter — ház az úton, kóválygó és lassú mobilvezetés (spec, 2026-09-29)

Forrás: tulajdonosi jelzés valódi Android-telefonon, websuli.vip, LEVEL 1, a PR #137 után.
Ág: `fix/tornado-ut-kormanyzas`. Előzmény: `2026-09-29-tornado-fizika.md` (híd, ütközés, szélsodrás).
Csak mért vagy a kódból ellenőrzött tény; ami nem bizonyított, UNVERIFIED.

## 1. Hibák és gyökérokok

### H1 — Ház (és más tereptárgy) az úton
- `source/client/src/lib/tornado/world.ts:365` — a `propsInChunk` csak a tárgy KÖZÉPPONTJÁT szűri:
  `roadFactor(x, z) > 0.35` → kihagyás. Ez a középvonaltól 0,65 · 9 = 5,85 egységre engedi a középpontot,
  a tárgy méretét figyelmen kívül hagyva. Egy ház ütközője 3,5 × 4 (× 0,8–1,4 lépték, forgatva: fél-átló
  akár 7,4), vagyis a ház a 9 egység fél-szélességű útsávba, sőt a középvonalon túlra is benyúlik.
- Mérve (a teljes térkép minden chunkja, 4764 tárgy; a világ minden pályán ugyanaz, szint- és magfüggetlen
  függvény — `propsInChunk(cx, cz)`, nincs seed paraméter, így a teljes térkép bejárása kimerítő):
  **325 szilárd tárgy ütközője metszi az útsávot** (ház 70, csűr 72, fa 112, kerítés 43, siló 8,
  víztorony 7, oszlop 7, kút 6), ebből **99 az aszfaltba** (< 4,05) is benyúlik; a legrosszabb ház a
  középvonalon 0,84 egységgel túl ér (x = −1194, z = −379).
- A #137 óta a tárgyak szilárdak (`collision.ts`), így az ilyen tárgy az utat is elzárja.

### H2 — „Nagyon lassú, zötyögős, nem tudom egyenesben tartani, jobbra-balra kóvályog”
Mérés: `source/tornado-sim.local.mts` (fej nélküli, a játékhurok pontos lánca: joystick → bemenet →
`stepVehicle` → `resolveVehicleCollisions` → `groundHeight`, 60 és 30 Hz, 12 mag), és
`source/tornado-drive-probe.local.mts` (valódi Chrome, 390×844, `isMobile`, `hasTouch`, CDP-érintés a
`VirtualJoystick`-on, 1× és 4× CPU-fojtás). Kezdő jármű: `stormrunner-s` (172 km/h, gyorsulás 65,
kezelhetőség 75, szélállóság 39). „Közel egyenes” hüvelykujj: 6° eltérés + Ornstein–Uhlenbeck remegés
(σ = 12°, τ = 0,5 s), a tárcsa sugarának 90%-áig kitolva.

Vizsgált okok és a mért eredmény:
1. **A tárcsa digitális (ELSŐDLEGES GYÖKÉROK, bizonyított).** `TornadoHunter200.tsx:2169-2173` a
   `joystickToDirections` (`game-engine/joystick.ts`, küszöb 0,35) négy logikai gombjára bontja a vektort;
   a játékhurok (`TornadoHunter200.tsx:1627-1632`) ebből ±1 kormányt és 0/1 gázt képez. Így egy ~23°-os
   hüvelykujj-eltérésig SEMMI nem történik, fölötte azonnal TELJES kormány (1,6 · 75/80 ≈ 1,5 rad/s ≈ 86°/s).
   Finom korrekció lehetetlen: a gyerek vagy nem kormányoz, vagy túlkormányoz. Mérve (böngésző, 16 s):
   laterális RMS **56,7** egység, max **112**, irányeltérés max **53°**, az idő **74,7%-ában nem aszfalton**.
   Fej nélkül (12 mag, 60 Hz, nyílt hurok): 80% az úton kívül; zárt hurokban (gyerek korrigál, 180 ms
   reakció, σ = 20°): laterális RMS 2,69, az idő 11,9%-a nem aszfalt, 2,1% az úton kívül.
2. **Szélsodrás (#137) — NEM ok.** LEVEL 1: szélcsúcs 120 km/h, a kezdőponton 13,7 km/h →
   `windDriftUnits` ≈ 0,05 egység/s. Zárt hurokban szél 0 / 18 / 60 km/h mellett a laterális RMS
   2,69 / 2,69 / 2,68 — gyakorlatilag azonos.
3. **Holtzóna.** A radiális 0,15-ös holtsáv megvan, de a kormányzásnak nincs saját tengely-holtsávja
   és görbéje — a digitális küszöb a 1. pont része.
4. **A kormány nem áll vissza középre — NEM ok.** A modellben nincs kormányszög-állapot: a fordulási
   sebesség minden lépésben közvetlenül a bemenet (`drive.ts:79-81`), felengedésre azonnal 0.
5. **Terep / magasság (a „zötyögés” oka, bizonyított, a kóválygás következménye).** Az útbevágás
   V alakú (`world.ts:89-91`, `roadFactor` lineáris): 1 egység oldalmozgás mediánban 0,36, legfeljebb
   0,83 egység emelkedés. A kamera mereven `ground + 9` (`TornadoHunter200.tsx:1762`). A kóválygás így
   függőleges hintázás: böngészőben a jármű alatti talaj és a középvonal különbsége RMS **1,90**,
   csúcstól csúcsig **5,43** egység (a jármű 1,3 magas). A középvonalon egyenesen haladva a talaj sima
   (képkockánként medián 0,002, p99 0,02 egység), kivéve 24 hídvéget, ahol a pálya 0,35-ös emelése
   (`DECK_LIFT`) egy képkocka alatt ugrik (max 0,36).
6. **Ütközésfeloldás rezgése — NEM ok az úton.** Az úton maradó zárt hurkos futásban az ütközés
   nem aktív; az úton lévő tárgyak (H1) okoznak ütközést.
7. **dt / frekvencia — NEM ok.** 30 és 60 Hz közti különbség a zárt hurokban 2,69 → 2,92 (a remegés
   mintavétele), a gyorsulás 0,88 / 0,87 s. Böngészőben 4× CPU-fojtással is 16,7 ms medián, 0 db
   50 ms feletti képkocka (asztali GPU; valódi Android-GPU UNVERIFIED). Ha a telefon 20 fps alá esik,
   a `dt` 0,05-ös vágása lassítja a játékidőt (`TornadoHunter200.tsx:1253`) — ez nem mért, UNVERIFIED.
8. **Alacsony végsebesség (bizonyított).** `maxSpeedUnits(172) = 12,42` egység/s (`drive.ts:41-43`), a
   jármű 5,2 egység hosszú → 2,4 kocsihossz/s; a térkép km-skálája (1 egység ≈ 3,85 m) a jármű méretéhez
   képest ~4× tömörített, így a névleges 172 km/h vizuálisan ~40 km/h-nak hat. A HUD „MAX: 18” értéke
   NEM sebesség, hanem a szél maximuma (`TornadoHunter200.tsx:1834`, `hud.maxWind`).

## 2. Cél
- C1: Egyetlen tereptárgy (szilárd ütköző, bokor, kútpénztár-tető, háztető) se nyúljon az út/híd sávjába:
  a lábnyoma a középvonaltól legalább `ROAD_HALF_WIDTH + 1,5 = 10,5` egységre marad. Determinisztikus.
- C2: Közel egyenes tárcsánál az autó tartsa az irányt és maradjon az aszfalton; finom korrekció lehetséges.
- C3: Sima, zötyögés nélküli kép: a kamera magassága nem ugrál a talaj minden apró változásával.
- C4: A végsebesség érezhetően (60%-kal) nagyobb; az ütközés nagy sebességen, alacsony fps mellett
  sem ugrik át vékony tárgyon.
- C5: Billentyű és gamepad nem romlik (analóg gamepad változatlan, billentyű digitális marad).

## 3. Nem-cél
- A térkép km-skálájának (`UNITS_PER_KM`) átírása, a szél/távolság-HUD, az útbevágás profilja és a
  terephálózat (a V-profil marad; a hálózat 12,5 egységenként mintavételez, egy lapos útprofil a
  vizuális felület és a jármű között eltérést okozna).
- Új HUD-elem (sebességmérő). A „MAX” felirat félreérthetősége külön jelzés.
- Kormányszög-állapot, gyorsulás-görbe a billentyűs vezérlésben.

## 4. Rögzített döntések
- D1 (lábnyom): `world.ts` `propFootprint(p)` — a tárgy talajra vetített, `scale`-lel szorzott helyi
  alakja: ház doboz 4,4 × 4,4 (a tető 6,2/√2 ⊇ a fal 3,5 × 4), csűr 6,3 × 8 (tető ⊇ test 5,5 × 8),
  kerítés 4,5 × 0,11, kút doboz 7 × 4,5 (a tető ⊇ a ±6-os oszlopok), oszlop doboz 2,1 × 0,28 (kar),
  siló kör 2,6, víztorony kör 3,4 (tartály), fa kör 2,6 (lomb), bokor kör 1,5. Minden ütköző
  (`collidersForProp`) benne van a lábnyomban (teszt).
- D2 (távolságtartás): a régi középpont-szűrés (`roadFactor > 0.35`, víz, híd) marad. Ami megmarad, azt
  mindkét tengelyen a legközelebbi útvonaltól ELTOLJUK (a saját oldalán, a középvonalra merőlegesen),
  amíg a lábnyom széle ≥ `PROP_ROAD_CLEARANCE = ROAD_HALF_WIDTH + 1,5`. Az útvonalak chunk-határon
  futnak (−1200 + 300k), ezért az eltolás mindig a chunk belseje felé visz; a tárgy a saját chunkjában
  marad (max. eltolás < 25 egység). Eltolás után ismét víz- és hídvizsgálat; vízbe került tárgy kimarad.
- D3 (analóg érintés): új `touchDriveInput(v: JoystickVector)` a `lib/tornado/controls.ts`-ben.
  Kormány: tengely-holtsáv 0,12, teljes kitérés |x| ≥ 0,85-nél, köztük (t)^1,7 görbe. Gáz/hátramenet:
  holtsáv 0,12, teljes |y| ≥ 0,6-nál, lineáris. A `TouchControls` `touchRef`-je `{ throttle, steer }`
  számpár; `blur`/`visibilitychange` nullázza. A többi játék (`joystickToDirections`) változatlan.
- D4 (tempó): `drive.ts` `DRIVE_PACE = 1,6`; `maxSpeedUnits(kmh) = fromKm(kmh/3600) · DRIVE_PACE`.
  A gyorsulás a végsebességgel arányos (változatlan képlet), így 0 → 90% idő változatlan (~0,9 s).
- D5 (részlépés): `driveSubsteps(dt) = ceil(dt · 60)` (legalább 1); a játékhurok a jármű-lépést és az
  ütközésfeloldást ennyi egyenlő részre bontva futtatja (részlépés ≤ 1/60 s). 60 Hz-en 1 (változatlan).
- D6 (kamera): `followHeight(prev, target, dt, tau = 0,15)` exponenciális simítás, dt-független;
  |eltérés| > 8 egység (teleport, újraindítás) → azonnal a célra ugrik. A jármű a talajon marad; csak a
  kamera (és a nézési pont) magassága simított. A tesztkampó `getCamera()`-t kap a méréshez.

### Spec-változás meglévő teszteknél (dokumentált)
- `tests/tornado-drive.test.ts` „maxSpeedUnits: 168 km/h ≈ 12.13”: a D4 tulajdonosi kérés („a
  végsebesség érezhetően nagyobb legyen”) miatt az elvárt érték `fromKm(168/3600) · DRIVE_PACE`. A
  *60-as hiba elleni őr megmarad és szigorodik: `u < 20` helyett `u / fromKm(168/3600) < 2`.
- Ugyanott „1 s full throttle”: a km/h-ra visszaszámolt sebesség felső korlátja a tempóval szorzódik
  (180 → 180 · DRIVE_PACE); a *60-as őr (a 0,25 km-es távolságkorlát) változatlan.
- `tests/tornado-mobile-controls.test.ts` „köralakú tárcsa vezet (mind a négy irány)”: a D3 miatt a
  tárcsa nem négy logikai gombra, hanem analóg `touchDriveInput`-ra kötött; a teszt a tárcsa meglétét, a
  `touchDriveInput(` hívást, a `touchRef.current.throttle`/`.steer` bekötést és a régi gombok hiányát
  követeli (nem gyengül: mindkét tengely bekötése kötelező).

## 5. Edge case-ek
- Tárgy két út közelében (kereszteződés): mindkét tengelyen külön eltolás.
- Eltolás a folyóba: kimarad (determinisztikusan).
- Térképszél (±1200-as vonalak): ugyanaz a szabály; a térképen kívüli chunk üres.
- Tárcsa teljesen oldalra (θ = 90°): gáz 0, teljes kormány (mint eddig a digitálisnál).
- Nagy dt (0,05) és 260 km/h (a katalógus felső vágása): részlépésenként ≤ 0,5 egység elmozdulás.
- Teleport (újraindítás, tesztkampó): a kamera nem úszik át, hanem ugrik.

## 6. Elfogadás (EARS)
- E1: A teljes térkép minden tárgyára: minden ütköző (és a lábnyom) szélének távolsága minden
  útvonaltól ≥ 10,5. A régi kódon 325 átfedés (bukik).
- E2: `propsInChunk` determinisztikus; minden tárgy a saját chunkjában marad; ütköző ⊆ lábnyom.
- E3: WHEN a tárcsa 20°-ra tér el a függőlegestől THEN |kormány| < 0,15 (régi: 0 vagy 1);
  WHEN 6° + σ = 12°-os remegés (fej nélküli modell, 12 mag, 60 és 30 Hz) THEN az autó az idő ≥ 95%-ában
  aszfalton és a laterális eltérés max < 4,05 (régi: 80% úton kívül).
- E4: WHEN teljes gáz THEN a végsebesség ≥ 1,5 × a régi (12,42 → ≥ 18,6).
- E5: WHEN 260 km/h, 20 fps (dt 0,05), merőlegesen egy kerítésnek hajt THEN nem jut át rajta.
- E6: A kamera-simítás 30/60/144 Hz-en 0,5 s után ±2%-on belül azonos; 8 egység fölött ugrik.
- E7: Böngészőben (390×844, érintés) a „közel egyenes” próbán a laterális RMS < 2 és az aszfalton
  töltött idő ≥ 95%; a függőleges hintázás csúcstól csúcsig < 1,5 egység.
- E8: Minden új teszt a régi kódon BUKIK (kimenettel igazolva), az újon zöld; meglévő teszt nem gyengül.

## 7. Érintett fájlok
- `source/client/src/lib/tornado/world.ts`, `drive.ts`, `controls.ts`
- `source/client/src/pages/TornadoHunter200.tsx`
- Új tesztek: `source/tests/tornado-prop-clearance.test.ts`, `source/tests/tornado-touch-drive.test.ts`
- Módosuló (spec-változás): `tests/tornado-drive.test.ts`, `tests/tornado-mobile-controls.test.ts`

## 8. Mérések előtte / utána
(A 3. fázis végén kitöltve, lásd lent.)
