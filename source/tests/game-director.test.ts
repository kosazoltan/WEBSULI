import assert from "node:assert/strict";
import test from "node:test";
import {
  createIntensityDirector,
  DECAY_PER_SEC,
  PEAK_ENTER,
  RELAX_ENTER,
  type DirectorPhase,
  type IntensityDirector,
} from "../client/src/game-engine/play/director";

/**
 * J0a — mini-Director (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J0a, KSZ-15; terv 6.1).
 *
 * A menet hullámzik: felépülés → csúcs → lecsengés → pihenő. A kérdés a nyugodt pillanatra (pihenő / lecsengés) esik, hogy
 * a gyerek ne a legnagyobb harc közepén olvasson. A teszt az időzítéseket a szabályból számolja (kommentben).
 */

const DT = 1 / 60;

/** `seconds` ideig lépteti; minden lépésben a `perStep` jelzéseket adja; visszaadja a fázisváltások sorát időbélyeggel. */
function run(d: IntensityDirector, seconds: number, perStep: (dir: IntensityDirector) => void = () => {}) {
  const changes: Array<{ phase: DirectorPhase; at: number }> = [];
  let prev = d.phase();
  const steps = Math.round(seconds / DT);
  for (let i = 1; i <= steps; i++) {
    perStep(d);
    d.update(DT);
    if (d.phase() !== prev) {
      prev = d.phase();
      changes.push({ phase: prev, at: i * DT });
    }
  }
  return changes;
}

// SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md K.2 „Megvalósult eltérések”, közös
// utójavítás a): a kezdő, nyugodt (0 intenzitású) felépülő fázis NYUGODT — a kérdés-ütemező itt is kérdezhet. A szigor
// megmarad: a buildup fázisban a `calm()` pontosan akkor igaz, ha a szint `RELAX_ENTER` alatt van (lent, minden mintán).
test("kezdet: buildup, 0 intenzitás, nyugodt (a szint a pihenő-küszöb alatt)", () => {
  const d = createIntensityDirector();
  assert.equal(d.phase(), "buildup");
  assert.equal(d.intensity(), 0);
  assert.equal(d.calm(), true);
  d.signal("damage"); // 0,25 = RELAX_ENTER: már nem a küszöb alatt
  assert.equal(d.calm(), false);
});

test("jelzések: sérülés +0,25, rossz válasz +0,1, közeli veszély +0,05/s, plafon 1", () => {
  const d = createIntensityDirector();
  d.signal("damage");
  assert.ok(Math.abs(d.intensity() - 0.25) < 1e-12);
  d.signal("wrong");
  assert.ok(Math.abs(d.intensity() - 0.35) < 1e-12);
  d.signal("nearThreat", 2);
  assert.ok(Math.abs(d.intensity() - 0.45) < 1e-12);
  d.signal("combat");
  assert.ok(Math.abs(d.intensity() - 0.45) < 1e-12, "a combat nem emel, csak a lecsengést tartja vissza");
  for (let i = 0; i < 10; i++) d.signal("damage");
  assert.equal(d.intensity(), 1);
});

test("lecsengés −0,15/s harc nélkül; harc közben nem csökken; a rossz válasz nem számít harcnak", () => {
  const d = createIntensityDirector();
  d.signal("damage");
  d.signal("damage"); // 0,5 — a csúcs-küszöb (0,7) alatt
  run(d, 1, (dir) => dir.signal("combat"));
  assert.ok(Math.abs(d.intensity() - 0.5) < 1e-9, `harc közben ${d.intensity()}`);
  run(d, 1);
  assert.ok(Math.abs(d.intensity() - (0.5 - DECAY_PER_SEC)) < 1e-9, `1 s harc nélkül ${d.intensity()}`);
  const before = d.intensity();
  d.signal("wrong");
  d.update(1);
  assert.ok(Math.abs(d.intensity() - (before + 0.1 - DECAY_PER_SEC)) < 1e-9);
});

test("fázisok sorrendje és időzítése: buildup → peak → fade → relax → buildup", () => {
  const d = createIntensityDirector();
  // 3 sérülés = 0,75 ≥ 0,7 → az első update-en csúcs.
  d.signal("damage");
  d.signal("damage");
  d.signal("damage");
  // Folyamatos harc mellett az intenzitás nem csökken, így a csúcs a felső korlátig (4 s) tart.
  const changes = run(d, 40, (dir) => {
    if (dir.phase() === "buildup" || dir.phase() === "peak") dir.signal("combat");
  });
  const phases = changes.map((c) => c.phase);
  assert.deepEqual(phases.slice(0, 4), ["peak", "fade", "relax", "buildup"]);
  const at = (p: DirectorPhase) => changes.find((c) => c.phase === p)!.at;
  const peakLen = at("fade") - at("peak");
  assert.ok(Math.abs(peakLen - 4) <= DT * 1.5, `csúcs ${peakLen} s (elvárt: 4 s, a peakSec felső korlátja)`);
  // Lecsengés: 0,75 → 0,25 harc nélkül 0,15/s-mal = 3,33 s.
  const fadeLen = at("relax") - at("fade");
  assert.ok(Math.abs(fadeLen - (0.75 - RELAX_ENTER) / DECAY_PER_SEC) <= DT * 1.5, `lecsengés ${fadeLen} s`);
  // Pihenő jelzés nélkül a felső korlátig (15 s) tart.
  const relaxLen = at("buildup") - at("relax");
  assert.ok(Math.abs(relaxLen - 15) <= DT * 1.5, `pihenő ${relaxLen} s`);
});

