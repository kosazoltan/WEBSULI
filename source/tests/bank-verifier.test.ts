import assert from "node:assert/strict";
import test from "node:test";

import {
  BANK_CHECK_LATE_SUBKIND,
  BANK_VERIFIER_NOTE_PREFIX,
  bankItemHash,
  bankVerifierChunks,
  buildBankVerifierPrompt,
  mergeBankVerifierNotes,
  parseBankVerifierErrors,
  runBankVerifier,
} from "../server/studio/bank-verifier";
import { classifyNotes, type RawNote } from "../server/studio/lektor";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { BlindSolutions } from "../server/studio/blind-solver";

/** Spec 2026-09-24 (docs/specs/2026-09-24-bank-ellenor.md). */

const BLIND: BlindSolutions = { sourceHash: "h", model: "claude-opus-5-5", solutions: [{ task: "1. feladat", answer: "39" }] };

function twoSectionLesson() {
  const lesson = standardFusionFixture();
  const e = lesson.experience!;
  lesson.sections = [lesson.sections[0], { ...lesson.sections[0], heading: "Második fejezet" }];
  e.quiz = e.quiz.map((q, i) => (i < 2 ? { ...q, sectionIndex: 1 } : q));
  return lesson;
}

test("bank-ellenőr: fejezetenkénti darabok útvonallal, azonosítók nélkül; a hibátlannak talált tétel kimarad", () => {
  const lesson = twoSectionLesson();
  const e = lesson.experience!;
  const chunks = bankVerifierChunks(lesson);
  assert.deepEqual(chunks.map((c) => c.sectionIndex), [0, 1]);
  const total = e.methods.length + e.tasks.length + e.quiz.length;
  assert.equal(chunks.reduce((n, c) => n + c.items.length, 0), total);
  assert.deepEqual(chunks[1].items.map((i) => i.path), ["experience.quiz[0]", "experience.quiz[1]"]);
  for (const key of ["id", "sourceHash", "coversConceptIds", "sectionIndex"]) assert.equal(key in chunks[1].items[0].item, false, key);
  assert.equal(chunks[1].items[0].item.question, e.quiz[0].question);

  const cleared = new Set([bankItemHash(e.quiz[0] as unknown as Record<string, unknown>)]);
  const again = bankVerifierChunks(lesson, cleared);
  assert.deepEqual(again[1].items.map((i) => i.path), ["experience.quiz[1]"]);
  // A hash a tartalomhoz kötött: a változott tétel újra ellenőrzésre megy.
  const changed = { ...e.quiz[0], question: e.quiz[0].question + " (javítva)" };
  assert.notEqual(bankItemHash(changed as unknown as Record<string, unknown>), [...cleared][0]);
});

test("bank-ellenőr: csak a darab útvonala fogadható el, tételenként egy jegyzet; hibás alak kivételt dob", () => {
  const allowed = new Set(["experience.quiz[0]", "experience.tasks[2]"]);
  const { errors, rejected } = parseBankVerifierErrors({ errors: [
    { path: "experience.quiz[0]", message: "Mi hamis: a | Bizonyíték: b | Javítás iránya: c" },
    { path: "experience.quiz[0]", message: "ismétlés" },
    { path: "experience.quiz[99]", message: "kitalált" },
  ] }, allowed);
  assert.deepEqual(errors.map((e) => e.path), ["experience.quiz[0]"]);
  assert.deepEqual(rejected, ["experience.quiz[99]"]);
  assert.deepEqual(parseBankVerifierErrors({}, allowed).errors, []);
  assert.throws(() => parseBankVerifierErrors({ errors: "nem lista" }, allowed));
});

test("bank-ellenőr: a prompt a skill-lel indul, a vak megoldások és a tételek adatként szerepelnek", () => {
  const lesson = twoSectionLesson();
  const chunk = bankVerifierChunks(lesson)[1];
  const prompt = buildBankVerifierPrompt(chunk, BLIND, lesson);
  assert.match(prompt, /^=== TÁMOGATÓ SKILL: bank-verifier/);
  assert.match(prompt, /FÜGGETLEN VAK MEGOLDÁSOK[^]*"answer":"39"/);
  assert.match(prompt, /Második fejezet/);
  assert.match(prompt, /"path":"experience\.quiz\[1\]"/);
  assert.doesNotMatch(prompt, /"sourceHash"/);
});

test("bank-ellenőr: a bukott darab nem dob, a többi eredménye megmarad; a hibás tétel nem kerül a hibátlanok közé", async () => {
  const lesson = twoSectionLesson();
  const failures: number[] = [];
  const result = await runBankVerifier({
    lesson, blind: BLIND,
    call: async (system) => {
      if (system.includes("Második fejezet")) return { errors: [{ path: "experience.quiz[1]", message: "Mi hamis: két igaz opció | Bizonyíték: 12 + 9 − 17 = 4 | Javítás iránya: 4" }] };
      throw new Error("időtúllépés");
    },
    onChunkError: (sectionIndex) => failures.push(sectionIndex),
  });
  assert.deepEqual(failures, [0]);
  assert.equal(result.failedChunks, 1);
  assert.equal(result.checked, 2);
  assert.deepEqual(result.notes, [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[1]",
    message: BANK_VERIFIER_NOTE_PREFIX + "Mi hamis: két igaz opció | Bizonyíték: 12 + 9 − 17 = 4 | Javítás iránya: 4" }]);
  assert.deepEqual(result.cleared, [bankItemHash(lesson.experience!.quiz[0] as unknown as Record<string, unknown>)]);
  assert.equal(classifyNotes(result.notes)[0].blocking, true);
});

test("bank-ellenőr: összefésülés — a lektor által már jelzett útvonal nem duplikálódik; késői jegyzet nem blokkol", () => {
  const lektor: RawNote[] = [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: "lektor" }];
  const verifier: RawNote[] = [
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: "dupla" },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.tasks[3]", message: "új" },
  ];
  const blocking = mergeBankVerifierNotes(lektor, verifier, true);
  assert.deepEqual(blocking.map((n) => n.message), ["lektor", "új"]);
  assert.equal(classifyNotes(blocking).filter((n) => n.blocking).length, 2);
  const late = mergeBankVerifierNotes(lektor, verifier, false);
  assert.equal(late[1].subkind, BANK_CHECK_LATE_SUBKIND);
  const classified = classifyNotes(late);
  assert.equal(classified[1].blocking, false);
  assert.equal(classified[1].severity, "warn");
});
