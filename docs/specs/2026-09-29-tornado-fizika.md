# Tornado Hunter — híd, ütközés, magától induló autó (spec, 2026-09-29)

Forrás: tulajdonosi hibajelzés (három pont). Ág: `fix/tornado-fizika`.
Csak a kódból ellenőrzött tények; a nem bizonyított állítás UNVERIFIED jelölést kap.

## 1. Hibák és gyökérokok

### H1 — A folyó átfolyik az úton
- `source/client/src/lib/tornado/world.ts:75-83` — `terrainHeight` nem ismer folyómedret: a folyó csak
  festék a sík terepen, nincs magasságkülönbség az út és a víz között.
- `source/client/src/lib/tornado/world.ts:117` — `surfaceAt` előbb a vizet nézi, így az út és a folyó
  metszetében a felület „water” (tapadás 0,12): a fizika szerint is a vízen gurul az autó.
- `source/client/src/tornado/buildMeshes.ts:646` — a terep-shader a vizet festi UTOLJÁRA
  (`surface = mix(surface, river, water)`), vagyis az aszfalt fölé.
- Mérve (rácsminta 2 egységenként): az aszfalt-minták 1,5%-a (1419/94 400) víz. A folyó 9 vízszintes
  utat keresztez, és az `x = -300 / 0 / 300` függőleges utak mentén 70–170 egység hosszan fut közvetlenül
  az út mellett/alatt; a `(0,0)`, `(-300,-600)`, `(300,600)` kereszteződések a folyózónában vannak.
- Híd-fogalom a kódban nincs (grep: `bridge` 0 találat).

### H2 — Az autó átmegy épületen, fán
- `TornadoHunter200.tsx` játékhurok: `stepVehicle` után a pozíció közvetlenül `p.x/p.z`-be kerül, ütközés
  nincs. A kellékek pozíciója determinisztikus (`propsInChunk`), de csak a kirajzolás használja.
- A tornádó jelenleg SEMMILYEN kelléket nem sodor el és nem rombol le (grep: nincs kellék-eltávolítás; a
  `debrisParticles` csak részecske-látvány).

### H3 — „Érintés nélkül hátra elindult az autó”
Elsődleges (bizonyítandó böngészőben és unit-tesztben):
- `TornadoHunter200.tsx:1608` — `windPush = windForceOn(...) * dt * 30`. Ez a #200-as „*60”-as fizika
  skálája; a WO-2026-09-06-tornado-uncontrollable D3 a jármű sebességét 60-szorosáról valósra javította,
  a szélsodrást nem. A sodrás így sebességgel összemérhető vagy nagyobb: scout (szélállóság 40) a
  horgonyzósávban (0,4 km, csúcs 520 km/h) ≈ 80 egység/s ≈ 1100 km/h, 3,4 km-en ≈ 36 km/h.
- `drive.ts:83-84` — a sodrás iránya `(cos θ, sin θ)`, de a `windDirection` 0 = észak (−Z), óramutató
  szerint (`wind.ts` `bearingBetween`). A helyes egységvektor `(sin θ, −cos θ)`. A hibás képlet 90°-kal
  elforgat: a széliránynak a tölcsér irányától +90°-os célja (`advanceWind`) így a tölcsérrel ELLENTÉTES,
  sugárirányú lökés lesz. A tölcsér felé néző autó tehát input nélkül, a sebességmutató 0-ja mellett
  hátrafelé csúszik.
- A sodrás álló, input nélküli autóra is hat (nincs tapadási tartás).
Másodlagos, bizonyítandó mechanizmusok (a tulajdonos eszközén a pontos kiváltó UNVERIFIED):
- `TornadoHunter200.tsx:1346-1347` — csak `keydown`/`keyup` van; ablakváltáskor (`blur`,
  `visibilitychange`) a lenyomva tartott `S`/`↓` `keyup`-ja elmarad, a `keysRef.back` beragad → tolat.
- `gamepad.ts:26-31` — `applyDeadzone(NaN)` NaN-t ad; nyugalomban is kitérő tengelyű (nem szabványos)
  eszköz `axes[1] = +1` mellett folyamatos −1 gázt ad → tolat, amint a böngésző a padot felfedi.
A touch-joystick (`VirtualJoystick.tsx`) `pointerup` és `pointercancel` esetén nulláz; holtsáv 0,15 —
ez nem hibás, csak a TouchControls ref-jét is nullázni kell `blur`/`visibilitychange`-kor.

