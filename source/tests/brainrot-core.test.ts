import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSIST_MS,
  CAGE_ARM_MS,
  CAGE_DWELL_MS,
  cageLabelsFit,
  cageSingleRow,
  cageWidthU,
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
    const cages: Cage[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, w: 0, h: 0, armed: false, dwellMs: 0, entered: false, inside: false }));
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
  const cages: Cage[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, w: 0, h: 0, armed: false, dwellMs: 0, entered: false, inside: false }));
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

test("review #485 Ú1: a nyitáskor lent lévő ujj húzása nem ad célt (és szándékot sem) — csak a friss lenyomás; a kérdés után újra vadászhat", () => {
  const core = createBrainRotCore({ seed: 6, arenaW: 1, arenaH: 1.5 });
  const st = core.state();
  st.player.x = 0.5;
  st.player.y = 0.3;
  core.setTarget(0.5, 0.35, "down"); // a gyerek a lény felé húz
  core.forceCatch();
  core.openCages(4, 1);
  const cage = st.cages[2]!;
  // A lent tartott ujj egy ketrec helyére csúszik: a vadász nem indul el, az élesítés után sem választ.
  for (let i = 0; i < 90; i++) {
    core.setTarget(cage.x, cage.y, "move");
    core.step(DT, 0.4, 1);
  }
  assert.ok(Math.hypot(st.player.x - 0.5, st.player.y - 0.3) < 1e-9, "a húzás nem mozdít");
  assert.equal(st.hitCage, -1);
  assert.ok(st.cages.slice(0, 4).every((c) => !c.entered), "nincs szándékos belépés");
  // Friss lenyomás a ketrecre: oda fut (és ez a szándék).
  core.setTarget(cage.x, cage.y, "down");
  core.step(DT, 0.4, 1);
  assert.ok(Math.hypot(st.player.x - 0.5, st.player.y - 0.3) > 0, "a friss lenyomás mozdít");
  // A kimenet után a lent tartott ujj húzása újra vadászik.
  core.applyOutcome("wrong", 0);
  const x0 = st.player.x;
  core.setTarget(x0 + 0.3, st.player.y, "move");
  core.step(DT, 0.4, 1);
  assert.ok(st.player.x > x0, "a ketrecek zárása után a húzás újra célt ad");
});

test("ketrec-zár: a ketrecbe beállás (megállás) választ; a teljes sebességű átfutás nem", () => {
  const core = createBrainRotCore({ seed: 6, arenaW: 1, arenaH: 1.5 });
  openWithCarry(core, 0.5, 0.3);
  const st = core.state();
  for (const cage of st.cages) cage.armed = true; // az élesítés (előjelzés) szabályát külön teszt méri
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
  // Szándékos választás: az élesítés után lendülettel belép, majd megáll — a megállás után `CAGE_DWELL_MS`-en belül választ.
  const core2 = createBrainRotCore({ seed: 6, arenaW: 1, arenaH: 1.5 });
  openWithCarry(core2, 0.5, 0.3);
  const s2 = core2.state();
  run(core2, CAGE_ARM_MS + 50);
  const cage = s2.cages[1]!;
  core2.setTarget(cage.x, cage.y);
  let steps = 0;
  let stoppedAt = -1;
  while (s2.hitCage < 0 && steps < 600) {
    core2.step(DT, 0.4);
    steps += 1;
    if (stoppedAt < 0 && Math.hypot(s2.player.vx, s2.player.vy) < 0.05 && playerInCage(s2.player.x, s2.player.y, cage)) stoppedAt = steps;
  }
  assert.equal(s2.hitCage, 1);
  assert.ok(stoppedAt > 0 && (steps - stoppedAt) * DT <= CAGE_DWELL_MS + DT, `a megállás után ${((steps - stoppedAt) * DT).toFixed(0)} ms`);
});

