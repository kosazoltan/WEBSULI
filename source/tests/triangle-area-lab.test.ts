import test from "node:test";
import assert from "node:assert/strict";
import { blockSchema } from "../shared/lesson-schema";
import { triangleAreaScene } from "../shared/triangle-area-lab";

const params = { base: 6, height: 4, unit: "cm" as const };
test("moving apex preserves area and draws an honest perpendicular outside the base", () => {
  for (const apex of [-0.4, 0, 0.5, 1, 1.4]) {
    const s = triangleAreaScene(params, apex, 1);
    assert.equal(s.area, 12);
    assert.equal(s.c.x, s.foot.x);
    assert.equal(s.foot.y, s.a.y);
    assert.equal(s.external, apex < 0 || apex > 1);
    const drawnArea = Math.abs((s.b.x - s.a.x) * (s.c.y - s.a.y)) / 2;
    const scale = (s.b.x - s.a.x) / params.base;
    assert.ok(Math.abs(drawnArea / scale ** 2 - s.area) < 1e-8);
  }
});
test("area varies with perpendicular height, including decimal source data", () => {
  assert.equal(triangleAreaScene(params, 0.5, 0.5).area, 6);
  assert.equal(triangleAreaScene(params, 0.5, 1.5).area, 18);
  assert.ok(Math.abs(triangleAreaScene({ base: 3.2, height: 5.6, unit: "m" }, 1.4, 1).area - 8.96) < 1e-10);
});
test("lesson schema rejects unrenderable lab data instead of substituting invented dimensions", () => {
  const block = { kind: "animate", animKind: "triangleArea", params, caption: "Háromszög területe", coversConceptIds: ["c1"] };
  assert.ok(blockSchema.safeParse(block).success);
  for (const invalid of [{}, { ...params, unit: "kg" }, { ...params, height: 0 }, { ...params, base: Infinity }, { ...params, base: 1001 }, { ...params, script: "evil" }]) {
    assert.equal(blockSchema.safeParse({ ...block, params: invalid }).success, false);
  }
  assert.throws(() => triangleAreaScene(params, NaN, 1), RangeError);
  assert.throws(() => triangleAreaScene(params, 0.5, 2), RangeError);
});
