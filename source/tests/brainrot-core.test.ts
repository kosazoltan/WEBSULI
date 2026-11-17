import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSIST_MS,
  CAGE_DWELL_MS,
  CARRY_RESOLVE_MS,
  CARRY_SPEED_FACTOR,
  FLEE_RADIUS,
  PLAYER_SPEED,
  ROUND_MS,
  BRAIN_ROT_SLOW_MO,
  brainRotDirectorConfig,
  cageLayout,
  clearCagesFrom,
  createBrainRotCore,
  createBrainRotDriver,
  playerInCage,
  type BrainRotCore,
  type BrainRotEvent,
  type BrainRotQuestionUi,
  type BrainRotState,
  type Cage,
} from "../client/src/lib/brainRot/core";
import { SIM_STEP_MS } from "../client/src/game-engine/play/loop";
import { windowMsFor } from "../client/src/game-engine/play/questionDirector";
import type { QuestionPresentation } from "../client/src/game-engine/play/types";

/**
 * J5a — a „Lény-aréna” tiszta magja (végrehajtás J5a 2., 4.; terv 5.5; K.5 KSZ-4, KSZ-6): menekülés és falcsúszás,
 * kifáradás, elkapás érintéssel, a vitt lény lassítja a vadászt (−20%), ketrec-zár (beállás, átfutás nem választ, a
 * vadászra eső ketrec arrébb kerül), kimenetek, segítség, óra a kérdés alatt, determinizmus (meghajtó, arany lenyomat).
 */

const DT = SIM_STEP_MS;

/** `ms` világidő lépésekben (egész lépésszám — a lebegőpontos összegzés ne adjon egy plusz lépést). */
function run(core: BrainRotCore, ms: number, band = 0.4): void {
  const n = Math.round(ms / DT);
  for (let i = 0; i < n; i++) core.step(DT, band);
}

function events(core: BrainRotCore): BrainRotEvent[] {
  const out: BrainRotEvent[] = [];
  core.drainEvents((e) => out.push({ ...e }));
  return out;
}

test("az első lény 2 mp-en belül, a vadász közelében születik (terv 5.5: 0–10 mp)", () => {
  const core = createBrainRotCore({ seed: 1, arenaW: 1, arenaH: 1.5 });
  run(core, 2000);
  const st = core.state();
  const first = st.creatures.filter((c) => c.active);
  assert.ok(first.length >= 1, "van lény");
  const d = Math.min(...first.map((c) => Math.hypot(c.x - st.player.x, c.y - st.player.y)));
  assert.ok(d < 0.6, `az első lény ${d.toFixed(2)} egységre`);
});

test("menekülés: a vadász közelében a lény távolodik; a falnál csúszik, nem megy ki az arénából", () => {
  const core = createBrainRotCore({ seed: 2, arenaW: 1, arenaH: 1.5 });
  run(core, 400);
  const st = core.state();
  const c = st.creatures.find((x) => x.active && x.state === "free")!;
  // A vadászt a lény mellé tesszük (balra tőle), mozdulatlanul: a lény jobbra menekül.
  c.x = 0.5;
  c.y = 0.75;
  c.vx = 0;
  c.vy = 0;
  st.player.x = 0.5 - FLEE_RADIUS * 0.6;
  st.player.y = 0.75;
  const d0 = Math.hypot(c.x - st.player.x, c.y - st.player.y);
  run(core, 300);
  const d1 = Math.hypot(c.x - st.player.x, c.y - st.player.y);
  assert.ok(d1 > d0 + 0.05, `távolodik: ${d0.toFixed(3)} → ${d1.toFixed(3)}`);
  // Sarokba szorítva sem hagyja el az arénát (csúszás a fal mentén).
  st.player.x = 0.6;
  st.player.y = 1.2;
  for (let i = 0; i < 240; i++) {
    core.step(DT, 0.4);
    for (const x of st.creatures) {
      if (!x.active || x.state !== "free") continue;
      assert.ok(x.x >= x.r - 1e-9 && x.x <= st.arenaW - x.r + 1e-9 && x.y >= x.r - 1e-9 && x.y <= st.arenaH - x.r + 1e-9, "a lény az arénán belül marad");
    }
  }
});

