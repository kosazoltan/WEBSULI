# Végrehajtási utasítás — játékok telefonos reszponzivitása (Vihargarázs + meta-képernyők)

**Állapot:** folyamatban – 2026-11-16, ág `fix/jatek-telefonos-reszponzivitas`
Terv: `docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md`

Minden útvonal a `source/` alatt értendő; parancsok a `source/` könyvtárból. A játéklogika (`client/src/lib/tornado/*`)
NEM módosul. A meglévő `data-testid`-k maradnak; új elem új testidet kap.

## R1 — mérő (a kód előtt, a javítás előtti állapoton bukik)

Fájlok: `tests/support/game-meta-quality.ts` (új), `tests/game-meta-quality.spec.ts` (új), `playwright.game-mobile.config.ts`
(`testMatch` + `game-meta-quality.spec.ts`).

- `measureMetaScreen(page, { scope, insets, minTarget = 44 })` → `MetaViolation[]` (X1–X7, a terv „Mérce” szakasza).
  A csukott `<details>` tartalma nem látható (`checkVisibility`).
- `expectMetaScreenOk`, `insetsFor(viewport)` (álló 44/0/34/0, fekvő 0/44/21/44), `metaShot` (`GAME_MOBILE_SHOT_DIR`).
- Spec: Vihargarázs 6 nézetben (360×640, 390×844, 412×800, 412×915, 844×390, 915×412): megnyitás érintéssel →
  mérés → „Felderítő” szűrő → 2. jármű → mérés → 1. (saját) jármű → Motor fejlesztés (900 SC) → `tornado-coins` „300 SC”,
  `data-level="1"`, `data-affordable="false"` → mérés → „Vissza” → menü. Szintek / Rekordok / Statisztika / Beállítások 3
  nézetben (360×640, 412×915, 844×390).
- Bizonyíték: a javítás előtti futás kimenete a PR-leírásba (idézet).

Parancs: `GAME_MOBILE_PORT=<egyedi> npx playwright test --config playwright.game-mobile.config.ts game-meta-quality`.

## R2 — a rögzített keret csak a játékban (gyökérok)

Fájl: `client/src/pages/TornadoHunter200.tsx`.

1. `useOrientation` importja a `@/game-engine/mobile`-ból; `const orientation = useOrientation();`.
2. `fixedScreen={screen === "play" || screen === "levels" || garageLandscape}` (eddig `screen !== "menu"`): a Szintek
   (`game-viewport-experience.spec.ts` C1: a lap nem görög; a lista `ScrollPane`) és a fekvő garázs két `ScrollPane`-hasábja
   rögzített; az álló garázs, a Beállítás, a Rekordok és a Statisztika természetes lapgörgetésű (a rögzített keretben a
   kártya alja elérhetetlen volt). Review-kiegészítés: lásd a terv „Kiegészítés — orkesztrátori review” szakaszát.
3. `ScreenHeader`: a „Vissza” gombról a `-ml-2` le (a kártya `overflow: hidden`-je levágta).
4. A `main` alsó párnázása a biztonsági sávot is vegye figyelembe (a közös `index.css` már ad
   `max(8px, var(--game-safe-bottom))`-ot; a lap `pb-20` marad).

## R3 — `VehicleArt` SVG-sziluett

Új fájl: `client/src/tornado/VehicleArt.tsx`.

- `VehicleArt({ vehicle, size?: "sm" | "md" | "lg", className? })`: `role="img"`, `aria-label="<név> – <kategória>"`,
  `data-testid="tornado-vehicle-art"`, `data-silhouette=<silhouette>`.
- Oldalnézeti SVG (`viewBox 0 0 120 72`), 5 forma: `pickup` (felderítő: alacsony fülke + plató), `wedge` (elfogó: lapos ék
  + légterelő), `tank` (nehéz: szögletes páncél + lánctalp-sáv, 3 kerék), `van` (kutató: magas doboz + radartányér),
  `beast` (extrém: bukócső-ketrec + óriáskerék + horgony). Kitöltés: `colors.body`, csík: `colors.accent`, ablak:
  `colors.glass`; háttér-ragyogás és keret: `RARITY_COLOR[rarity]`.
- A `svg` gyermekei vannak → az X6 nem jelzi üresnek.

