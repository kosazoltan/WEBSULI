import assert from "node:assert/strict";
import test from "node:test";
import { createRng } from "../shared/game-rng";
import { createFixedLoop } from "../client/src/game-engine/play/loop";
import {
  createFeel,
  HITSTOP_COOLDOWN_MS,
  MAX_SHAKE_FRACTION,
  MAX_SHAKE_ROT_RAD,
  tween,
  type ShakeOffset,
} from "../client/src/game-engine/play/feel";

/**
 * J0a — játékérzet (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J0a, K.4/19, KSZ-10; terv 4.2, 6.1).
 *
 * A gyerekeknek szóló játékban a rázás mértékletes (plafon), lecseng, és csökkentett mozgásnál NINCS (rosszullét-kockázat).
 * A hitstop csak a szimulációt állítja meg, rövid ideig, és nem írja felül a szünetet / kérdés alatti lassítást.
 */

const fx = () => {
  const rng = createRng("fx");
  return () => rng.next();
};

/** A legnagyobb eltolás `durationMs` alatt, `stepMs` lépésekben mintavételezve (a trauma közben cseng). */
function maxShake(feel: ReturnType<typeof createFeel>, h: number, durationMs: number, stepMs = 4) {
  const out: ShakeOffset = { x: 0, y: 0, rot: 0 };
  let x = 0;
  let y = 0;
  let rot = 0;
  for (let t = 0; t < durationMs; t += stepMs) {
    feel.shakeOffset(out, h);
    x = Math.max(x, Math.abs(out.x));
    y = Math.max(y, Math.abs(out.y));
    rot = Math.max(rot, Math.abs(out.rot));
    feel.update(stepMs);
  }
  return { x, y, rot };
}

test("a trauma plafonja 1: a rázás legfeljebb a képmagasság 1%-a és 2,5°", () => {
  const feel = createFeel({ reducedMotion: false, fxRng: fx() });
  feel.addTrauma(0.7);
  feel.addTrauma(0.7);
  feel.addTrauma(5);
  const h = 800;
  const m = maxShake(feel, h, 200, 1);
  assert.ok(m.x <= h * MAX_SHAKE_FRACTION + 1e-9, `x = ${m.x}`);
  assert.ok(m.y <= h * MAX_SHAKE_FRACTION + 1e-9, `y = ${m.y}`);
  assert.ok(m.rot <= MAX_SHAKE_ROT_RAD + 1e-12, `rot = ${m.rot}`);
  assert.ok(m.x > 0 && m.y > 0 && m.rot > 0, "teljes traumánál van rázás");
});

test("a rázás trauma²-arányos: fél trauma legfeljebb negyed akkora eltolás", () => {
  const h = 1000;
  const full = createFeel({ reducedMotion: false, fxRng: fx() });
  const half = createFeel({ reducedMotion: false, fxRng: fx() });
  full.addTrauma(1);
  half.addTrauma(0.5);
  const out: ShakeOffset = { x: 0, y: 0, rot: 0 };
  const outFull: ShakeOffset = { x: 0, y: 0, rot: 0 };
  // Ugyanaz a zajrács (azonos fxRng-seed) és ugyanaz az időpont → az arány pontosan 0,25.
  half.shakeOffset(out, h);
  full.shakeOffset(outFull, h);
  assert.ok(Math.abs(out.x - outFull.x * 0.25) < 1e-9);
  assert.ok(Math.abs(out.rot - outFull.rot * 0.25) < 1e-12);
});

test("a trauma lecseng (0,8/s): 1,25 s után nincs rázás", () => {
  const feel = createFeel({ reducedMotion: false, fxRng: fx() });
  feel.addTrauma(1);
  const early = maxShake(feel, 1000, 100);
  feel.update(1250);
  const out: ShakeOffset = { x: 9, y: 9, rot: 9 };
  feel.shakeOffset(out, 1000);
  assert.deepEqual(out, { x: 0, y: 0, rot: 0 });
  assert.ok(early.x > 0);
});

test("csökkentett mozgásnál az eltolás mindig 0", () => {
  const feel = createFeel({ reducedMotion: true, fxRng: fx() });
  feel.addTrauma(1);
  const m = maxShake(feel, 1000, 500, 1);
  assert.deepEqual(m, { x: 0, y: 0, rot: 0 });
});

