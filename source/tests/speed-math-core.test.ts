import assert from "node:assert/strict";
import test from "node:test";

import {
  DRONE_ENTER_MS,
  FIRST_SPAWN_MS,
  INTERMISSION_MS,
  RAIDERS,
  SHIELD_MAX,
  SHIELD_START,
  SPAWN_Y,
  TOWER,
  TOWER_SLOW_MO,
  TOWER_WAVES,
  TUTORIAL_MS,
  WARP_MS,
  createTowerCore,
  droneLayout,
  towerDirectorConfig,
  turretIntervalMs,
  type TowerCore,
  type TowerEvent,
} from "../client/src/lib/speedMath/core";
import { createSimGame } from "../client/src/lib/speedMath/sim";
import { windowMsFor } from "../client/src/game-engine/play/questionDirector";

/**
 * J4a — a „Neon védőtorony” magja (végrehajtás J4a 2., 6.; terv 5.4; K.4/21, 23–25; K.5 KSZ-11, KSZ-15).
 * A szabályokat a mag nyilvános API-ján át mérjük (nincs belső állapot-piszkálás).
 */

const STEP = 1000 / 60;

function run(core: TowerCore, ms: number, intensity = 0.5, onEvent?: (e: TowerEvent) => void): void {
  for (let t = 0; t < ms; t += STEP) {
    core.step(STEP, intensity);
    core.drainEvents((e) => onEvent?.(e));
  }
}

function events(core: TowerCore, ms: number, intensity = 0.5): TowerEvent[] {
  const out: TowerEvent[] = [];
  run(core, ms, intensity, (e) => out.push({ ...e }));
  return out;
}

test("kezdés: 4 pajzs (max 5), 1. hullám, az első fosztogató ~0,7 mp után a kérdés-kártya alatt bevillan", () => {
  const core = createTowerCore({ seed: 1 });
  const st = core.state();
  assert.equal(st.shield, SHIELD_START);
  assert.equal(SHIELD_MAX, 5);
  assert.equal(st.wave, 0);
  assert.equal(st.waves, 5);
  const ev = events(core, FIRST_SPAWN_MS + 200);
  const spawn = ev.find((e) => e.type === "spawn");
  assert.ok(spawn, "az első 0,9 mp-ben jön fosztogató (0–10 mp: azonnali akció)");
  assert.ok(spawn.y >= SPAWN_Y - 1e-9, "a kérdés-kártya alatt jelenik meg");
});

test("előjelzés (K.4/21): a fosztogató a bevillanás (≥ 400 ms) alatt nem mozdul, utána a torony felé repül", () => {
  assert.ok(WARP_MS >= 400);
  const core = createTowerCore({ seed: 2 });
  run(core, FIRST_SPAWN_MS + 100);
  const r = core.state().raiders.find((it) => it.alive)!;
  assert.ok(r, "van élő fosztogató");
  const sx = r.x;
  const sy = r.y;
  const age0 = r.age;
  run(core, Math.max(0, WARP_MS - age0 - 20));
  assert.equal(r.x, sx);
  assert.equal(r.y, sy);
  run(core, 600);
  const d0 = Math.hypot(TOWER.x - sx, TOWER.y - sy);
  const d1 = Math.hypot(TOWER.x - r.x, TOWER.y - r.y);
  assert.ok(d1 < d0, "a bevillanás után közelebb ér a toronyhoz");
});

