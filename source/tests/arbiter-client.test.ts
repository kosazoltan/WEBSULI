import assert from "node:assert/strict";
import test from "node:test";
import { bestVerdict, htmlArbiterSource } from "../client/src/lesson-runtime/arbiter";

/* Tételgyár T7.2 (docs/specs/2026-10-15-tetelgyar-t7-dontobiro-vegrehajtas.md): a kliens csak emelhet; a HTML-lecke forrása a /dev/:id útvonal. */

test("bestVerdict: a döntőbíró emelhet, rontani nem; hiányzó ítéletnél a pontozó marad", () => {
  const det = { state: "partial" as const, score: 0.5, reason: "Részben jó." };
  assert.deepEqual(bestVerdict(det, { state: "ok", score: 1, reason: "Szép!", source: "döntőbíró" }), { state: "ok", score: 1, reason: "Szép!", arbiter: true });
  assert.deepEqual(bestVerdict(det, { state: "fail", score: 0, reason: "x", source: "döntőbíró" }), { ...det, arbiter: false });
  assert.deepEqual(bestVerdict(det, undefined), { ...det, arbiter: false });
  assert.equal(bestVerdict(det, { state: "ok", score: 1, reason: "", source: "gyorsítótár" }).reason, "Részben jó.", "üres indoklásnál a pontozóé");
});

test("htmlArbiterSource: csak a /dev/:id lapon", () => {
  assert.deepEqual(htmlArbiterSource("/dev/abc-123"), { kind: "html", materialId: "abc-123" });
  assert.deepEqual(htmlArbiterSource("/dev/abc-123/"), { kind: "html", materialId: "abc-123" });
  assert.equal(htmlArbiterSource("/preview/abc"), null);
  assert.equal(htmlArbiterSource("/dev/a/b"), null);
});
