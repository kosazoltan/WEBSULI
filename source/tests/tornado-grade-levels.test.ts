import assert from "node:assert/strict";
import test from "node:test";

import { levelBand } from "../client/src/game-engine/gradeLevels";
import { tornadoLevelTimeScale, tornadoWorldLevel } from "../client/src/lib/tornado/gradeWorld";
import { AUTO_GRADE_TABLE, resolveGrades } from "../client/src/lib/tornado/questions";

// Spec 2026-09-29-palyak-szoletra-nyelvek, 3. döntés: a Tornádó a kiválasztott évfolyam AUTO-tábla-tartományából
// 10 egyenletesen elosztott világpályát rendel az 1–10. pályához (az 1. a tartomány eleje, a 10. a vége).

test("pálya → világszint: minden 3–12. évfolyamon a tartomány elejétől a végéig, szigorúan növekvő", () => {
  for (let grade = 3; grade <= 12; grade++) {
    const row = AUTO_GRADE_TABLE.find((r) => r.grades.includes(grade))!;
    assert.ok(row, `${grade}. évfolyam sora`);
    assert.equal(tornadoWorldLevel(grade, 1), row.from, `${grade}. évf. 1. pálya`);
    assert.equal(tornadoWorldLevel(grade, 10), row.to, `${grade}. évf. 10. pálya`);
    let prev = 0;
    for (let level = 1; level <= 10; level++) {
      const world = tornadoWorldLevel(grade, level)!;
      assert.ok(world > prev, `${grade}. évf. ${level}. pálya: ${world} > ${prev}`);
      assert.ok(world >= row.from && world <= row.to);
      assert.deepEqual(resolveGrades("auto", world), [grade], "AUTO módban is az évfolyam kérdései jönnek");
      prev = world;
    }
  }
});

test("pálya → világszint: egyenletes elosztás (a lépések legfeljebb 1-gyel térnek el)", () => {
  for (let grade = 3; grade <= 12; grade++) {
    const steps: number[] = [];
    for (let level = 2; level <= 10; level++) steps.push(tornadoWorldLevel(grade, level)! - tornadoWorldLevel(grade, level - 1)!);
    assert.ok(Math.max(...steps) - Math.min(...steps) <= 1, `${grade}. évf. lépések: ${steps.join(",")}`);
  }
});

test("érvénytelen évfolyam vagy pálya: nincs leképezés, illetve a szélső pálya", () => {
  for (const g of [1, 2, 13, Number.NaN, 4.5]) assert.equal(tornadoWorldLevel(g, 1), null, String(g));
  assert.equal(tornadoWorldLevel(5, 0), tornadoWorldLevel(5, 1));
  assert.equal(tornadoWorldLevel(5, 99), tornadoWorldLevel(5, 10));
});

test("pályás időkeret-szorzó: mérsékelt, a 10. pálya szűkebb, az 1. bővebb", () => {
  let prev = Infinity;
  for (let l = 1; l <= 10; l++) {
    const s = tornadoLevelTimeScale(levelBand(l));
    assert.ok(s < prev && s >= 0.85 && s <= 1.15, `${l}. pálya: ${s}`);
    prev = s;
  }
  assert.ok(tornadoLevelTimeScale(levelBand(1)) > 1);
  assert.ok(tornadoLevelTimeScale(levelBand(10)) < 1);
});
