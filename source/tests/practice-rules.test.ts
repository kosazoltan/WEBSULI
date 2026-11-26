import { test } from "node:test";
import assert from "node:assert/strict";

import { PRACTICE_BANK_RULE, PRACTICE_TEACHING_RULE } from "../shared/practice-rules";
import { buildAuthorPrompt, buildPedagoguePrompt } from "../server/studio/step-io";
import { bankPacketContract, LESSON_METHOD_CONTRACT } from "../shared/lesson-experience";
import { lessonHtmlSpecParts } from "../server/ai/lesson-html-spec";
import { PLAYFUL_QUESTIONING_CONTRACT } from "../shared/lesson-opener";

/**
 * TANANYAG-GYAKORLATI P3 (docs/specs/2026-11-26-tananyag-gyakorlati-p3-vegrehajtas.md): a gyártás minden útja ugyanazt a
 * gyakorlatiassági szabályt kapja — tanítás: példa → a szükséges fogalom röviden → a tanuló a következő példán cselekszik; bank:
 * kb. kétharmad alkalmazó tétel, meta-kérdés (a feladatlap / felvételi pontozása, feladattípusa) tilos. Tulajdonosi döntés 2026-11-26.
 */
const map = { title: "T", subject: "magyar nyelvtan", classroom: 6, concepts: [{ localId: "c1", examWeight: "core" as const, term: "közmondás" }] };
const sections = [{ heading: "H", conceptIds: ["c1"], plannedBlocks: ["explain" as const], animationSuggestions: [] as string[] }];

test("a szabályszöveg: alkalmazás vs. fogalmi tudás, kétharmad, meta-tilalom, tantárgyfüggetlen példák", () => {
  assert.match(PRACTICE_TEACHING_RULE, /következő példán/);
  assert.match(PRACTICE_TEACHING_RULE, /indokl/);
  assert.match(PRACTICE_BANK_RULE, /kétharmad/);
  assert.match(PRACTICE_BANK_RULE, /pontoz/);
  assert.match(PRACTICE_BANK_RULE, /feladattípus/);
  for (const peldak of [/szólás|közmondás/, /elválaszt/, /mindkettő/, /számol/]) assert.match(PRACTICE_BANK_RULE, peldak);
});

test("a szerző és a tervező promptja a gyakorlatiassági szabályt kapja", () => {
  const author = buildAuthorPrompt(sections, map, []);
  assert.ok(author.includes(PRACTICE_TEACHING_RULE), "szerző");
  assert.ok(!author.includes("miért ez következik?"), "az Ellenőrzés fejezet nem „miért” kérdéssort kér");
  assert.ok(buildPedagoguePrompt(map).includes(PRACTICE_TEACHING_RULE), "tervező");
});

test("a bankcsomag-szerződés és a közös tananyagmódszer a bank-szabályt kapja", () => {
  const c = bankPacketContract({ sectionIndex: 0, conceptIds: ["a"], methodKinds: ["gate"], taskCount: 1, taskTarget: 2, quizCount: 2, quizTarget: 3 });
  assert.ok(c.includes(PRACTICE_BANK_RULE), "bankcsomag");
  assert.ok(LESSON_METHOD_CONTRACT.includes(PRACTICE_BANK_RULE), "közös módszer");
});

test("a HTML-specifikáció nem „részletes lexikális tudást” kér, és a gyakorlatiassági szabályt kapja", () => {
  const { spec } = lessonHtmlSpecParts({ classroom: 5, seed: "Közmondások", subjectHint: "magyar nyelvtan" });
  assert.ok(!spec.includes("Részletes lexikális tudás"));
  assert.ok(spec.includes(PRACTICE_TEACHING_RULE));
});

test("a játékos kérdezés selfCheck-je új példán végzett önellenőrzés, nem „magyarázd el, miért”", () => {
  assert.ok(!PLAYFUL_QUESTIONING_CONTRACT.includes("selfCheck = „magyarázd el, miért”"));
  assert.match(PLAYFUL_QUESTIONING_CONTRACT, /selfCheck = [^;.]*új példán/);
});
