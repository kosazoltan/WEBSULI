import assert from "node:assert/strict";
import test from "node:test";

import { layoutCycle, type CycleLayout } from "../client/src/lesson-runtime/blocks/explanatory-visuals";

/**
 * Spec 2026-09-30 (docs/specs/2026-09-30-korforgas-felirat-utkozes.md), review #199 — a körforgás-ábra
 * tiszta elrendezőjének (`layoutCycle`) invariánsai, a spec geometriájából FÜGGETLENÜL újraszámolva:
 * - E7: a nyilas gyűrű sugara R > n·(node + 8)/π (a nyílhézagok elférnek, a nyíl nem fordul vissza);
 * - E8: `exact` elrendezésben minden feliratsor közepe a SAJÁT fázis-köréhez van a legközelebb;
 *   `exact`/`drift` elrendezésben nincs kilógás és átfedés;
 * - E9: `overlap` tartalékban minden felirat átfedés-mértéke ≤ bármely spec-jelöltjéé (a legkisebbet adja).
 */

const W = 400, H = 400, EDGE = 2, GAP = 2, LINE_H = 24, ASCENT = 17, DESCENT = 5, CHAR_EM = 0.62, BADGE_R = 13;
const R_MAX = 104;
const OFFSETS = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90];
const EXTRAS = [0, 6, 12];

type Box = { l: number; t: number; r: number; b: number };
type Circle = { x: number; y: number; r: number };