test("kifáradás: a folyamatosan üldözött lény ereje elfogy (STAMINA), és a vadász utoléri", () => {
  const core = createBrainRotCore({ seed: 3, arenaW: 1, arenaH: 1.5 });
  run(core, 400);
  const st = core.state();
  const c = st.creatures.find((x) => x.active && x.state === "free")!;
  let caught = false;
  for (let i = 0; i < 60 * 8 && !caught; i++) {
    const t = st.creatures.find((x) => x.id === c.id)!;
    core.setInput(t.x - st.player.x, t.y - st.player.y);
    core.step(DT, 0.4);
    caught = st.carry?.id === c.id;
  }
  assert.ok(caught, "8 mp üldözés után elkapva");
});

test("elkapás érintéssel: `catch` esemény, a lény a vadász kezében; amíg viszi, nem kap el másikat és 20%-kal lassabb", () => {
  const core = createBrainRotCore({ seed: 4, arenaW: 1, arenaH: 1.5 });
  const st = core.state();
  core.forceCatch();
  assert.ok(st.carry, "vitt lény");
  assert.ok(events(core).some((e) => e.type === "catch"));
  assert.equal(core.canCatch(), false);
  // Sebesség: teljes kitérés 1 s-ig → ~ PLAYER_SPEED × 0,8 egység / s (a rövid gyorsulás után).
  st.player.x = 0.1;
  st.player.y = 0.75;
  core.setInput(1, 0);
  run(core, 500);
  const x0 = st.player.x;
  run(core, 250);
  const v = (st.player.x - x0) / 0.25;
  assert.ok(Math.abs(v - PLAYER_SPEED * CARRY_SPEED_FACTOR) < 0.03, `vitt sebesség ${v.toFixed(3)}`);
  core.keepDirect();
  st.player.x = 0.1;
  run(core, 500);
  const x1 = st.player.x;
  run(core, 250);
  const v2 = (st.player.x - x1) / 0.25;
  assert.ok(Math.abs(v2 - PLAYER_SPEED) < 0.03, `szabad sebesség ${v2.toFixed(3)}`);
});

test("a vadász a kérdés alatti lassításban is a saját tempójában fut (a világ lassul): timeScale-kompenzáció", () => {
  const a = createBrainRotCore({ seed: 5, arenaW: 1, arenaH: 1.5 });
  a.state().player.x = 0.1;
  a.setInput(1, 0);
  // 1 s valós idő 0,6×-es hurokban = 0,6 s világidő, 36 lépés 0,6-os szorzóval.
  for (let i = 0; i < 36; i++) a.step(DT, 0.4, BRAIN_ROT_SLOW_MO);
  const b = createBrainRotCore({ seed: 5, arenaW: 1, arenaH: 1.5 });
  b.state().player.x = 0.1;
  b.setInput(1, 0);
  for (let i = 0; i < 60; i++) b.step(DT, 0.4, 1);
  assert.ok(Math.abs(a.state().player.x - b.state().player.x) < 0.02, `${a.state().player.x} ≈ ${b.state().player.x}`);
  assert.ok(a.state().worldMs < b.state().worldMs * 0.65, "a világ ideje lassabban telt");
});

