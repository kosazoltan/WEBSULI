# Joystick a jobb kézre — végrehajtási utasítás

**Terv:** `docs/specs/2026-11-18-joystick-jobb-kez.md` (D1–D5, A1–A9)
**Ág / munkafa:** `feat/joystick-jobb-kez`, `D:/repo/WEBSULI/.claude/worktrees/joystick-jobb`
**Állapot:** folyamatban (2026-11-18)

Tilos: push, PR, `--no-verify`, rebase, új npm-függőség. Minden parancs a munkafából fut. A böngészőtesztek adatbázis nélkül,
a Vite-os `playwright.game-mobile.config.ts`-szel futnak (`--workers=1`); a fő (adatbázisos) konfig alá tartozó két módosított
spec (`brainrot-play.spec.ts`, `blockcraft-two-finger.spec.ts`) helyi futtatásához a munkamenet scratchpadjában lévő, nem
commitolt Vite-os konfig használható (a spec-ek minden `/api/**` hívást csonkolnak).

## 1. feladat — közös beállítás (D1)

Fájl: `source/client/src/game-engine/play/gameSettings.ts`

1. `export type JoystickSide = "right" | "left";`
2. `GameSettings = { v: 1; tts: boolean; joystickSide: JoystickSide }`; `DEFAULTS.joystickSide = "right"`.
3. `loadGameSettings`: `joystickSide = parsed.joystickSide === "left" ? "left" : "right"`.
4. `saveGameSettings`: a tárolt alak `{ v: 1, tts, joystickSide }` (ugyanaz a normalizálás).
5. `export function useJoystickSide(): JoystickSide` (a `useGameSettings` tárából).

Teszt: `source/tests/game-settings.test.ts` igazítása a terv „módosuló tesztek” 1. pontja szerint.
Parancs: `cd source && node --import tsx --test tests/game-settings.test.ts` → minden teszt `ok`.

## 2. feladat — szótár és tiszta segédek (D3, D5)

Új fájl: `source/client/src/game-engine/mobile/joystickSide.ts`

- `oppositeSide(side)`.
- `JOYSTICK_SIDE_TEXT`: `{ label: "Joystick oldala", groupLabel: "Melyik oldalon legyen a joystick?", right: "Jobb oldalt",
  left: "Bal oldalt" }`.
- `joystickSideHint(key, side)` a három oldalfüggő súgóhoz (`"asteroid-start"`, `"blockcraft-start"`, `"blockcraft-play"`):
  a joystick hüvelykujja `side`, a másik hüvelykujjé az ellentétes oldal.
- `isOppositeZone(x, width, side, share)`: igaz, ha az `x` a joystickkal ELLENTÉTES `share` arányú sávban van
  (`side === "left"` → `x >= width * (1 - share)`; `side === "right"` → `x <= width * share`); `width <= 0` → igaz.
- Jelenlét-számláló: `joystickMounted(): () => void` (felcsatoláskor hívandó, a visszaadott függvény lecsatol),
  `useJoystickPresent(): boolean` (`useSyncExternalStore`).

Új fájl: `source/client/src/game-engine/mobile/JoystickSideToggle.tsx` — a közös kapcsoló (`role="group"`, két `button`,
`aria-pressed`, `data-testid="joystick-side-toggle"`, `joystick-side-right`, `joystick-side-left`; osztály:
`game-joystick-side`). Export a `game-engine/mobile/index.ts`-ből.

## 3. feladat — közös keret, joystick, szünet menü, CSS (D2, D5)

1. `source/client/src/game-engine/mobile/GameShell.tsx`: a gyökérre `data-joystick-side={useJoystickSide()}`.
2. `source/client/src/game-engine/VirtualJoystick.tsx`: a gyökér `className`-je elé `game-joystick`; `useEffect(() =>
   joystickMounted(), [])`. Más nem változik (a húzás, a `countRender`, a festés érintetlen).
3. `source/client/src/game-engine/mobile/PauseMenu.tsx`: a `game-pause-actions` után, ha `useJoystickPresent()` igaz:
   `<JoystickSideToggle />`.