## 2. Cél
- C1: Minden út–folyó metszetben híd: az út a víz fölött fut, a víz az út alatt, determinisztikusan,
  minden pályán (a világ szintfüggetlen, tehát egy függvény minden pályára).
- C2: Az autó nem hatol át épületen, fán, oszlopon, silón, víztornyon, kúton, kerítésen, hídkorláton:
  frontálisan megáll, ferdén mellette csúszik.
- C3: Input nélkül az autó nem indul el; a szél csak mozgó autót sodor, oldalirányban, a valós
  sebességskálán. Beragadt billentyű / joystick / gamepad nem vezethet.

## 3. Nem-cél
- Új játékmenet (kellékrombolás, sérülés-rendszer), új járművek, kamera, kvíz.
- A terep-shader átírása (a GLSL útblokk változatlan; a cache-kulcs `tornado-terrain-v3` marad, mert a
  shader forrása nem változik).
- A híd alatti áthajtás (a mederben haladó autó a hídkorlát-ütköztetőkbe ütközik — egyszerűsítés).

## 4. Rögzített döntések
- D1 (meder): `terrainHeight = alapmagasság − riverCarve`. `riverCarve`: |d| ≤ 22 → 2,6 egység mély,
  22–30 között smoothstep-pel 0-ra fut (a homokos part-sáv 25–31). `d = x − riverCenterX(z)`.
- D2 (híd-zóna): egy pont hídon van, ha az útsávon belül van (`distToGridLine < 9`) ÉS az útsáv
  keresztmetszetének a folyóközéptől mért legkisebb távolsága < 30 + 4 (ráhagyás). Függőleges útnál
  ez pontos (`max(0, |rc − xL| − 9)`), vízszintesnél 5 mintából (−9, −4,5, 0, 4,5, 9) számolt.
- D3 (hídmagasság): `deckSurfaceHeight = alapmagasság (meder nélkül) + 0,35`; `groundHeight` = híd-zónában
  ez, máshol `terrainHeight`. A jármű, a kamera és a porfelhő `groundHeight`-ot használ.
- D3b (rámpa, a böngészős próba után): az útbevágás V-alakú (a sáv közepén az alapmagasság 45%-a,
  dombon ~6 egység mély), így az első hídpálya vályú lett, és mellette a meder a pálya FÖLÉ került. A
  híd-zónában és utána 22 egységig (a terephálózat legnagyobb rácstávolsága 20) az út nincs bevágva,
  majd 30 egységes smoothstep-rámpán tér vissza a bevágásba (`bridgeInfluence`). Teszt: a pálya
  keresztben sík (±1), mellette a meder ≥ 1,5 egységgel alatta.
- D4 (felület): hídon `surfaceAt` = `asphalt` (a víz-vizsgálat ELŐTT). Kellék nem kerül hídra.
- D5 (hídháló): chunkonként `bridgeSpansInChunk` → aszfalt pálya-szalag + két beton szegélygerenda +
  két korlát + pillérek a mederig. A vonal abba a chunkba tartozik, ahol `floor(line/100)`; a hossz
  mentén a chunk [base, base+100) tartományát fedi, így a szomszédos chunkok varrat nélkül illeszkednek.
  Kereszteződésben a függőleges út hídszalagja kihagyja a vízszintes híd területét (nincs z-fighting),
  a korlátok hézagot hagynak a keresztező útnak.
- D6 (ütközők): kör: fa (törzs 0,6), oszlop (0,28), siló (2,6), víztorony (láb 0,7), kút-oszlopok
  (2 × 0,35 a ±6 helyen); forgatott doboz: ház (3,5 × 4), csűr (5,5 × 8), kerítés (4,5 × 0,11),
  hídkorlát (fél-hossz × 0,15). Mind × `scale`. A bokor puha (nincs ütköző). A Three `rotation.y`
  konvencióját követi: világ = (lx·cosθ + lz·sinθ, −lx·sinθ + lz·cosθ).
- D7 (jármű): két kör a hossztengelyen, sugár = fél-szélesség, középpontok ±(fél-hossz − fél-szélesség);
  méretek a `vehicleDimensions(silhouette)`-ből (a `buildVehicle` is ezt használja).
- D8 (válasz): kitolás a behatolás normálisán (max. 3 iteráció); a sebesség × (1 − |cos α|), ahol α a
  haladási irány és a falnormális szöge → frontálisan 0, érintőlegesen megmarad (csúszás).
