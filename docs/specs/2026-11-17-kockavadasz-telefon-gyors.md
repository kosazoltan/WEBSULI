# Spec: Kockavadász telefonon — gyors, main-alapú szelet (olcsóbb megjelenítés a telefonos szinteken + `?perf=1` panel)

> Dátum: 2026-11-17 · Szerző: Claude Code (alügynök, orkesztrátori megbízásra a tulajdonos panasza után) · Állapot: JÓVÁHAGYVA
> (orkesztrátori döntés 2026-11-17: nem várunk a tulajdonos fotóira; a fotók az ellenőrzést szolgálják).
> Végrehajtás: `docs/specs/2026-11-17-kockavadasz-telefon-gyors-vegrehajtas.md`
> Alap: `docs/specs/2026-11-17-kockavadasz-telefon.md` (eltérés-tábla E1–E17, mérések M1 / M2 — ebbe az ágba áthozva a
> `perf/kockavadasz-telefon` ágról, a hozzá tartozó végrehajtási fájllal együtt).
> Ág: `perf/kockavadasz-telefon-gyors` a friss `origin/main`-ről (`b4b84db6`) — az ÉLESBEN futó (a #484 előtti) Kockavadászra.

## 1. Cél

A tulajdonos telefonján (Honor Magic V6, kihajtva, „medium” szint) a Kockavadász az egyetlen játék, amely árnyéktérképet, teljes
képernyős PBR-anyagot és 8× anizotróp szűrést futtat (alapterv E1, E2, E6), és képkockánként elrendezést olvas (E13). Ez a szelet a
telefonos szinteken (low / medium) ezeket olcsóbbra cseréli úgy, hogy a kép szép maradjon és a felbontás alapértéke NE csökkenjen;
a high szint (asztali gép) változatlan. Emellett a mainre kerül a `?perf=1` mérőpanel, hogy a tulajdonos a saját telefonján
ellenőrizhesse az eredményt.

## 2. NEM cél

- A high szint bármilyen változása (árnyéktérkép, PBR, 8× anizotrópia marad).
- A felbontás alapértékének csökkentése (a szint dpr-plafonja marad: medium 1,5).
- A játékóra kiemelése a lapból, a darabolt (chunk) háló — a #484-alapú ágon maradnak (`perf/kockavadasz-telefon`).
- A kérdésbank-szűrés (#491), a játékszabály, a HUD, a közös `game-engine/three-look/*` fájlok.
- Annak ígérete, hogy „megoldja a telefonon”: asztali GPU-n mérünk; a telefonon a tulajdonos panel-fotója dönt.

## 3. Változások (mind a `source/client/src/pages/BlockCraftQuiz.tsx` jelenet-effektjében, `lite = tier !== "high"` mögött)

| # | Változás | Low / medium (telefon) | High |
|---|---|---|---|
| a | **Árnyéktérkép ki, helyette sütött blokk-árnyék:** `applyRendererLook(…, { shadows: tier === "high" })`; a világ építésekor minden látható kocka kap egy példányszínt (`InstancedMesh.setColorAt`): a nap irányában (≈ 45°, a −z felé) a rácson lépkedve ha tömör blokk takarja → sötétebb, hűvösebb árnyalat; ha csak lomb takarja → enyhébb („lombszűrte”) árnyék. A fák, dombok, barlangszájak árnyéka így megmarad, képpontonkénti mintavétel nélkül. A víz nem kap árnyalatot. | sütött árnyék | árnyéktérkép, változatlan |
| b | **Olcsó anyag:** a blokkok `MeshLambertMaterial` (ugyanaz a textúra, ugyanaz az önvilágítás és az „AO” árnyalás az `onBeforeCompile`-ban); a víz `MeshPhongMaterial` (megmarad a csillanás) | Lambert / Phong | `MeshStandardMaterial`, változatlan |
| c | **Anizotrópia** | medium: 8× → 2×; low: 1× (eddig is) | 8×, változatlan |
| d | **Lomb keverés nélkül:** a lomb textúrája teljesen fedő (nincs átlátszó képpontja — `mcBlockPatternBuild`), ezért a 93 %-os áttetszőség elhagyásával átlátszatlan anyag lesz, `alphaTest` (`discard`) nélkül | átlátszatlan | `transparent`, változatlan |
| e | **`ResizeObserver`** a képkockánkénti `clientWidth / clientHeight` olvasás helyett (minden szinten; a kimenet azonos): a méret csak a megfigyelő / `resize` jelzésére számolódik újra | igen | igen |
| f | **Képpontszám-plafon csak „könnyű grafika” módban:** a Szökőár mintájára (`TsunamiEscapeEnglish.tsx` `isLowEnd`) az ESZKÖZ jelei döntenek, egyszer, betöltéskor: low szint, csökkentett mozgás kérése vagy ≤ 4 GB memória → a 3D vászon legfeljebb 1,0 Mpx (arányos lekicsinyítés; a HUD natív DOM). Minden más eszközön (a tulajdonos telefonján is) a felbontás a mostani dpr-korlát szerinti. A panelen a felbontás kézzel is állítható. | csak könnyű módban | nincs |
| g | **`?perf=1` panel** (`game-engine/perf/*`, a #484-alapú ágról változatlan modulok) bekötve a main lapjára; kapcsolók: Árnyék (csak ahol van árnyéktérkép; telefonon „nincs”), Felbontás 100 / 75 / 50 %, Anyag (az alap és az egyszerűbb készlet között), Köd | igen | igen |

Tiszta, egységtesztelt segédek új modulban: `game-engine/perf/pixelBudget.ts` (`pixelRatioForBudget`, `isLightGraphicsFrom`) és
`lib/voxelSunShade.ts` (`sunShadeAt` — a sütött árnyék rácsbejárása).

## 4. Edge case-ek

- Bányászás / lerakás: a main minden blokkváltozáskor újraépíti a példányokat (`rebuildWorld`) — a sütött árnyék ugyanott
  újraszámolódik (kockánként ≤ 14 rácslépés), a kibányászott fa árnyéka eltűnik.
- A világ széle: a rácson kívül nincs takarás (világos).
- Új pálya / időjárás: a sütött árnyék a geometriától függ, az időjárástól nem; a nap iránya állandó.
- WebGL nélkül / kontextusvesztés: változatlan viselkedés (ez a szelet nem nyúl hozzá).
- A vászon szülője rejtett (menü): a megfigyelő 0 méretet jelez → a méret nem változik (a korábbi `max(1, …)` védelem marad).
- `ResizeObserver` hiánya (nagyon régi böngésző): visszaesés a képkockánkénti méretolvasásra.
- A panel „Anyag” kapcsolója high szinten PBR ↔ Lambert, telefonon Lambert ↔ Lambert „AO” nélkül nem lenne informatív — ezért
  telefonon a gomb az alap (Lambert) és a PBR között vált (visszamérhető, mennyit hozott a csere).

## 5. EARS-elfogadás

- G-1: AMIKOR a szint low vagy medium, a rendszer nem hoz létre és nem mintavételez árnyéktérképet (`renderer.shadowMap.enabled === false`).
- G-2: AMIKOR a szint low vagy medium, a tömör blokk által a nap felől takart kockák példányszíne sötétebb a takaratlanokénál.
- G-3: AMIKOR a szint low vagy medium, a blokk-anyagok `MeshLambertMaterial` (víz: `MeshPhongMaterial`), a lomb nem `transparent`.
- G-4: AMIKOR a szint high, az árnyéktérkép, a PBR-anyag, a 8× anizotrópia és az áttetsző lomb változatlan.
- G-5: A vászon képpontmérete alapállapotban megegyezik a változtatás előttivel (medium, kihajtott nézet: 1240×1252).
- G-6: AMIKOR az eszköz „könnyű grafika” módba esik, a vászon képpontszáma ≤ 1,0 Mpx; különben a plafon nem hat.
- G-7: AMIKOR a vászon szülőjének mérete változik (forgatás, kihajtás), a vászon a következő képkockára követi; a képkocka-hurok
  nem olvas elrendezést.
- G-8: A `?perf=1` panel a mainen is megjelenik és a kapcsolói hatnak (alapterv E-1 … E-8); paraméter nélkül nem töltődik be.
- G-9: A közös mobil mérő, a meta-mérő és a Kockavadász saját e2e-i zöldek maradnak (az ismert ingadozó `joystick-response`
  block-craft eset kivételével, ha csak az bukik).

## 6. Érintett fájlok

- MÓD `source/client/src/pages/BlockCraftQuiz.tsx`
- ÚJ `source/client/src/game-engine/perf/perfStats.ts`, `perfOverlay.ts` (áthozva), `pixelBudget.ts`
- ÚJ `source/client/src/lib/voxelSunShade.ts`
- ÚJ `source/tests/perf-stats.test.ts` (áthozva), `pixel-budget.test.ts`, `voxel-sun-shade.test.ts`,
  `blockcraft-perf-panel.spec.ts` (áthozva, a main lapjához igazítva)
- ÚJ `docs/measurements/2026-11-17-kockavadasz-telefon-gyors/` (előtte / utána képek, mérőtábla)
- ÁTHOZVA `docs/specs/2026-11-17-kockavadasz-telefon.md`, `-vegrehajtas.md`
