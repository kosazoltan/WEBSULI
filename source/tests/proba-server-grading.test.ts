import assert from "node:assert/strict";
import test from "node:test";

import { gradeProba } from "../server/rewards/grade";
import type { Lesson } from "../shared/lesson-schema";

/**
 * LS-3a — the server marks the test, not the browser.
 *
 * A coupon buys screen time, which makes the client an interested party: any grading
 * done in the page can be edited by anyone who opens the dev tools. So the answers are
 * scored against the stored lesson JSON, and the request carries only what the child
 * picked. There is deliberately no `score` field to trust — the tests below feed one
 * anyway and require it to change nothing.
 */

function lesson(): Lesson {
  return {
    title: "Törtek",
    subject: "matematika",
    classroom: 4,
    mapId: "km-1",
    misconceptions: [],
    sourceOnly: true,
    sections: [
      {
        heading: "Szakasz 0",
        probaEnabled: true,
        blocks: [
          {
            kind: "explain",
            text: "A tört a rész és az egész viszonya.",
            depth: "core",
            readAloud: true,
            coversConceptIds: ["c-tort"],
          },
          {
            kind: "check",
            question: "Mennyi a fél?",
            options: ["1/2", "1/3", "2/3"],
            correctIndex: 0,
            feedbackPerOption: ["Így van.", "Ez harmad.", "Ez kétharmad."],
            coversConceptIds: ["c-fel"],
          },
          {
            kind: "check",
            question: "Melyik a nagyobb?",
            options: ["1/4", "1/2"],
            correctIndex: 1,
            feedbackPerOption: ["Kisebb.", "Így van."],
            coversConceptIds: ["c-osszehasonlitas", "c-tort"],
          },
        ],
      },
      {
        heading: "Szakasz 1",
        probaEnabled: true,
        blocks: [
          {
            kind: "check",
            question: "Másik szakasz kérdése",
            options: ["a", "b"],
            correctIndex: 0,
            feedbackPerOption: ["Jó.", "Rossz."],
            coversConceptIds: ["c-masik"],
          },
        ],
      },
    ],
  };
}

test("AC5 a kérésben küldött pontszám nem befolyásolja az eredményt", () => {
  const hazug = gradeProba(lesson(), 0, [
    { blockIndex: 1, pickedIndex: 1 },
    { blockIndex: 2, pickedIndex: 0 },
    // A kliens 100-at állít magáról — a szerver nem is olvassa.
    { blockIndex: 1, pickedIndex: 1, score: 100 } as never,
  ]);

  assert.equal(hazug.score, 0, "két rossz válasz nulla pont, bármit is állít a kliens");
  assert.equal(hazug.correctCount, 0);
  assert.equal(hazug.total, 2);
});

test("minden helyes válasz 100 pont", () => {
  const out = gradeProba(lesson(), 0, [
    { blockIndex: 1, pickedIndex: 0 },
    { blockIndex: 2, pickedIndex: 1 },
  ]);

  assert.equal(out.score, 100);
  assert.deepEqual(out.weakConceptIds, []);
});

test("a rossz válaszok fogalmai kerülnek a weakConceptIds-be", () => {
  const out = gradeProba(lesson(), 0, [
    { blockIndex: 1, pickedIndex: 0 },
    { blockIndex: 2, pickedIndex: 0 },
  ]);

  assert.equal(out.score, 50);
  assert.deepEqual(out.weakConceptIds.sort(), ["c-osszehasonlitas", "c-tort"]);
});

test("hiányzó válasz = rossz válasz", () => {
  const out = gradeProba(lesson(), 0, [{ blockIndex: 1, pickedIndex: 0 }]);

  assert.equal(out.total, 2, "a szakasz összes kérdése számít, nem csak a beküldöttek");
  assert.equal(out.correctCount, 1);
  assert.equal(out.score, 50);
  assert.ok(out.weakConceptIds.includes("c-osszehasonlitas"));
});

test("a szakaszon kívüli blokk nem számít bele", () => {
  const out = gradeProba(lesson(), 0, [
    { blockIndex: 1, pickedIndex: 0 },
    { blockIndex: 2, pickedIndex: 1 },
    // Egy másik szakasz blokk-indexe: nem létezik ebben a szakaszban.
    { blockIndex: 9, pickedIndex: 0 },
  ]);

  assert.equal(out.total, 2);
  assert.equal(out.score, 100);
});

test("csak a check blokkok számítanak", () => {
  const out = gradeProba(lesson(), 0, [
    { blockIndex: 0, pickedIndex: 0 },
    { blockIndex: 1, pickedIndex: 0 },
    { blockIndex: 2, pickedIndex: 1 },
  ]);

  assert.equal(out.total, 2, "az explain blokkra adott válasz nem kérdés");
  assert.equal(out.score, 100);
});

test("kérdés nélküli szakasz nem osztható nullával", () => {
  const l = lesson();
  l.sections[0].blocks = [l.sections[0].blocks[0]];

  const out = gradeProba(l, 0, []);

  assert.equal(out.total, 0);
  assert.equal(out.score, 0, "kérdés nélkül nincs mit jutalmazni");
});

test("nem létező szakaszindex üres értékelést ad", () => {
  const out = gradeProba(lesson(), 7, [{ blockIndex: 0, pickedIndex: 0 }]);

  assert.equal(out.total, 0);
  assert.equal(out.score, 0);
});

test("az utolsó szakasz a lecke záró próbája", () => {
  assert.equal(gradeProba(lesson(), 1, []).isLessonFinal, true);
  assert.equal(gradeProba(lesson(), 0, []).isLessonFinal, false);
});