- D9 (elsodort/lerombolt tárgy): ma nincs ilyen. Ha a jövőben lesz, az ütköző ugyanabból az
  (x, z, kind) kulcsból számolt „eltávolítva” halmazzal szűrendő, mint a kirajzolás — a lerombolt tárgy
  nem ütközik, a törmelék-részecske sosem ütközik.
- D10 (szél): `stepVehicle` a `windPush`-t egység/s-ként kezeli (`× dt`), iránya `(sin θ, −cos θ)`, és nem
  hat, ha |sebesség| ≤ `STOPPED_SPEED` és |gáz| < 0,05 (tapadás tartja). A lap
  `windDriftUnits(force) = force × 0,5` (a #200-as 30-as szorzó / 60, vagyis a sodrás és a végsebesség
  eredeti aránya).
- D11 (bemenet): `blur` és `visibilitychange: hidden` minden billentyű- és touch-irányt elenged; a
  billentyű-leképezés a `controls.ts`-ben (`driveKeyFor`, `releaseDriveKeys`). Gamepad: NaN/Infinity
  tengely → 0; `createGamepadRestGate` egy padot csak az első semleges (holtsávon belüli) olvasás után
  enged vezetni.
- D12 (tesztkampó): `VITE_ENABLE_GAME_TEST_HOOKS=1` mellett `window.__websuliTornado`
  (`getPlayer`, `setPlayer`, `getPhase`) a böngészős próbához; élesben fordítási időben kiesik.

## 5. Edge case-ek
- Kereszteződés a folyózónában (0,0), (−300,−600), (300,600): mindkét út hídon, egy magasságon.
- A folyó hosszan az út mellett (x = 0, ±300): hosszú híd (viadukt), chunk-határokon átnyúlva.
- Térképszél: `clampToWorld` után is fut az ütközés; a chunk-lista a térképen kívül üres.
- dt nagy (tab visszatérés): az ütközés iterált, a kör-sugár (≥ 1,2) > egy képkocka elmozdulása
  (≤ 12 egység/s × 0,05 s).
- Gamepad `axes` NaN / hiányzó; pad nyugalmi kitéréssel.

## 6. Elfogadás (EARS)
- E1: Minden útvonal-mintapontra (2 egységenként a teljes térképen), ahol `roadFactor > 0,55`,
  `surfaceAt ≠ "water"`, és ahol `isWater` is igaz, ott `groundHeight − terrainHeight ≥ 2`.
- E2: `bridgeSpansInChunk` a 9 vízszintes metszet mindegyikét lefedi; az egymást követő chunkok spanjai
  a határon folytonosak; a függvény determinisztikus (két hívás azonos).
- E3: WHEN az autó frontálisan házba/fába hajt THEN a törzse nem hatol a kellékbe, sebessége ≈ 0.
  WHEN 30°-os szögben falhoz ér THEN a fal mentén halad tovább (sebesség > 0).
- E4: WHEN nincs bemenet és az autó áll THEN szélben (bármely irány, bármely erősség) 5 s alatt sem mozdul.
  WHEN az autó halad THEN a szélsodrás merőleges a tölcsér irányára (nem sugárirányú).
- E5: WHEN ablak-`blur` vagy `visibilitychange: hidden` THEN minden vezetési irány felenged.
- E6: WHEN a gamepad tengely NaN THEN 0; WHEN a pad nyugalmi `axes[1] = 1` THEN a kapun át 0 gáz.
- E7: Minden új teszt a régi kódon BUKIK (kimenettel igazolva), az újon zöld; meglévő teszt nem gyengül.
- E8: Valós böngészőben (Chrome, GPU) a régi kódon az input nélküli autó sodródik (mért elmozdulás), az
  újon nem; a híd és egy ütközés képernyőképen látszik asztali és mobil nézetben.

## 7. Érintett fájlok
- `source/client/src/lib/tornado/world.ts`, `drive.ts`, `controls.ts`, `gamepad.ts`, új `collision.ts`
- `source/client/src/tornado/buildMeshes.ts` (hídháló, `vehicleDimensions` használata)
- `source/client/src/pages/TornadoHunter200.tsx` (bekötés)
- Új tesztek: `source/tests/tornado-bridge.test.ts`, `tornado-collision.test.ts`,
  `tornado-wind-drift.test.ts`, `tornado-input-release.test.ts`
