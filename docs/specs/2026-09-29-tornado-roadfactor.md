# Spec: Tornado Hunter 200 — a `roadFactor` fordított értéke

> Dátum: 2026-09-29 · Szerző: Claude Code · Állapot: JÓVÁHAGYVA (tulajdonosi kérés: „Fix roadFactor …”; a 2. fázis után azonnal a 3.)
> Szabály: `docs/agent-haromfazisu-munka.md`. Végrehajtás: `docs/specs/2026-09-29-tornado-roadfactor-vegrehajtas.md`.

## 0. Diagnózis (kódból és mérésből ellenőrzött)

`source/client/src/lib/tornado/world.ts:95-103` — a dokumentáció szerint `0 = off-road, 1 = on the centreline of a road`.
A kód a `near` értéket (a legközelebbi úthálózat-vonal távolsága: `ROAD_SPACING/2 - |m - ROAD_SPACING/2|`, ahol
`m = (v + HALF_WORLD) % ROAD_SPACING`) számolja, majd `near >= halfWidth` → **1**, `near <= 0` → **0**: fordítva.

Mérés (2 egységes rács a teljes 2400×2400 térképen, javítás előtt):

| felület | arány |
|---|---|
| asphalt | 91,71 % |
| grass | 5,34 % |
| water | 1,83 % |
| dirt | 1,02 % |
| mud | 0,10 % |

`roadFactor(0,0) = 0` (x = 0 útvonal), `roadFactor(150,150) = 1` (cellaközép). Mind a 206 kellék az úthálózat vonalainak
±3 egységes sávjába kerül (`propsInChunk` a `roadFactor > 0.35` pontokat hagyja ki — ez most a mezőt jelenti).

Érintett fogyasztók (grep `roadFactor|surfaceAt|gripAt`):
- `world.ts:81` `terrainHeight` — `base * (1 - onRoad * 0.55)`: most a mezőt lapítja, az utat nem.
- `world.ts:114` `surfaceAt` — `> 0.55` → `"asphalt"`.
- `world.ts:184` `propsInChunk` — `> 0.35` → kihagyás.
- `client/src/tornado/buildMeshes.ts:331-335` — terep-színezés: `> 0.55` aszfalt, `> 0.15` földút-padka, egyébként fű.
- `client/src/pages/TornadoHunter200.tsx:1391,1528` `gripAt` → `stepVehicle` (`drive.ts:68-78`) és `anchorOutcome` (`scoring.ts:72`); `:1674` HUD-felület.

## 1. Cél

A `roadFactor(x, z)` a dokumentációnak megfelelően az út középvonalán **1**, attól távolodva lineárisan csökken, és
`halfWidth` (9 egység) távolságtól **0**. A négy fogyasztó küszöbei változatlanok — a javítás után a szándékolt jelentésük érvényesül.

## 2. NEM cél

- A küszöbök (0.55 / 0.35 / 0.15), az útszélesség, a `ROAD_SPACING`, a tapadási értékek (`SURFACE_GRIP`) és a `MIN_ANCHOR_GRIP` módosítása.
- A terep-mesh felbontásának (`terrainSegments`) módosítása.
- Meglévő tesztek módosítása.

## 3. Rögzített döntések

1. Közös segédfüggvény: `distToGridLine(v)` — pozitív maradékos modulóval (`((a % s) + s) % s`), így a térképen kívüli
   (negatív `v + HALF_WORLD`) koordinátán sem ad a `[0, 1]` tartományon kívüli értéket. A térképen belül az eredmény azonos a régi `near`-rel.
2. `roadFactor = near >= halfWidth ? 0 : 1 - near / halfWidth`.
3. `buildMeshes.ts` színezésénél rövid komment rögzíti a küszöbök jelentését (a hivatkozott „~429/470. sor” komment NEM létezik;
   a színezés a `:331-335` sorokban van — ott kap kommentet).

## 4. Játékmeneti hatás (elemzés)

- **Tapadás (`drive.ts`)**: a mező (0.62) most valóban a térkép nagy része; a közegellenállás `0.15 + (1-grip)·1.2` → mezőn 0.606/s vs. aszfalton 0.15/s,
  a kormányzás `× grip`. Az aszfaltút ezzel tényleg gyorsabb út lesz — ez a `surfaceAt` doksi szándéka („Grip matters twice”).
