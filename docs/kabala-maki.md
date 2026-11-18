# A Websuli makija — a Websuli 3D kabalája (kísérlet)

**Állapot:** kísérlet a `kiserlet/kabala-maki` ágon; a játékokba és a honlapba NINCS bekötve. Terv:
[`docs/specs/2026-11-18-kabala-maki.md`](specs/2026-11-18-kabala-maki.md).

**Név (tulajdonosi döntés, 2026-11-18): „A Websuli makija”.** A külső a gyűrűsfarkú makié; a „borneói” jelzőt nem használjuk.

## Mi készült el

- Egy eredeti, „chibi” arányú maki-figura: nagy csillogó borostyán szem, szürke bunda, krémszínű pofa és has, rózsaszín pír,
  kis kerek fülek, apró orr, mosoly, hosszú gyűrűs-csíkos farok.
- A figura **teljes egészében szkriptből** jön létre (Blender, fej nélkül) — nincs kézzel rajzolt vagy letöltött elem.
  Ha változtatni akarunk rajta (szín, arány, új mozdulat), a szkriptet írjuk át, és újragyártjuk.
- Képek: `docs/measurements/kabala-maki/01-elol.jpg` … `07-haromnegyed-farok.jpg`, a mozdulatok a `06-tablo.jpg`-n.
- A böngészőnek szánt fájl: `source/client/public/models/kabala/kabala-maki.<hash>.glb` (a pontos név és a számok a mellette lévő
  `kabala-maki.manifest.json`-ban).

## Hogyan mozgatjuk

A figurában „csontváz” van (22 csont: törzs, fej, két fül, karok, lábak, hét farokcsont), és előre elkészített, névvel ellátott
mozdulatok („klipek”). A böngészőben a three.js (ez már most is a Websuli része) `AnimationMixer` nevű lejátszója játssza le őket —
a programnak csak annyit kell mondani: „most ezt a klipet”.

| Klip | Hossz | Mit csinál | Mikor játsszuk |
| --- | --- | --- | --- |
| `idle` | 2 mp, körbe ismételhető | lélegzik, a farka lassan ring | alapállapot: amikor a figura csak „ott van” |
| `wave` | 2 mp | integet, mosolyog | köszönés: játék indulása, visszatérő tanuló, búcsú |
| `cheer` | 1,5 mp | örömében felugrik, nevet | jó válasz, szintlépés, jutalom |
| `sad` | 2,5 mp | lekonyul a füle és a farka, lefelé néz, aztán visszaáll | rossz válasz — kedvesen, nem ijesztően |
| `blink` | 1 mp | kettőt pislog | néhány másodpercenként magától, hogy „éljen” |

Két „alakkulcs” (arckifejezés-csúszka) is van, ezek a csontoktól függetlenül állíthatók 0 és 1 között:

- `blink` — a szemhéj lecsukódik (0 = nyitva, 1 = csukva);
- `smile` — a száj nevetésre nyílik (0 = kis mosoly, 1 = nevet; −1 felé lefelé görbül, ezt használja a `sad`).

A klipek keverhetők: az `idle` alatt mehet a `blink`, a klipek között fél másodperces átúsztatás van. Kipróbálható az
előnézeti oldalon (lent).

### Új mozdulat

1. A `source/scripts/blender/kabala-maki/maki_anim.py`-ban új póz-függvény (pl. `think_pose`) és bejegyzés a `CLIPS`, `POSES`,
   `FRAMES` táblákba — a pózok egyszerű mondatok: „a fej 15 fokot bólint”, „a jobb kar erre mutat”.
2. Újragyártás (`build.py`), képek (`render.py`), az őr-teszt klipnév-listájának bővítése.
3. A böngészőben az új klip a nevével azonnal játszható.

### Beszéd, szájmozgás — mi kellene hozzá

Most a száj egyetlen csúszkával nyílik. Beszédhez:

- **Egyszerű (ajánlott első lépés):** a `smile` mellé egy `open` (szájnyitás) alakkulcs; a hang hangereje mozgatja (hangosabb →
  nyitottabb). Ez pár óra munka, és kisiskolásoknak már „beszélő” figurát ad.
- **Igényes:** 5–8 szájforma (A, E, O, U, M-B-P, F-V …) külön alakkulcsként, és a felolvasó (TTS) időzítési adataiból vezérelve.
  Ehhez a pofát át kell tervezni, hogy a száj ne csak egy lap legyen a felszínen — ez több napos munka.

## Mennyibe kerül a telefonon (BECSLÉS — nem mértük készüléken)

A számok a manifestből valók; a következtetés becslés.

- **Letöltés:** a GLB kb. 100 KB (Draco-tömörítve; a pontos szám a manifestben). A kibontáshoz a three.js Draco-dekódolója kell (a `three` csomag része,
  külön letöltés nélkül kiszolgálható); ez egyszeri, néhány száz KB.
- **Rajzolás:** kb. 19 000 háromszög, 4 rajzolási hívás, textúra nélkül. Egy mai középkategóriás telefon ennél nagyságrenddel
  többet rajzol 60 képkocka/mp mellett; a figura önmagában nem lehet szűk keresztmetszet.