test("becsapódás: a tanító szakaszban (első 30 mp) nem sebez, utána pajzs −1; 0 pajzs = vereség", () => {
  const core = createTowerCore({ seed: 3 });
  const early = events(core, TUTORIAL_MS - 500);
  assert.ok(early.some((e) => e.type === "blocked"), "a tanító szakaszban is becsapódik (nem lövünk)");
  assert.equal(early.filter((e) => e.type === "breach").length, 0);
  // SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J4b „Megvalósult eltérések”): a rövidebb 1. hullám a tanító szakaszban véget érhet (+1 pajzs) — a mérce: a pajzs NEM fogy.
  assert.ok(core.state().shield >= SHIELD_START, "a tanító szakaszban a pajzs nem fogy (K.4/25: halál nélkül)");
  const later = events(core, 60_000);
  const breaches = later.filter((e) => e.type === "breach");
  assert.ok(breaches.length >= 1, "a tanító szakasz után a becsapódás sebez");
  assert.equal(core.state().phase, "lost", "lövés nélkül a torony elesik (van vesztési feltétel)");
  assert.equal(core.state().shield, 0);
  assert.ok(later.some((e) => e.type === "lost"));
  // Vereség után a mag nem lép tovább.
  const t = core.state().worldMs;
  core.step(STEP, 0.5);
  assert.equal(core.state().worldMs, t);
});

// SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J4b „Megvalósult eltérések”): a rossz válasz / lejárat
// ára a kombó és vele a lövés ereje (≤ 2 s látható következmény), a PAJZS NEM fogy (J4a-ban −1 volt, 1-es padlóval). A szigor
// megmarad / nő: a kérdés semmilyen sorozatban nem visz pajzsot (a 20 seedes mérés szerint különben a tanulás büntetett).
test("rossz válasz / lejárat (K.4/24, J4b): kombó és erő elvész, a pajzs nem fogy — a kérdés nem öl és nem büntet", () => {
  const core = createTowerCore({ seed: 4 });
  run(core, TUTORIAL_MS + 100, 0.5);
  for (let i = 0; i < 6; i++) core.applyOutcome("correct", 1);
  assert.equal(core.state().combo.count, 6);
  assert.ok(core.state().power >= 2);
  const s0 = core.state().shield;
  const ev: TowerEvent[] = [];
  core.applyOutcome("wrong", 0);
  core.drainEvents((e) => ev.push({ ...e }));
  assert.equal(core.state().combo.count, 0);
  assert.equal(core.state().power, 1);
  assert.equal(core.state().shield, s0);
  assert.ok(ev.some((e) => e.type === "zap"), "a következmény látszik (villám a pajzson)");
  for (let i = 0; i < 10; i++) core.applyOutcome(i % 2 ? "timeout" : "wrong", 0);
  assert.equal(core.state().shield, s0, "kérdés miatt a pajzs semmilyen sorozatban nem fogy");
  assert.equal(core.state().phase === "lost", false);
  // aborted: semmi nem változik
  const before = JSON.stringify({ s: core.state().shield, c: core.state().combo, sc: core.state().score });
  core.applyOutcome("aborted", 0);
  assert.equal(JSON.stringify({ s: core.state().shield, c: core.state().combo, sc: core.state().score }), before);
});

test("a tanító szakaszban a rossz válasz sem visz pajzsot (halál nélkül, egy mechanika)", () => {
  const core = createTowerCore({ seed: 5 });
  run(core, 2000);
  core.applyOutcome("wrong", 0);
  core.applyOutcome("timeout", 0);
  assert.equal(core.state().shield, SHIELD_START);
});

test("jó válasz (K.4/23): energiahullám a toronyból (a közeli fosztogatók megsemmisülnek), pont = 10 × erő + ≤ 25% gyorsasági bónusz", () => {
  const core = createTowerCore({ seed: 6 });
  run(core, 12_000);
  const alive = () => core.state().raiders.filter((r) => r.alive).length;
  assert.ok(alive() > 0, "van élő fosztogató a hullám előtt");
  const score0 = core.state().score;
  const ev: TowerEvent[] = [];
  core.applyOutcome("correct", 1);
  core.drainEvents((e) => ev.push({ ...e }));
  const shock = ev.find((e) => e.type === "shock");
  assert.ok(shock && shock.n > 0, "az energiahullám legalább egy fosztogatót leszed");
  assert.equal(alive(), 0, "a kártya alatti teljes pálya a hullám sugarában van");
  // 1. jó válasz: erő ×1 → 10 + 2,5 (teljes gyorsaság) = 12,5 → 13 (+ a lelőttek pontja)
  const killPoints = ev.filter((e) => e.type === "kill").reduce((s, e) => s + RAIDERS[e.kind!].points, 0);
  assert.equal(core.state().score - score0, 13 + killPoints);
});