const angle = (i: number, n: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
const sizeOf = (lines: string[]) => ({
  w: Math.max(...lines.map((l) => l.length)) * 16 * CHAR_EM,
  h: (lines.length - 1) * LINE_H + ASCENT + DESCENT,
});
const nodesOf = (L: CycleLayout, n: number) =>
  Array.from({ length: n }, (_, i) => ({ x: W / 2 + L.R * Math.cos(angle(i, n)), y: H / 2 + L.R * Math.sin(angle(i, n)) }));
const circlesOf = (L: CycleLayout, n: number): Circle[] =>
  nodesOf(L, n).flatMap((p) => [{ ...p, r: L.node }, { x: p.x + L.node * 0.72, y: p.y - L.node * 0.72, r: BADGE_R }]);
const boxOf = (lab: CycleLayout["labels"][number]): Box => {
  const { w, h } = sizeOf(lab.lines);
  return { l: lab.x - w / 2, r: lab.x + w / 2, t: lab.top, b: lab.top + h };
};
const dist = (b: Box, x: number, y: number) => Math.hypot(Math.max(b.l, Math.min(x, b.r)) - x, Math.max(b.t, Math.min(y, b.b)) - y);
/** Átfedés-mérték (a spec 6. döntésének mennyiségi kiegészítése): behatolási mélységek összege. */
function hitOf(box: Box, circles: Circle[], others: Box[]): number {
  let hit = Math.max(0, EDGE - box.l) + Math.max(0, EDGE - box.t) + Math.max(0, box.r - (W - EDGE)) + Math.max(0, box.b - (H - EDGE));
  for (const c of circles) hit += Math.max(0, c.r + GAP - dist(box, c.x, c.y));
  for (const o of others) hit += Math.max(0, Math.min(box.r + GAP - o.l, o.r + GAP - box.l, box.b + GAP - o.t, o.b + GAP - box.t));
  return hit;
}
/** Azok a feliratsorok, amelyek közepe egy másik fázis-körhöz van közelebb, mint a sajátjához. */
function straysOf(L: CycleLayout, n: number): string[] {
  const nodes = nodesOf(L, n), out: string[] = [];
  for (const [i, lab] of L.labels.entries()) for (let k = 0; k < lab.lines.length; k++) {
    const my = lab.top + k * LINE_H + (ASCENT + DESCENT) / 2;
    const own = Math.hypot(nodes[i].x - lab.x, nodes[i].y - my);
    for (const [j, o] of nodes.entries()) if (j !== i && Math.hypot(o.x - lab.x, o.y - my) < own) out.push(`${i}:${k}→${j}`);
  }
  return out;
}

const repeatTo = (unit: string, len: number) => unit.repeat(Math.ceil(len / unit.length)).slice(0, len).trim();
const CASES: Array<{ name: string; labels: string[]; center?: string; moon?: boolean }> = [];
for (let n = 3; n <= 12; n++) for (const len of [6, 10, 14, 20, 30, 40]) {
  CASES.push({ name: `${n}×„Ű”${len} + center`, labels: Array.from({ length: n }, () => "Ű".repeat(len)), center: "Középpont felirat" });
  CASES.push({ name: `${n}×szavas ${len}`, labels: Array.from({ length: n }, () => repeatTo("ab cd ", len)), center: "Víz" });
  CASES.push({ name: `${n}×„Ű”${len}, nincs center`, labels: Array.from({ length: n }, () => "Ű".repeat(len)) });
  CASES.push({ name: `${n}×szavas ${len}, nincs center`, labels: Array.from({ length: n }, () => repeatTo("ab cd ", len)) });
}
const REVIEW_8 = ["A", "A", "A", "A", "A", "A", "Párolgás a tengerből", "A"];
CASES.push({ name: "review #199: 8 fázis, „Középpont”", labels: REVIEW_8, center: "Középpont" });

test("E7: a nyílhézagok minden fázisszámnál elférnek (R > n·(node + 8)/π)", () => {
  for (const c of CASES) {
    const n = c.labels.length, L = layoutCycle(c.labels, c.center, !!c.moon);
    const arc = L.R * (2 * Math.PI / n) - 2 * (L.node + 8);
    assert.ok(arc > 0, `${c.name}: R=${L.R}, a nyíl íve ${arc.toFixed(2)} egység (visszafelé fordul)`);
  }
});

test("E8: exact elrendezésben minden feliratsor a saját köréhez a legközelebb; exact/drift: nincs átfedés", () => {
  let exact = 0;
  for (const c of CASES) {
    if (c.center) continue; // a középfelirat dobozát a böngészős spec méri; itt a körök és feliratok
    const n = c.labels.length, L = layoutCycle(c.labels, c.center, false);
    assert.ok(["exact", "drift", "overlap"].includes(L.fit), `${c.name}: ismeretlen fit ${String(L.fit)}`);
    assert.equal(L.labels.length, n, `${c.name}: minden felirat megvan`);
    if (L.fit === "exact") { exact++; assert.deepEqual(straysOf(L, n), [], `${c.name}: exact, mégis elcsúszott sor`); }
    if (L.fit === "overlap") continue;
    const circles = circlesOf(L, n), boxes = L.labels.map(boxOf);
    for (const [i, b] of boxes.entries()) {
      const hit = hitOf(b, circles, boxes.filter((_, j) => j !== i));
      assert.equal(hit, 0, `${c.name}: ${L.fit} elrendezésben a(z) ${i}. felirat átfedése ${hit.toFixed(2)}`);
    }
  }
  assert.ok(exact > 20, `legyen elég exact eset a mintában (${exact})`);
});

test("E8: a review #199 esete (8 fázis, „Párolgás a tengerből” a 6. helyen) nem számít exact-nak, és nem takar", () => {
  const L = layoutCycle(REVIEW_8, "Középpont", false);
  const strays = straysOf(L, REVIEW_8.length);
  if (L.fit === "exact") assert.deepEqual(strays, []);
  else assert.equal(L.fit, "drift", `nincs átfedés-mentes hely? fit=${L.fit}`);
  // A régi kód R = 104-en mindkét sort a 7. kör mellé tette — a legkisebb elcsúszás ennél kevesebb.
  assert.ok(strays.length < 2, `elcsúszott sorok: ${strays.join(", ")}`);
});

test("E9: a végső tartalék (overlap) feliratonként a legkisebb átfedés-mértékű jelöltet adja", () => {
  let checked = 0;
  for (const c of CASES) {
    if (c.center) continue;
    const n = c.labels.length, L = layoutCycle(c.labels, undefined, false);
    if (L.fit !== "overlap") continue;
    assert.equal(L.R, R_MAX, `${c.name}: a tartalék R_MAX-on fut`);
    const circles = circlesOf(L, n), nodes = nodesOf(L, n), placed: Box[] = [];
    for (const [i, lab] of L.labels.entries()) {
      const { w, h } = sizeOf(lab.lines), box = boxOf(lab);
      const chosen = hitOf(box, circles, placed);
      let best = Infinity;
      for (const off of OFFSETS) for (const extra of EXTRAS) {
        const th = angle(i, n) + (off * Math.PI) / 180, ux = Math.cos(th), uy = Math.sin(th);
        const d = L.node + 8 + extra + Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2;
        const bx = nodes[i].x + ux * d, by = nodes[i].y + uy * d;
        best = Math.min(best, hitOf({ l: bx - w / 2, r: bx + w / 2, t: by - h / 2, b: by + h / 2 }, circles, placed));
      }
      assert.ok(chosen <= best + 1e-9, `${c.name}: a(z) ${i}. felirat átfedése ${chosen.toFixed(2)}, a legjobb jelölté ${best.toFixed(2)}`);
      placed.push(box);
      checked++;
    }
  }
  assert.ok(checked > 50, `legyen elég tartalék-eset a mintában (${checked})`);
});

test("a mérőlecke esetei (Mezopotámia, víz-körforgás, holdciklus) exact elrendezésűek, elcsúszás nélkül", () => {
  const probes: Array<[string[], string, boolean]> = [
    [["Áradás előrejelzése", "Tavaszi áradás", "Száraz időszak", "Tavak és csatornák"], "Mezopotámia", false],
    [["Párolgás a tengerből", "Felhőképződés", "Csapadékhullás", "Beszivárgás a talajba", "Felszíni lefolyás", "Visszatérés a tengerbe"], "Víz", false],
    [["Újhold", "Növő sarló", "Első negyed", "Növő hold", "Telihold", "Fogyó hold", "Utolsó negyed", "Fogyó sarló"], "Föld", true],
  ];
  for (const [labels, center, moon] of probes) {
    const L = layoutCycle(labels, center, moon);
    assert.equal(L.fit, "exact", center);
    assert.deepEqual(straysOf(L, labels.length), [], center);
  }
});