test("review #485 B1: a ketrecek nyitásakor a vadász megáll (cél, bemenet, lendület törlődik), az előjelzés alatt nincs válasz", () => {
  const core = createBrainRotCore({ seed: 21, arenaW: 1, arenaH: 1.5 });
  const st = core.state();
  st.player.x = 0.5;
  st.player.y = 0.3;
  core.setInput(1, 0.4);
  run(core, 300);
  assert.ok(Math.hypot(st.player.vx, st.player.vy) > 0.5, "fut");
  core.forceCatch();
  core.setTarget(0.9, 1.4); // a régi böködés célja
  core.openCages(4, 1);
  assert.equal(st.player.vx, 0);
  assert.equal(st.player.vy, 0);
  const x0 = st.player.x;
  run(core, 200);
  assert.equal(st.player.x, x0, "bemenet és cél nélkül áll (a régi cél törölve)");
  assert.ok(st.cages.slice(0, 4).every((c) => !c.armed), "az előjelzés (600 ms) alatt nincs éles ketrec");
  run(core, CAGE_ARM_MS);
  assert.ok(st.cages.slice(0, 4).every((c) => c.armed), "az előjelzés után a kint álló vadász mellett élesek");
});

test("review #485 B1: elkapáskor a böködés célja törlődik (a lényre szánt bökés nem viszi ketrecbe)", () => {
  const core = createBrainRotCore({ seed: 22, arenaW: 1, arenaH: 1.5 });
  const st = core.state();
  core.setTarget(0.9, 1.4);
  core.forceCatch();
  const x0 = st.player.x;
  run(core, 300);
  assert.equal(st.player.x, x0);
});

test("review #485 B1: aki az élesítéskor bent áll vagy lassan csúszik be, nem választ — ki kell lépnie és lendülettel visszamennie", () => {
  const core = createBrainRotCore({ seed: 23, arenaW: 1, arenaH: 1.5 });
  const st = core.state();
  openWithCarry(core, 0.5, 0.3);
  const cage = st.cages[3]!;
  // A kérdés után még tolja (400 ms) a ketrec felé, majd elengedi: belép az előjelzés alatt.
  st.player.x = cage.x - cage.w / 2 - 0.12;
  st.player.y = cage.y;
  core.setInput(1, 0);
  run(core, 400);
  core.setInput(0, 0);
  run(core, 2000);
  assert.equal(st.hitCage, -1, "a tehetetlenség nem válasz");
  // Lassú becsúszás az élesítés után sem választ.
  const core2 = createBrainRotCore({ seed: 23, arenaW: 1, arenaH: 1.5 });
  const s2 = core2.state();
  openWithCarry(core2, 0.5, 0.3);
  run(core2, CAGE_ARM_MS + 50);
  const c2 = s2.cages[3]!;
  s2.player.x = c2.x - c2.w / 2 - 0.05;
  s2.player.y = c2.y;
  for (let i = 0; i < 240; i++) {
    core2.setInput(0.25, 0); // a stop-küszöb alatti tempó
    core2.step(DT, 0.4);
  }
  core2.setInput(0, 0);
  run(core2, 1000);
  assert.equal(s2.hitCage, -1, "lassú becsúszás nem választ");
});

test("review #485 B2: a ketrec-zóna a kérdés-kártya alja alatt — elrendezés és áthelyezés sem teszi fölé (álló, fekvő)", () => {
  for (const [w, h, top] of [[1, 1.22, 0.55], [1, 1.95, 0.6], [2.6, 1, 0.42], [2.1, 1, 0.5]] as const) {
    for (const compact of [false, true]) {
      const cages: Cage[] = Array.from({ length: 4 }, () => ({ x: 0, y: 0, w: 0, h: 0, armed: false, dwellMs: 0, entered: false, inside: false }));
      cageLayout(w, h, 4, cages, top, compact);
      for (const c of cages) {
        assert.ok(c.y - c.h / 2 >= top + 0.029, `a kártya alatt (${w}×${h}, top ${top}): ${(c.y - c.h / 2).toFixed(3)}`);
        assert.ok(c.y + c.h / 2 <= h + 1e-9 && c.h >= 0.14 - 1e-9, "az arénán belül, érintési méretű");
      }
      // A vadász a zóna tetején áll: az áthelyezés sem visz a kártya alá.
      clearCagesFrom(cages[0]!.x, cages[0]!.y - cages[0]!.h / 2, w, h, 4, cages, top);
      for (const c of cages) assert.ok(c.y - c.h / 2 >= top + 0.029, "áthelyezve is a kártya alatt");
    }
  }
});

