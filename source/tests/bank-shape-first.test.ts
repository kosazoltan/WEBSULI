import { test } from "node:test";
import assert from "node:assert/strict";
import { autofixBankPacket } from "../server/studio/tools/bank-packet-autofix";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-10-01-gyokerok-egyben (2.2a, E2): a determinisztikus eszköz (autofix, szabályok) a NYERS modell-JSON-on nem dobhat
   kivételt, és ha mégis, az bukott kísérlet (javító kör), nem a lépés halála. Mért: job 35370b32, `value.trim is not a function`
   (az autofix a séma előtt hívta a pontozót a nyers `typedAnswers[].value` számmal). */

const malformed = () => {
  const e = structuredClone(standardFusionFixture().experience!);
  // a modell szám típust írt a szöveg mezőkbe (mért hibaosztály)
  (e.tasks[1] as unknown as { sample: unknown }).sample = 12;
  (e.tasks[2] as unknown as { typedAnswers: unknown }).typedAnswers = [{ part: "a", kind: "number", value: 12 }];
  (e.tasks[3] as unknown as { required: unknown }).required = [[12]];
  return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
};

test("autofix: nem-szöveg minta / típusos érték / rubrika nem dob kivételt (a séma utasítja el)", () => {
  assert.doesNotThrow(() => autofixBankPacket(malformed(), { sectionIndex: 0, allowedConceptIds: ["area"] }));
});

test("bankgyártás: az alakhibás jelölt bukott kísérlet és javító kör — a második, helyes csomag átmegy", async () => {
  const lesson = standardFusionFixture();
  const good = standardFusionFixture().experience!;
  let calls = 0;
  const failures: string[] = [];
  const result = await buildLessonExperience(lesson, [{ localId: "area", examWeight: "core" }], {
    call: async () => (++calls === 1 ? malformed() : { methods: good.methods, tasks: good.tasks, quiz: good.quiz, glossary: [] }),
    onAttemptFailure: (_section, _attempt, issues) => { failures.push(issues); },
  });
  assert.equal(calls, 2, "egy bukott kísérlet, majd siker");
  assert.equal(failures.length, 1);
  assert.match(failures[0], /sample|typedAnswers|required/);
  assert.equal(result.tasks.length, good.tasks.length);
});

test("bankgyártás: ha az előfeldolgozó eszköz kivételt dob a nyers adaton, az bukott kísérlet — a lépés nem hal meg", async () => {
  const lesson = standardFusionFixture();
  const good = standardFusionFixture().experience!;
  let calls = 0, toolCalls = 0;
  const failures: string[] = [];
  const result = await buildLessonExperience(lesson, [{ localId: "area", examWeight: "core" }], {
    call: async () => { calls++; return { methods: good.methods, tasks: good.tasks, quiz: good.quiz, glossary: [] }; },
    // a mért osztály: az eszköz a séma ELŐTT a nyers adaton dolgozik, és típushibán kivételt dob
    autofix: (packet, options) => { if (++toolCalls === 1) throw new TypeError("value.trim is not a function"); return autofixBankPacket(packet, options); },
    onAttemptFailure: (_section, _attempt, issues) => { failures.push(issues); },
  });
  assert.equal(calls, 2, "a kivétel bukott kísérlet, a következő kísérlet fut");
  assert.match(failures[0], /value\.trim is not a function/);
  assert.equal(result.tasks.length, good.tasks.length);
});
