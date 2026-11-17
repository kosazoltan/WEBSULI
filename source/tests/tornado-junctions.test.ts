import assert from "node:assert/strict";
import test from "node:test";

import { createRng } from "../shared/game-rng";
import {
  DETOUR_MAX_SEC,
  DETOUR_MIN_SEC,
  JUNCTION_GAP_MAX_MS,
  JUNCTION_GAP_MIN_MS,
  JUNCTION_LINE_MAX,
  JUNCTION_LINE_MIN,
  NITRO_MS,
  TURBO_GAP_MAX_MS,
  TURBO_GAP_MIN_MS,
  TURBO_PAD_LIFE_MS,
  detourSeconds,
  freezeJunction,
  gateOffset,
  gatePoint,
  junctionCrossing,
  junctionEffect,
  junctionLineDistance,
  junctionLocal,
  nextJunctionGapMs,
  nextTurboGapMs,
  padReached,
  planJunction,
  planTurboPad,
} from "../client/src/lib/tornado/junctions";
import { createChaseCore, tornadoDirectorConfig, type ChaseEvent } from "../client/src/lib/tornado/sim";
import { collidersNear, resolveVehicleCollisions } from "../client/src/lib/tornado/collision";
import { ROAD_SPACING } from "../client/src/lib/tornado/world";
import { bankPlayQuestion, createQuestionDirector, restoreReviewQuestion } from "../client/src/game-engine/play/questionDirector";
import { createReviewQueue } from "../client/src/game-engine/play/reviewQueue";
import { createQuestionUi } from "../client/src/game-engine/play/questionUi";

/**
 * J7b — útelágazás (Q1) és turbópad (Q3): ütemezés, a kapuk geometriája, a választás az áthajtás irányából, a 3 opció
 * visszaképezése a kérdés eredeti indexére, és a „helyes út rövidebb” játékbeli hatás (végrehajtás J7b 2., 4., 5.;
 * „J7b döntések” 1–3.).
 */

const rng = () => createRng("junction-test").next;

test("ütemezés: elágazás 15–20 mp-enként, turbópad 25–30 mp-enként, kerülő 8–12 mp — seedelt és a sávon belül", () => {
  const r = rng();
  const gaps = Array.from({ length: 500 }, () => nextJunctionGapMs(r));
  assert.ok(gaps.every((g) => g >= JUNCTION_GAP_MIN_MS && g <= JUNCTION_GAP_MAX_MS));
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 3000, "nem állandó (seedelt szórás)");
  const pads = Array.from({ length: 500 }, () => nextTurboGapMs(r));
  assert.ok(pads.every((g) => g >= TURBO_GAP_MIN_MS && g <= TURBO_GAP_MAX_MS));
  const detours = Array.from({ length: 500 }, () => detourSeconds(r));
  assert.ok(detours.every((d) => Number.isInteger(d) && d >= DETOUR_MIN_SEC && d <= DETOUR_MAX_SEC));
  assert.deepEqual([...new Set(detours)].sort((a, b) => a - b), [8, 9, 10, 11, 12]);
  // Azonos seed → azonos sorozat.
  const a = rng();
  const b = rng();
  for (let i = 0; i < 20; i++) assert.equal(nextJunctionGapMs(a), nextJunctionGapMs(b));
});

test("a kapuvonal a sebesség × ablak 85%-ánál, 30–110 egység között (álló járműnél is elérhető)", () => {
  assert.equal(junctionLineDistance(0, 5500), JUNCTION_LINE_MIN);
  assert.equal(junctionLineDistance(16, 5500), 16 * 5.5 * 0.85);
  assert.equal(junctionLineDistance(-16, 5500), 16 * 5.5 * 0.85, "tolatásnál is a sebesség nagysága számít");
  assert.equal(junctionLineDistance(40, 9000), JUNCTION_LINE_MAX);
  assert.equal(junctionLineDistance(Number.NaN, 5500), JUNCTION_LINE_MIN);
});