test("review #485 B2: a ketrecfelirat beférése a ketrec valódi szélességével (fekvőben az „alany: ház, állítmány: nagy” nem fér)", () => {
  // Fekvő ketrec: kb. 0,416 egység × 300 px; álló: 0,44 × 360 px.
  assert.equal(cageLabelsFit(["alany: ház, állítmány: nagy", "kert", "tükör", "ablak"], 0.416 * 300), false);
  assert.equal(cageLabelsFit(["kert", "tükör", "körte", "ablak"], 0.416 * 300), true);
  assert.equal(cageLabelsFit(["alany: ház, állítmány: nagy"], 0.44 * 360), true);
});

test("L4 (új követelmény): a kérdés alatt a lények kora 0,6×-sel telik (nincs kor-fagyasztás), szünetben áll", () => {
  const ui = fakeUi({ give: true });
  const d = createBrainRotDriver({ seed: 24, questions: ui, band: () => 0.4, arenaW: 1, arenaH: 1.5 });
  d.core.forceCatch();
  d.resolve();
  const w0 = d.core.state().worldMs;
  for (let i = 0; i < 60; i++) d.frame(DT, false);
  const grown = d.core.state().worldMs - w0;
  assert.ok(grown > 550 && grown < 650, `1 s valós idő alatt ${grown.toFixed(0)} ms világidő (0,6×)`);
  const w1 = d.core.state().worldMs;
  for (let i = 0; i < 60; i++) d.frame(DT, true);
  assert.equal(d.core.state().worldMs, w1);
});

test("J5a 13.: a kérdés nélküli (közvetlen) megtartás pontot ad, de nem számít a győzelembe", () => {
  const core = createBrainRotCore({ seed: 25, arenaW: 1, arenaH: 1.5 });
  for (let i = 0; i < 12; i++) {
    core.forceCatch();
    core.keepDirect();
  }
  assert.equal(core.state().direct, 12);
  assert.equal(core.state().caught, 0);
  assert.ok(core.state().score > 0);
  assert.equal(core.won(), false);
});