4. `source/client/src/index.css` a `.game-touch-layer > *` szabály után:
   - `.game-shell-fixed[data-joystick-side="right"] .game-joystick { order: 1; }`
   - a kapcsoló stílusa (`.game-joystick-side…`, gomb ≥ 48 px); az alacsony fekvő szünet menüben
     (`@media (max-height: 500px) and (min-width: 560px)`) a kapcsoló egy sorban.
   - A Szökőárhoz külön CSS nem kell: a sáv álló és fekvő nézetben is teljes szélességű (böngészőben mérve; terv D3).

## 4. feladat — játékok (D3, D4)

Sorrend és fájlok:

1. `source/client/src/pages/TornadoHunter200.tsx`: a `TouchControls` `leftHanded` propja megszűnik; a tárcsa a sáv közvetlen
   gyereke; a gombsor `flex-row-reverse`-e a `useJoystickSide() === "right"` esetén; a kezdő beállítások „Irányítás” blokkja
   a `<JoystickSideToggle />`; a szünet menü gyerekei közül az „Irányítás” blokk törlődik (a közös menü adja).
2. `source/client/src/pages/SpaceAsteroidQuiz.tsx`: a `<style>` blokkban
   `[data-joystick-side="right"] .sa-actions { flex-direction: row-reverse; }`; a súgó `joystickSideHint("asteroid-start", side)`;
   a `space` bemenet-mérő `fire` mezője (1 / 0 — csak teszt-kampós buildben él).
3. `source/client/src/pages/BlockCraftQuiz.tsx`: `isLookZone(x, width, side)` az `isOppositeZone`-ra épül (60%); a vászon
   `pointerdown` a beállítás ref-jét adja át; a `.bc-actions` rács tükrözése CSS-ben; a két súgó a szótárból.
4. `source/client/src/pages/BrainRotSteal.tsx`: a `HAND_KEY`, a `leftHanded` állapot, a `chooseHand` és a `data-hand`
   megszűnik; a CSS a `[data-joystick-side=…]`-ra vált (alap: joystick jobb; `left`: tükör); a kezdő beállításokban a
   `<JoystickSideToggle />`.
5. `source/client/src/pages/TsunamiEscapeEnglish.tsx`: csak a `TsunamiTouchControls` megjegyzése (a szerkezet nem változik).

Minden lap után: `cd source && npx.cmd tsc --noEmit -p .` (vagy a repó `check` parancsa) → 0 hiba.

## 5. feladat — tesztek

1. Új: `source/tests/joystick-side.test.ts` (terv „Új tesztek” 1.).
2. Új: `source/tests/joystick-side.spec.ts` + felvétel a `source/playwright.game-mobile.config.ts` `testMatch`-ébe.
   Képernyőkép: `JOYSTICK_SIDE_SHOT_DIR` környezeti változó mappájába `<játék>-<szélesség>x<magasság>-<oldal>.png`.
3. Módosul (terv „módosuló tesztek” 2–4.): `brainrot-play.spec.ts`, `blockcraft-two-finger.spec.ts`,
   `blockcraft-mobile.test.ts`.

Parancsok (PowerShell, a `source` mappából):

- `node --import tsx --test tests/joystick-side.test.ts tests/game-settings.test.ts tests/blockcraft-mobile.test.ts` → `fail 0`.
- `npx.cmd playwright test -c playwright.game-mobile.config.ts joystick-side.spec.ts --workers=1` → minden eset zöld.
- `npx.cmd playwright test -c playwright.game-mobile.config.ts joystick-response.spec.ts game-mobile-quality.spec.ts --workers=1`
  → zöld (ismert ingadozó: a `joystick-response.spec.ts` tsunami-english esete; ha csak az bukik, a bukás okát a kimenetből
  kell megállapítani).
- Mutáció (commit UTÁN, másolattal; C-70): (a) `DEFAULTS.joystickSide = "left"`, (b) a közös `order` szabály törlése →
  a `joystick-side.spec.ts` A1 esetei buknak; visszaállítás után `cmp` az eredetivel.

## 6. feladat — bizonyíték és kapuk

1. Képernyőképek megnézése (Read): mind az öt játék, 390×844 és 844×390, alapérték és átkapcsolva.
2. `npm run gate:stage`, majd `npm run gate:push` a munkafa gyökeréből (a `native-arch.test.ts` helyi bukása ismert kivétel).
3. A terv elfogadási pontjainak (A1–A9) tételes újraellenőrzése futtatott parancs kimenetéből; az **Állapot** sor frissítése
   NEM történik kódcommit után külön (C-37) — a záró állapot a jelentésben szerepel.
