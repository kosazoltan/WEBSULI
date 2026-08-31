import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASSROOMS,
  CLASSROOM_VALUES,
  MIN_CLASSROOM,
  MAX_CLASSROOM,
  DEFAULT_CLASSROOM,
  getClassroomLabel,
  isValidClassroom,
  extractClassroomFromTitle,
} from "../shared/classrooms";

/**
 * shared/classrooms.ts — the single source of truth for classroom values, shared by the
 * upload validation on the server and the selects/filters on the client.
 */

// -------------------------------------------------------------------- the table

test("the classroom table covers 0-12 with no gaps or duplicates", () => {
  assert.deepEqual(CLASSROOM_VALUES, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(CLASSROOMS.length, 13);
  assert.equal(new Set(CLASSROOM_VALUES).size, CLASSROOM_VALUES.length);
});

test("every classroom has a non-empty label and short label", () => {
  for (const c of CLASSROOMS) {
    assert.ok(c.label.length > 0, `missing label for ${c.value}`);
    assert.ok(c.shortLabel.length > 0, `missing shortLabel for ${c.value}`);
  }
});

test("the bounds and default agree with the table", () => {
  assert.equal(MIN_CLASSROOM, Math.min(...CLASSROOM_VALUES));
  assert.equal(MAX_CLASSROOM, Math.max(...CLASSROOM_VALUES));
  assert.ok(CLASSROOM_VALUES.includes(DEFAULT_CLASSROOM));
});

// ------------------------------------------------------------ getClassroomLabel

test("getClassroomLabel returns the long label by default and the short one on request", () => {
  assert.equal(getClassroomLabel(0), "Programozási alapismeretek");
  assert.equal(getClassroomLabel(0, true), "Prog.");
  assert.equal(getClassroomLabel(5), "5. osztály");
  assert.equal(getClassroomLabel(5, true), "5.");
});

test("getClassroomLabel falls back for an unknown value", () => {
  assert.equal(getClassroomLabel(99), "99. osztály");
});

// ------------------------------------------------------------- isValidClassroom

test("isValidClassroom accepts every value in the table", () => {
  for (const v of CLASSROOM_VALUES) {
    assert.equal(isValidClassroom(v), true, `rejected ${v}`);
  }
});

test("isValidClassroom rejects out-of-range values", () => {
  assert.equal(isValidClassroom(-1), false);
  assert.equal(isValidClassroom(13), false);
});

test("isValidClassroom rejects non-integers", () => {
  // The value ends up in an integer DB column; 3.7 would be silently truncated.
  assert.equal(isValidClassroom(3.7), false);
  assert.equal(isValidClassroom(NaN), false);
  assert.equal(isValidClassroom(Infinity), false);
});

// ---------------------------------------------------- extractClassroomFromTitle

test("extractClassroomFromTitle recognises the programming track as 0", () => {
  assert.equal(extractClassroomFromTitle("Programozási alapismeretek — ciklusok"), 0);
  assert.equal(extractClassroomFromTitle("PROGRAMOZASI ALAPISMERETEK"), 0);
  assert.equal(extractClassroomFromTitle("Programozás alapok"), 0);
});

test("extractClassroomFromTitle reads a grade from the common title shapes", () => {
  assert.equal(extractClassroomFromTitle("Törtek — 5. osztály"), 5);
  assert.equal(extractClassroomFromTitle("Törtek — 5.osztály"), 5);
  assert.equal(extractClassroomFromTitle("Nyelvtan 3 osztály"), 3);
  assert.equal(extractClassroomFromTitle("Fizika osztály: 9"), 9);
  assert.equal(extractClassroomFromTitle("Kémia osztaly 7"), 7);
});

test("extractClassroomFromTitle handles two-digit grades", () => {
  assert.equal(extractClassroomFromTitle("Érettségi 12. osztály"), 12);
  assert.equal(extractClassroomFromTitle("Irodalom 10. osztály"), 10);
  assert.equal(extractClassroomFromTitle("Történelem 11. osztály"), 11);
});

test("extractClassroomFromTitle is accent- and case-insensitive", () => {
  assert.equal(extractClassroomFromTitle("MATEMATIKA 4. OSZTÁLY"), 4);
  assert.equal(extractClassroomFromTitle("matematika 4. osztaly"), 4);
});

test("extractClassroomFromTitle returns null when the title carries no grade", () => {
  assert.equal(extractClassroomFromTitle("Általános ismétlés"), null);
  assert.equal(extractClassroomFromTitle(""), null);
});

test("extractClassroomFromTitle never returns an out-of-range grade", () => {
  // 13+ and 0 are not valid grades; embedded digits must not be misread.
  for (const title of ["Feladat 13. osztály", "Feladat 0. osztály", "Feladat 112. osztály", "Feladat 99 osztály"]) {
    const got = extractClassroomFromTitle(title);
    assert.ok(got === null || isValidClassroom(got), `${title} → ${got}`);
  }
});

test("extractClassroomFromTitle only produces values the table knows", () => {
  const got = extractClassroomFromTitle("Dolgozat 8. osztály");
  assert.ok(got !== null && CLASSROOM_VALUES.includes(got));
});