test("kombó → erő ×1…×5 (közös combo.ts), lépcsőnként +1 pajzs (max 5); 2. erőtől automata ágyú és szórólövés", () => {
  const core = createTowerCore({ seed: 7 });
  run(core, TUTORIAL_MS + 100);
  // SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J4b „Megvalósult eltérések”): a rossz válasz már nem visz pajzsot,
  // ezért a pajzsot fosztogató-becsapódással visszük le 1-ig (lövés nélkül), és onnan mérjük a lépcsőket.
  for (let t = 0; t < 120_000 && core.state().shield > 1 && core.running(); t += STEP) {
    core.step(STEP, 0.5);
    core.drainEvents(() => {});
  }
  assert.equal(core.state().shield, 1);
  const powers: number[] = [];
  const shields: number[] = [];
  for (let i = 0; i < 15; i++) {
    core.applyOutcome("correct", 0);
    powers.push(core.state().power);
    shields.push(core.state().shield);
  }
  assert.deepEqual(powers, [1, 1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5]);
  // +1 pajzs a 3., 6., 10., 15. egymás utáni jónál (1 → 5)
  assert.deepEqual([shields[1], shields[2], shields[5], shields[9], shields[14]], [1, 2, 3, 4, 5]);
  assert.equal(core.state().combo.best, 15);
  assert.equal(turretIntervalMs(1), Number.POSITIVE_INFINITY);
  assert.ok(Number.isFinite(turretIntervalMs(2)) && turretIntervalMs(5) < turretIntervalMs(2));
  const ev = events(core, 8000);
  assert.ok(ev.some((e) => e.type === "turret"), "5-ös erőn az automata ágyú tüzel");
});

test("lövés: találat → megsemmisül (a páncélos 2 találatot bír); a találati ellipszis a nézet sugarával", () => {
  const core = createTowerCore({ seed: 8 });
  run(core, 4000);
  const r = core.state().raiders.find((it) => it.alive)!;
  assert.ok(r);
  assert.equal(core.raiderAt(r.x + 0.5, r.y, 0.05, 0.05), -1, "távoli koppintás nem talál");
  const id = core.raiderAt(r.x + 0.02, r.y - 0.01, 0.05, 0.05);
  assert.equal(id, r.id);
  assert.equal(core.shoot(id), true);
  assert.equal(r.alive, false);
  assert.equal(core.shoot(id), false, "halott célpontra nincs második találat");
  assert.equal(core.state().kills, 1);
  assert.equal(RAIDERS.tank.hp, 2);
});