test("L2: a meghajtó kérdéssel is reprodukálható — azonos seed, bemenet és képkocka-sorozat → bitre azonos állapot", () => {
  const drive = () => {
    const ui = fakeUi({ give: true });
    const d = createBrainRotDriver({ seed: 26, questions: ui, band: () => 0.4, arenaW: 1, arenaH: 1.56 });
    const frames = [16.67, 7, 33, 16.67, 41, 3];
    for (let i = 0; i < 1200; i++) {
      const phase = Math.floor(i / 70) % 4;
      d.core.setInput(phase === 0 ? 1 : phase === 2 ? -1 : 0.3, phase === 1 ? 1 : phase === 3 ? -1 : 0);
      if (i % 200 === 199 && ui.openNow()) ui.pick(0);
      d.frame(frames[i % frames.length]!, false);
    }
    return d.core.hash() + `|${ui.requests()}`;
  };
  assert.equal(drive(), drive());
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

// SPEC-VÁLTOZÁS 2026-11-17 (terv 2026-11-17-brainrot-valaszido D5, tulajdonosi döntés „Álljon meg”): a menet 90 mp-es órája
// a nyitott kérdés alatt ÁLL (a régi elvárás: a kérdés alatt is jár); a kérdés-óra (határidő) továbbra is jár.
test("meghajtó: a kérdés-óra a kérdés alatt is jár, a menet-óra áll (D5); szünetben mindkettő áll; a végén a menet lezárul", () => {
  const ui = fakeUi({ give: true });
  const d = createBrainRotDriver({ seed: 10, questions: ui, band: () => 0.4, arenaW: 1, arenaH: 1.5 });
  d.core.forceCatch();
  d.resolve();
  assert.ok(ui.openNow(), "nyitott kérdés");
  const roundBefore = d.remainingMs();
  for (let i = 0; i < 60; i++) d.frame(DT, false);
  assert.ok(Math.abs(d.clockMs() - 1000) < 1, `kérdés-óra ${d.clockMs()}`);
  assert.equal(d.remainingMs(), roundBefore, "(a) nyitott kérdés alatt a menet-óra nem fogy");
  assert.ok(d.loop.simTimeMs() < 700 && d.loop.simTimeMs() > 500, `a világ 0,6×: ${d.loop.simTimeMs()}`);
  // Kérdés nélkül (üres forrás) a menet-óra a kérdés-órával együtt jár.
  const noQ = createBrainRotDriver({ seed: 10, questions: fakeUi({ give: false }), band: () => 0.4, arenaW: 1, arenaH: 1.5 });
  for (let i = 0; i < 60; i++) noQ.frame(DT, false);
  assert.ok(Math.abs(ROUND_MS - noQ.remainingMs() - 1000) < 1, `kérdés nélkül a menet-óra jár: ${noQ.remainingMs()}`);
  const before = d.remainingMs();
  for (let i = 0; i < 60; i++) d.frame(DT, true);
  assert.equal(d.remainingMs(), before, "szünetben áll");
  for (let i = 0; i < (2 * ROUND_MS) / DT && d.core.running(); i++) {
    if (ui.openNow()) {
      ui.pick(0);
      d.core.applyOutcome("correct", 0);
    }
    d.frame(DT, false);
  }
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
  // J5a 13.: a közvetlen megtartás nem számít a győzelembe (`caught`), csak pont (`direct`).
  assert.equal(d.core.state().caught, 0);
  assert.equal(d.core.state().direct, 1);
  assert.ok(frames * DT >= CARRY_RESOLVE_MS - DT && frames * DT <= CARRY_RESOLVE_MS + 4 * DT, `${frames * DT} ms`);
  const noQ = createBrainRotDriver({ seed: 11, questions: null, band: () => 0.4, arenaW: 1, arenaH: 1.5 });
  noQ.core.forceCatch();
  noQ.frame(DT, false);
  assert.equal(noQ.core.state().direct, 1);
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

// SPEC-VÁLTOZÁS (J5a 18., review #485 Ú4): a gumiszalag a lemaradást követi (nem a válasz-pontosság sávját) — újrarögzítve.
const GOLDEN_42 = "play|30000000000|75000|1485000|0|6|3|0|350|0|11|free|884747|990645|12|free|463255|695928|13|free|440353|599082|10|free|287754|1183800";

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

test("review #485 B1: a nyitás után böködött ketrec az élesítéskor rögtön választ (a gyors böködőnek nem kell kilépnie)", () => {
  const core = createBrainRotCore({ seed: 27, arenaW: 1, arenaH: 1.5 });
  const st = core.state();
  openWithCarry(core, 0.5, 0.3);
  const cage = st.cages[2]!;
  core.setTarget(cage.x, cage.y); // 0 ms-nál bök: az előjelzés alatt beér és megáll
  let steps = 0;
  while (st.hitCage < 0 && steps < 600) {
    core.step(DT, 0.4);
    steps += 1;
  }
  assert.equal(st.hitCage, 2);
  assert.ok(steps * DT >= CAGE_ARM_MS, `nem az előjelzés alatt: ${(steps * DT).toFixed(0)} ms`);
});

// SPEC-VÁLTOZÁS 2026-11-17 (D5): a régi „az óra lejártakor nyitott kérdés megszakad” helyett — a menet vége nem eshet
// nyitott kérdésre; a késői kimenet-őr (a lezárt menetben nem ír a magba) változatlanul mérve.
test("D5 (b): a menet vége nem esik nyitott kérdésre — az utolsó fél másodpercben nyílt kérdés alatt a menet nem ér véget", () => {
  const ui = fakeUi({ give: true });
  const d = createBrainRotDriver({ seed: 28, questions: ui, band: () => 0.4, arenaW: 1, arenaH: 1.5 });
  // A menet-óra 500 ms-ig fut le (a közben nyíló kérdéseket a gyerek azonnal megválaszolja).
  for (let i = 0; i < (3 * ROUND_MS) / DT && d.remainingMs() > 500; i++) {
    if (ui.openNow()) {
      ui.pick(0);
      d.core.applyOutcome("correct", 0);
    }
    d.frame(DT, false);
  }
  if (ui.openNow()) {
    ui.pick(0);
    d.core.applyOutcome("correct", 0);
  }
  d.core.forceCatch();
  d.resolve();
  assert.ok(ui.openNow(), "nyitott kérdés az utolsó fél másodpercben");
  // A kérdés 20 s-ig nyitva (hosszú ablak): a menet nem ér véget, a kérdés nem szakad meg.
  for (let i = 0; i < Math.round(20_000 / DT); i++) d.frame(DT, false);
  assert.equal(d.core.running(), true, "nyitott kérdés alatt a menet nem ér véget");
  assert.ok(ui.openNow(), "a kérdés nem szakadt meg");
  assert.ok(d.remainingMs() > 0 && d.remainingMs() <= 500, `a menet-óra a kérdés alatt állt: ${d.remainingMs()}`);
  ui.pick(0);
  d.core.applyOutcome("correct", 0);
  const caught = d.core.state().caught;
  for (let i = 0; i < 120; i++) d.frame(DT, false);
  assert.equal(d.core.running(), false, "a kérdés után a maradék menet-idő lefut");
  // A lezárt menetben egy késői válasz-kísérlet sem ír a magba.
  d.core.applyOutcome("correct", 0);
  d.core.applyOutcome("wrong", 0);
  assert.equal(d.core.state().caught, caught, "késői jó válasz nem ad megtartást");
});

test("önellenőrzés (e): 6 megtartásnál a menet vége után érkező jó válasz nem fordítja győzelemre a vereséget", () => {
  const core = createBrainRotCore({ seed: 5, arenaW: 1, arenaH: 1.5 });
  for (let i = 0; i < 6; i++) {
    openWithCarry(core, 0.5, 0.3);
    core.applyOutcome("correct", 0);
  }
  assert.equal(core.state().caught, 6);
  openWithCarry(core, 0.5, 0.3);
  core.end();
  assert.equal(core.won(), false);
  core.applyOutcome("correct", 0);
  assert.equal(core.state().caught, 6);
  assert.equal(core.won(), false);
});

test("review #485 Ú2: álló 360×640 (344 × 420 px-es tábla) — a mély ketrec-zóna fölé egy ketrec sem lóg; ha két sor nem fér, egy sor (≥ 48 px széles, ≥ 12 px rés)", () => {
  const unit = 344;
  for (const topPx of [75, 150, 200, 250, 270, 300, 330]) {
    for (const compact of [false, true]) {
      const core = createBrainRotCore({ seed: 1, arenaW: 1, arenaH: 420 / unit });
      core.setCageZone(topPx / unit, compact);
      core.forceCatch();
      core.openCages(4, 1);
      const cages = core.state().cages.slice(0, 4);
      for (const c of cages) {
        assert.ok((c.y - c.h / 2) * unit >= topPx - 0.5, `zóna ${topPx} px: a ketrec teteje ${((c.y - c.h / 2) * unit).toFixed(0)} px`);
        assert.ok(c.w * unit >= 48 && c.h * unit >= 48, `zóna ${topPx} px: ${(c.w * unit).toFixed(0)} × ${(c.h * unit).toFixed(0)} px`);
      }
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const a = cages[i]!;
          const b = cages[j]!;
          const gapX = Math.abs(a.x - b.x) - (a.w + b.w) / 2;
          const gapY = Math.abs(a.y - b.y) - (a.h + b.h) / 2;
          assert.ok(Math.max(gapX, gapY) * unit >= 12, `zóna ${topPx} px: ${i}–${j} rés ${(Math.max(gapX, gapY) * unit).toFixed(1)} px`);
        }
      }
      // A lap a beférést ugyanezzel a szélességgel számolja.
      assert.ok(Math.abs(cageWidthU(1, 420 / unit, 4, topPx / unit) - cages[0]!.w) < 1e-9);
    }
  }
  assert.equal(cageSingleRow(1, 420 / unit, 150 / unit), false);
  assert.equal(cageSingleRow(1, 420 / unit, 300 / unit), true);
});

test("review #485 Ú5 (e2e-lelet): a ketrecek keresztezésénél álló vadász (a pereme mind a négyet érinti) mellett is élesednek, de mozdulat nélkül nincs válasz", () => {
  const core = createBrainRotCore({ seed: 1, arenaW: 1, arenaH: 1.2537 });
  core.setCageZone(0.748, true);
  const st = core.state();
  st.player.x = 0.5;
  st.player.y = 0.964;
  core.forceCatch();
  core.openCages(4, 1);
  for (let i = 0; i < 120; i++) core.step(DT, 0.4, 0.6);
  const cages = st.cages.slice(0, 4);
  assert.ok(cages.every((c) => playerInCage(st.player.x, st.player.y, c)), "a perem mind a négyet érinti (a mérő helyzete)");
  assert.ok(cages.every((c) => c.armed), "mind élesedett");
  assert.equal(st.hitCage, -1, "álló vadásznál nincs válasz");
  assert.ok(cages.every((c) => !c.entered));
});

/**
 * Review #485 (Vercel, 4597845275): a vadász az élesítéskor egy ketrec kibővített (perem-) zónájában áll — a szándékos,
 * élesítés utáni friss bökés / joystick-mozdulat arra a ketrecre válaszoljon (ne ragadjon be a válasz). Mind a négy
 * ketrec, álló és fekvő elrendezés; a perem a ketrec mind a négy oldalán kipróbálva, ahol a vadász közepe kint van.
 */
function zoneStarts(core: BrainRotCore, i: number): { x: number; y: number }[] {
  const st = core.state();
  const c = st.cages[i]!;
  const m = 0.075 * 0.5 * 0.6; // a perem (PLAYER_RADIUS × 0,5) 60%-a: a közép kint, a perem bent
  const out: { x: number; y: number }[] = [];
  for (const [x, y] of [[c.x, c.y - c.h / 2 - m], [c.x, c.y + c.h / 2 + m], [c.x - c.w / 2 - m, c.y], [c.x + c.w / 2 + m, c.y]] as const) {
    if (x < 0.08 || y < 0.08 || x > st.arenaW - 0.08 || y > st.arenaH - 0.08) continue;
    if (!playerInCage(x, y, c)) continue;
    // csak ez az egy ketrec érintett (a vadász tényleg „e mellett” áll)
    if (st.cages.slice(0, 4).some((o, j) => j !== i && playerInCage(x, y, o))) continue;
    out.push({ x, y });
  }
  return out;
}

function standInZoneAndArm(arenaW: number, arenaH: number, i: number, at: { x: number; y: number } | null): { core: BrainRotCore; starts: { x: number; y: number }[] } {
  const core = createBrainRotCore({ seed: 4, arenaW, arenaH });
  core.setCageZone(0.3, false);
  core.forceCatch();
  core.openCages(4, 1);
  const st = core.state();
  const starts = zoneStarts(core, i);
  const s = at ?? starts[0]!;
  st.player.x = s.x;
  st.player.y = s.y;
  st.cages[i]!.inside = true; // már bent állt (a perem) — nem friss belépés
  for (let k = 0; k < Math.ceil(CAGE_ARM_MS / DT) + 2; k++) core.step(DT, 0.4, 0.6);
  assert.equal(st.hitCage, -1, "az élesítésig nincs válasz");
  assert.ok(st.cages[i]!.armed, "a ketrec élesedett (a vadász közepe kint)");
  return { core, starts };
}

for (const [label, aw, ah] of [["álló", 1, 1.5], ["fekvő", 2.16, 1]] as const) {
  test(`review #485 (Vercel): ${label} — a ketrec peremén álló vadász szándékos bökéssel és joystickkal is tud válaszolni mind a négy ketrecre`, () => {
    for (let i = 0; i < 4; i++) {
      const { starts } = standInZoneAndArm(aw, ah, i, null);
      assert.ok(starts.length > 0, `${label} ${i}: van peremhelyzet`);
      for (const s of starts) {
        // Bökés (friss lenyomás) a ketrec közepére.
        let { core } = standInZoneAndArm(aw, ah, i, s);
        let st = core.state();
        let hit = -1;
        core.setTarget(st.cages[i]!.x, st.cages[i]!.y, "down");
        for (let k = 0; k < 180 && hit < 0; k++) {
          core.step(DT, 0.4, 0.6);
          hit = st.hitCage;
        }
        assert.equal(hit, i, `${label} ${i} bökés (${s.x.toFixed(3)}, ${s.y.toFixed(3)})`);
        // Joystick: élesítés után indított mozdulat a ketrec belseje felé, majd elengedés (megállás).
        ({ core } = standInZoneAndArm(aw, ah, i, s));
        st = core.state();
        const c = st.cages[i]!;
        const dx = c.x - st.player.x;
        const dy = c.y - st.player.y;
        const len = Math.hypot(dx, dy);
        core.setInput(dx / len, dy / len);
        for (let k = 0; k < 6; k++) core.step(DT, 0.4, 0.6);
        core.setInput(0, 0);
        hit = -1;
        for (let k = 0; k < 180 && hit < 0; k++) {
          core.step(DT, 0.4, 0.6);
          hit = st.hitCage;
        }
        assert.equal(hit, i, `${label} ${i} joystick (${s.x.toFixed(3)}, ${s.y.toFixed(3)})`);
      }
    }
  });
}

test("review #485 (Vercel): a peremen álló vadász bemenet nélkül, és a nyitás ELŐTT tolt, át nem engedett joystickkal sem válaszol", () => {
  const { core } = standInZoneAndArm(1, 1.5, 0, null);
  const st = core.state();
  for (let k = 0; k < 120; k++) core.step(DT, 0.4, 0.6);
  assert.equal(st.hitCage, -1, "álló vadász: nincs válasz");
  // A nyitás előtt tolt joystick (a lap folyamatosan küldi) — a ketrec felé, elengedés nélkül, majd elengedve.
  const core2 = createBrainRotCore({ seed: 4, arenaW: 1, arenaH: 1.5 });
  core2.setCageZone(0.3, false);
  core2.setInput(0, 1); // a gyerek lefelé tol
  core2.forceCatch();
  core2.openCages(4, 1);
  const st2 = core2.state();
  const s = zoneStarts(core2, 0)[0]!;
  st2.player.x = s.x;
  st2.player.y = s.y;
  st2.cages[0]!.inside = true;
  const c = st2.cages[0]!;
  const dx = c.x - s.x;
  const dy = c.y - s.y;
  const len = Math.hypot(dx, dy);
  for (let k = 0; k < Math.ceil(CAGE_ARM_MS / DT) + 8; k++) {
    core2.setInput(dx / len, dy / len); // ugyanaz a (nyitás előtt kezdett) tolás, elengedés nélkül
    core2.step(DT, 0.4, 0.6);
  }
  core2.setInput(0, 0);
  for (let k = 0; k < 60; k++) core2.step(DT, 0.4, 0.6);
  assert.equal(st2.hitCage, -1, "a nyitáskor már tolt joystick (tehetetlenség) nem szándék");
});

/**
 * Main CI 44095911311 utómunka — a termék lassú képkockánál (a lassú CI-gép / lassú telefon), 60 fps-en és 250 ms-os
 * képkockákkal. KÉT óra van (a review szerint pontosítva):
 * - a KÉRDÉS-ÓRA a valós képkocka-időből halad, képkockánként legfeljebb 250 ms-mal (`BrainRotSteal.tsx:977`, a meghajtó
 *   `clock += dt`); ezen fut a kérdés határideje (`questionUi.ts:125`, `:206`), a 90 mp-es menetóra és a visszaszámláló;
 * - a JÁTÉKIDŐ (a mag fix lépései) képkockánként legfeljebb 5 lépést fut (`loop.ts:57`); ezen fut az élesítés
 *   (`CAGE_ARM_MS`), a látható előjelzés (`data-armed`), a megállás, a joystick-szándék és a mozgás.
 * ~7 fps alatt a kettő szétcsúszik: a játékidő lassabb, így az élesítés valós időben később jön, a döntésre jutó idő a
 * határidőig rövidebb (4 fps-en ~25–33%; jegy — a közös hurok kérdése).
 * Amit ez a teszt garantál: lassú képkockánál sem születik véletlen válasz (az élesítés előtti tolásból, a lent tartott
 * ujj húzásából), és a friss bökés nem nyelődik el (az előjelzés és az elfogadás ugyanazt a játékidőt használja). Amit NEM
 * garantál: hogy a gyerek döntési ideje lassú eszközön ugyanakkora — az a fenti két óra eltérése miatt rövidebb.
 */
for (const frameMs of [DT, 250]) {
  test(`lassú képkocka (${Math.round(frameMs)} ms): a kérdés után 400 ms-ig tolt, majd elengedett joystick nem válaszol`, () => {
    const ui = fakeUi({ give: true });
    const d = createBrainRotDriver({ seed: 21, questions: ui, band: () => 0.4, arenaW: 1, arenaH: 1.5 });
    const core = d.core;
    core.setInput(0, 1); // a gyerek lefelé tol, és közben elkap egy lényt
    core.forceCatch();
    d.resolve();
    assert.ok(ui.openNow(), "nyitott kérdés");
    core.openCages(4, ui.openNow()!.id); // a lap / a sim `onShow`-ja
    const st = core.state();
    assert.ok(st.cagesOpen);
    const c = st.cages[0]!;
    // A vadász közvetlenül a ketrec fölött: a tolás a ketrecbe viszi (a mérés így nem üres).
    st.player.x = c.x;
    st.player.y = c.y - c.h / 2 - 0.12;
    let hit = -1;
    const onEvent = (e: BrainRotEvent) => {
      if (e.type === "cageHit") hit = e.n;
    };
    const open = d.clockMs();
    core.setInput(0, 1); // a nyitás utáni apró mozdulat újraküldi a régi irányt
    while (d.clockMs() - open < 400) d.frame(frameMs, false, onEvent);
    core.setInput(0, 0);
    const released = d.clockMs();
    while (d.clockMs() - released < 1500) d.frame(frameMs, false, onEvent);
    assert.equal(hit, -1, "a döntés előtt nincs válasz");
    assert.ok(ui.openNow(), "a kérdés még nyitva");
  });

  test(`lassú képkocka (${Math.round(frameMs)} ms): a lent tartott ujj húzása 2 mp-ig sem válaszol; friss bökés a ketrecre igen`, () => {
    const ui = fakeUi({ give: true });
    const d = createBrainRotDriver({ seed: 22, questions: ui, band: () => 0.4, arenaW: 1, arenaH: 1.5 });
    const core = d.core;
    const st = core.state();
    core.setTarget(st.player.x, st.player.y + 0.05, "down"); // húzás a lény felé
    core.forceCatch();
    d.resolve();
    core.openCages(4, ui.openNow()!.id); // a lap / a sim `onShow`-ja
    assert.ok(st.cagesOpen);
    const c = st.cages[2]!;
    let hit = -1;
    const onEvent = (e: BrainRotEvent) => {
      if (e.type === "cageHit") hit = e.n;
    };
    const open = d.clockMs();
    let lastMove = -Infinity;
    while (d.clockMs() - open < 2000) {
      if (d.clockMs() - lastMove >= 100) {
        core.setTarget(c.x, c.y, "move");
        lastMove = d.clockMs();
      }
      d.frame(frameMs, false, onEvent);
    }
    assert.equal(hit, -1, "a lent tartott ujj húzása nem válasz");
    assert.ok(ui.openNow(), "a kérdés nyitva");
    core.setTarget(c.x, c.y, "down");
    const tapped = d.clockMs();
    while (hit < 0 && d.clockMs() - tapped < 3000) d.frame(frameMs, false, onEvent);
    assert.equal(hit, 2, "a friss bökés válaszol (a kérdés-ablakon belül)");
  });
}

test("D5-módosítás (a): nyitott kérdés alatt a menet-óra pontosan a régi ablaknyit fogy, utána (a hosszabbítás alatt) áll; az előjelzés alatt áll", () => {
  const ui = fakeUi({ give: true });
  const OLD_WINDOW = 3000;
  const LEAD = 600;
  // A burkolt presentation mintája: az óra az előjelzés után indul (startedAtSimMs + LEAD).
  const paced = { ...ui, request: (r: "trigger", c: number) => { const p = ui.request(r, c); return p ? { ...p, startedAtSimMs: p.startedAtSimMs + LEAD } : null; } };
  let openP: QuestionPresentation | null = null;
  const wrapped: BrainRotQuestionUi = { ...paced, request: (r, c) => (openP = paced.request(r, c)), active: () => (ui.openNow() ? openP : null) };
  const d = createBrainRotDriver({ seed: 10, questions: wrapped, band: () => 0.4, arenaW: 1, arenaH: 1.5, questionRoundMs: () => OLD_WINDOW });
  d.core.forceCatch();
  d.resolve();
  assert.ok(ui.openNow(), "nyitott kérdés");
  const r0 = d.remainingMs();
  for (let i = 0; i < 36; i++) d.frame(DT, false); // 600 ms előjelzés
  assert.ok(Math.abs(d.remainingMs() - r0) < 1, `az előjelzés alatt áll: ${r0 - d.remainingMs()}`);
  for (let i = 0; i < Math.round(8000 / DT); i++) d.frame(DT, false); // a hosszú (új) ablakon belül
  assert.ok(Math.abs(r0 - d.remainingMs() - OLD_WINDOW) < 20, `pontosan a régi ablaknyit fogyott: ${r0 - d.remainingMs()}`);
  assert.ok(ui.openNow(), "a kérdés még nyitva (a hosszabbításban)");
});
