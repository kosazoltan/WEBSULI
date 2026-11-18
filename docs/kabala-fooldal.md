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

## Mérések (2026-11-18, ez a munkafa; asztali Chrome a Playwright alatt — valódi telefonon NEM mértük)

### Eszközök

| Eszköz | Méret | Megjegyzés |
| --- | --- | --- |
| képkocka-lap (`kabala-fooldal.b1fd2cd8.webp`) | 240 222 B | 44 képkocka, 130×216 px-es cella, 1040×1296 px; kibontva ≈ 5,1 MiB |
| álló kép (`kabala-fooldal-allo.23544f4a.webp`) | 8 220 B | 130×216 px |
| lusta JS-darab (`HomeMascot-*.js`) | 11 302 B (gzip 4 678 B) | megjelenítő + forgatókönyv + lejátszó + manifest |
| lusta CSS (`HomeMascot-*.css`) | 3 067 B (gzip 1 191 B) | |
| **átvitt összesen (böngészőben mérve)** | **262 836 B (≈ 256,7 KiB)** | keret: ≤ 350 KB — teljesül; a 250 KB-os CÉL fölött van ≈ 6,7 KiB-tal (lásd a terv 10. szakaszának 1. kérdését) |

A gyártás megismételhető: háromszori futtatás ugyanazt a hash-t adta (Blender 5.3.0, Windows x64).

### A főoldal csomagja előtte / utána (`npx vite build`)

| Darab | Előtte | Utána | Különbség |
| --- | --- | --- | --- |
| `main-*.js` | 340 106 B (gzip 116 556) | 343 586 B (gzip 117 714) | +3 480 B (gzip +1 158 B) |
| `main-*.css` | 210 673 B (gzip 36 812) | 210 811 B (gzip 36 848) | +138 B (gzip +36 B) |

A three.js (`three.module-*.js`, 732 828 B, gzip 189 321 B) a főoldalra továbbra sem töltődik be.

### Hálózati kérések a főoldalon (390×844, névtelen látogató, a teszt adataival)

| | Kikapcsolva | Bekapcsolva |
| --- | --- | --- |
| összes kérés | 25 | 31 (+4 kabala-eszköz: lusta JS, lusta CSS, álló kép, lap; +2 további kérés — UNVERIFIED: vélhetően az ajánlott sorok bélyegképei, tételesen nem ellenőrizve) |
| adat-kérés (`/api/…`, bélyegképek nélkül) | 11 | 11 |

Az adat-kérések (API) száma bekapcsolva sem nő: a kabala a meglévő `/api/html-files` listából dolgozik. Kikapcsolt kapcsolónál a
`main` DOM-ja bájtra azonos a bekapcsolt állapot DOM-jával a sáv eltávolítása után (böngészőteszt, K1).

### Mozgás és elrendezés

- **Képkockák 4× lassított CPU-n** (a mérce a tervé: egyetlen 3 mp-es mérés, ≥ 50 képkocka/mp és nincs 50 ms-nál hosszabb képkocka;
  a korábbi „három mérésből a legjobb” változatot az orkesztrátor 2026-11-18-án mérce-gyengítésként elutasította, a teszt visszaállt;
  a mérés nyugodt gépen futott — legfeljebb 1 idegen e2e-konténer mellett) (3 mp-es mérés a lapon belül; mutatás → koppintás → szökkenés → mutatás):
  - végleges változat, nyugodt gépen, három egymást követő mérés: 60,2 / 60,2 / 60,2 képkocka/mp, a leghosszabb képkocka
    17,3 / 16,9 / 17,0 ms; ugyanez erősen terhelt gépen (más ügynökök párhuzamos buildjei mellett): 59,9 / 52,2 / 59,9
    képkocka/mp, a leghosszabb képkocka 61,0 / 344,8 / 33,2 ms (a 344,8 ms-os a koppintás ELŐTT, 114 ms-nál volt — külső terhelés);
  - az optimalizálás ELŐTT (8 mérés): 57,7–62,0 képkocka/mp, a koppintás képkockája 36–54 ms (4 mérésben 50 ms fölött) — ezért a
    koppintás frissítése szeletelt (`startTransition`), a mozdulat a következő képkockában indul, és nincs kényszerített elrendezés;
  - köztes változat, erősen terhelt gépen (8 mérés): 55,9–64,3 képkocka/mp, a leghosszabb képkocka 16,9–50,1 ms.