// SPEC-VÁLTOZÁS 2026-11-16 (docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md J4b „Megvalósult eltérések”): az 5. hullám vége nem győzelem,
// hanem a Zéró-robot; a 3. után a Hibagyár (terv 5.4). A győzelem a főellenfél legyőzése.
test("hullámok és főellenfelek: 5 hullám, a 3. után Hibagyár, az 5. után Zéró-robot; a győzelem a legyőzése (J4b)", () => {
  assert.equal(TOWER_WAVES.length, 5);
  const core = createTowerCore({ seed: 9 });
  const seen: TowerEvent[] = [];
  // Hibátlan „játékos”: minden élő fosztogatót azonnal lelő, és minden főellenfél-kérdésre jól felel.
  for (let t = 0; t < 900_000 && core.running(); t += STEP) {
    core.step(STEP, 0.5);
    for (const r of core.state().raiders) if (r.alive && r.age > WARP_MS) core.shoot(r.id);
    if (core.bossWantsQuestion()) core.applyOutcome("correct", 1, "boss");
    core.drainEvents((e) => seen.push({ ...e }));
  }
  assert.equal(core.state().phase, "won");
  assert.deepEqual(seen.filter((e) => e.type === "waveClear").map((e) => e.n), [1, 2, 3, 4, 5]);
  assert.deepEqual(seen.filter((e) => e.type === "waveStart").map((e) => e.n), [2, 3, 4, 5]);
  assert.deepEqual(seen.filter((e) => e.type === "bossSpawn").map((e) => e.n), [1, 2], "Hibagyár, majd Zéró-robot");
  assert.deepEqual(seen.filter((e) => e.type === "bossDefeat").map((e) => e.n), [1, 2]);
  assert.ok(seen.findIndex((e) => e.type === "bossSpawn" && e.n === 1) > seen.findIndex((e) => e.type === "waveClear" && e.n === 3));
  assert.equal(seen.filter((e) => e.type === "breach").length, 0);
  assert.equal(core.state().bossesDefeated, 2);
  assert.ok(INTERMISSION_MS >= 2000);
  const minutes = core.state().worldMs / 60_000;
  assert.ok(minutes >= 2 && minutes <= 5, `hibátlan menet ${minutes.toFixed(2)} perc (2–5)`);
});

test("determinizmus (K.4/13, J19): azonos seed + bemenetsor → azonos végállapot; más seed → más pálya", () => {
  const play = (seed: number) => {
    const core = createTowerCore({ seed });
    for (let i = 0; i < 6000 && core.running(); i++) {
      core.step(STEP, 0.4 + (i % 7) * 0.05);
      if (i % 40 === 0) {
        const id = core.mostAdvanced();
        if (id >= 0) core.shoot(id);
      }
      if (i % 300 === 150) core.applyOutcome(i % 600 === 150 ? "correct" : "wrong", 0.5);
      core.drainEvents(() => {});
    }
    const st = core.state();
    return JSON.stringify({ ms: st.worldMs, s: st.shield, sc: st.score, k: st.kills, w: st.wave, r: st.raiders.map((r) => [r.alive, r.kind, r.x.toFixed(6), r.y.toFixed(6), r.hp]) });
  };
  assert.equal(play(42), play(42));
  assert.notEqual(play(42), play(43));
});

test("számdrónok helye: seedelt, a kérdés-kártya alatt, a játéktéren belül, és 360 px-en sem fedik egymást", () => {
  for (const wide of [false, true]) {
    const W = wide ? 844 : 360;
    const H = wide ? 330 : 560;
    for (let id = 1; id <= 200; id++) {
      const a: { x: number; y: number }[] = [];
      const b: { x: number; y: number }[] = [];
      droneLayout("s", id, 4, wide, a);
      droneLayout("s", id, 4, wide, b);
      assert.deepEqual(a, b);
      for (const p of a) {
        assert.ok(p.x * W - 40 >= 0 && p.x * W + 40 <= W, `${wide ? "fekvő" : "álló"} #${id}: x ${p.x}`);
        assert.ok(p.y >= 0.3 && p.y <= 0.7, `#${id}: y ${p.y}`);
      }
      // 76 × 60 px-es drónok: a középpontok legalább ennyire távol (nincs átfedés)
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          const dx = Math.abs(a[i]!.x - a[j]!.x) * W;
          const dy = Math.abs(a[i]!.y - a[j]!.y) * H;
          assert.ok(dx >= 78 || dy >= 62, `${wide ? "fekvő" : "álló"} #${id}: ${i}–${j} átfed (${dx.toFixed(0)}, ${dy.toFixed(0)})`);
        }
      }
    }
  }
  assert.ok(DRONE_ENTER_MS <= 600, "a belépő repülés rövid, utána a drón áll (célozható)");
});