test("három kapu a menetirányra merőleges vonalon: bal / egyenes / jobb, a kapupontok a vonalon", () => {
  for (const heading of [0, Math.PI / 2, Math.PI, -0.7]) {
    const j = planJunction({ pose: { x: 100, z: -50, heading }, speed: 15, windowMs: 5000, questionId: 1, optionCount: 3, rng: rng() });
    assert.deepEqual([0, 1, 2].map((i) => gateOffset(j, i)), [-16, 0, 16]);
    assert.equal(j.frozen, false, "a táblák várakozva indulnak (J7b döntések 13.)");
    for (let i = 0; i < 3; i++) {
      const g = gatePoint(j, i);
      const loc = junctionLocal(j, g.x, g.z);
      assert.ok(Math.abs(loc.forward - j.line) < 1e-9 && Math.abs(loc.lateral - gateOffset(j, i)) < 1e-9);
    }
  }
  // Észak felé haladva (heading 0) a bal kapu nyugatra (kisebb x) esik.
  const north = planJunction({ pose: { x: 0, z: 0, heading: 0 }, speed: 10, windowMs: 5000, questionId: 1, optionCount: 3, rng: rng() });
  assert.ok(gatePoint(north, 0).x < gatePoint(north, 2).x);
  assert.ok(gatePoint(north, 1).z < 0, "előre = −Z");
});

test("a választás az áthajtás iránya: a keresztezés pontjának szektora; tolatás és a vonal előtt maradás nem választ", () => {
  const j = planJunction({ pose: { x: 0, z: 0, heading: 0 }, speed: 10, windowMs: 6000, questionId: 7, optionCount: 3, rng: rng() });
  const line = j.line;
  const through = (lateral: number) => junctionCrossing(j, { x: lateral, z: -(line - 1) }, { x: lateral, z: -(line + 1) });
  // Várakozó (nem rögzült) táblán át nincs választás (B1: szándék nélkül nincs kapuátlépés).
  assert.equal(through(0), null);
  j.frozen = true;
  assert.equal(through(-25), 0);
  assert.equal(through(-9), 0);
  assert.equal(through(-7), 1);
  assert.equal(through(0), 1);
  assert.equal(through(7), 1);
  assert.equal(through(9), 2);
  assert.equal(through(400), 2, "a szélső szektor a végtelenig tart");
  // Ferdén áthajtva a keresztezés pontja számít (nem a kiinduló vagy a végpont oldaliránya).
  assert.equal(junctionCrossing(j, { x: -22, z: -(line - 10) }, { x: 10, z: -(line + 10) }), 1);
  assert.equal(junctionCrossing(j, { x: 0, z: -(line + 1) }, { x: 0, z: -(line - 1) }), null, "visszafelé");
  assert.equal(junctionCrossing(j, { x: 0, z: -(line - 5) }, { x: 0, z: -(line - 1) }), null, "még a vonal előtt");
});

test("a helyes út rövidebb: helyes = nitró (turbó), rossz = 8–12 mp kerülő, lejárat / megszakítás = semmi", () => {
  const j = { detourSec: 10 };
  assert.deepEqual(junctionEffect("correct", j), { nitroMs: NITRO_MS, detourSec: 0 });
  assert.deepEqual(junctionEffect("wrong", j), { nitroMs: 0, detourSec: 10 });
  assert.deepEqual(junctionEffect("timeout", j), { nitroMs: 0, detourSec: 0 });
  assert.deepEqual(junctionEffect("aborted", j), { nitroMs: 0, detourSec: 0 });
});

test("turbópad: a jármű előtt jelenik meg, a körén belül érhető el, 12 mp-ig él", () => {
  const pad = planTurboPad({ x: 10, z: 10, heading: Math.PI }, 5000);
  assert.ok(Math.abs(pad.x - 10) < 1e-9 && pad.z > 10, "dél felé haladva a pad +Z irányban");
  assert.equal(pad.expiresAtMs, 5000 + TURBO_PAD_LIFE_MS);
  assert.ok(padReached(pad, pad.x + 5, pad.z));
  assert.ok(!padReached(pad, pad.x + 15, pad.z));
});

/* ---- a közös magon át: 3 opció visszaképezve a kérdés eredeti indexére ---- */

function harness() {
  const provider = {
    couponOnly: false,
    material: () => null,
    fresh: () => {
      n += 1;
      return bankPlayQuestion("tornado-hunter-200", { id: `t-${n}`, prompt: `${n} + ${n} = ?`, options: [String(2 * n), "x", "y", "z"], correctIndex: 0, explanation: "." });
    },
    restore: (item: Parameters<typeof restoreReviewQuestion>[0]) => restoreReviewQuestion(item, {}),
  };
  let n = 0;
  const director = createQuestionDirector({
    config: { ...tornadoDirectorConfig(7), promptFits: undefined, readingAware: false, warmupMs: 0 },
    provider,
    review: createReviewQueue(null),
    rng: createRng("jt-q"),
    startBand: 0.4,
    now: () => 0,
  });
  const outcomes: Array<{ result: string; picked: number | null; correctIdx: number }> = [];
  let core: ReturnType<typeof createChaseCore> | null = null;
  const ui = createQuestionUi({
    director: () => director,
    onView: () => {},
    onShow: (p) => core!.onShow(p),
    onOutcome: (o, p) => {
      outcomes.push({ result: o.result, picked: o.pickedOriginalIndex, correctIdx: o.correctOriginalIndex });
      core!.onOutcome(o, p);
    },
  });
  core = createChaseCore({
    seed: 3,
    collidersAt: () => [],
    questions: {
      frame: (c, ctx) => ui.frame(c, ctx),
      request: (r, c) => ui.request(r, c),
      pick: (i, c) => ui.pick(i, c),
      active: () => ui.active(),
      abort: () => ui.abort(),
      canAsk: () => ui.canAsk(),
      pending: () => ui.view().pending !== null,
    },
  });
  return { core, ui, outcomes };
}