Teszt: `tests/tornado-vehicle-art.test.ts` (node:test, `react-dom/server` `renderToStaticMarkup`): mind az 5 sziluett
eltérő `path`-készletet ad; a ritkaság színe megjelenik; `aria-label` a nevet tartalmazza.

## R4 — a Vihargarázs új elrendezése

Fájl: `client/src/pages/TornadoHunter200.tsx`, `GarageScreen` (+ `FilterChip`, új `UpgradeRow`, `VehicleTile`).

- Egyetlen külső kártya marad (`data-testid="tornado-garage"`, `data-layout="portrait" | "landscape"`); a részletek belső
  kerete csak vékony elválasztó, nem újabb párnázott kártya. Párnázás 360 px-en ≤ 8 px oldalanként.
- Álló: fejléc → szűrősor (vízszintesen görgethető, `flex-nowrap overflow-x-auto`, chip `min-h-11`, testid
  `tornado-garage-filter-<id|all>`, `aria-pressed`) → járműsor (vízszintes, csempe ~112 px, testid
  `tornado-garage-vehicle-<id>`, `aria-pressed`, `VehicleArt sm`, név, ár, lakat / ✓) → részletek (`VehicleArt lg`, név,
  ritkaság, kategória, ár, stat-sávok, Vásárlás / Kiválasztás / ✓) → fejlesztések → „Feloldható most”.
- Fekvő: `grid-cols-2`, bal: szűrő (sortöréssel) + járműrács (`overflow-y-auto min-h-0`), jobb: részletek + fejlesztések
  (`overflow-y-auto min-h-0`); a lap nem görög (R2 rögzített keret).
- A kiválasztott csempe a sorban vízszintesen középre görgetődik (`scrollLeft`, NEM `scrollIntoView` — a lap nem ugrik).
- `UpgradeRow` (testid `tornado-garage-upgrade-<track>`, `data-level`, `data-affordable`): `min-h-12`, bal: címke +
  hatás (≥ 12 px), 5 pötty (●/○, a kitöltött zöld); jobb: ár-jelvény „+ 900 SC” (elég SC: lime; kevés: halvány, „kevés SC”
  alcím); maximumon „MAX”. A gomb `aria-label`: „Motor fejlesztése, 1. szint → 2. szint, 900 SC”.
- A logika hívásai (`buyVehicle`, `selectVehicle`, `buyUpgrade`, `upgradeCost`) változatlanok.
- A menü „Aktuális jármű” kártyáján is `VehicleArt sm`.

## R5 — közös „Hogyan játsszak?” ablak

Fájl: `client/src/components/GamePedagogyPanel.tsx` (mind a 7 játék). A `DialogContent` `className`-je: a bezáró gomb
(`[&>button:last-child]`) 44×44 px, `right-2 top-2`, középre igazított ikon; a tartalom felül 3 rem párnázást kap, hogy a cím
ne csússzon a gomb alá. A `ui/dialog.tsx` (az egész oldal) NEM módosul.

## R6 — ellenőrzés

1. `npx playwright test --config playwright.game-mobile.config.ts game-meta-quality game-mobile-quality joystick-response`
   → zöld (a Viharvadász M1–M12 is).
2. `node --import tsx --test tests/tornado-vehicle-art.test.ts tests/tornado-progress.test.ts tests/tornado-vehicles.test.ts
   tests/joystick-curve.test.ts tests/game-touch-controls.test.ts tests/tornado-mobile-shell.test.ts` → zöld.
3. Leltár újrafuttatása utána (ideiglenes, nem commitolt leltár-spec a scratchpadban) → a táblázat „utána” oszlopa.
4. Képek: `docs/measurements/jatek-reszponziv/elotte/` és `…/utana/` (CSS-pixeles JPEG 70), valódi érintéses végigjárás.
5. Push előtt: `git merge origin/main`, `npm run lint`, `npm run check`, `npm run check:test`, three-phase-check.

## Elfogadás

A terv `<!-- acceptance-checklist -->` pontjai, mindegyik futtatott parancs kimenetével vagy képpel igazolva.

## UNKNOWN

- Valódi Android-telefonos viselkedés (címsor be-/kiúszása, rendszer-betűméret nagyítás): UNVERIFIED — a 412×800-as nézet
  közelíti; a tulajdonos egyperces próbája a PR-leírásban.
