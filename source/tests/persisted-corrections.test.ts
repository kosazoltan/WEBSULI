import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { persistedCorrections } from "../server/studio/lesson-pipeline-routes";
import { correctionNotes } from "../server/studio/source-corrections";

/* Review #181 javítása (mért élesben, job e9fac201, 2026-10-05): újraindításkor a térkép már helyesbített, a modell nem javasolt
   semmit („HELYESBÍTÉS 0”), a job helyesbítés nélkül futott → a független bank-ellenőr a nyers átirathoz („bérművesek”) mérte a
   helyes („kézművesek”) tételeket → kapu-megállás. A már érvényes helyesbítés a DB-ből a jobbal utazik. */

const rows = [
  { localId: "parasztok-bermuvesek", term: "Parasztok és kézművesek", definition: "A társadalom egyik csoportja.", verbatimReason: "corrected:owner" },
  { localId: "azsia", term: "Ázsia", definition: "Közel-Kelet térsége.", verbatimReason: "corrected:transcription" },
  { localId: "sumerek", term: "Sumérok", definition: "Őslakók.", verbatimReason: null },
  { localId: "szamolas", term: "x", definition: "y", verbatimReason: "corrected:arithmetic" },
];

test("a már érvényes tanári/átírási helyesbítés visszaépül; a helyesbítetlen és az (újrafutó) aritmetikai nem", () => {
  const out = persistedCorrections(rows);
  assert.deepEqual(out.map((c) => [c.localId, c.basis]), [["parasztok-bermuvesek", "owner"], ["azsia", "transcription"]]);
  assert.equal(out[0].term, "Parasztok és kézművesek");
  assert.deepEqual(out[0].from, {}, "a korábbi alak nem ismert — az audit „(már helyesbítve)”-t ír");
});

test("a bank-ellenőr mércéje megkapja: a helyesbített alak a jegyzetben szerepel", () => {
  const notes = correctionNotes(persistedCorrections(rows));
  assert.match(notes.get("parasztok-bermuvesek") ?? "", /\(már helyesbítve\) → „Parasztok és kézművesek”/);
});

test("bekötés: a már érvényes helyesbítés a corrections listába kerül, így az eredeti kijáratokon (review #181) visszajön", () => {
  const code = readFileSync(new URL("../server/studio/lesson-pipeline-routes.ts", import.meta.url), "utf8");
  const fn = code.slice(code.indexOf("export async function correctMapFromOwner("), code.indexOf("export function persistedCorrections("));
  assert.ok(fn.includes("const corrections = [...proposed, ...persistedCorrections(rows)"), "a lista része");
  assert.ok(fn.includes("if (!pending.length) return corrections;"), "a review #181 kijárata változatlan");
});
