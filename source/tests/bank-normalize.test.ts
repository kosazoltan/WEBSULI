import test from "node:test";
import assert from "node:assert/strict";
import { alignTaskToSample, normalizeBankPacket } from "../server/studio/bank-normalize";
import { checkGrounding } from "../server/studio/grounding";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import { questionKey } from "../shared/lesson-experience";

/* Spec 2026-10-05-bank-determinisztikus-normalizalas — a mért gépies bankhibák modellhívás nélkül (élő naplók, 2026-10-05). */

const task = (over: Record<string, unknown>) => ({ id: "t1", sectionIndex: 0, conceptIds: ["c1"], q: "Mennyi egy emberöltő?", required: [["30 év"]], bonus: [], minWords: 3, needsSentence: false, sample: "Egy emberöltő körülbelül 30 évnyi idő.", mode: "written", ...over }) as never;

test("mért: a kötelező „30 év” csak ragozva („30 évnyi”) áll a mintában → a ragozott alak a csoportba kerül, a minta teljes pont", () => {
  const t = task({});
  assert.notEqual(evaluateOpenAnswer((t as { sample: string }).sample, t).score, 1, "eredetileg nem teljes pont");
  assert.equal(alignTaskToSample(t), true);
  assert.equal(evaluateOpenAnswer((t as { sample: string }).sample, t).score, 1);
  assert.ok((t as { required: string[][] }).required[0].includes("30 évnyi"));
});

test("a szószám-küszöb nem csökken: a saját küszöbénél rövidebb minta javíthatatlan (a modell-javítókör dönt)", () => {
  const t = task({ required: [["emberöltő"]], minWords: 15 });
  assert.equal(alignTaskToSample(t), false);
  assert.equal((t as { minWords: number }).minWords, 15);
});

test("a mintában nem szereplő fogalom nem kerül be (a rubrika nem lazul vakon) → javíthatatlan", () => {
  assert.equal(alignTaskToSample(task({ required: [["évezred"]] })), false);
});

test("ismétlődő kérdés kivéve, a javíthatatlan feladat marad (a meglévő hibaút dönt), a minimum alá soha", () => {
  const quiz = (id: string, question: string) => ({ id, question }) as never;
  const packet = { tasks: [task({ id: "a" }), task({ id: "b", q: "Mi az évezred?", required: [["évezred"]] })], quiz: [quiz("q1", "Mi Mezopotámia?"), quiz("q2", "Mi a zikkurat?"), quiz("q3", "Ki a papkirály?")] };
  const notes = normalizeBankPacket(packet as never, { tasks: [], quiz: ["Mi Mezopotámia?"] }, { tasks: 1, quiz: 2 }, questionKey);
  assert.deepEqual(packet.quiz.map((q: { id: string }) => q.id), ["q2", "q3"]);
  assert.deepEqual(packet.tasks.map((t: { id: string }) => t.id), ["a", "b"]);
  assert.ok(notes.some((n) => n.startsWith("q1")) && notes.some((n) => n.startsWith("a: rubrika")));
  const tight = { tasks: [], quiz: [quiz("q1", "Mi Mezopotámia?"), quiz("q2", "Mi a zikkurat?")] };
  normalizeBankPacket(tight as never, { tasks: [], quiz: ["Mi Mezopotámia?"] }, { tasks: 0, quiz: 2 }, questionKey);
  assert.equal(tight.quiz.length, 2, "a minimum alá nem vesz ki — a régi hibaút dönt");
});

test("mért (job 5b33202a): a csak rövidítésből álló fogalom („Kr. u. / i. sz.”) a szó szerinti előfordulással megalapozott; magányos betű nem", () => {
  const c = { localId: "c7", term: "Kr. u. / i. sz.", examWeight: "core" } as never;
  assert.equal(checkGrounding("Jelölés nélkül mindig Kr. u. / i. sz. évszámról van szó, vagyis Krisztus után.", c), true);
  assert.equal(checkGrounding("Krisztus előtt történt minden ilyen esemény a régi korban.", c), false);
  assert.equal(checkGrounding("Az u betű és az i betű magánhangzó a szavakban.", { localId: "x", term: "u", examWeight: "core" } as never), false);
});
