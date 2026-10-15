import test from "node:test";
import assert from "node:assert/strict";
import { inflectedForms, spellingVariants, synonymsOf } from "../shared/hu-lexicon";
import { autofixBankPacket } from "../server/studio/tools/bank-packet-autofix";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import type { OpenTask } from "../shared/lesson-experience";

/* Tételgyár T4′ (tulajdonosi döntés D2). Mért (job 416ad01d): a tanítás „ásványianyag-” és „termőre” alakját a rubrika nem fogadta el;
   ellenpélda: a „testére” alak a „testéről” helyett is átment. */

test("írásmód: a többszavas kifejezés egybeírt változata", () => {
  assert.ok(spellingVariants("ásványi anyag").includes("asvanyianyag"));
  assert.deepEqual(spellingVariants("termő"), []);
});

test("a tanítás közös tövű alakja: igen a „termőre”, nem a „termés”, nem az ellentétes irányrag", () => {
  assert.deepEqual(inflectedForms("termőjére", "A virágpor a termőre kerül."), ["termőre"], "az eredeti, ékezetes alak");
  assert.deepEqual(inflectedForms("termő", "A termés beérik."), []);
  assert.deepEqual(inflectedForms("testéről", "A virágpor a rovar testére tapad."), [], "a -ről ↔ -re irány nem cserélhető");
  assert.deepEqual(inflectedForms("anyag", "nem anyag"), [], "rövid szó / tagadás nem kerül be");
});

test("rokon értelmű: csak a kézzel ellenőrzött teljes csoporttag; az „eső” nem „csapadék”", () => {
  assert.deepEqual(synonymsOf("tilos"), ["nem szabad"]);
  assert.deepEqual(synonymsOf("eső"), []);
});

const task = (required: string[][], sample: string): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Mit tartalmaz?", required, bonus: [], minWords: 3, needsSentence: false, sample, mode: "written",
});

test("autofix: a 416-os két valós eset megoldva — a tanítás szóalakjával írt helyes válasz „ok”", () => {
  const teachingText = "A gyümölcs ásványianyag-tartalma magas. A virágpor a rovar testéről a termőre kerül.";
  const packet = { methods: [], quiz: [], tasks: [task([["ásványi anyag"]], "Sok ásványi anyag van benne."), task([["termőjére"]], "A virágpor a bibe termőjére kerül.")] };
  packet.tasks[1].id = "t2";
  const fixed = autofixBankPacket(packet, { sectionIndex: 0, allowedConceptIds: ["c1"], teachingText }).packet as { tasks: OpenTask[] };
  assert.equal(evaluateOpenAnswer("Sok ásványianyag van benne.", fixed.tasks[0]).state, "ok");
  assert.equal(evaluateOpenAnswer("A virágpor a termőre kerül.", fixed.tasks[1]).state, "ok");
  assert.equal(evaluateOpenAnswer("A virágpor a termésre kerül.", fixed.tasks[1]).state === "ok", false, "a „termés” nem fogadható el");
});

test("autofix: csak hozzáad — a meglévő csoporttag és a minWords változatlan; tanítás nélkül nincs tanítás-alak", () => {
  const packet = { methods: [], quiz: [], tasks: [task([["termőjére"]], "A virágpor a termőjére kerül.")] };
  const fixed = autofixBankPacket(packet, { sectionIndex: 0, allowedConceptIds: ["c1"] }).packet as { tasks: OpenTask[] };
  assert.deepEqual(fixed.tasks[0].required, [["termőjére"]]);
  assert.equal(fixed.tasks[0].minWords, 3);
});
