import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  JOYSTICK_SIDE_TEXT,
  isOppositeZone,
  joystickMounted,
  joystickPresent,
  joystickSideHint,
  oppositeSide,
  type JoystickSideHintKey,
} from "../client/src/game-engine/mobile/joystickSide";
import { loadGameSettings } from "../client/src/game-engine/play/gameSettings";
import { memoryStorage } from "./support/vocab-fixture";

/**
 * A joystick oldala (`docs/specs/2026-11-18-joystick-jobb-kez.md`) — tiszta logika és bekötés-őr.
 *
 * A tulajdonos kérése: a joystick alapból a JOBB kézre essen, az akciógombok a BALra. A tényleges elrendezést a
 * böngészős `joystick-side.spec.ts` méri az elem-dobozokból; ez a fájl azt rögzíti, ami böngésző nélkül eldönthető:
 * az alapértéket, a szövegek oldalhelyességét, a Kockavadász körbenéző zónájának tükrözését, és azt, hogy az oldalt
 * EGY közös beállítás adja (a lapok nem tartanak saját oldal-állapotot).
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../client/src/${rel}`, import.meta.url)), "utf8");
/** Forrás megjegyzések nélkül (a megjegyzés szövege ne elégítsen ki forrásmintát). */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("alapérték: a joystick a JOBB oldalon (tárolt beállítás nélkül és üres tárral is)", () => {
  assert.equal(loadGameSettings(null).joystickSide, "right");
  assert.equal(loadGameSettings(memoryStorage()).joystickSide, "right");
});

test("oppositeSide: az akciógombok oldala a joystickkal ellentétes", () => {
  assert.equal(oppositeSide("right"), "left");
  assert.equal(oppositeSide("left"), "right");
});

test("a kapcsoló feliratai: az oldalt nevezik meg, nem a kezességet", () => {
  assert.equal(JOYSTICK_SIDE_TEXT.label, "Joystick oldala");
  assert.equal(JOYSTICK_SIDE_TEXT.right, "Jobb oldalt");
  assert.equal(JOYSTICK_SIDE_TEXT.left, "Bal oldalt");
});

test("súgószövegek: a joystick hüvelykujja mindig a beállított oldal, a másik teendő az ellentétes", () => {
  const keys: JoystickSideHintKey[] = ["asteroid-start", "blockcraft-start", "blockcraft-play"];
  for (const key of keys) {
    const right = joystickSideHint(key, "right");
    const left = joystickSideHint(key, "left");
    // A szöveg a joystick (mozgás) oldalával kezdődik.
    assert.match(right, /^Jobb\b/, `${key} / jobb: ${right}`);
    assert.match(left, /^Bal\b/, `${key} / bal: ${left}`);
    // Jobb oldali joysticknál a szöveg nem mondhat „bal”-t a joystickra / mozgásra — és fordítva.
    assert.doesNotMatch(right, /\bBal\b[^·]*(joystick|mozgás)/i, `${key} / jobb: ${right}`);
    assert.doesNotMatch(left, /\bJobb\b[^·]*(joystick|mozgás)/i, `${key} / bal: ${left}`);
    // A második teendő (tűz / körbenézés / nézelődés) a másik oldalé.
    assert.match(right.split("·")[1] ?? "", /\bbal\b/, `${key} / jobb, 2. rész: ${right}`);
    assert.match(left.split("·")[1] ?? "", /\bjobb\b/, `${key} / bal, 2. rész: ${left}`);
    assert.notEqual(right, left);
  }
});