test("ketrec-elrendezés: álló nézetben 4 ketrec a négy negyedben, fekvőben egy sor alul; nem fedik egymást, az arénán belül", () => {
  for (const [w, h] of [[1, 1.22], [1, 1.95], [2.6, 1], [2.1, 1]] as const) {
    const cages: Cage[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, w: 0, h: 0, armed: false, dwellMs: 0 }));
    cageLayout(w, h, 4, cages);
    if (w > h * 1.25) {
      // Fekvő: egy sor az aréna alsó részén (a kérdés-kártya fent középen van), balról jobbra.
      for (const c of cages) assert.ok(c.y - c.h / 2 > h * 0.55, `alul (${w}×${h})`);
      for (let i = 1; i < 4; i++) assert.ok(cages[i]!.x > cages[i - 1]!.x);
    } else {
      const quadrants = new Set(cages.map((c) => `${c.x < w / 2 ? "L" : "R"}${c.y < h * 0.66 ? "T" : "B"}`));
      assert.equal(quadrants.size, 4, `négy negyed (${w}×${h})`);
    }
    for (const [i, a] of cages.entries()) {
      assert.ok(a.x - a.w / 2 >= 0 && a.x + a.w / 2 <= w && a.y - a.h / 2 >= 0 && a.y + a.h / 2 <= h, "az arénán belül");
      for (const b of cages.slice(i + 1)) {
        const gapX = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
        const gapY = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
        assert.ok(gapX > 0.03 || gapY > 0.03, "nem fedik egymást (≥ ~12 px)");
      }
    }
  }
});

test("a nyíláskor a vadászra eső ketrec arrébb kerül (a vadász nem „áll bele” egy válaszba)", () => {
  const cages: Cage[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, w: 0, h: 0, armed: false, dwellMs: 0 }));
  cageLayout(1, 1.5, 4, cages);
  const p = { x: cages[0]!.x, y: cages[0]!.y };
  clearCagesFrom(p.x, p.y, 1, 1.5, 4, cages);
  for (const c of cages) assert.equal(playerInCage(p.x, p.y, c), false);
});

function openWithCarry(core: BrainRotCore, px: number, py: number): void {
  const st = core.state();
  st.player.x = px;
  st.player.y = py;
  core.forceCatch();
  core.openCages(4, 1);
}

test("ketrec-zár: a ketrecbe beállás (megállás) választ; a teljes sebességű átfutás nem", () => {
  const core = createBrainRotCore({ seed: 6, arenaW: 1, arenaH: 1.5 });
  openWithCarry(core, 0.5, 0.3);
  const st = core.state();
  const c0 = st.cages[0]!;
  const c2 = st.cages[2]!; // ugyanabban az oszlopban, alatta
  // Átfutás: felülről lefelé végig a 0. ketrecen át a 2.-ig, teljes sebességgel.
  st.player.x = c0.x;
  st.player.y = c0.y - c0.h / 2 - 0.15;
  core.setInput(0, 1);
  let hit = -1;
  for (let i = 0; i < 600 && hit < 0; i++) {
    core.step(DT, 0.4);
    if (st.hitCage >= 0) hit = st.hitCage;
    if (st.player.y > c2.y) core.setInput(0, 0); // a 2. ketrecben megáll
  }
  assert.equal(hit, 2, "az átfutott 0. ketrec nem választott, a megállás a 2.-ben igen");
  // Review #485 (Codex, vercel): vízszintes és átlós átfutás sem választ — a felső sor bal széléről a jobb ketrec közepére
  // teljes sebességgel (a széles ketrecen az átfutás tovább tart, mint a régi 450 ms-os küszöb), és onnan átlósan a bal alsóba.
  const pairs: Array<[number, number]> = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if (a !== b) pairs.push([a, b]);
  for (const [from, to] of pairs) {
    const c3 = createBrainRotCore({ seed: 6, arenaW: 1, arenaH: 1.5 });
    openWithCarry(c3, 0.5, 0.3);
    const s3 = c3.state();
    for (const cage of s3.cages) cage.armed = true;
    const a = s3.cages[from]!;
    const b = s3.cages[to]!;
    s3.player.x = a.x - Math.sign(b.x - a.x || 1) * (a.w / 2 - 0.01);
    s3.player.y = a.y - Math.sign(b.y - a.y) * (a.h / 2 - 0.01);
    c3.setTarget(b.x, b.y);
    let hit3 = -1;
    for (let i = 0; i < 600 && hit3 < 0; i++) {
      c3.step(DT, 0.4);
      if (s3.hitCage >= 0) hit3 = s3.hitCage;
    }
    assert.equal(hit3, to, `átfutás ${from} → ${to}: csak a cél-ketrec választ`);
  }
  // Egy helyben állva a beállási idő után is választ (dwell).
  const core2 = createBrainRotCore({ seed: 6, arenaW: 1, arenaH: 1.5 });
  openWithCarry(core2, 0.5, 0.3);
  const s2 = core2.state();
  const cage = s2.cages[1]!;
  s2.player.x = cage.x;
  s2.player.y = cage.y;
  s2.player.vx = 0;
  s2.player.vy = 0;
  let steps = 0;
  while (s2.hitCage < 0 && steps < 120) {
    core2.step(DT, 0.4);
    steps += 1;
  }
  assert.equal(s2.hitCage, 1);
  assert.ok(steps * DT <= CAGE_DWELL_MS + DT, `${(steps * DT).toFixed(0)} ms`);
});

