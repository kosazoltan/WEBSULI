import test from "node:test";
import assert from "node:assert/strict";
import { TelemetryRecorder } from "../server/studio/single-run/telemetry";
import { telemetryOf, telemetryView } from "../shared/run-telemetry";

/* J3 (docs/specs/2026-10-16-egyfutas-atvilagitas.md): futásonkénti telemetria — gyűjtés, folytatásnál összeadás, a felület nézete. */

test("J3: a gyűjtő állomásonként és a friss hívásokra összead; a tartalékmodell válasza jelzett", () => {
  let now = 1000;
  const rec = new TelemetryRecorder(null, () => now);
  rec.record("tananyag", { model: "claude-opus-5-5", usage: { input: 1000, cachedInput: 800, output: 50 } }, 1200);
  rec.record("tananyag", { model: "claude-opus-5-5", usage: { input: 1100, cachedInput: 900, output: 60 } }, 800, { fix: true });
  rec.record("gyakorlóbank", { model: "gpt-6.1-sol", usage: { input: 500, output: 40 } }, 300, { fresh: true });
  rec.gates.quizBlindRemoved += 2;
  now = 6000;
  const t = rec.snapshot("claude-opus-5-5");
  assert.deepEqual(t.stations["tananyag"], { turns: 2, fixTurns: 1, input: 2100, cached: 1700, output: 110, ms: 2000 });
  assert.deepEqual(t.fresh, { calls: 1, input: 500, cached: 0, output: 40 });
  assert.equal(t.fallback, true, "a GPT-6.1 Sol válasza tartalékváltás");
  assert.equal(t.totalMs, 5000);
  assert.equal(t.gates.quizBlindRemoved, 2);
  assert.deepEqual(telemetryOf({ telemetry: t }), t);
  assert.equal(telemetryOf({}), null, "régi jobnál nincs telemetria");
});

test("J3/J5: folytatásnál a mentett telemetria folytatódik (idő, számok, kapuk összeadódnak)", () => {
  let now = 0;
  const first = new TelemetryRecorder(null, () => now);
  first.record("tananyag", { model: "claude-opus-5-5", usage: { input: 10, output: 1 } }, 5);
  first.gates.answerKeyFails = 3;
  now = 100;
  const saved = first.snapshot("claude-opus-5-5");
  now = 1000;
  const resumed = new TelemetryRecorder(saved, () => now);
  resumed.record("tananyag", { model: "claude-opus-5-5", usage: { input: 20, output: 2 } }, 7);
  now = 1050;
  const t = resumed.snapshot("claude-opus-5-5");
  assert.equal(t.stations["tananyag"].turns, 2);
  assert.equal(t.stations["tananyag"].input, 30);
  assert.equal(t.totalMs, 150);
  assert.equal(t.gates.answerKeyFails, 3);
  assert.equal(saved.stations["tananyag"].turns, 1, "a mentett pillanatkép nem változik");
});

test("J3: a JobMonitor nézete — összegzés, állomás-sorok, csak a megtörtént kapuesemények", () => {
  const rec = new TelemetryRecorder(null, () => 0);
  rec.record("lektorálás", { model: "claude-opus-5-5", usage: { input: 2_500_000, cachedInput: 2_000_000, output: 12_000 } }, 61_000, { fresh: true });
  rec.gates.lengthOverBudget = true;
  const v = telemetryView(rec.snapshot("claude-opus-5-5"));
  assert.match(v.summary, /claude-opus-5-5 · 0 s · 1 forduló \(1 friss\) · bemenet 2\.50 M \(80% gyorsítótárból\) · kimenet 12 e/);
  assert.deepEqual(v.rows, [{ station: "lektorálás", turns: "1", input: "2.50 M", cachedPct: "80%", output: "12 e", time: "61 s" }]);
  assert.deepEqual(v.gates, ["A Tananyag lap a szókeret fölött maradt"]);
});