/** Egy jármű 1/60 s-os lépésekben a `target` oldalirányú sávban halad előre (észak felé), amíg a vonalat át nem lépi. */
function driveThrough(h: ReturnType<typeof harness>, gate: number | "none" | "passive", maxSteps = 600): ChaseEvent[] {
  const events: ChaseEvent[] = [];
  let x = 0;
  let z = 0;
  h.core.step(1000 / 60, { x, z, heading: 0, speed: 15 }, { hold: false }); // az első lépés megnyitja az ütemezett kérdést
  events.push(...h.core.drainEvents());
  assert.ok(h.core.junction(), "az ütemezett kérdés elágazást nyitott");
  for (let i = 0; i < maxSteps && h.core.junction(); i++) {
    const j = h.core.junction()!;
    // "passive": egyenesen halad, a vezérlőhöz nem nyúl; "none": áll, és nem nyúl semmihez.
    if (typeof gate === "number" && j.frozen) x += Math.max(-0.5, Math.min(0.5, j.ox + gateOffset(j, gate) - x));
    if (gate !== "none") z -= 0.25;
    // A döntés jelzése: koppintás (a lap a táblára koppintást / billentyűt így jelzi).
    h.core.step(1000 / 60, { x, z, heading: 0, speed: 15, tap: typeof gate === "number" && i === 30 }, { hold: false });
    events.push(...h.core.drainEvents());
  }
  return events;
}

test("a kérdés-sáv 3 opciója = a 3 kapu; az áthajtott kapu az opció eredeti indexére képeződik vissza", () => {
  for (let gate = 0; gate < 3; gate++) {
    const h = harness();
    const events = driveThrough(h, gate);
    const shown = events.find((e) => e.kind === "junction");
    assert.ok(shown && shown.kind === "junction" && shown.junction.gates === 3);
    const done = events.find((e) => e.kind === "junction-done");
    assert.ok(done && done.kind === "junction-done", "a kapu áthajtása lezárta a kérdést");
    const p = h.ui.view().presentation!;
    const o = h.outcomes[0]!;
    assert.equal(o.picked, p.options[gate]!.originalIndex, `a(z) ${gate}. kapu a(z) ${gate}. opció`);
    const correctGate = p.options.findIndex((opt) => opt.correct);
    assert.equal(o.result, gate === correctGate ? "correct" : "wrong");
    if (done.kind === "junction-done") {
      if (gate === correctGate) assert.equal(done.nitroMs, NITRO_MS);
      else assert.ok(done.detourSec >= DETOUR_MIN_SEC && done.detourSec <= DETOUR_MAX_SEC && done.nitroMs === 0);
    }
    if (gate === correctGate) assert.ok(h.core.nitroLeftMs() > 0);
    else assert.equal(h.core.detourTotalSec(), done.kind === "junction-done" ? done.detourSec : -1);
  }
});

test("nem hajt át egyik kapun sem: a kérdés lejár (időtúllépés), büntetés nélkül; az elágazás eltűnik", () => {
  const h = harness();
  const events = driveThrough(h, "none");
  const done = events.find((e) => e.kind === "junction-done");
  assert.ok(done && done.kind === "junction-done" && done.result === "timeout" && done.detourSec === 0 && done.nitroMs === 0);
  assert.equal(h.core.junction(), null);
});

test("B1: szándék nélkül egyenesen hajtva sincs válasz — a táblák várnak, a kérdés lejár, a nyilvántartásban lejárt", () => {
  const h = harness();
  const events = driveThrough(h, "passive");
  assert.equal(events.some((e) => e.kind === "junction-frozen"), false, "szándék nélkül nem rögzül");
  const done = events.find((e) => e.kind === "junction-done");
  assert.ok(done && done.kind === "junction-done" && done.result === "timeout" && done.detourSec === 0);
  assert.equal(h.outcomes[0]!.result, "timeout");
  assert.equal(h.outcomes[0]!.picked, null);
});

