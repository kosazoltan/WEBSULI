import test from "node:test";
import assert from "node:assert/strict";
import { deepWellFormed, wellFormed } from "../shared/well-formed";
import { jobStillRunning, reconcileLegacy } from "../server/studio/legacy-migration";

/* Spec 2026-10-21-ciklus5: a félbevágott emoji a mentésben (mért: „Felszín és Térfogat”) + a beragadt sorelem. */

const HIGH = String.fromCharCode(0xd83d);
const REPL = String.fromCharCode(0xfffd);
const box = String.fromCodePoint(0x1f4e6);

test("ciklus5: a katalógus-vágás módjára kettévágott emoji mélyen beágyazva is U+FFFD lesz; az ép szöveg, a szám, a null és a Date érintetlen", () => {
  const cut = `${box} FELSZÍN`.slice(0, 1);
  assert.equal(cut, HIGH, "előfeltétel: a vágás magányos felső fél-karaktert hagy");
  const when = new Date(0);
  const patch = { step: "author", finishedAt: when, output: { catalog: { items: [{ body: cut, score: 26, note: null, ok: `${box} ép` }] } } };
  const clean = deepWellFormed(patch);
  assert.equal(clean.output.catalog.items[0].body, REPL);
  assert.equal(clean.output.catalog.items[0].ok, `${box} ép`);
  assert.equal(clean.output.catalog.items[0].score, 26);
  assert.equal(clean.output.catalog.items[0].note, null);
  assert.equal(clean.finishedAt, when);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(clean)));
  assert.equal(wellFormed("ép szöveg"), "ép szöveg");
});

test("ciklus5: a hibás fázisú futás „running” job-ja bérlet nélkül nem fut (nem ragad be); a másik példány folytatása (élő bérlet) fut", () => {
  assert.equal(jobStillRunning("running", "error", false), false, "elbukott hibamentés: a job running maradt, de senki nem dolgozik rajta");
  assert.equal(jobStillRunning("running", "error", true), true, "review #350: a job egy másik futásban (folytatás) él");
  assert.equal(jobStillRunning("running", "author", false), true);
  assert.equal(jobStillRunning("error", "error", true), false);
  const base = { attempt: 1, startedAt: 0, runUpdatedAt: new Date(0), leaseAlive: false, targetIsLesson: false, jobResumable: false, jobFailed: false };
  assert.equal(reconcileLegacy({ ...base, runPhase: "error", jobRunning: jobStillRunning("running", "error", false) }, Date.now()), "restart");
});
