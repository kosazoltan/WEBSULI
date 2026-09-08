import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  emptyLessonProgress,
  lessonProgressKey,
  parseLessonProgress,
  LESSON_PROGRESS_VERSION,
} from "../client/src/lesson-runtime/useLessonProgress.ts";

describe("lesson progress persistence (B7)", () => {
  it("builds a versioned storage key from lesson id", () => {
    assert.equal(lessonProgressKey("abc"), "websuli.lesson.abc.v1");
  });

  it("rejects corrupt or wrong-version payloads", () => {
    assert.equal(parseLessonProgress(null), null);
    assert.equal(parseLessonProgress("{"), null);
    assert.equal(parseLessonProgress(JSON.stringify({ v: 99, current: 0, sections: {} })), null);
    assert.equal(parseLessonProgress(JSON.stringify({ v: 1, current: -1, sections: {} })), null);
  });

  it("round-trips a valid snapshot shape", () => {
    const snap = emptyLessonProgress();
    snap.current = 2;
    snap.sections["0"] = {
      answers: { "2": 1 },
      tryBlocks: { "4": { kind: "fillBlank", values: ["levél", "fény"], checked: false } },
    };
    const raw = JSON.stringify(snap);
    const parsed = parseLessonProgress(raw);
    assert.ok(parsed);
    assert.equal(parsed!.v, LESSON_PROGRESS_VERSION);
    assert.equal(parsed!.current, 2);
    assert.equal(parsed!.sections["0"]!.answers["2"], 1);
    assert.equal(parsed!.sections["0"]!.tryBlocks["4"]!.kind, "fillBlank");
  });
});