test("isOppositeZone: jobb oldali joysticknál a BAL 60%, bal oldalinál a JOBB 60% a másik hüvelykujjé", () => {
  const W = 1000;
  // Alapérték (joystick jobbra): a bal 60% a zóna.
  assert.equal(isOppositeZone(0, W, "right", 0.6), true);
  assert.equal(isOppositeZone(250, W, "right", 0.6), true);
  assert.equal(isOppositeZone(600, W, "right", 0.6), true, "a határ még a zónában");
  assert.equal(isOppositeZone(601, W, "right", 0.6), false);
  assert.equal(isOppositeZone(800, W, "right", 0.6), false, "a joystick felőli 40% nem zóna");
  // Tükör (joystick balra): a jobb 60% a zóna — a régi viselkedés (x ≥ 40%).
  assert.equal(isOppositeZone(200, W, "left", 0.6), false);
  assert.equal(isOppositeZone(399, W, "left", 0.6), false);
  assert.equal(isOppositeZone(400, W, "left", 0.6), true, "a határ még a zónában");
  assert.equal(isOppositeZone(750, W, "left", 0.6), true);
  // A két oldal egymás tükre: x ↔ W − x.
  for (const x of [0, 100, 399, 400, 500, 600, 601, 900, 1000]) {
    assert.equal(isOppositeZone(x, W, "right", 0.6), isOppositeZone(W - x, W, "left", 0.6), `x = ${x}`);
  }
  // Ismeretlen szélesség: megengedő (ahogy a régi isLookZone).
  assert.equal(isOppositeZone(5, 0, "right", 0.6), true);
  assert.equal(isOppositeZone(5, -1, "left", 0.6), true);
});

test("joystick-jelenlét: fel- és lecsatolás számlálva; a dupla lecsatolás nem visz negatívba", () => {
  assert.equal(joystickPresent(), false);
  const a = joystickMounted();
  const b = joystickMounted();
  assert.equal(joystickPresent(), true);
  a();
  a();
  assert.equal(joystickPresent(), true, "a második joystick még fent van");
  b();
  assert.equal(joystickPresent(), false);
});

test("bekötés: a közös keret hirdeti a beállítást, a közös joystick osztálya megvan, a közös CSS-szabály létezik", () => {
  const shell = code("game-engine/mobile/GameShell.tsx");
  assert.match(shell, /const joystickSide = useJoystickSide\(\);/, "a keret nem olvassa a közös beállítást");
  assert.match(shell, /data-joystick-side=\{joystickSide\}/, "a keret nem hirdeti a beállítást");

  const stick = code("game-engine/VirtualJoystick.tsx");
  assert.match(stick, /className=\{`game-joystick /, "a joystick gyökerén nincs game-joystick osztály");
  assert.match(stick, /useEffect\(\(\) => joystickMounted\(\), \[\]\);/, "a joystick nem jelzi a jelenlétét");

  const css = read("index.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(
    css,
    /\.game-shell-fixed\[data-joystick-side="right"\] \.game-joystick \{ order: 1; \}/,
    "hiányzik a közös szabály, amely a joystickot jobb oldali beállításnál a sáv végére teszi",
  );

  const pause = code("game-engine/mobile/PauseMenu.tsx");
  assert.match(pause, /\{joystickPresent && <JoystickSideToggle /, "a szünet menü nem mutatja a kapcsolót joystickos lapon");
});

test("egy igazságforrás: a joystickos lapok nem tartanak saját oldal-állapotot, és nem rendezik át a DOM-ot", () => {
  const pages = ["TsunamiEscapeEnglish.tsx", "TornadoHunter200.tsx", "SpaceAsteroidQuiz.tsx", "BlockCraftQuiz.tsx", "BrainRotSteal.tsx"];
  for (const file of pages) {
    const src = code(`pages/${file}`);
    assert.match(src, /<VirtualJoystick\b/, `${file}: nincs joystick a lapon`);
    assert.doesNotMatch(src, /leftHanded/, `${file}: saját „balkezes” állapot / prop maradt`);
    assert.doesNotMatch(src, /data-hand=/, `${file}: saját oldal-attribútum maradt`);
    assert.doesNotMatch(src, /websuli\.brainrot\.hand/, `${file}: a régi, saját tárolókulcs maradt`);
    assert.doesNotMatch(src, /Jobbkezes|Balkezes/, `${file}: saját kezesség-felirat maradt (a közös kapcsoló az oldalt nevezi meg)`);
    assert.doesNotMatch(src, /Bal hüvelykujj: |"Bal: mozgás/, `${file}: rögzítetten bal oldalt mondó súgó maradt`);
  }
});
