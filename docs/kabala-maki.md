# A Websuli makija — a Websuli 3D kabalája (kísérlet)

**Állapot:** kísérlet a `kiserlet/kabala-maki` ágon; a játékokba és a honlapba NINCS bekötve. Terv:
[`docs/specs/2026-11-18-kabala-maki.md`](specs/2026-11-18-kabala-maki.md) (a második változat a 7. szakasz).

**Név (tulajdonosi döntés, 2026-11-18): „A Websuli makija”.** A figura gyűrűsfarkú maki (Lemur catta, Madagaszkár).

## Mi készült el (második változat: élethűbb gyűrűsfarkú maki)

- Felismerhető gyűrűsfarkú maki, kabalának stilizálva: fehér arc, a szem körül sötét, kifelé-lefelé nyúló folt, megnyúlt pofa
  fekete orral, sötétszürke „sapka” homlokcsúccsal, felálló, hegyesedő fehér fül, fehér has és mellkas, sötét kéz- és lábfej,
  a testnél hosszabb, 14 gyűrűs, fekete végű, kérdőjel-ívben magasra tartott farok. A szem a valóságosnál nagyobb, kerek,
  nyitott, csillogó; mosolyog. Fej : test magasság kb. 1 : 1,6.
- A test, a végtagok és a fej **egyetlen összefüggő háló** (nincs varrat a vállnál és a csípőnél); az arc mintája festett
  textúra (éles foltszélek), a farok gyűrűi élesek.
- A figura **teljes egészében szkriptből** jön létre (Blender, fej nélkül) — nincs kézzel rajzolt vagy letöltött elem.
- Képek: `docs/measurements/kabala-maki/01-elol.jpg` … `08-napozo.jpg` (a klipek a `06-tablo.jpg`-n), böngészős képernyőképek:
  `09-…` – `11-…`.
- A böngészőnek szánt fájl: `source/client/public/models/kabala/kabala-maki.<hash>.glb` (a pontos név és a számok a mellette
  lévő `kabala-maki.manifest.json`-ban).

## Hogyan mozgatjuk

A figurában „csontváz” van (25 csont: törzs, fej, két fül, karok, comb–lábszár–lábfej, nyolc farokcsont), és előre elkészített,
névvel ellátott mozdulatok („klipek”). A böngészőben a three.js (ez már most is a Websuli része) `AnimationMixer` nevű
lejátszója játssza le őket — a programnak csak annyit kell mondani: „most ezt a klipet”.

| Klip | Hossz | Mit csinál | Mikor játsszuk |
| --- | --- | --- | --- |
| `idle` | 2 mp, körbe ismételhető | lélegzik, a farka lassan ring | alapállapot: amikor a figura csak „ott van” |
| `wave` | 2 mp | integet (a kéz az arc mellett), mosolyog | köszönés: játék indulása, visszatérő tanuló, búcsú |
| `cheer` | 1,5 mp | örömében felugrik, nevet | jó válasz, szintlépés, jutalom |
| `sad` | 2,5 mp | lekonyul a füle és a farka, lefelé néz, aztán visszaáll | rossz válasz — kedvesen, nem ijesztően |
| `blink` | 1 mp | kettőt pislog | néhány másodpercenként magától, hogy „éljen” |
| `sunbathe` | 3 mp | leül, karját széttárja a nap felé, szemét behunyja, mosolyog, majd feláll | pihenő, várakozás, szünet, „szép munka” — a makik jellegzetes napozó póza |

Két „alakkulcs” (arckifejezés-csúszka) is van, ezek a csontoktól függetlenül állíthatók:

- `blink` — a szemhéj lecsukódik (0 = nyitva, 1 = csukva);
- `smile` — a száj nevetésre nyílik (0 = kis mosoly, 1 = nevet; −1 felé lefelé görbül, ezt használja a `sad`).

A klipek keverhetők: az `idle` alatt mehet a `blink`, a klipek között rövid átúsztatás van. Kipróbálható az előnézeti oldalon.

