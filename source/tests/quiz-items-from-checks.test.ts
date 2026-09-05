import assert from "node:assert/strict";
import test from "node:test";

import { exportQuizItemsFromChecks } from "../server/studio/quiz-export";
import type { Block, Lesson } from "../shared/lesson-schema";

/**
 * LS-5 — game_quiz_items.conceptId export (master plan §5).
 *
 * A lecke check-blokkjai már kész kvíz-elemek: a játékok quiz-bankjába
 * koncepció-azonosítóval együtt kerülnek be, hogy a feedback-loop a játékbeli
 * hibát is a fogalomhoz tudja kötni.
 */

function lessonWithChecks(): Lesson {
  return {
    title: "A sejt",
    subject: "biológia",
    classroom: 7,
    mapId: "m1",
    sourceOnly: true,
    misconceptions: [],
    sections: [
      {
        heading: "Bevezetés",
        probaEnabled: true,
        blocks: [
          {
            kind: "check",
            question: "Mi az élőlények alapegysége?",
            options: ["A sejt", "A szerv", "A szövet"],
            correctIndex: 0,
            feedbackPerOption: ["Így van!", "Nem", "Nem"],
            coversConceptIds: ["c1"],
          },
          {
            kind: "check",
            question: "Melyik nem sejtszervecske?",
            options: ["Mitokondrium", "Kloroplasztisz", "A bőr"],
            correctIndex: 2,
            feedbackPerOption: ["Nem", "Nem", "Így van!"],
            coversConceptIds: ["c1", "c2"],
          },
        ],
      },
    ],
  };
}

test("exportQuizItemsFromChecks: minden check sorrá lesz, conceptId kötve", () => {
  const rows = exportQuizItemsFromChecks(lessonWithChecks(), "space", "teszt-téma");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].gameId, "space");
  assert.equal(rows[0].tier, "1");
  assert.equal(rows[0].prompt, "Mi az élőlények alapegysége?");
  assert.deepEqual(rows[0].options, ["A sejt", "A szerv", "A szövet"]);
  assert.equal(rows[0].correctIndex, 0);
  // #178 spec change: without a resolver the FK column stays null (see the #178 tests below).
  assert.equal(rows[0].conceptId, null);
  assert.equal(rows[1].conceptId, null);
});

test("exportQuizItemsFromChecks: fogalom nélküli check KIMARAD (nem lehet hangtalanul bekötni)", () => {
  const l = lessonWithChecks();
  (l.sections[0].blocks[0] as Extract<Block, { kind: "check" }>).coversConceptIds = [];
  const rows = exportQuizItemsFromChecks(l, "space");
  assert.equal(rows.length, 1);
});

test("exportQuizItemsFromChecks: csak check-blokkokat exportál", () => {
  const l = lessonWithChecks();
  const rows = exportQuizItemsFromChecks(l, "blockcraft");
  assert.ok(rows.every((r) => r.options.length >= 2));
});

// #178 — measured live (run 0c2d09ad, 2026-09-05): the lesson carries the map's LOCAL
// slugs ("s1-sarkany") in coversConceptIds, but game_quiz_items.concept_id is an FK to
// km_concepts.id (a UUID). Writing the slug into the FK column made the publish
// transaction fail and the lesson never reached the child.
test("exportQuizItemsFromChecks: a conceptId a DB-azonosító (resolver), nem a lecke slugja", () => {
  const resolve = (localId: string) => (localId === "c1" ? "uuid-c1" : null);
  const rows = exportQuizItemsFromChecks(lessonWithChecks(), "space", "t", "lesson-1", resolve);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.conceptId === "uuid-c1"), "a slug FK-ként érvénytelen — az UUID kell");
});

test("exportQuizItemsFromChecks: feloldatlan slug → conceptId null, a sor MEGMARAD (FK SET NULL-kompatibilis)", () => {
  const rows = exportQuizItemsFromChecks(lessonWithChecks(), "space", "t", "lesson-1", () => null);
  assert.equal(rows.length, 2, "a kvíz a gyereknek jár akkor is, ha a fogalom-kötés elveszett");
  assert.ok(rows.every((r) => r.conceptId === null));
});

test("exportQuizItemsFromChecks: resolver nélkül a slug NEM kerülhet az FK-oszlopba", () => {
  const rows = exportQuizItemsFromChecks(lessonWithChecks(), "space");
  assert.ok(rows.every((r) => r.conceptId === null), "nincs feloldó → nincs conceptId, nem a nyers slug");
});