- **Mozgatás:** 22 csont és 2 alakkulcs — elhanyagolható terhelés.
- **Memória:** néhány MB (nincs textúra).
- **Ahol vigyázni kell:** ha egyszerre sok példány látszik, vagy ha a figura egy már amúgy is nehéz 3D-s játék (pl. a Szökőár)
  jelenetébe kerül — ott mérni kell. Régi, gyenge telefonra készíthető egy 5–6 ezer háromszöges változat ugyanabból a szkriptből
  (a gömbök felbontásának csökkentésével).

## Újragyártás

```
# a Blender helye: BLENDER_BIN környezeti változó (vagy a PATH-on lévő „blender”)
"$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-maki/build.py     # GLB + manifest
"$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-maki/render.py    # bemutató képek
cd source && node --import tsx --test tests/kabala-model-budget-guard.test.ts            # méretkeret-őr
```

A gyártás megismételhető: ugyanaz a szkript ugyanazon a Blender-verzión bájtra azonos GLB-t ad (kétszeri futtatással ellenőrizve,
Blender 5.3.0, Windows x64). Más Blender-verzió vagy más processzor-architektúra adhat eltérő bájtokat (más exportáló, más
lebegőpontos kerekítés) — ilyenkor a hash változik, a figura nem.

## Előnézet a böngészőben (CDN nélkül)

```
cd source && npm.cmd ci          # ha még nincs node_modules
cd .. && node source/scripts/blender/kabala-maki/preview-server.mjs
# → http://localhost:4599/
```

Gombok a klipekhez, csúszka a mosolyhoz, egérrel / ujjal körbeforgatható.

## Fájlok

| Fájl | Szerep |
| --- | --- |
| `source/scripts/blender/kabala-maki/maki_model.py` | háló, színek, anyagok, csontváz, súlyok, alakkulcsok |
| `source/scripts/blender/kabala-maki/maki_anim.py` | a klipek pózai |
| `source/scripts/blender/kabala-maki/build.py` | export: GLB + manifest |
| `source/scripts/blender/kabala-maki/render.py` | bemutató képek |
| `source/scripts/blender/kabala-maki/preview-server.mjs` | helyi előnézeti kiszolgáló |
| `source/tests/kabala-model-budget-guard.test.ts` | őr-teszt: ≤ 400 KB, ≤ 20 000 háromszög, ≤ 6 anyag, 5 klip, 2 alakkulcs |

## Javító körök a képek alapján (2026-11-18)

1. Túl világos, kifakult kép; szögletes színhatárok a fejen → gyengébb fény, sűrűbb fejháló, puhább színátmenet, kerek „dobogó”.
2. Az integetésnél és az ugrásnál a rövid kar a nagy fej mögé került; a csukott szem „napszemüvegnek” látszott; a szomorú farok
   mereven állt → hosszabb kar, oldalra-előre emelt kéz, bundaszínű szemhéj, a farok a földre ereszkedik, lefelé görbülő száj.
3. Pislogáskor a fénypont átütött a szemhéjon → a fénypontok az alakkulcsos hálóba kerültek, és csukáskor a szembe süllyednek.
4. A szomorú póznál eltűnt a csillogás (üres tekintet) → kevesebb szemhéj-zárás, a fénypont megmarad; halvány pillasor.

5. **Finomító kör a tulajdonos kérésére:** gömbölyded comb és lábujjas talp (a szögletességet az egyenes henger + éles árnyék
   okozta, nem hálóhiba); kerekded, egymásba olvadó pofaszőr-pamacsok; hosszabb kar vállgömbbel és ujj-jelzéses kézfejjel;
   külön pillaív, amely csukott szemnél is jól látszik; az arc felé sűrített fejháló (sima folt-szélek); a farok a hát
   színéből, puha dudorból nő ki. Közben két zsákutca: a túl hosszú, széttárt kar „karmos” kézzel, és a hegyes, tüskeszerű
   pamacs — mindkettő a képek alapján visszavonva.

## Ismert hiányok (őszintén)

- A test részei továbbra is egymásba tolt alapformák, nem egyetlen összefüggő háló: a vállgömb és a gömbölyded comb puhítja
  a csatlakozást, de közelről a varrat látszik, és erős hajlításnál a részek elcsúszhatnak egymáson.
- A pofaszőr most puha, de oldalnézetből „gyöngysor”-szerű; valódi szőrhatás nincs (csak forma és szín).
- Térd- és könyökhajlítás nincs kidolgozva, a figura nem tud járni (ilyen klip nincs).
- Az integetésnél a kéz az arc mellé, szemmagasságba ér — a fej FÖLÉ nem: ahhoz a chibi arányt (nagy fej) kellene feladni.
- A three.js-ben a kép nem azonos a Blender-renderrel (más fények); az élő megjelenéshez a játék fényeit hangolni kell.
- Készüléken (telefonon) nincs mérve; a teljesítmény-rész becslés.
- A névkérdés nyitott: a külső a gyűrűsfarkú makié (Madagaszkár), nem borneói állaté — a tulajdonos dönt a névről.