test("kimenet: jó → a lény megmarad, kombó, pont; rossz → elszökik (lost), kombó törik; megszakítva → szabadon, büntetés nélkül", () => {
  const core = createBrainRotCore({ seed: 7, arenaW: 1, arenaH: 1.5 });
  const st = core.state();
  openWithCarry(core, 0.5, 0.3);
  core.applyOutcome("correct", 2);
  assert.equal(st.caught, 1);
  assert.equal(st.combo.count, 1);
  assert.ok(st.score > 0);
  assert.equal(st.carry, null);
  assert.ok(events(core).some((e) => e.type === "kept" && e.n > 0));
  openWithCarry(core, 0.5, 0.3);
  core.applyOutcome("wrong", 1);
  assert.equal(st.lost, 1);
  assert.equal(st.combo.count, 0);
  assert.equal(st.combo.best, 1);
  assert.ok(events(core).some((e) => e.type === "lost"));
  openWithCarry(core, 0.5, 0.3);
  const id = st.carry!.id;
  core.applyOutcome("aborted", null);
  const c = st.creatures.find((x) => x.id === id)!;
  assert.equal(c.state, "free");
  assert.equal(st.lost, 1);
  assert.equal(st.caught, 1);
});

test("élettartam: a lény a világ idejében öregszik, a végén elszökik („Elszökött!”), és ez nem töri a kombót", () => {
  const core = createBrainRotCore({ seed: 8, arenaW: 1, arenaH: 1.5 });
  // A teszt a belső állapotot írja (a `state()` csak olvasható nézetet ad a lapnak).
  const st = core.state() as BrainRotState;
  st.combo = { count: 4, multiplier: 2, best: 4 };
  st.player.x = 0.05;
  st.player.y = 1.45;
  st.sinceCatchMs = -1e9; // a segítség ne fárassza el a lényt
  run(core, 15_000);
  assert.ok(st.missed >= 1, `elszökött: ${st.missed}`);
  assert.equal(st.combo.count, 4);
});

test("segítség: ASSIST_MS elkapás nélküli világidő után a legközelebbi lény elfárad (nem menekül)", () => {
  const core = createBrainRotCore({ seed: 9, arenaW: 1, arenaH: 1.5 });
  const st = core.state();
  run(core, ASSIST_MS - 200);
  assert.ok(!st.creatures.some((c) => c.active && c.dazed));
  run(core, 400);
  assert.ok(st.creatures.some((c) => c.active && c.dazed), "van fáradt lény");
  assert.ok(events(core).some((e) => e.type === "dazed"));
});