test("a csúcs a minimum (2 s) után véget ér, ha az intenzitás a küszöb alá esik", () => {
  const d = createIntensityDirector();
  d.signal("damage");
  d.signal("damage");
  d.signal("damage"); // 0,75; harc nélkül 0,15/s → 0,33 s alatt a 0,7 alá esik, de a csúcs legalább 2 s
  const changes = run(d, 6);
  const peak = changes.find((c) => c.phase === "peak")!;
  const fade = changes.find((c) => c.phase === "fade")!;
  assert.ok(Math.abs(fade.at - peak.at - 2) <= DT * 1.5, `csúcs ${fade.at - peak.at} s`);
  assert.ok(d.intensity() < PEAK_ENTER);
});

test("a pihenő a minimum (8 s) után az első harc-jelzésre véget ér, előtte nem", () => {
  const d = createIntensityDirector();
  d.signal("damage");
  d.signal("damage");
  d.signal("damage");
  run(d, 20, (dir) => {
    if (dir.phase() !== "relax" && dir.phase() !== "fade") dir.signal("combat");
  });
  // Csúcs 4 s + lecsengés 3,33 s → a pihenő ~7,35 s-nál kezdődött; 20 s-nál ~12,7 s pihenő telt el harc-jelzés nélkül,
  // a felső korlát 15 s → még pihenő.
  assert.equal(d.phase(), "relax");
  const fresh = createIntensityDirector();
  fresh.signal("damage");
  fresh.signal("damage");
  fresh.signal("damage");
  run(fresh, 4 + 3.5, (dir) => {
    if (dir.phase() === "peak" || dir.phase() === "buildup") dir.signal("combat");
  });
  assert.equal(fresh.phase(), "relax");
  run(fresh, 2, (dir) => dir.signal("combat")); // a pihenő eleje: harc-jelzés < 8 s → marad
  assert.equal(fresh.phase(), "relax");
  run(fresh, 7, (dir) => dir.signal("combat")); // 8 s után az első harc-jelzésre → buildup
  assert.equal(fresh.phase(), "buildup");
});

// SPEC-VÁLTOZÁS 2026-11-16 (közös utójavítás a): buildup alatt a `calm()` = szint < RELAX_ENTER (korábban mindig hamis).
test("calm(): relax és fade alatt igaz, buildup alatt pontosan a pihenő-küszöb alatt, rövid peak alatt hamis; 4 s-nál hosszabb peak alatt igaz", () => {
  const d = createIntensityDirector();
  d.signal("damage");
  d.signal("damage");
  d.signal("damage");
  const seen = new Map<DirectorPhase, Set<boolean>>();
  let buildupSamples = 0;
  run(d, 30, (dir) => {
    if (dir.phase() === "peak") dir.signal("combat");
    const set = seen.get(dir.phase()) ?? new Set<boolean>();
    set.add(dir.calm());
    seen.set(dir.phase(), set);
    if (dir.phase() === "buildup") {
      buildupSamples += 1;
      assert.equal(dir.calm(), dir.intensity() < RELAX_ENTER, `buildup, szint ${dir.intensity()}`);
    }
  });
  assert.deepEqual([...seen.get("relax")!], [true]);
  assert.deepEqual([...seen.get("fade")!], [true]);
  assert.ok(buildupSamples > 0, "a futás buildup fázist is mintázott");
  assert.ok(seen.get("buildup")!.has(false), "magas szintű buildup alatt nem nyugodt");
  assert.deepEqual([...seen.get("peak")!], [false], "az alap 2–4 s-os csúcs sosem hosszabb 4 s-nál");

  const long = createIntensityDirector({ peakSec: [2, 8] });
  long.signal("damage");
  long.signal("damage");
  long.signal("damage");
  run(long, 3, (dir) => dir.signal("combat"));
  assert.equal(long.phase(), "peak");
  assert.equal(long.calm(), false);
  run(long, 1.5, (dir) => dir.signal("combat"));
  assert.equal(long.phase(), "peak");
  assert.equal(long.calm(), true, "4 s-nál hosszabb csúcs alatt kérdés jöhet");
});

test("determinisztikus: azonos jelzés-sorozat → azonos fázis- és intenzitás-görbe", () => {
  const trace = () => {
    const d = createIntensityDirector({ peakSec: [2, 3], relaxSec: [5, 9] });
    const out: string[] = [];
    for (let i = 0; i < 3000; i++) {
      if (i % 97 === 0) d.signal("damage");
      if (i % 13 === 0) d.signal("nearThreat", DT);
      if (i % 211 === 0) d.signal("wrong");
      d.update(DT);
      out.push(`${d.phase()}:${d.intensity().toFixed(12)}`);
    }
    return out;
  };
  assert.deepEqual(trace(), trace());
});

test("érvénytelen beállítás és lépés", () => {
  assert.throws(() => createIntensityDirector({ peakSec: [4, 2] }), RangeError);
  assert.throws(() => createIntensityDirector({ relaxSec: [-1, 5] }), RangeError);
  const d = createIntensityDirector();
  d.signal("damage");
  d.update(Number.NaN);
  d.update(-1);
  assert.ok(Math.abs(d.intensity() - 0.25) < 1e-12, "érvénytelen dt nem lépteti");
});