### Új mozdulat

1. A `source/scripts/blender/kabala-maki/maki_anim.py`-ban új póz-függvény és bejegyzés a `CLIPS`, `POSES`, `FRAMES` táblákba —
   a pózok egyszerű mondatok: „a fej 15 fokot bólint”, „a jobb kar erre mutat”. (A `sunbathe` így készült.)
2. Újragyártás (`build.py`), képek (`render.py`), az őr-teszt klipnév-listájának bővítése.
3. A böngészőben az új klip a nevével azonnal játszható.

### Beszéd, szájmozgás — mi kellene hozzá

Most a száj egyetlen csúszkával nyílik. Beszédhez:

- **Egyszerű (ajánlott első lépés):** a `smile` mellé egy `open` (szájnyitás) alakkulcs; a hang hangereje mozgatja. Pár óra munka.
- **Igényes:** 5–8 szájforma külön alakkulcsként, a felolvasó (TTS) időzítési adataiból vezérelve; ehhez a pofa alját át kell
  tervezni (valódi állkapocs), ez több napos munka.

## Mennyibe kerül a telefonon (BECSLÉS — nem mértük készüléken)

A számok a manifestből valók; a következtetés becslés.

- **Letöltés:** a GLB kb. 240 KB (Draco-tömörítve, benne az arc 512 px-es textúrája). A kibontáshoz a three.js Draco-dekódolója
  kell (a `three` csomag része); ez egyszeri, néhány száz KB.
- **Rajzolás:** kb. 26 400 háromszög, 5 rajzolási hívás, egy kis textúra. Egy mai középkategóriás telefonnak ez önmagában
  nem teher; a szűk keresztmetszet akkor jöhet, ha a figura egy már nehéz 3D-s jelenetbe kerül, vagy sok példány látszik.
- **Mozgatás:** 25 csont és 2 alakkulcs — elhanyagolható.
- **Könnyített változat:** ugyanabból a szkriptből a `SOFT_TRIS` cél-háromszögszám csökkentésével (pl. 10 000) készíthető.

## Újragyártás

```
# a Blender helye: BLENDER_BIN környezeti változó (vagy a PATH-on lévő „blender”)
"$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-maki/build.py     # GLB + manifest
"$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-maki/render.py    # bemutató képek
cd source && node --import tsx --test tests/kabala-model-budget-guard.test.ts            # méretkeret-őr
```

A gyártás megismételhető: ugyanaz a szkript ugyanazon a Blender-verzión bájtra azonos GLB-t ad (kétszeri futtatással ellenőrizve,
Blender 5.3.0, Windows x64 — a voxel-remesh és a decimálás is megismételhető volt). Más Blender-verzió vagy más
processzor-architektúra adhat eltérő bájtokat — ilyenkor a hash változik, a figura nem.

## Előnézet a böngészőben (CDN nélkül)

```
cd source && npm.cmd ci --ignore-scripts    # ha még nincs node_modules (C-38)
cd .. && node source/scripts/blender/kabala-maki/preview-server.mjs
# → http://localhost:4599/
```

Gombok a hat kliphez, csúszka a mosolyhoz, egérrel / ujjal körbeforgatható. Ellenőrizve a végleges GLB-vel: betölt, mind a
hat klip lejátszható, konzolhiba nincs (képernyőképek: `09-bongeszo-napozas.jpg`, `10-bongeszo-integetes.jpg`,
`11-bongeszo-alap.jpg`).

## Hogyan készül (röviden)

1. „Puha” alapformák (fej, pofa, fül, pofaszőr-tincsek, nyak, törzs, végtagok, faroktő) — mindegyiknek képletes színe és
   csontsúlya van.
2. Ezekből voxel-remesh → simítás → decimálás: egy összefüggő háló, varrat nélkül.
3. A szín és a súly a legközelebbi alapforma-pontokról kerül át az új hálóra (ezért determinisztikus, és nem kell a Blender
   hő-alapú automata súlyozása, amely ilyen hálón megbízhatatlan).