- **Elrendezés-ugrás (CLS):** kikapcsolva 0,0091, bekapcsolva 0,0004 (egy-egy mérés; a különbség mérési zaj — a keret: bekapcsolva ≤ kikapcsolva + 0,005). A sáv magassága a megjelenéstől végig rögzített (324 / 336 px három tananyagnál).
- **Kontraszt a buborékban:** 14,63:1 (`#1e293b` fehér alapon; a teszt a számított színekből méri).
- **Érintőcélok:** telefonon a sorok 44 px, ≥ 640 px-en 68 px magasak; gombok 44 × 44 px; a maki telefonon 66 × 110 px.

### Mutációs ellenpróbák (mindegyiknél a megnevezett teszt elbukott, visszaállítás után zöld)

| Mutáció | Elbukó teszt |
| --- | --- |
| a kapcsoló mindig bekapcsolva (`homeMascotEnabled` → `true`) | K1 (a kikapcsolt lapon megjelent a sáv) |
| a csökkentett mozgás / adatkímélő mód figyelmen kívül hagyva | K10 mindkét esete |
| a rögzített magasság osztálya eltávolítva | K4/K8 mindhárom képernyőméreten, K3/K14, K8 (CLS) |
| a `visibilitychange` figyelmen kívül hagyva | K11 |
| a lap 70 KB-tal megnövelve (manifesttel együtt) | őr-teszt K6: „320122 B > 307200 B” |
| a cella 320 px-re növelve a gyártóban | a gyártó megáll: „A képek túllépik a keretet: 383110 B > 307200 B” |

## Őszinte értékelés a képernyőképek alapján

Képek: `docs/measurements/kabala-fooldal/` (360×640, 390×844, 1366×768: integet, mutat az 1–3. sorra, ugrik, pihen; csendesítve,
bezárva, csökkentett mozgás, adatkímélő mód, hosszú cím, egy tananyag; `kepsor-1…7`: a szökkenés egymást követő pillanatai).

- **Cuki:** igen — a nagy szemű, gyűrűs farkú figura az új modellel jól felismerhető; az integetés és az örömugrás (két kar a
  magasban) a legjobb mozdulat.
- **Látványos:** mérsékelten. A szökkenés sorról sorra és az ugrás íve sima; a testmozgás 4–12 képkocka/mp-es, „rajzfilmes”. A
  mutatás visszafogott: a mutató kar a farok előtt van, telefonon kicsi — ez a leggyengébb pont. A pislogás csukott szeme a
  modellen sötét foltként jelenik meg (a figura gyári alakkulcsa), 1/12 mp-ig látszik.
- **Nem zavaró, nem takar:** a sáv a dokumentumfolyamban áll, semmi fölé nem úszik; a teszt minden sor és gomb közepén ellenőrzi,
  hogy a saját eleme van felül. 360×640-en a sáv 324 px magas (a képernyő fele) — névtelen látogatónál ennyivel lejjebb kezdődik a
  lista; ismert névnél az üdvözlő kártya hármasa kiesik, így a különbség kicsi.
- **Ismert hiányok:** valódi telefonon nincs mérve; a balra mutatás (tükrözés) megvan, de a mostani elrendezés nem használja; a
  figura a sötét háttéren lágy fényudvart kap, hogy a fekete farokgyűrűk látsszanak — ez ízlés kérdése.
