import assert from "node:assert/strict";
import test from "node:test";

import {
  decideOneStepAction,
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

// docs/specs/2026-10-15-hiba-gombok.md (E3): a kifejezett újragyártás jelzője átjut az ellenőrzésen, hibás típus nem.
test("parseOneStepRequest: forceNew opcionális logikai jelző", () => {
  const files = [{ name: "a.txt", kind: "text", content: "A szár szállít." }];
  const forced = parseOneStepRequest({ files, forceNew: true });
  assert.ok(forced.ok && forced.data.forceNew === true);
  const plain = parseOneStepRequest({ files });
  assert.ok(plain.ok && plain.data.forceNew === undefined);
  assert.equal(parseOneStepRequest({ files, forceNew: "igen" }).ok, false);
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

// S4b (docs/specs/2026-10-16-egy-futas.md): a különálló tantárgy-felismerés (inferScope) kivezetve a one-step.ts-ből — a két esete törölve.

// Audit 2026-09-05 (szelet A): a kapu determinisztikus lépés, a driver átmegy rajta.
test("decideOneStepAction: gate lépésen → continue (a determinisztikus kapu a driverben fut le)", () => {
  assert.equal(decideOneStepAction({ step: "gate", status: "ok", output: { lesson: {} } }), "continue");
});