4. Az arc mintáját egy képlet festi 512 px-es textúrára (a fej közepéből vett irány szerint) — ettől élesek a foltszélek.
5. Pontos paraméteres részek: szem, orr, gyűrűs farok; külön kis háló az alakkulcsokhoz (szemhéj, pillaív, fénypont, száj).

## Fájlok

| Fájl | Szerep |
| --- | --- |
| `source/scripts/blender/kabala-maki/maki_model.py` | háló, színek, textúra, anyagok, csontváz, súlyok, alakkulcsok |
| `source/scripts/blender/kabala-maki/maki_anim.py` | a klipek pózai |
| `source/scripts/blender/kabala-maki/build.py` | export: GLB + manifest |
| `source/scripts/blender/kabala-maki/render.py` | bemutató képek |
| `source/scripts/blender/kabala-maki/preview-server.mjs` | helyi előnézeti kiszolgáló |
| `source/tests/kabala-model-budget-guard.test.ts` | őr-teszt: ≤ 600 KB, ≤ 30 000 háromszög, ≤ 6 anyag, ≤ 30 csont, ≤ 1 kép, 6 klip, 2 alakkulcs |

## Javító körök a képek alapján (2026-11-18)

**Első változat (chibi, alapformákból):** 1. kifakult kép, szögletes színhatárok → fény, sűrűbb háló; 2. rövid kar, „napszemüveg”
csukott szem, merev szomorú farok; 3. átütő fénypont; 4. üres szomorú tekintet; 5. finomító kör (kerek láb, pamacsok, pillaív).

**Második változat (élethűbb gyűrűsfarkú maki, összefüggő háló):**

1. Az első render: a váz jó, de a figura túl vékony („menyétszerű”), a fül tüskés fehér korona, a pofaszőr lefelé „csöpög”, az
   orr fölött második orrnak látszó sötét folt → teltebb törzs és végtagok, nagyobb fej, rendezett fül, kifelé álló tincsek,
   kis orrtájék.
2. A váll két oldalán „szárny” (a kar töve kilógott), a tabló apró, a szomorú és a napozó pózban eltűnt a farok, a napozó szem
   résnyire nyitva („sunyi”) → mélyebbről induló kar, közelebbi kamera, új farokpózok, teljesen behunyt szem.
3. Hátulról világos, gyűrött „gallér” a nyakon; a tarkó túl sötét → a fej jelzőszíne nem szivároghat a nyakra (szín csak azonos
   címkéjű forrásból), a sötét sapka csak a fejtetőn.
4. A mellkas pamacsa „izmos mellkasnak” hatott → laposabb, szélesebb mellkas-pamacs.

## Ismert hiányok (őszintén)

- **Nem kézzel szobrászott minőség.** Az összefüggő háló organikus, de a felszíne helyenként enyhén egyenetlen (a törzs elején
  és a tarkón látszanak az összeolvasztott formák lágy dudorai); egy 3D-művész kézi simítása / retopológiája szebb volna.
- **A bolyhosság forma, nem szőr.** A pofa két oldalán hullámos, tincses a körvonal, a farok gyűrűnként domborodik — valódi
  szőrszálak nincsenek (a webes keret miatt nem is cél), közelről ez „gyurma” jellegű.
- **Kéz és láb:** egyujjas kesztyű-szerű, az ujj-dudorok a simítás után alig látszanak.
- **A hajlások egyszerűek:** könyök és térd van, de a súlyozás képletes — szélső pózban (pl. a napozó ülésnél a csípőnél) a háló
  kissé megtörik.
- **A szomorú póz farka** oldalra-lefelé hajlik; kifejező, de nem anatómiai pontosságú.
- A three.js-ben a kép nem azonos a Blender-renderrel (más fények); az élő megjelenéshez a játék fényeit hangolni kell.
- Készüléken (telefonon) nincs mérve; a teljesítmény-rész becslés.