/** A meghajtó próbájához egy kézi kérdés-sáv (a `createQuestionUi` szerződésének a meghajtó által használt része). */
function fakeUi(opts: { give: boolean }) {
  let open: QuestionPresentation | null = null;
  let ended = false;
  let requests = 0;
  const ui: BrainRotQuestionUi & { requests(): number; openNow(): QuestionPresentation | null } = {
    frame: () => {},
    timeScale: () => (open ? BRAIN_ROT_SLOW_MO : 1),
    finished: () => ended,
    finish: () => {
      ended = true;
      open = null;
    },
    request: (_r, clock) => {
      requests += 1;
      if (!opts.give || open) return null;
      open = { id: requests, question: { key: `k${requests}`, quiz: { id: "", prompt: "p", options: ["a", "b", "c", "d"], correctIndex: 0 }, source: "bank" }, isReview: false, options: [0, 1, 2, 3].map((i) => ({ label: String(i), originalIndex: i, correct: i === 0 })), windowMs: 6000, slowMo: BRAIN_ROT_SLOW_MO, startedAtSimMs: clock, reason: "trigger" };
      return open;
    },
    abort: () => {
      open = null;
    },
    canAsk: () => !open && !ended,
    active: () => open,
    pick: () => {
      open = null;
    },
    requests: () => requests,
    openNow: () => open,
  };
  return ui;
}

test("meghajtó: a 90 mp-es óra a lassítatlan kérdés-óra — nyitott kérdés alatt is jár, szünetben áll; a végén a menet lezárul", () => {
  const ui = fakeUi({ give: true });
  const d = createBrainRotDriver({ seed: 10, questions: ui, band: () => 0.4, arenaW: 1, arenaH: 1.5 });
  d.core.forceCatch();
  d.resolve();
  assert.ok(ui.openNow(), "nyitott kérdés");
  for (let i = 0; i < 60; i++) d.frame(DT, false);
  assert.ok(Math.abs(d.clockMs() - 1000) < 1, `óra ${d.clockMs()}`);
  assert.ok(d.loop.simTimeMs() < 700 && d.loop.simTimeMs() > 500, `a világ 0,6×: ${d.loop.simTimeMs()}`);
  const before = d.remainingMs();
  for (let i = 0; i < 60; i++) d.frame(DT, true);
  assert.equal(d.remainingMs(), before, "szünetben áll");
  for (let i = 0; i < (ROUND_MS / DT) + 5; i++) d.frame(DT, false);
  assert.equal(d.core.running(), false);
  assert.equal(ui.finished(), true, "a kérdés-sáv lezárva");
});

test("meghajtó: ha nincs kérdés (üres forrás), a vitt lény CARRY_RESOLVE_MS után közvetlenül megmarad; kérdés nélküli módban azonnal", () => {
  const ui = fakeUi({ give: false });
  const d = createBrainRotDriver({ seed: 11, questions: ui, band: () => 0.4, arenaW: 1, arenaH: 1.5 });
  d.core.forceCatch();
  let frames = 0;
  while (d.core.state().carry && frames < 400) {
    d.frame(DT, false);
    frames += 1;
  }
  assert.equal(d.core.state().caught, 1);
  assert.equal(d.core.state().direct, 1);
  assert.ok(frames * DT >= CARRY_RESOLVE_MS - DT && frames * DT <= CARRY_RESOLVE_MS + 4 * DT, `${frames * DT} ms`);
  const noQ = createBrainRotDriver({ seed: 11, questions: null, band: () => 0.4, arenaW: 1, arenaH: 1.5 });
  noQ.core.forceCatch();
  noQ.frame(DT, false);
  assert.equal(noQ.core.state().caught, 1);
});

