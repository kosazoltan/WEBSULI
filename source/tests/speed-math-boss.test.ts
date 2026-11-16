import assert from "node:assert/strict";
import test from "node:test";

import { createRng } from "../shared/game-rng";
import {
  BOSS_ENTER_MS,
  BOSS_QUESTION_GAP_MS,
  BOSS_TELEGRAPH_MS,
  BOMB_EVERY_MS,
  FACTORY_HP,
  TUTORIAL_MS,
  ZERO_CHIP_PER_HP,
  ZERO_HP,
  ZERO_STAGE2_HP,
  bossWeakPoints,
  chainTask,
  createTowerCore,
  createTowerTasks,
  estimateTask,
  towerQuestionKind,
  type TowerCore,
  type TowerEvent,
} from "../client/src/lib/speedMath/core";
import { createQuestionDirector, type QuestionProvider } from "../client/src/game-engine/play/questionDirector";
import { createReviewQueue } from "../client/src/game-engine/play/reviewQueue";
import type { QuestionPresentation } from "../client/src/game-engine/play/types";

/**
 * J4b — Hibagyár miniboss, Zéró-robot főellenfél, Számlánc, Becslő-bomba (végrehajtás J4b; terv 5.4 Q2, Q3; K.4/21, 23, 24).
 */

const STEP = 1000 / 60;

function run(core: TowerCore, ms: number, opts: { questionOpen?: boolean; shoot?: boolean } = {}, onEvent?: (e: TowerEvent) => void): void {
  for (let t = 0; t < ms && core.running(); t += STEP) {
    core.step(STEP, 0.5, { questionOpen: opts.questionOpen });
    if (opts.shoot) for (const r of core.state().raiders) if (r.alive && r.age > 450) core.shoot(r.id);
    core.drainEvents((e) => onEvent?.({ ...e }));
  }
}

function enteredZero(seed = 1): TowerCore {
  const core = createTowerCore({ seed });
  core.forceBoss("zero");
  run(core, BOSS_ENTER_MS + 50);
  return core;
}

test("Hibagyár: a 3. hullám után jön, gyárt, két jó gyenge-pont válasz lerombolja (+1 pajzs), utána a 4. hullám", () => {
  const core = createTowerCore({ seed: 2 });
  const ev: TowerEvent[] = [];
  for (let t = 0; t < 600_000 && core.running() && core.state().phase !== "boss"; t += STEP) {
    core.step(STEP, 0.5);
    for (const r of core.state().raiders) if (r.alive && r.age > 450) core.shoot(r.id);
    core.drainEvents((e) => ev.push({ ...e }));
  }
  assert.equal(core.state().boss?.kind, "factory");
  assert.equal(core.state().wave, 2, "a 3. hullám (index 2) után");
  assert.equal(core.state().boss?.maxHp, FACTORY_HP);
  // gyárt: a belépő után fosztogatók születnek
  const spawned: TowerEvent[] = [];
  run(core, BOSS_ENTER_MS + 6000, {}, (e) => e.type === "spawn" && spawned.push(e));
  assert.ok(spawned.length >= 2, `a Hibagyár gyárt (${spawned.length})`);
  const s0 = core.state().shield;
  for (let i = 0; i < FACTORY_HP; i++) {
    assert.ok(core.bossWantsQuestion(), `${i + 1}. gyenge-pont kérdés`);
    core.applyOutcome("correct", 1, "boss");
    run(core, BOSS_QUESTION_GAP_MS + 50);
  }
  assert.equal(core.state().boss, null);
  assert.equal(core.state().phase === "intermission" || core.state().phase === "play", true);
  assert.ok(core.state().shield >= Math.min(5, s0), "+1 pajzs (a maximumig)");
});