test("B1 / R1: a tartott kormány és a rezgés nem szándék; a ≥ 1 s olvasás után FENNTARTOTT (≥ 0,6, 0,5 s) kitérés az", () => {
  const h = harness();
  const step = (i: number, steer: number, extra: { tap?: boolean; reverse?: boolean } = {}) =>
    h.core.step(1000 / 60, { x: 0, z: -i * 0.25, heading: 0, speed: 15, steer, ...extra }, { hold: false });
  step(0, 0.8); // a kérdés a már tartott kormánnyal nyílik
  for (let i = 1; i < 40; i++) step(i, 0.8);
  assert.equal(h.core.intentSeen(), false, "a megjelenéskori kormány nem szándék");
  // Rezgés: nagy, de rövid kitérések váltakozó irányba — nem szándék.
  for (let i = 40; i < 160; i++) step(i, i % 20 < 10 ? 0.1 : 1.5);
  assert.equal(h.core.intentSeen(), false, "a rövid / váltakozó kitérés nem szándék");
  // Az első 1 s-ban a fenntartott kitérés sem számít (minimális olvasás): új kérdésen mérve.
  const h2 = harness();
  h2.core.step(1000 / 60, { x: 0, z: 0, heading: 0, speed: 15, steer: 0 }, { hold: false });
  for (let i = 1; i < 50; i++) h2.core.step(1000 / 60, { x: 0, z: -i * 0.25, heading: 0, speed: 15, steer: -0.9 }, { hold: false });
  assert.equal(h2.core.intentSeen(), false, "1 s olvasás előtt a kormány nem szándék");
  for (let i = 50; i < 100; i++) h2.core.step(1000 / 60, { x: 0, z: -i * 0.25, heading: 0, speed: 15, steer: -0.9 }, { hold: false });
  assert.equal(h2.core.intentSeen(), true, "1 s után a fenntartott kitérés szándék");
  assert.equal(h2.core.junction()!.frozen, true, "a szándék után rögzül");
  // A koppintás és a hátrahúzott gáz (R5) azonnal szándék.
  const h3 = harness();
  h3.core.step(1000 / 60, { x: 0, z: 0, heading: 0, speed: 15 }, { hold: false });
  h3.core.step(1000 / 60, { x: 0, z: -0.25, heading: 0, speed: 15, reverse: true }, { hold: false });
  assert.equal(h3.core.intentSeen(), true, "a hátrahúzott gáz szándék");
});

test("R1: rögzüléskor a kapuk a PILLANATNYI menetirányhoz igazodnak (a középső egyenesen előre)", () => {
  const h = harness();
  h.core.step(1000 / 60, { x: 0, z: 0, heading: 0, speed: 15 }, { hold: false });
  h.core.step(1000 / 60, { x: 0, z: -0.25, heading: 0.6, speed: 15, tap: true }, { hold: false });
  const j = h.core.junction()!;
  assert.equal(j.frozen, true);
  assert.ok(Math.abs(j.fx - Math.sin(0.6)) < 1e-9 && Math.abs(j.fz + Math.cos(0.6)) < 1e-9, "a tengely a rögzüléskori irány");
});

test("R2: rögzüléskor a kérdés határideje legalább a kapuig érés + 0,4 s", () => {
  const h = harness();
  h.core.step(1000 / 60, { x: 0, z: 0, heading: 0, speed: 15 }, { hold: false });
  const p = h.ui.active()!;
  // Az ablak vége előtt 0,5 s-mal jelez szándékot.
  const until = p.startedAtSimMs + p.windowMs - 500;
  let i = 1;
  while (h.core.clockMs() < until) h.core.step(1000 / 60, { x: 0, z: -(i++) * 0.25, heading: 0, speed: 15 }, { hold: false });
  h.core.step(1000 / 60, { x: 0, z: -i * 0.25, heading: 0, speed: 15, tap: true }, { hold: false });
  const j = h.core.junction()!;
  assert.ok(j.frozen);
  const deadline = p.startedAtSimMs + p.windowMs;
  assert.ok(deadline >= h.core.clockMs() + (j.line / 15) * 1000 + 400 - 1, `határidő ${deadline} < kapuig érés`);
});

test("horgonyzott / mérési sávbeli tartásnál nem nyílik elágazás és nem jön turbópad", () => {
  const h = harness();
  for (let i = 0; i < 60 * 40; i++) h.core.step(1000 / 60, { x: 0, z: 0, heading: 0, speed: 0 }, { hold: true });
  assert.equal(h.core.junction(), null);
  assert.equal(h.core.pad(), null);
  assert.equal(h.ui.active(), null);
  // A horgony-kérdés viszont kérhető tartás alatt is (a sávban ezért áll meg a gyerek).
  assert.equal(h.core.requestAnchor(), true);
  assert.equal(h.core.kindOf(h.ui.active()!.id), "anchor");
});

