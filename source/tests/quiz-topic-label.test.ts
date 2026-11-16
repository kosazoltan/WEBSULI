import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { quizTopicLabelHu, QUIZ_SUBJECT_LABELS_HU } from "../client/src/lib/quizTopicLabel";
import { VOCAB_TOPICS } from "../client/src/data/vocabBank/topics";

/** E24 — éles próba: a Brain Rot fejléce „HUNGARIAN KVÍZ”-t írt, mert a `quiz.topic` nyers angol kulcsa került ki. */
test("minden tantárgy-kulcsra magyar címke jár (kis- és nagybetűtől függetlenül)", () => {
  for (const key of ["math", "english", "hungarian", "nature", "science", "history"]) {
    const label = quizTopicLabelHu(key);
    assert.equal(label, QUIZ_SUBJECT_LABELS_HU[key]);
    assert.notEqual(label.toLowerCase(), key, `${key}: nyers angol kulcs maradt`);
    assert.equal(quizTopicLabelHu(key.toUpperCase()), label);
  }
  assert.equal(quizTopicLabelHu("Hungarian"), "Magyar");
});

test("mind a 24 szóbank-témára magyar címke jár, és egyik sem a nyers kulcs", () => {
  assert.equal(VOCAB_TOPICS.length, 24);
  for (const t of VOCAB_TOPICS) {
    const label = quizTopicLabelHu(t);
    assert.ok(label.length > 0 && label !== "Kvíz", `${t}: nincs címke`);
    if (t !== "nature") assert.notEqual(label.toLowerCase(), t);
  }
});

test("ismeretlen azonosító-szerű kulcs → „Kvíz”; emberi szöveg változatlan; üres → tartalék", () => {
  assert.equal(quizTopicLabelHu("geography"), "Kvíz");
  assert.equal(quizTopicLabelHu("some_new-topic"), "Kvíz");
  assert.equal(quizTopicLabelHu("Egyenletek"), "Egyenletek");
  assert.equal(quizTopicLabelHu("Szorzás és osztás"), "Szorzás és osztás");
  assert.equal(quizTopicLabelHu(""), "Kvíz");
  assert.equal(quizTopicLabelHu(null, "Angol"), "Angol");
  assert.equal(quizTopicLabelHu(undefined), "Kvíz");
});

test("a kvíz-fejlécet kiíró játékoldalak a közös címkét használják, nyers topic nem kerül ki", () => {
  const read = (f: string) => readFileSync(new URL(`../client/src/pages/${f}`, import.meta.url), "utf8");
  for (const f of ["BrainRotSteal.tsx", "TornadoHunter200.tsx", "TsunamiEscapeEnglish.tsx"]) {
    const src = read(f);
    assert.match(src, /quizTopicLabelHu\(/, `${f}: nincs közös címke`);
    assert.ok(!/\{\s*quiz\.topic\s*\|\|/.test(src) && !/\{\s*activeQuiz\.topic\s*\|\|/.test(src), `${f}: nyers topic a fejlécben`);
    assert.ok(!/label:\s*quiz\.topic\b/.test(src), `${f}: nyers topic a címkében`);
  }
});
