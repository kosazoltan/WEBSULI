import { test } from "node:test";
import assert from "node:assert/strict";
import { isRepairable, matchesRepairQuery } from "../client/src/lib/lesson-repair-search";

/* Spec 2026-10-19-javito-valaszto-mobil: a régi HTML-tananyag is választható, a keresés évfolyamra és szinonimára is illik. */
const files = [
  { id: "a", title: "4. Osztály all about me english", contentType: "html", classroom: 4 },
  { id: "b", title: "There are – Angol 4. osztály", contentType: "html", classroom: 4 },
  { id: "c", title: "4 osztályos környezetismeret Budapest, barangolás", contentType: "html", classroom: 4 },
  { id: "d", title: "Have Got - Angol 5. osztály", contentType: "html", classroom: 5 },
  { id: "e", title: "Week 6 – angol szókincs és olvasás 4. osztály", contentType: "lesson", classroom: 4 },
  { id: "f", title: "Harmadik osztályos matek angol-magyar", contentType: "html", classroom: 3 },
];
const ids = (q: string) => files.filter((f) => matchesRepairQuery(f, q)).map((f) => f.id);

test("a tulajdonos keresése („4 osztályos angol”) a 4. évfolyam angol anyagait adja, a régi HTML-t is", () => {
  assert.deepEqual(ids("4 osztályos angol"), ["a", "b", "e"]);
});

test("ékezet, kisbetű és szinonima független; a pont nem zavar", () => {
  assert.deepEqual(ids("4. OSZTALY Angol"), ["a", "b", "e"]);
  assert.deepEqual(ids("english"), ["a", "b", "d", "e", "f"]);
  assert.deepEqual(ids("környezet"), ["c"]);
  assert.deepEqual(ids("4 angol"), ["a", "b", "e"]); // a „barangolás” nem „angol”: a szó elejére illik
});

test("a szám az évfolyamra illik, nem a cím tetszőleges számjegyére", () => {
  assert.deepEqual(ids("5 angol"), ["d"]);
  assert.deepEqual(ids("6"), ["e"]); // „Week 6” önálló szám a címben
});

test("üres keresés mindent ad; a PDF nem javítható", () => {
  assert.equal(ids("  ").length, files.length);
  assert.equal(isRepairable("pdf"), false);
  for (const t of ["lesson", "html", "text/html", undefined]) assert.equal(isRepairable(t), true);
});