- **Horgonyzás (`scoring.ts`)**: `MIN_ANCHOR_GRIP = 0.45` — aszfalt (1), földút (0.78), mező (0.62) tart; sár (0.3), víz (0.12) nem. A szabály nem változik;
  a sár/víz arány kicsi, a horgonyzás továbbra is szinte mindenhol lehetséges, csak a sáros/vizes helyen nem.
- **Kellékek**: a cellák belsejébe kerülnek (tervezett darabszám 4–16/chunk), az utakra nem. Több kellék épül a látókörben — mérni kell (V4).
- **Domborzat**: a mező a teljes amplitúdót kapja, az út 45 %-ot (a komment szerinti „shallow cuttings”).

## 5. Edge case-ek

- Két út kereszteződése: `min` a két tengely távolságára → 1 a metszéspontban.
- A térkép széle (`±1200` = útvonal) és azon kívül: `[0, 1]`-ben marad (1. döntés).
- Lebegőpontos: a vonalon (`-1200 + 300k`) a maradék pontosan 0 → pontosan 1.

## 6. Elfogadás (EARS)

- A1: HA a pont egy útvonal középvonalán van, AKKOR `roadFactor === 1`.
- A2: HA a pont legalább 9 egységre van minden útvonaltól, AKKOR `roadFactor === 0`.
- A3: AMIKOR a pont 0-ról 12 egységig távolodik egy vonaltól (a keresztirányú vonaltól messze), a `roadFactor` nem nő, és a `[0, 9)` szakaszon szigorúan csökken.
- A4: Az érték mindig `[0, 1]`, a térképen kívül is.
- A5: A teljes térképen mért aszfalt-arány < 30 % és > 1 % (utak léteznek); a mező a leggyakoribb felület.
- A6: Egyetlen kellék sem áll aszfalton.
- V: `npx tsc --noEmit`, `npx eslint client/src/lib/tornado client/src/tornado --max-warnings 0`, `node --import tsx --test tests/tornado-*.test.ts` → mind zöld.

## 7. Eredmény (2026-09-29, mérve)

- Felület-eloszlás (2 egységes rács): aszfalt 91,71 % → **5,18 %**, mező 5,34 % → **75,30 %**, földút 1,02 % → 16,84 %, sár 0,10 % → 0,85 %, víz 1,83 % (változatlan).
- Kellékek a teljes térképen: 206 → 4 434 (egyik sem aszfalton). Látókörben a (0,0) körül: low 332, medium 600, high 1 243.
- Headless Chromium (SwiftShader), 1. szint, kezdőpont (0, 884): HUD „Mező” → **„Aszfalt”**; FPS 40,6 → 37,5–38,3; konzolhiba 0.
- `npx tsc --noEmit` 0 · `npx eslint client/src/lib/tornado client/src/tornado --max-warnings 0` 0 · `node --import tsx --test tests/tornado-*.test.ts` 109/109.
- Maradó kockázat: a #129 óta az utat a terep-shader pixelenként színezi, így a mesh csúcstávolsága (`terrainSegments` 5/8/12 → 20/12,5/8,3 egység) nem mossa el az útsávot; a sűrűbb kellékek gyenge gépen (low: ~330 kellék, ~1,8 mesh/kellék) mérhetően több rajzolási hívást jelentenek — valós iskolai laptopon NOT RUN.

## Kiegészítés a beolvasztáskor (2026-09-29, PR #129 utáni main)
A #129 (3D látvány) a terepet PIXELENKÉNT színezi egy GLSL-shaderrel (`tornado/buildMeshes.ts`,
`terrainMaterial`), amely a `roadFactor` képletének **ikerpéldányát** tartalmazza — a régi, fordított
alakban (`road = clamp(nearLine / 9, 0, 1)`). A `world.ts` javítása egyedül a HUD-ot és a fizikát
igazította volna; a képen a mezők továbbra is aszfaltnak látszottak volna.
- Javítás: `road = 1.0 - clamp(nearLine / 9.0, 0.0, 1.0)` (a `nearLine` a legközelebbi úttengely
  távolsága, a `distToGridLine` GLSL-ikre), shader-cache kulcs `tornado-terrain-v3`.
- Új teszt: `tests/tornado-terrain-shader-road.test.ts` — a shader saját útszámító sorait
  JavaScriptként kiértékeli, és 400+ ponton a `roadFactor`-ral hasonlítja; a régi képleten bukik.