test("a horgony-kérés a nyitott elágazást megszakítja (nem hiba, nem kerülő), és horgony-kérdést nyit", () => {
  const h = harness();
  h.core.step(1000 / 60, { x: 0, z: 0, heading: 0, speed: 15 }, { hold: false });
  assert.ok(h.core.junction());
  for (let i = 0; i < 120; i++) h.core.step(1000 / 60, { x: 0, z: 0, heading: 0, speed: 0 }, { hold: true });
  assert.equal(h.core.requestAnchor(), true);
  assert.equal(h.outcomes[0]!.result, "aborted");
  assert.equal(h.core.detourTotalSec(), 0);
  assert.equal(h.core.junction(), null);
  assert.equal(h.core.kindOf(h.ui.active()!.id), "anchor");
});

test("turbópad a magon át: elérve turbó-kérdés (gomb-mód), jó válaszra 3 mp nitró", () => {
  const h = harness();
  // Elágazás nélkül (a kapukat áthajtva gyorsan lezárjuk), a pad 25–30 mp után jön.
  let x = 0;
  let z = 0;
  let turbo: number | null = null;
  for (let i = 0; i < 60 * 70 && turbo === null; i++) {
    const pad = h.core.pad();
    const j = h.core.junction();
    if (j) {
      const loc = junctionLocal(j, x, z);
      x += Math.max(-0.4, Math.min(0.4, gateOffset(j, 1) - loc.lateral));
      z -= 0.3;
    } else if (pad) {
      x += Math.max(-0.4, Math.min(0.4, pad.x - x));
      z += Math.max(-0.4, Math.min(0.4, pad.z - z));
    } else z -= 0.25;
    h.core.step(1000 / 60, { x, z, heading: 0, speed: 15 }, { hold: false });
    const act = h.ui.active();
    if (act && h.core.kindOf(act.id) === "turbo") turbo = act.id;
    h.core.drainEvents();
  }
  assert.ok(turbo !== null, "a pad elérése turbó-kérdést nyitott");
  const p = h.ui.active()!;
  h.ui.pick(p.options.findIndex((o) => o.correct), h.core.clockMs());
  assert.equal(h.core.nitroLeftMs(), NITRO_MS);
  assert.equal(h.core.pad(), null);
});

test("M2: rögzüléskor mindhárom kapuhoz szabad út vezet — 400 útpozíció, a valódi világ ütközőivel, független próbával", () => {
  const r = createRng("m2-roads");
  let frozen = 0;
  let blocked = 0;
  let waiting = 0;
  const dims = { width: 2.4, length: 5.2 };
  for (let k = 0; k < 400; k++) {
    // É–D-i és K–Ny-i utakon (300 egységes rács), menetirányban.
    const alongZ = k % 2 === 0;
    const line = ROAD_SPACING * (r.int(7) - 3);
    const t = (r.next() - 0.5) * 2000;
    const heading = alongZ ? (r.next() < 0.5 ? 0 : Math.PI) : r.next() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    const pose = alongZ ? { x: line, z: t, heading } : { x: t, z: line, heading };
    const speed = 6 + r.next() * 24;
    const j = planJunction({ pose, speed, windowMs: 6000, questionId: k, optionCount: 3, rng: r.next });
    if (!freezeJunction(j, pose, speed, collidersNear)) {
      waiting += 1;
      continue;
    }
    frozen += 1;
    for (let i = 0; i < 3; i++) {
      const g = gatePoint(j, i);
      const h = Math.atan2(g.x - pose.x, -(g.z - pose.z));
      const len = Math.hypot(g.x - pose.x, g.z - pose.z);
      for (let d = 0; d <= len; d += 1.5) {
        const x = pose.x + Math.sin(h) * d;
        const z = pose.z - Math.cos(h) * d;
        if (resolveVehicleCollisions({ x, z, heading: h, speed: 10 }, dims, collidersNear(x, z)).hit) {
          blocked += 1;
          break;
        }
      }
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[tornado-junctions] M2: rögzült ${frozen}, tovább vár ${waiting}, elzárt kapu ${blocked}`);
  assert.equal(blocked, 0, "elzárt kapu rögzült elágazásban");
  assert.ok(frozen >= 300, `kevés rögzülés: ${frozen}/400`);
});