test("Zéró-robot: 6 szegmens, a felénél 2. fázis; ritmus: kérdés → szünet → kérdés; legyőzve = győzelem", () => {
  const core = enteredZero();
  const b = core.state().boss!;
  assert.equal(b.maxHp, ZERO_HP);
  const ev: TowerEvent[] = [];
  let questions = 0;
  for (let t = 0; t < 120_000 && core.running(); t += STEP) {
    core.step(STEP, 0.5);
    if (core.bossWantsQuestion()) {
      questions += 1;
      core.applyOutcome("correct", 1, "boss");
    }
    core.drainEvents((e) => ev.push({ ...e }));
  }
  assert.equal(core.state().phase, "won");
  assert.equal(questions, ZERO_HP, "minden jó válasz egy szegmens");
  assert.deepEqual(ev.filter((e) => e.type === "bossHit").map((e) => e.n), [5, 4, 3, 2, 1, 0]);
  assert.equal(ev.filter((e) => e.type === "bossStage").length, 1);
  assert.ok(ev.findIndex((e) => e.type === "bossStage") > ev.findIndex((e) => e.type === "bossHit" && e.n === ZERO_STAGE2_HP));
  assert.ok(ev.some((e) => e.type === "bossDefeat" && e.n === 2) && ev.some((e) => e.type === "won"));
});

test("előjelzés (K.4/21): a töltés ≥ 600 ms-mal a találat előtt látszik; nyitott kérdés alatt nem támad", () => {
  for (const t of BOSS_TELEGRAPH_MS) assert.ok(t >= 600);
  const core = enteredZero(3);
  // nyitott kérdés alatt hosszú ideig sem tölt
  const quiet: TowerEvent[] = [];
  run(core, 12_000, { questionOpen: true }, (e) => quiet.push(e));
  assert.equal(quiet.filter((e) => e.type === "bossCharge" || e.type === "bossFire").length, 0, "a válasz közben nem éri támadás");
  const ev: { e: TowerEvent; at: number }[] = [];
  let at = 0;
  for (let i = 0; i < 1200 && core.running(); i++) {
    at += STEP;
    core.step(STEP, 0.5);
    core.drainEvents((e) => ev.push({ e: { ...e }, at }));
  }
  const charge = ev.find((x) => x.e.type === "bossCharge");
  const fire = ev.find((x) => x.e.type === "bossFire");
  assert.ok(charge && fire, "töltés, majd lövés");
  assert.ok(fire.at - charge.at >= 600 - 1, `előjelzés ${fire.at - charge.at} ms`);
  assert.ok(charge.e.n >= 600);
});

test("a főellenfél lövése az utolsó pajzsot nem viszi el; a töltő mag megérintése kivédi (és repeszti a páncélt)", () => {
  const core = enteredZero(4);
  const st = core.state();
  // pajzs 1-re: sok lövés
  run(core, 60_000);
  assert.equal(st.shield, 1, "a lövés 1-ig visz");
  assert.equal(core.running(), true, "a főellenfél lövése egymaga nem öl");
  // töltés közben a mag megérintése
  let stunned = 0;
  let hp0 = st.boss!.hp;
  for (let i = 0; i < 4000 && core.running() && stunned < ZERO_CHIP_PER_HP; i++) {
    core.step(STEP, 0.5);
    if (st.boss?.attack === "charge") {
      assert.equal(core.hitBossCore(), true);
      stunned += 1;
    }
    core.drainEvents(() => {});
  }
  assert.equal(stunned, ZERO_CHIP_PER_HP);
  assert.equal(st.boss!.hp, hp0 - 1, `${ZERO_CHIP_PER_HP} megszakítás egy szegmenst tör (ügyességi út)`);
  hp0 = st.boss!.hp;
  assert.equal(core.hitBossCore(), false, "töltésen kívül a mag páncélozott");
  assert.equal(st.boss!.hp, hp0);
});

test("rossz válasz a főellenfélnél: nincs sebzés, a pajzs nem fogy, de rövid szünet után előjelzett ellencsapás jön", () => {
  const core = enteredZero(5);
  const s0 = core.state().shield;
  const ev: { e: TowerEvent; at: number }[] = [];
  core.applyOutcome("wrong", 0, "boss");
  core.drainEvents((e) => ev.push({ e: { ...e }, at: 0 }));
  assert.equal(core.state().boss!.hp, ZERO_HP);
  assert.equal(core.state().shield, s0);
  assert.ok(ev.some((x) => x.e.type === "bossShrug"));
  let at = 0;
  for (let i = 0; i < 300; i++) {
    at += STEP;
    core.step(STEP, 0.5);
    core.drainEvents((e) => ev.push({ e: { ...e }, at }));
  }
  const charge = ev.find((x) => x.e.type === "bossCharge");
  assert.ok(charge && charge.at <= 2000, `az ellencsapás ≤ 2 s-on belül látszik (${charge?.at})`);
});

