import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  JOYSTICK_DEAD_ZONE,
  joystickVector,
  knobOffset,
} from "../client/src/game-engine/joystick";

/**
 * G-8 — mobil vezérlés.
 *
 * Két hiba mérve a kódban 2026-09-07-én, pontosan az, amit a tulajdonos
 * telefonon tapasztalt:
 *
 *  1. Mind a négy akciójáték `onPointerLeave`-re ELENGEDI a nyomva tartott
 *     gombot. Közben pointer capture-t is kérnek — a kettő egymás ellen
 *     dolgozik: a capture épp azért van, hogy az elcsúszó hüvelykujj is a
 *     gombhoz tartozzon, a `pointerleave` viszont a határon túllépve azonnal
 *     elengedi. Innen a „megáll az irányítás".
 *
 *  2. Egyetlen vezérlőfelület sem állít `touch-action: none`-t. Hosszú nyomásra
 *     a böngésző kijelöl, felugró menüt nyit, görget — innen a „kijelöli az
 *     elemet".
 *
 * A joystick matematikája tiszta modul: holtsáv (a drift ellen) és egységkörre
 * vágás, hogy az átló ne legyen gyorsabb az egyenesnél.
 */

/* ----------------------------- joystick-matek ----------------------------- */

const ORIGIN = { x: 100, y: 100 };
const RADIUS = 50;

test("középen semmi mozgás — a holtsáv kiszűri a remegő ujjat", () => {
  const v = joystickVector({ origin: ORIGIN, point: { x: 102, y: 101 }, radius: RADIUS });

  assert.equal(v.x, 0);
  assert.equal(v.y, 0);
  assert.equal(v.magnitude, 0);
});

test("a holtsávon túl azonnal nem ugrik teljes sebességre", () => {
  // Épp a holtsáv szélén túl: a magnitude nullától induljon, ne a holtsáv értékétől.
  const justOutside = JOYSTICK_DEAD_ZONE + 0.02;
  const v = joystickVector({
    origin: ORIGIN,
    point: { x: ORIGIN.x + RADIUS * justOutside, y: ORIGIN.y },
    radius: RADIUS,
  });

  assert.ok(v.magnitude > 0, "a holtsávon túl mozogni kell");
  assert.ok(v.magnitude < 0.1, `ugrás a holtsáv szélén: ${v.magnitude}`);
});

test("teljes kitérésnél egységnyi a hossz", () => {
  const v = joystickVector({ origin: ORIGIN, point: { x: 150, y: 100 }, radius: RADIUS });

  assert.ok(Math.abs(v.x - 1) < 1e-6, `x=${v.x}`);
  assert.ok(Math.abs(v.magnitude - 1) < 1e-6);
});

test("a sugáron túl nem gyorsul tovább", () => {
  const v = joystickVector({ origin: ORIGIN, point: { x: 400, y: 100 }, radius: RADIUS });

  assert.ok(v.magnitude <= 1 + 1e-9, `a hüvelykujj kicsúszott, a hajó nem gyorsulhat: ${v.magnitude}`);
});

test("az átló nem gyorsabb az egyenesnél", () => {
  const straight = joystickVector({ origin: ORIGIN, point: { x: 150, y: 100 }, radius: RADIUS });
  const diagonal = joystickVector({ origin: ORIGIN, point: { x: 150, y: 150 }, radius: RADIUS });

  assert.ok(
    Math.abs(diagonal.magnitude - straight.magnitude) < 1e-6,
    `egyenes ${straight.magnitude}, átló ${diagonal.magnitude} — az átlós gyorsulás klasszikus hiba`,
  );
});

test("a képernyő koordinátája lefelé nő, a játék iránya felfelé pozitív", () => {
  // Fölfelé húzás: a képernyőn kisebb y, a játékban „előre".
  const v = joystickVector({ origin: ORIGIN, point: { x: 100, y: 60 }, radius: RADIUS });

  assert.ok(v.y > 0, `fölfelé húzásnál előre kell menni, y=${v.y}`);
});

test("a gomb sosem rajzolódik ki a tárcsán kívülre", () => {
  const knob = knobOffset({ origin: ORIGIN, point: { x: 900, y: 900 }, radius: RADIUS });

  assert.ok(
    Math.hypot(knob.x, knob.y) <= RADIUS + 1e-6,
    "a joystick gombja kilógott a tárcsából",
  );
});

test("nulla sugár nem oszt nullával", () => {
  const v = joystickVector({ origin: ORIGIN, point: { x: 120, y: 100 }, radius: 0 });

  assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.magnitude));
});

/* --------------------------- a játékok bekötése --------------------------- */

const root = fileURLToPath(new URL("..", import.meta.url));

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const ACTION_GAMES = [
  "TornadoHunter200.tsx",
  "SpaceAsteroidQuiz.tsx",
  "BlockCraftQuiz.tsx",
  "TsunamiEscapeEnglish.tsx",
];

for (const file of ACTION_GAMES) {
  const code = stripComments(readFileSync(join(root, "client/src/pages", file), "utf8"));

  test(`${file}: a nyomva tartás nem szakad meg, ha az ujj elcsúszik`, () => {
    // A pointer capture mellett a `pointerleave` elengedése értelmetlen és káros:
    // épp azt a helyzetet öli meg, amiért a capture-t kértük.
    assert.doesNotMatch(
      code,
      /onPointerLeave=\{[^}]*\b(endHold|pressEnd|onUp|hold)\b/,
      "onPointerLeave elengedi a vezérlést — elcsúszó hüvelykujjnál megáll az irányítás",
    );
  });

  test(`${file}: a vezérlőfelület letiltja a böngésző saját gesztusait`, () => {
    assert.match(
      code,
      /touchAction:\s*"none"|touch-none/,
      "nincs touch-action: none — hosszú nyomásra kijelöl és görget a böngésző",
    );
  });
}

test("a HoldButton a capture-t használja, nem a leave-et", () => {
  const btn = stripComments(
    readFileSync(join(root, "client/src/game-engine/HoldButton.tsx"), "utf8"),
  );

  assert.match(btn, /setPointerCapture/, "capture nélkül az elcsúszó ujj elveszti a gombot");
  assert.match(btn, /onPointerCancel/, "a rendszer-megszakítást kezelni kell, különben beragad");
  assert.match(btn, /onContextMenu/, "hosszú nyomásra felugró menü jönne");
  assert.doesNotMatch(btn, /onPointerLeave/, "a leave épp a capture ellen dolgozik");
});
