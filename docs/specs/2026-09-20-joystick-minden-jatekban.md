# Egységes, köralakú joystick-vezérlés minden irányvezérléses játékban (2026-09-20)

## Kérés
„Mindegyik vezérelhető játék vezérlését állítsd át az Asteroidban kialakított, köralakú,
joystick-szerű vezérlésre.” Mellékelve képernyőkép az Aszteroida-játékról: bal alul a köralakú
tárcsa, jobb alul a nagy akciógomb.

## Kiindulás (felderítve, fájl:sor hivatkozásokkal)
Hét játék van (`client/src/pages/`), ebből **négynek van irányvezérlése**:

| Játék | Mozgás | Mostani érintős vezérlés |
| --- | --- | --- |
| `SpaceAsteroidQuiz.tsx` | hajó, 8 irány | **már joystick** (`:2358`) + Tűz gomb |
| `TornadoHunter200.tsx` | jármű | `◀`/`▶` kormánygomb (`:1974`) + Gáz/Fék/⚓/Cam pedál (`:1980`) |
| `BlockCraftQuiz.tsx` | FPS-mozgás | négy külön gomb: Balra/Előre/Hátra/Jobbra (`:2385`) + Ugrás |
| `TsunamiEscapeEnglish.tsx` | futó karakter | Balra/Sprint/Jobbra gomb (`:1562`) |

Irányvezérlés NINCS (nem érinti a feladat): `WordLadderHuEn.tsx`, `SpeedQuizMath.tsx`,
`BrainRotSteal.tsx` — ezek csak válaszgombosak.

## Cél
A három még gombos játék irányvezérlése ugyanarra a köralakú tárcsára álljon át, amit az Aszteroida
használ (`client/src/game-engine/VirtualJoystick.tsx`), a meglévő minta szerint:
`joystickToDirections(v)` kimenete közvetlenül a játék meglévő irány-referenciájába megy, így a
játékok fizikáját NEM kell átírni.

## Nem cél
- A billentyűzetes és gamepad-vezérlés bármilyen módosítása (érintetlen marad).
- A játékok fizikája, sebessége, nehézsége.
- A nem irányjellegű akciógombok megszüntetése (Ugrás, Bányász, Lerak, ⚓, Cam, Sprint, Tűz) —
  ezek maradnak `HoldButton`/gomb, csak a helyük igazodik a tárcsához.
- A látványvilág átszabása; a tárca a meglévő komponens, változatlan kinézettel.

## Megvalósítás
Egységes elrendezés minden érintős játékban (az Aszteroida mintája): **bal oldalon a tárcsa, jobb
oldalon az akciógombok**, egy `touch-action: none` burkolóban.

1. **TornadoHunter200** — a `steer` blokk (`◀`/`▶`) helyére tárcsa kerül, és a tárca a **gázt és a
   féket is** adja (`fwd`/`back`), mert azok is irányok. A pedálsorban csak a nem irányjellegű
   gombok maradnak: `⚓` és `Cam`. A balkezes elrendezés (`leftHanded`) megmarad: tárcsa és
   akciógombok helye cserélhető.
2. **BlockCraftQuiz** — a négy irány-gomb helyére tárcsa; az `Ugrás`, `Bányász`, `Lerak` gombok
   maradnak. A vászon `look`-húzása (nézelődés) változatlan.
3. **TsunamiEscapeEnglish** — a `Balra`/`Jobbra` gomb helyére tárcsa (`left`/`right`). A `sprint`
   SZÁNDÉKOSAN külön, kerek gomb marad: ha a tárcsa is állítaná, a tárcsa felengedése kikapcsolná a
   gombbal tartott sprintet — az ütközés több kárt okozna, mint amennyit a megspórolt gomb érne.

Az érintős vezérlés láthatósága játékonként VÁLTOZATLAN: ahol eddig `useCoarsePointer()` mögött volt
(Aszteroida, BlockCraft), ott marad; ahol mindig látszott (Tornado, Tsunami), ott továbbra is látszik.
A tárcsa egérrel is működik (pointer-események), tehát ez nem von el funkciót.

Közös szabály (a meglévő `game-touch-controls` szerződésből): pointer capture, `pointerleave`
NÉLKÜL, `touch-action: none`, kijelölés-tiltás. Ezeket a `VirtualJoystick` és a `HoldButton` már hozza.

## Elfogadás
- WHEN bármelyik irányvezérléses játék érintőképernyőn fut THEN a lapon pontosan egy
  `data-testid="virtual-joystick"` tárcsa van, és nincs külön irány-gomb (`Balra`/`Jobbra`/`Előre`/
  `Hátra`/`◀`/`▶`/`Gáz`/`Fék`).
- WHEN a tárcsát elengedik THEN a játék iránya nullázódik (a komponens garantálja).
- WHEN a játékot billentyűzettel vagy gamepaddel vezetik THEN a viselkedés változatlan (a tárcsa
  csak a meglévő irány-referenciákat állítja, nem vesz el kezelőt).
- A `joystickToDirections` küszöbe és a holtsáv közös; játékonként nem hangoljuk.
- Teszt: `tests/game-touch-controls.test.ts` — az eddig csak az Aszteroidára vonatkozó joystick-
  ellenőrzés MIND A NÉGY irányvezérléses játékra kiterjed (bekötés + a régi irány-gombok hiánya).

## Spec-változás a meglévő teszten
A `tests/tornado-mobile-controls.test.ts` eddig a `Gáz`/`Fék`/`◀`/`▶` gombok MEGLÉTÉT követelte. Ez
a tulajdonosi utasítás nyomán dokumentált spec-változás, ezért a teszt az ÚJ szerződésre íródott át —
nem gyengült: most a tárcsa meglétét, mind a négy irány bekötését ÉS a régi gombok hiányát is kéri.

## Verifikáció (mérve)
Kapuk: `tsc`, `check:test`, `lint` (0 figyelmeztetés), `npm test` **1365/1365**, `vite build`.
Fejlesztői kiszolgálón, 375×812 mobil nézetben, játékot elindítva:

| Játék | Tárcsa | Régi irány-gomb | Megmaradt gombok |
| --- | --- | --- | --- |
| Tsunami | ✅ 104×104 | 0 | Sprint |
| BlockCraft | ✅ | 0 | Ugrás, Bányász, Lerak |
| Tornado | ✅ „Vezetés", bal alul (24 px) | 0 | ⚓, Cam |

Képernyőkép igazolja: bal alul a köralakú tárcsa, jobb alul a kerek akciógomb — ugyanaz az
elrendezés, mint az Aszteroidában.
