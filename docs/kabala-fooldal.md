# A Websuli makija a főoldalon — animált ajánló

**Állapot:** elkészült a `feat/kabala-fooldal` ágon, a `HOME_MASCOT` kapcsoló mögött (alapból KI — élesben nincs bekapcsolva).
Terv: [`docs/specs/2026-11-18-kabala-fooldal.md`](specs/2026-11-18-kabala-fooldal.md) · a figura: [`docs/kabala-maki.md`](kabala-maki.md).

## Mit csinál

A főoldalon, az üdvözlő kártya és az évfolyamszűrő között egy „A maki ajánlja” sáv áll. A maki integet, a három legújabb
tananyag sorához szökken, rájuk mutat, a szövegbuborékban a tananyag címével ajánlja őket; a makira koppintva a következő ajánlat
jön, a sorra koppintva a tananyag megnyílik. Első látogatáskor egyszer végigvezet a hármon, utána (és visszatérő látogatónál)
magától nem mozdul el. Lecsendesíthető (áll) és bezárható (egy gombbá zsugorodik); az eszköz megjegyzi.

A „legújabb három”: a tanuló évfolyamának három legújabb tananyaga, ha az évfolyam ismert és van ott anyag; különben (és adminnál)
az összes tananyag három legújabbja — a főoldal meglévő listájából, új kérés nélkül.

## Bekapcsolás

Szerver-környezeti változó: `HOME_MASCOT=on` (minden más érték: KI). Bekapcsolva a szerver az `index.html` fejébe egy
`<meta name="websuli-home-mascot" content="on">` sort tesz; a kliens ezt olvassa (nincs külön kérés). Visszavonás: a változó törlése.

## Technika: képkocka-lap, nincs 3D-motor a főoldalon

A figura mozdulatai a Blenderből előre renderelt, átlátszó hátterű képkockák egyetlen WebP-lapon; a böngésző a lapot egy
cellányi ablak mögött lépteti (`transform`, Web Animations — a kompozitoron fut, képkockánkénti JS nincs). A helyváltoztatást és
az ugrás ívét külön `transform`-animáció adja. A választás mérésen alapul (a terv 3. szakasza): az élő 3D (three.js + GLB +
dekóder) ≈ 485–540 KB lenne és folyamatos WebGL-rajzolást hozna a főoldalra; a képkocka-lap a 350 KB-os keret alatt marad.

## Újragyártás a (végleges) modellből — egy parancs

```
# a Blender helye: BLENDER_BIN környezeti változó (vagy a PATH-on lévő „blender”)
node source/scripts/blender/kabala-fooldal/build.mjs
cd source && node --import tsx --test tests/home-mascot-assets-guard.test.ts     # őr: méret, rács, klipek
```

A szkript a figura AKTUÁLIS modelljét (`source/scripts/blender/kabala-maki/maki_model.py`, `maki_anim.py`) importálja, ≈ 25 mp
alatt rendereli a 44 képkockát, közös kivágást számol, és kiírja:

- `source/client/public/mascot/kabala-fooldal.<hash>.webp` — a lap,
- `source/client/public/mascot/kabala-fooldal-allo.<hash>.webp` — álló kép (csökkentett mozgás, adatkímélő mód, csendesítés, betöltés előtt),
- `source/client/src/mascot/home-mascot.manifest.json` — cella, oszlopok, klipek (képkockák, sebesség, ismétlődés, emelkedés), fájlnevek.

A felület mindent a manifestből olvas (fájlnév, rács, klipek) — a kódban nincs beégetve. A szkript hibával megáll, ha a figura a
renderelt kép szélét éri (pl. még hosszabb farok), vagy ha a képek túllépik a 300 KB-ot. Ha a figura aránya 3%-nál jobban
változik, az őr-teszt szól, hogy a `home-mascot.css` `--hm-w` arányát igazítani kell. Egyéb kapcsolók: `--keep-frames <mappa>`
(a PNG-k megtartása), `--frames <mappa>` (újracsomagolás Blender nélkül), `--contact <fájl.jpg>` (áttekintő kép).

Mozdulatok: `idle` (8 képkocka, ismétlődik), `blink` (3), `wave` (12), `cheer` (9), `point-in` (3), `point` (4, ismétlődik),
`hop` (5). Az `idle`, `wave`, `cheer` a figura gyári klipjeiből mintavételez; a `point`, `hop`, `blink` ennek a munkának a saját
póza a `home_frames.py`-ban (a gyári csontnevekre építve). Balra mutatás: ugyanaz a képsor CSS-tükrözéssel készíthető; a mostani
elrendezés csak a jobbra mutatást használja.

## Fájlok

| Fájl | Szerep |
| --- | --- |
| `source/scripts/blender/kabala-fooldal/home_frames.py` | képkockák renderelése a modellből (Blender, fej nélkül) |
| `source/scripts/blender/kabala-fooldal/build.mjs` | az egy parancs: Blender → kivágás → lap → WebP → manifest |
| `source/client/public/mascot/*.webp` | a gyártott lap és az álló kép |
| `source/client/src/mascot/home-mascot.manifest.json` | a gyártott manifest |
| `source/client/src/lib/home-mascot.ts` | a fő darabba kerülő logika: kapcsoló, a három legújabb, beállítás, lefoglalt magasság |
| `source/client/src/components/HomeMascotSlot.tsx` | a hely lefoglalása, lusta betöltés, a bezárt állapot gombja |
| `source/client/src/mascot/HomeMascot.tsx`, `home-mascot.css` | a sáv tartalma (lusta darab) |
| `source/client/src/mascot/mascot-script.ts` | feliratok kódszótára, mondatválasztás, állapotgép |
| `source/client/src/mascot/sprite-player.ts` | képkocka-lap lejátszó (Web Animations) |
| `source/server/lib/home-flags.ts`, `source/server/vite.ts` | a `HOME_MASCOT` kapcsoló és a `/mascot` kiszolgálása |
| `source/client/src/components/UserFileList.tsx`, `WelcomeCard.tsx` | a beszúrási pont; látható makinál az üdvözlő kártya hármasa elmarad |
| `source/tests/home-mascot*.test.ts`, `home-mascot.spec.ts` | egység-, őr- és böngészőtesztek |

MÉRÉSEK_HELYE