test("azonos fxRng-seed → azonos rázás-görbe (kozmetika is visszajátszható)", () => {
  const sample = () => {
    const feel = createFeel({ reducedMotion: false, fxRng: fx() });
    feel.addTrauma(0.9);
    const out: ShakeOffset = { x: 0, y: 0, rot: 0 };
    const xs: number[] = [];
    for (let i = 0; i < 50; i++) {
      feel.shakeOffset(out, 640);
      xs.push(out.x, out.y, out.rot);
      feel.update(16);
    }
    return xs;
  };
  assert.deepEqual(sample(), sample());
});

function loopWithCounter() {
  let steps = 0;
  const loop = createFixedLoop(() => steps++);
  return { loop, steps: () => steps };
}

test("hitstop: a sim áll a hitstop alatt, utána a korábbi lassítás (0,35) folytatódik", () => {
  const { loop, steps } = loopWithCounter();
  const feel = createFeel({ reducedMotion: false, loop, fxRng: fx() });
  loop.setTimeScale(0.35);
  let now = 0;
  loop.frame(now);
  feel.hitstop(80);
  for (let i = 0; i < 4; i++) {
    now += 16;
    feel.update(16);
    loop.frame(now);
  }
  assert.equal(steps(), 0, "64 ms-nál még tart a hitstop");
  for (let i = 0; i < 10; i++) {
    now += 16;
    feel.update(16);
    loop.frame(now);
  }
  assert.ok(steps() > 0, "a hitstop lejárt, a sim fut");
  assert.equal(loop.timeScale(), 0.35, "a kérdés alatti lassítás megmaradt");
});

test("a hitstop alatt kért szünet a hitstop után is szünet marad", () => {
  const { loop, steps } = loopWithCounter();
  const feel = createFeel({ reducedMotion: false, loop, fxRng: fx() });
  loop.frame(0);
  feel.hitstop(100);
  loop.setTimeScale(0);
  feel.update(200);
  loop.frame(500);
  assert.equal(steps(), 0);
  assert.equal(loop.timeScale(), 0);
});

test("hitstop 40–120 ms-ra szorítva, és 150 ms-on belül nem ismétlődik", () => {
  const { loop, steps } = loopWithCounter();
  const feel = createFeel({ reducedMotion: false, loop, fxRng: fx() });
  let now = 0;
  loop.frame(now);
  const tick = (ms: number) => {
    now += ms;
    feel.update(ms);
    loop.frame(now);
  };

  feel.hitstop(10); // → 40 ms
  tick(39);
  assert.equal(steps(), 0, "a 10 ms-os kérés 40 ms-ra nő");
  tick(2);
  const afterFirst = steps();

  // 41 ms-nál új kérés: a 150 ms-os hűtés miatt hatástalan, a sim tovább fut.
  feel.hitstop(120);
  tick(50);
  assert.ok(steps() > afterFirst, "a hűtési időn belüli hitstop nem állította meg a sim-et");

  tick(HITSTOP_COOLDOWN_MS); // a hűtés lejárt
  feel.hitstop(5000); // → 120 ms
  const before = steps();
  tick(119);
  assert.equal(steps(), before, "a túl hosszú kérés 120 ms-ra szorul, addig áll");
  tick(20);
  assert.ok(steps() > before);
});

test("loop nélkül a hitstop hatástalan, de nem dob hibát", () => {
  const feel = createFeel({ reducedMotion: false, fxRng: fx() });
  assert.doesNotThrow(() => {
    feel.hitstop(80);
    feel.update(200);
  });
});

test("tween: végpontok, monotonitás, outBack túllendül", () => {
  for (const kind of ["outCubic", "inOutQuad", "outBack"] as const) {
    assert.equal(tween(0, kind), 0);
    assert.ok(Math.abs(tween(1, kind) - 1) < 1e-12);
    assert.equal(tween(-3, kind), 0, "a t a [0, 1] tartományra szorul");
    assert.ok(Math.abs(tween(7, kind) - 1) < 1e-12);
  }
  assert.ok(tween(0.5, "outCubic") > 0.5, "az outCubic előre siet");
  assert.equal(tween(0.5, "inOutQuad"), 0.5);
  let peak = 0;
  for (let t = 0; t <= 1; t += 0.01) peak = Math.max(peak, tween(t, "outBack"));
  assert.ok(peak > 1, "az outBack túllendül 1 fölé");
  const feel = createFeel({ reducedMotion: false, fxRng: fx() });
  assert.equal(feel.tween(0.25, "outCubic"), tween(0.25, "outCubic"));
});
