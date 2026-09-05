import assert from "node:assert/strict";
import test from "node:test";

import {
  decideOneStepAction,
  inferScope,
  parseOneStepRequest,
} from "../server/studio/one-step";

/**
 * LS-6 (#164) — one-step lesson manufacturing. Upload sources once; the server
 * builds the knowledge map, infers subject/classroom when omitted, starts the
 * lesson pipeline and auto-approves the outline ONLY when the mechanical
 * coverage check passes. The lektor quality gate is untouched.
 */

test("parseOneStepRequest: scope elhagyható, files kötelező", () => {
  const noScope = parseOneStepRequest({
    files: [{ name: "a.jpg", kind: "image", content: "data:image/jpeg;base64,AA" }],
  });
  assert.equal(noScope.ok, true);
  const noFiles = parseOneStepRequest({ scope: { subject: "x", classroom: 4 }, files: [] });
  assert.equal(noFiles.ok, false);
});

test("decideOneStepAction: author-parkolás vázlattal → approve; approvedOutline után → continue", () => {
  assert.equal(
    decideOneStepAction({ step: "author", status: "ok", output: { outline: { sections: [] } } }),
    "approve",
  );
  assert.equal(
    decideOneStepAction({
      step: "author",
      status: "running",
      output: { outline: {}, approvedOutline: {} },
    }),
    "continue",
  );
});

test("decideOneStepAction: hiba és kész állapot megáll; vázlat nélküli parkolás megáll", () => {
  assert.equal(decideOneStepAction({ step: "error", status: "error", output: null }), "stop");
  assert.equal(decideOneStepAction({ step: "done", status: "ok", output: {} }), "stop");
  assert.equal(decideOneStepAction({ step: "author", status: "ok", output: {} }), "stop");
});

test("inferScope: a modell JSON-jából tantárgy+osztály, osztály 0-12 közé szorítva", async () => {
  const out = await inferScope(
    [{ name: "a.txt", kind: "text", content: "A kert élővilága" }],
    async () => '{"subject":"Természetismeret","classroom":4,"title":"Kert és park"}',
  );
  assert.deepEqual(out, {
    ok: true,
    scope: { subject: "Természetismeret", classroom: 4 },
    title: "Kert és park",
  });
  const clamped = await inferScope([], async () => '{"subject":"X","classroom":99}');
  assert.equal(clamped.ok, true);
  if (clamped.ok) assert.equal(clamped.scope.classroom, 12);
});

test("inferScope: értelmezhetetlen modellválasz → ok:false, nem dob", async () => {
  const bad = await inferScope([], async () => "nem json");
  assert.equal(bad.ok, false);
  const thrown = await inferScope([], async () => {
    throw new Error("model down");
  });
  assert.equal(thrown.ok, false);
});
