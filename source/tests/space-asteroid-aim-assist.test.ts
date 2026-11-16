import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { AIM_ASSIST_DEFAULTS, aimAssistVx } from "../client/src/lib/spaceAsteroid/aimAssist";

/**
 * S10 / terv 4.6/6 — célzássegéd érintésnél (végrehajtás S10, „Megírandó teszt”).
 * Az elvárások a szabályból: a kúp fél-nyílása 25°, |vx| ≤ 6, sebesség 14 (BULLET_SPEED).
 */

const ship = { x: 0, y: -9.6 };
/** Cél a hajótól `deg` fokra a függőlegestől, `dist` távolságra (pozitív szög = jobbra). */
function at(deg: number, dist: number, alive?: boolean) {
  const r = (deg * Math.PI) / 180;
  return { x: ship.x + Math.sin(r) * dist, y: ship.y + Math.cos(r) * dist, alive };
}

test("az alapértékek a végrehajtási utasítás szerintiek (25°, 6, 14)", () => {
  assert.deepEqual(AIM_ASSIST_DEFAULTS, { coneDeg: 25, maxVx: 6, speed: 14 });
});

test("cél egyenesen fölötte → vx = 0", () => {
  assert.equal(aimAssistVx(ship, [at(0, 8)]), 0);
});

test("cél 20°-ra jobbra → 0 < vx ≤ 6", () => {
  const vx = aimAssistVx(ship, [at(20, 8)]);
  // 14 × sin 20° ≈ 4,79 — a korlát (6) alatt, tehát a pontos érték jön ki.
  assert.ok(vx > 0 && vx <= 6, `vx=${vx}`);
  assert.ok(Math.abs(vx - 14 * Math.sin((20 * Math.PI) / 180)) < 1e-9, `vx=${vx}`);
});

test("cél 20°-ra balra → negatív vx (tükörkép)", () => {
  const vx = aimAssistVx(ship, [at(-20, 8)]);
  assert.ok(vx < 0 && vx >= -6, `vx=${vx}`);
});

test("cél 40°-ra → 0 (a 25°-os kúpon kívül)", () => {
  assert.equal(aimAssistVx(ship, [at(40, 8)]), 0);
});

test("a kúp határán belül (24°) céloz, kívül (26°) nem", () => {
  assert.ok(aimAssistVx(ship, [at(24, 8)]) > 0);
  assert.equal(aimAssistVx(ship, [at(26, 8)]), 0);
});

test("a korlát érvényes: szélesebb kúpnál sem lépi túl a ±maxVx-et", () => {
  // 14 × sin 60° ≈ 12,1 > 6 → a korlát vág.
  assert.equal(aimAssistVx(ship, [at(60, 8)], { coneDeg: 70, maxVx: 6, speed: 14 }), 6);
  assert.equal(aimAssistVx(ship, [at(-60, 8)], { coneDeg: 70, maxVx: 6, speed: 14 }), -6);
});

test("cél a hajó alatt vagy vele egy magasságban → 0", () => {
  assert.equal(aimAssistVx(ship, [{ x: 0.5, y: ship.y - 3 }]), 0);
  assert.equal(aimAssistVx(ship, [{ x: 0, y: ship.y }]), 0);
});

test("két cél közül a közelebbi felé céloz", () => {
  const near = at(-15, 5);
  const far = at(15, 12);
  assert.ok(aimAssistVx(ship, [far, near]) < 0, "a közelebbi (bal) cél felé kell");
  assert.ok(aimAssistVx(ship, [near, far]) < 0, "a sorrend nem számít");
});

test("halott cél kihagyva; ha csak az van, 0", () => {
  assert.equal(aimAssistVx(ship, [at(15, 5, false)]), 0);
  assert.ok(aimAssistVx(ship, [at(15, 5, false), at(-15, 10, true)]) < 0, "a halott közeli helyett az élő távoli");
});

test("nincs cél → 0", () => {
  assert.equal(aimAssistVx(ship, []), 0);
});

/* ------------------- forrásőr: a lap csak érintős ágon hívja ------------------- */

const root = fileURLToPath(new URL("..", import.meta.url));
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const page = stripComments(readFileSync(join(root, "client/src/pages/SpaceAsteroidQuiz.tsx"), "utf8"));

test("forrásőr: a lövés-ág aimAssistVx-et csak érintős ágon hívja", () => {
  assert.match(page, /from "@\/lib\/spaceAsteroid\/aimAssist"/, "nincs aimAssist import");
  const calls = page.match(/aimAssistVx\(/g) ?? [];
  assert.equal(calls.length, 1, "pontosan egy hívás kell (a lövés-ágban)");
  const idx = page.indexOf("aimAssistVx(");
  // A hívás egy érintés-feltételes kifejezés igaz ágában áll: `touchAssist ? aimAssistVx(...) : 0`.
  const before = page.slice(Math.max(0, idx - 120), idx);
  assert.match(before, /touchAssist\s*\?\s*$/, "az aimAssistVx nem érintés-feltételes ágban áll");
  assert.match(
    page,
    /const touchAssist\s*=\s*touchRef\.current\.fire\s*&&\s*touchCapableRef\.current\s*;/,
    "a feltétel nem az érintéses tüzelés (touchRef.fire) és az érintős eszköz",
  );
  // A billentyűzetes tüzelés (keysRef.fire) önmagában nem kapcsolja be.
  assert.doesNotMatch(page, /touchAssist\s*=[^;]*keysRef/, "billentyűzetnél nem kapcsolhat be a segéd");
});

test("forrásőr: a hármas lövés oldalsó lövedékei a középsőhöz képest ±3,0", () => {
  assert.match(page, /vx:\s*centerVx\s*-\s*3\.0/);
  assert.match(page, /vx:\s*centerVx\s*\+\s*3\.0/);
});