test("kérdés nélkül is legyőzhető a Zéró-robot (ügyességi út: a töltő mag megszakítása) — K.6", () => {
  const core = enteredZero(6);
  for (let t = 0; t < 600_000 && core.running(); t += STEP) {
    core.step(STEP, 0.5);
    for (const r of core.state().raiders) if (r.alive && r.age > 450) core.shoot(r.id);
    if (core.state().boss?.attack === "charge") core.hitBossCore();
    core.drainEvents(() => {});
  }
  assert.equal(core.state().phase, "won");
});

test("Becslő-bomba: 20 mp-enként (a tanító szakasz után) esedékes; jó becslés minden fosztogatót eltüntet, rossz nem büntet", () => {
  const core = createTowerCore({ seed: 7 });
  let firstDue = -1;
  for (let t = 0; t < 120_000 && core.running() && firstDue < 0; t += STEP) {
    core.step(STEP, 0.5);
    for (const r of core.state().raiders) if (r.alive && r.age > 450 && r.y > 0.6) core.shoot(r.id);
    core.drainEvents(() => {});
    if (core.bombDue()) firstDue = core.state().worldMs;
  }
  assert.ok(firstDue >= TUTORIAL_MS + BOMB_EVERY_MS - STEP, `az első bomba a tanító szakasz + 20 mp után (${firstDue})`);
  assert.equal(core.bombDue(), true);
  core.takeBomb();
  assert.equal(core.bombDue(), false);
  const alive = () => core.state().raiders.filter((r) => r.alive).length;
  const s0 = core.state().shield;
  const c0 = core.state().combo.count;
  core.applyOutcome("wrong", 0, "bomb");
  assert.equal(core.state().shield, s0);
  assert.equal(core.state().combo.count, c0, "a rossz becslés a kombót sem töri");
  const before = alive();
  const ev: TowerEvent[] = [];
  core.applyOutcome("correct", 1, "bomb");
  core.drainEvents((e) => ev.push({ ...e }));
  assert.equal(alive(), 0);
  assert.equal(ev.find((e) => e.type === "bomb")?.n, before);
});

test("Számlánc: az első operandus az előző eredmény; pontosan egy jó opció; 3–4. évfolyamon nemnegatív egész", () => {
  const rng = createRng(11).next;
  for (const grade of [3, 4, 5, 8, 12]) {
    let prev = 24;
    for (let i = 0; i < 300; i++) {
      const t = chainTask(prev, grade, rng);
      assert.ok(t.prompt.startsWith(`${String(Math.round(Math.min(grade <= 4 ? 1000 : 10_000, prev))).replace("-", "−")} `), `${grade}: ${t.prompt} (előző ${prev})`);
      assert.equal(t.labels.length, 4);
      assert.equal(new Set(t.labels).size, 4);
      assert.equal(t.labels[t.correctIndex], String(t.value).replace("-", "−"));
      assert.ok(Number.isInteger(t.value) && t.value >= 0, `${t.prompt} = ${t.value}`);
      assert.ok(/[+−×÷=]/.test(t.explanation));
      prev = t.value;
    }
  }
});

test("Becslő-bomba feladat: két opció, a jó a nagyobb, a különbség 6–20% (becsléssel dönthető)", () => {
  const rng = createRng(12).next;
  for (const grade of [3, 4, 7, 11]) {
    for (let i = 0; i < 300; i++) {
      const t = estimateTask(grade, rng);
      assert.equal(t.labels.length, 2);
      const val = (l: string) => (l.includes("×") ? l.split(" × ").map(Number).reduce((a, b) => a * b, 1) : Number(l.replace("−", "-")));
      const [a, b] = t.labels.map(val) as [number, number];
      assert.notEqual(a, b);
      assert.equal(t.correctIndex, a > b ? 0 : 1);
      const ratio = Math.abs(a - b) / Math.min(a, b);
      assert.ok(ratio >= 0.05 && ratio <= 0.27, `${t.labels.join(" vs ")}: ${ratio.toFixed(3)}`);
    }
  }
});