test("kérdés-ütemező beállítás (végrehajtás J4a 3.): 10/perc, 1,5–6 mp rés, első feladat 1,5 mp-nél, lassítás ≥ 0,35, ablak ≤ 9 mp", () => {
  const c = towerDirectorConfig(7);
  assert.equal(c.optionCount, 4);
  assert.equal(c.minGapMs, 1500);
  assert.equal(c.maxGapMs, 6000);
  assert.equal(c.targetPerMin, 10);
  assert.equal(c.baseWindowMs, 4500);
  assert.equal(c.warmupMs, 1500);
  assert.equal(c.readingAware, true, "J0c-b: olvasási időhöz igazított ablak");
  assert.equal(c.promptFits?.({ id: "", prompt: "7 × 8 = ?", options: ["56", "54", "63", "48"], correctIndex: 0 }), true);
  const longText = "Egy iskolába háromszáznyolcvanhat lány és négyszáztizenhét fiú jár, a tornateremben pedig kétszáz szék van. Hány tanuló jár az iskolába összesen?";
  assert.equal(towerDirectorConfig(3).promptFits?.({ id: "", prompt: longText, options: ["803", "793", "703", "813"], correctIndex: 0 }), false, "3. évfolyamon 9 mp alatt nem olvasható");
  assert.ok(TOWER_SLOW_MO >= 0.35 && TOWER_SLOW_MO <= 1);
  assert.equal(windowMsFor("7 × 8 = ?", 7, c.baseWindowMs), 4500);
  assert.equal(windowMsFor("7 × 8 = ?", 3, c.baseWindowMs), 5625, "3–4. évfolyamon ×1,25");
  assert.ok(windowMsFor("x".repeat(64), 4, c.baseWindowMs) <= 9000);
});

test("nyugalom a kérdésnek (KSZ-15): a meghajtó a közös mini-Director calm()-ját használja — a nyugodt kezdés nyugodt", async () => {
  // A J4a-ban itt egy saját `towerCalm` kerülőút állt; a közös utójavítás óta a `calm()` maga igaz a pihenő-küszöb alatti
  // buildup fázisban. A kérdés/perc hatását a `speed-math-sim.test.ts` méri.
  const { createTowerDriver } = await import("../client/src/lib/speedMath/core");
  const d = createTowerDriver({ seed: 1, questions: null, intensity: () => 0.4 });
  assert.equal(d.pace.phase(), "buildup");
  assert.equal(d.pace.calm(), true);
});

test("egy válasz / kérdés (terv 8.4, multitouch): két egyidejű koppintásból csak az első számít", () => {
  const sim = createSimGame({ seed: 11, grade: 7, questions: true });
  let q = sim.question();
  for (let i = 0; i < 600 && !q; i++) {
    sim.step(STEP, { skillRoll: 2 });
    q = sim.question();
  }
  assert.ok(q, "1,5 mp-en belül nyílik kérdés");
  const wrong = (q.correctOption + 1) % q.optionCount;
  sim.answer(q.id, wrong);
  sim.answer(q.id, q.correctOption); // a második ujj — eldobódik
  sim.step(STEP, { skillRoll: 2 });
  const st = sim.stats();
  assert.equal(st.answered, 1);
  assert.equal(st.correct, 0);
  assert.equal(sim.core.state().combo.count, 0);
});