test("determinizmus: lépés-indexhez kötött bemenettel eltérő képkocka-időknél bitre azonos a mag állapota (K.6)", () => {
  // A bemenet a LÉPÉS elején érkezik (a `band` visszahívás lépésenként egyszer fut a mag lépése előtt — a `speed-math-core`
  // „meghajtó” tesztjének mintája): így a képkocka-felosztás nem számít, csak a lépés sorszáma.
  const TARGET = 1800;
  const runWithFrames = (frames: () => number) => {
    let step = 0;
    let snapshot = "";
    let d: ReturnType<typeof createBrainRotDriver> | null = null;
    d = createBrainRotDriver({
      seed: 12,
      questions: null,
      arenaW: 1,
      arenaH: 1.56,
      band: () => {
        step += 1;
        if (step === TARGET + 1) snapshot = d!.core.hash();
        const phase = Math.floor(step / 90) % 4;
        d!.core.setInput(phase === 0 ? 1 : phase === 2 ? -1 : 0.2, phase === 1 ? 1 : phase === 3 ? -1 : 0);
        return 0.4;
      },
    });
    for (let guard = 0; guard < TARGET * 3 && !snapshot; guard++) d.frame(frames(), false);
    return snapshot;
  };
  const ref = runWithFrames(() => SIM_STEP_MS);
  assert.ok(ref.length > 0);
  assert.equal(runWithFrames(() => SIM_STEP_MS * 2), ref, "33 ms-os képkockák");
  let k = 0;
  const uneven = [7, 16.67, 41, 3, 25, 60, 12];
  assert.equal(runWithFrames(() => uneven[k++ % uneven.length]!), ref, "egyenetlen képkockák");
});

test("arany visszajátszás: fix seed + fix bemenetsor → rögzített lenyomat", () => {
  const core = createBrainRotCore({ seed: 42, arenaW: 1, arenaH: 1.56 });
  for (let i = 0; i < 60 * 30; i++) {
    const phase = Math.floor(i / 120) % 4;
    core.setInput(phase === 0 ? 1 : phase === 2 ? -1 : 0.3, phase === 1 ? 1 : phase === 3 ? -1 : 0);
    core.step(DT, 0.4);
    if (core.state().carry) core.keepDirect();
  }
  const again = createBrainRotCore({ seed: 42, arenaW: 1, arenaH: 1.56 });
  for (let i = 0; i < 60 * 30; i++) {
    const phase = Math.floor(i / 120) % 4;
    again.setInput(phase === 0 ? 1 : phase === 2 ? -1 : 0.3, phase === 1 ? 1 : phase === 3 ? -1 : 0);
    again.step(DT, 0.4);
    if (again.state().carry) again.keepDirect();
  }
  assert.equal(core.hash(), again.hash());
  assert.equal(core.hash(), GOLDEN_42);
});

test("J10: a ketrec-kérdés ablaka rövid tételnél 6 mp (3–4. évf. 7,5 mp), hosszúnál ≤ 9 mp; slowMo 0,6", () => {
  const cfg = brainRotDirectorConfig(7);
  assert.equal(cfg.slowMo, 0.6);
  assert.equal(windowMsFor("12 + 8 = ?", 7, cfg.baseWindowMs), 6000);
  assert.equal(windowMsFor("12 + 8 = ?", 4, cfg.baseWindowMs), 7500);
  assert.ok(windowMsFor("x".repeat(400), 3, cfg.baseWindowMs) <= 9000);
});

const GOLDEN_42 = "play|30000000000|75000|1485000|6|6|3|0|350|0|11|free|868072|983527|12|free|463255|695928|13|free|440353|599082|10|free|274199|1163889";

test("review #485: a bot által leírt forgatókönyv — a felső sor bal széléről a jobb ketrec közepére tartva a bal ketrec nem választódik", () => {
  const core = createBrainRotCore({ seed: 13, arenaW: 1, arenaH: 1.5 });
  openWithCarry(core, 0.5, 1.2);
  const st = core.state();
  for (const c of st.cages) c.armed = true;
  const left = st.cages[0]!;
  const right = st.cages[1]!;
  st.player.x = left.x - left.w / 2 + 0.01;
  st.player.y = left.y;
  core.setInput(1, 0); // teljes sebességgel jobbra (joystick), majd a jobb ketrecben elengedi
  let hit = -1;
  for (let i = 0; i < 600 && hit < 0; i++) {
    if (st.player.x >= right.x) core.setInput(0, 0);
    core.step(DT, 0.4);
    if (st.hitCage >= 0) hit = st.hitCage;
  }
  assert.equal(hit, 1);
});