test("gyenge pontok: a főellenféllel együtt mozognak, és 360 px-en sem fedik egymást", () => {
  const pts: { x: number; y: number }[] = [];
  bossWeakPoints("zero", 4, false, pts);
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      const dx = Math.abs(pts[i]!.x - pts[j]!.x) * 360;
      const dy = Math.abs(pts[i]!.y - pts[j]!.y) * 560;
      assert.ok(dx >= 80 || dy >= 64, `${i}–${j}: ${dx.toFixed(0)}, ${dy.toFixed(0)}`);
    }
  }
  const core = enteredZero(8);
  const b = core.state().boss!;
  const x0 = b.x;
  run(core, 2500, { questionOpen: true });
  assert.notEqual(core.state().boss!.x, x0, "a főellenfél (és vele a gyenge pontok) mozog — folyamatosan mozgó cél");
});

test("createTowerTasks: a bomba kétválaszos, ismétlési sorba nem kerülő tétel; a főellenfél lánca az előző eredményből megy tovább", () => {
  const core = createTowerCore({ seed: 9 });
  const tasks = createTowerTasks({ core, grade: () => 5, rng: createRng(13).next });
  core.setNextKind("bomb");
  const bomb = tasks.special()!;
  assert.equal(bomb.quiz.options.length, 2);
  assert.equal(bomb.noReview, true);
  core.setNextKind("boss");
  const b1 = tasks.special()!;
  const pres = (q: typeof b1, reason: QuestionPresentation["reason"]): QuestionPresentation => ({
    id: 1, question: q, isReview: false, windowMs: 4000, slowMo: 0.5, startedAtSimMs: 0, reason,
    options: q.quiz.options.map((label, i) => ({ label, originalIndex: i, correct: i === q.quiz.correctIndex })),
  });
  assert.equal(towerQuestionKind(pres(b1, "boss")), "boss");
  assert.equal(towerQuestionKind(pres(bomb, "trigger")), "bomb");
  tasks.noteOutcome({ id: 1, key: b1.key, result: "correct", pickedOriginalIndex: b1.quiz.correctIndex, correctOriginalIndex: b1.quiz.correctIndex, responseMs: 900 }, pres(b1, "boss"));
  const b2 = tasks.special()!;
  assert.ok(b2.quiz.prompt.startsWith(`${b1.quiz.options[b1.quiz.correctIndex]} `), `lánc: ${b1.quiz.prompt} → ${b2.quiz.prompt}`);
  // rendes kérdés: ×3 kombó + jó válasz után Számlánc
  core.setNextKind("normal");
  assert.equal(tasks.special(), null);
});

test("noReview (közös, additív): a Becslő-bomba nem kerül az ismétlési sorba, és nem rontja a visszatérési mérést", () => {
  const core = createTowerCore({ seed: 10 });
  const tasks = createTowerTasks({ core, grade: () => 6, rng: createRng(14).next });
  const review = createReviewQueue(null);
  const provider: QuestionProvider = { couponOnly: false, material: () => null, fresh: () => tasks.special(), restore: () => null };
  const d = createQuestionDirector({
    config: { gameId: "speed-quiz-math", optionCount: 4, minGapMs: 1500, maxGapMs: 6000, targetPerMin: 10, baseWindowMs: 4500, slowMo: 0.5, grade: 6, warmupMs: 0 },
    provider, review, rng: createRng(3), startBand: 0.5, now: () => 0,
  });
  core.setNextKind("bomb");
  const p = d.request("trigger", 0)!;
  assert.equal(p.options.length, 2, "a director a kétopciós tételt két célon mutatja");
  d.answer(p.id, p.options.findIndex((o) => !o.correct), 900);
  assert.equal(review.size(), 0, "a rossz becslés nem kerül az ismétlési sorba");
  const s = d.stats(1000);
  assert.equal(s.wrong, 1);
  assert.equal(s.reviewReturnWithin6, 1, "a visszatérési mérés nem számolja (szándékosan nem tér vissza)");
});