test("ismétlési kulcs évfolyammal (review #451): a Matek-tétel az évfolyamot hordozza, idegen játék tétele nem állítható vissza", async () => {
  const { bankPlayQuestion } = await import("../client/src/game-engine/play/questionDirector");
  const { inferReviewGrade, reviewFitsGrade, payloadFor } = await import("../client/src/game-engine/play/reviewQueue");
  const { isOwnReviewKey, speedMathQuizId } = await import("../client/src/lib/speedMath/core");
  const q12 = bankPlayQuestion("speed-quiz-math", { id: speedMathQuizId(12, "Mennyi 2⁸?"), prompt: "Mennyi 2⁸?", options: ["256", "128", "64", "512"], correctIndex: 0 }, undefined, 12);
  assert.equal(q12.grade, 12);
  assert.equal(inferReviewGrade(q12.key), 12, "a kulcsból is visszafejthető");
  const item = { key: q12.key, box: 0 as const, dueAt: 0, dueInRun: null, lastSeen: 0, wrong: 1, correct: 0, payload: payloadFor(q12), grade: 12 };
  assert.equal(reviewFitsGrade(item, 12), true);
  assert.equal(reviewFitsGrade(item, 3), false, "12. évfolyamos hiba nem jön vissza 3. osztályban");
  const a = bankPlayQuestion("speed-quiz-math", { id: speedMathQuizId(3, "7 × 8 = ?"), prompt: "7 × 8 = ?", options: ["56", "54", "63", "48"], correctIndex: 0 });
  const b = bankPlayQuestion("speed-quiz-math", { ...a.quiz, id: speedMathQuizId(4, "7 × 8 = ?") });
  assert.notEqual(a.key, b.key, "ugyanaz a prompt két évfolyamon két tétel");
  assert.equal(isOwnReviewKey(a.key), true);
  assert.equal(isOwnReviewKey("bank:tornado-hunter-200:g3:x"), false);
});

test("meghajtó (review #451): azonos seed + lépés-indexhez kötött bemenet → bitre azonos mag-állapot 16,67 / 33 ms-os és egyenetlen képkockákkal", async () => {
  const { createTowerDriver } = await import("../client/src/lib/speedMath/core");
  const TARGET = 3000;
  const runWithFrames = (frames: () => number) => {
    let step = 0;
    let snapshot = "";
    let driver: ReturnType<typeof createTowerDriver> | null = null;
    // A bemenet a LÉPÉS elején érkezik (az intenzitás-visszahívás lépésenként egyszer fut a mag lépése előtt): így a
    // képkocka-felosztás nem számít, csak a lépés sorszáma.
    driver = createTowerDriver({
      seed: 77,
      questions: null,
      intensity: () => {
        step += 1;
        const core = driver!.core;
        if (step === TARGET + 1) {
          const st = core.state();
          snapshot = JSON.stringify({ ms: st.worldMs, s: st.shield, sc: st.score, k: st.kills, w: st.wave, r: st.raiders.map((r) => [r.alive, r.kind, r.hp, r.x, r.y]) });
        }
        if (step % 37 === 0) {
          const id = core.mostAdvanced();
          if (id >= 0) core.shoot(id);
        }
        if (step === 400) core.applyOutcome("correct", 0.5);
        if (step === 900) core.applyOutcome("wrong", 0);
        return 0.5;
      },
    });
    for (let guard = 0; guard < 400_000 && !snapshot && driver.core.running(); guard++) driver.frame(frames(), false);
    return snapshot;
  };
  const a = runWithFrames(() => 1000 / 60);
  assert.ok(a.length > 0, "elérte a 3000. lépést");
  assert.equal(runWithFrames(() => 33), a, "33 ms-os képkockák");
  let k = 0;
  const uneven = [7, 33, 16.7, 50, 3, 24, 120];
  assert.equal(runWithFrames(() => uneven[k++ % uneven.length]!), a, "egyenetlen képkockák (a hitstop-tartással együtt)");
});

test("meghajtó: a sim (createSimGame) és a lap útja (createTowerDriver + createQuestionUi) ugyanazt az állapotot adja", async () => {
  const { createTowerDriver } = await import("../client/src/lib/speedMath/core");
  const sim = createSimGame({ seed: 5, grade: 7, questions: false });
  const d = createTowerDriver({ seed: 5, questions: null, intensity: () => 0.4 });
  for (let i = 0; i < 4000 && sim.core.running(); i++) {
    sim.step(STEP, { skillRoll: 2 }); // skillRoll 2: a bot sosem talál — csak a léptetés hasonlítható
    d.frame(STEP, false);
  }
  const pick = (c: TowerCore) => JSON.stringify({ ms: c.state().worldMs, s: c.state().shield, w: c.state().wave, r: c.state().raiders.map((r) => [r.alive, r.x, r.y]) });
  assert.equal(pick(sim.core), pick(d.core));
});
