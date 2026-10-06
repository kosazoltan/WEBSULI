import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import { fusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { canonicalLessonQuiz } from "../server/studio/canonical-quiz-bank";
import { extractFusionLesson } from "../server/catalog/fusion-extract";
import { addOutcomes, attemptQuestionFingerprint, incrementOutcomesQuery, outcomeRecords, recordRoundOutcomes, roundOutcomes, type OutcomeRound } from "../server/catalog/outcomes";
import type { AttemptQuestion } from "../shared/lesson-attempt";

/* Spec 2026-10-06-s8-tanuloi-eredmenyesseg — kör-kérdés → katalógus-lenyomat, tételenkénti összesítés, migráció, bekötés. */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("leképezés: a kör kérdésének lenyomata = a fúziós kinyerés katalógus-lenyomata (ugyanaz a kulcs)", () => {
  for (const lesson of [fusionFixture(), standardFusionFixture()]) {
    const bank = canonicalLessonQuiz({ id: "lesson-x", json: lesson, htmlFileId: null, version: 1 });
    assert.ok(bank && bank.length > 0);
    const catalog = new Set(extractFusionLesson(lesson, "lesson:lesson-x").filter((i) => i.kind === "quiz").map((i) => i.fingerprint));
    const fromRound = new Set(bank.map(attemptQuestionFingerprint));
    assert.deepEqual([...fromRound].sort(), [...catalog].sort());
  }
});

test("leképezés: újrapublikálás más lecke-azonosítóval → változatlan kérdés ugyanaz a lenyomat; megváltozott kulcs → új lenyomat", () => {
  const lesson = fusionFixture();
  const a = canonicalLessonQuiz({ id: "v1", json: lesson, htmlFileId: "m", version: 1 })!;
  const b = canonicalLessonQuiz({ id: "v2", json: lesson, htmlFileId: "m", version: 2 })!;
  assert.deepEqual(a.map(attemptQuestionFingerprint), b.map(attemptQuestionFingerprint));
  const q = a[0];
  assert.notEqual(attemptQuestionFingerprint({ ...q, correctIndex: (q.correctIndex + 1) % q.options.length }), attemptQuestionFingerprint(q));
});

const question = (id: string, prompt = `Kérdés ${id}`): AttemptQuestion =>
  ({ id, questionId: id, questionVersion: "v", prompt, options: ["a", "b", "c"], correctIndex: 1, feedbackPerOption: ["", "", ""], coversConceptIds: [] });
const answer = (correct: boolean, usedHint = false) => ({ pickedIndex: correct ? 1 : 0, usedHint, correct, answeredAt: "2026-10-06T00:00:00.000Z" });

test("összesítés: csak a megválaszolt kérdés számít; segítséggel helyes → correct, de nem independentCorrect", () => {
  const round: OutcomeRound = {
    questions: [question("q1"), question("q2"), question("q3"), question("q4"), question("q5")],
    answers: { q1: answer(true), q2: answer(false), q3: answer(true, true), q4: answer(true) },
    hints: ["q4"],
  };
  const out = roundOutcomes(round);
  assert.equal(out.size, 4, "a megválaszolatlan q5 kimarad");
  const of = (id: string) => out.get(attemptQuestionFingerprint(question(id)))!;
  assert.deepEqual(of("q1"), { attempts: 1, correct: 1, independentCorrect: 1 });
  assert.deepEqual(of("q2"), { attempts: 1, correct: 0, independentCorrect: 0 });
  assert.deepEqual(of("q3"), { attempts: 1, correct: 1, independentCorrect: 0 }, "usedHint");
  assert.deepEqual(of("q4"), { attempts: 1, correct: 1, independentCorrect: 0 }, "hints[]");
});

test("összesítés: azonos tartalmú két kérdés egy körben két kísérlet; körök összege; rendezett rekordok", () => {
  const same = roundOutcomes({ questions: [question("a", "Ugyanaz"), question("b", "Ugyanaz")], answers: { a: answer(true), b: answer(false) }, hints: [] });
  assert.equal(same.size, 1);
  assert.deepEqual([...same.values()][0], { attempts: 2, correct: 1, independentCorrect: 1 });
  const total = addOutcomes(addOutcomes(new Map(), same), same);
  assert.deepEqual([...total.values()][0], { attempts: 4, correct: 2, independentCorrect: 2 });
  const recs = outcomeRecords(roundOutcomes({ questions: [question("x"), question("y"), question("z")], answers: { x: answer(true), y: answer(true), z: answer(false) }, hints: [] }));
  assert.deepEqual(recs.map((r) => r.fingerprint), [...recs.map((r) => r.fingerprint)].sort());
  assert.deepEqual(Object.keys(recs[0]).sort(), ["attempts", "correct", "fingerprint", "independent_correct"], "csak lenyomat + darabszám (nincs azonosító)");
});

test("növelő upsert: ON CONFLICT a lenyomaton, összeadó frissítés; üres körnél nem ír", async () => {
  assert.equal(incrementOutcomesQuery([]), null);
  let calls = 0;
  assert.equal(await recordRoundOutcomes({ execute: async () => { calls++; } }, { questions: [question("q")], answers: {}, hints: [] }), 0);
  assert.equal(calls, 0);
  const { sql: text, params } = new PgDialect().sqlToQuery(incrementOutcomesQuery([{ fingerprint: "f", attempts: 2, correct: 1, independent_correct: 1 }])!);
  assert.match(text, /INSERT INTO catalog_item_outcomes/);
  assert.match(text, /ON CONFLICT \(fingerprint\) DO UPDATE SET attempts = catalog_item_outcomes\.attempts \+ EXCLUDED\.attempts/);
  assert.match(text, /correct = catalog_item_outcomes\.correct \+ EXCLUDED\.correct/);
  assert.match(text, /independent_correct = catalog_item_outcomes\.independent_correct \+ EXCLUDED\.independent_correct/);
  assert.deepEqual(JSON.parse(String(params[0])), [{ fingerprint: "f", attempts: 2, correct: 1, independent_correct: 1 }]);
});

test("migráció 0023: additív, idempotens; lenyomat a kulcs; nincs felhasználó/lecke-azonosító; helyes-arány számolt oszlop", () => {
  const sql = read("../migrations/0023_catalog_item_outcomes.sql");
  const stmts = sql.split("--> statement-breakpoint").map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
  assert.equal(stmts.length, 1);
  for (const stmt of stmts) assert.match(stmt, /^CREATE TABLE IF NOT EXISTS catalog_item_outcomes \(/);
  assert.doesNotMatch(sql, /^\s*(?:DROP|ALTER|DELETE|TRUNCATE)\b/im);
  assert.match(sql, /fingerprint varchar\(32\) PRIMARY KEY/, "ugyanaz a hossz, mint catalog_items.fingerprint");
  assert.doesNotMatch(sql, /user_id|lesson_id|attempt_id|session/i, "adatvédelem: csak összesített szám");
  assert.match(sql, /rate real GENERATED ALWAYS AS \(CASE WHEN attempts > 0 THEN correct::real \/ attempts END\) STORED/);
  assert.match(sql, /correct <= attempts/);
  assert.match(sql, /independent_correct <= correct/);
  assert.match(read("../shared/schema.ts"), /export const catalogItemOutcomes = pgTable\("catalog_item_outcomes"/);
});

test("bekötés: a kör lezárása savepointban rögzíti az eredményt, és a hibája nem buktatja a lezárást", () => {
  const src = read("../server/rewards/lesson-attempts.ts");
  const finish = src.slice(src.indexOf("export async function finishPractice"), src.indexOf("export async function practiceReport"));
  assert.match(finish, /try \{ await tx\.transaction\(sp => recordRoundOutcomes\(sp, row\)\); \}\s*catch \(error\) \{ logger\.warn\([^\n]*error\.message/, "review #201: a hiba oka naplózva");
  assert.ok(finish.indexOf("if (row.result) return viewOf(row)") < finish.indexOf("recordRoundOutcomes"), "egyszer lezárt kör nem számol újra");
  assert.ok(finish.indexOf("recordRoundOutcomes") < finish.indexOf('status: "completed"'));
});

test("job: alapból dry-run; íráskor zárol, a zár után olvas, a tranzakción belül ellenőriz", () => {
  const src = read("../scripts/catalog/refresh-outcomes.mts");
  assert.match(src, /const write = process\.argv\.includes\("--write"\)/);
  assert.match(src, /if \(!write\) \{[\s\S]*?withReadOnlyDb\(collect\)[\s\S]*?process\.exit\(0\);/);
  const tx = src.slice(src.indexOf("await withWriteTransaction"));
  const lock = tx.indexOf("LOCK TABLE catalog_item_outcomes IN EXCLUSIVE MODE");
  assert.ok(lock > 0 && lock < tx.indexOf("collect(q)") && tx.indexOf("collect(q)") < tx.indexOf("DELETE FROM catalog_item_outcomes"));
  assert.ok(tx.indexOf("throw new Error(`a DB-számok eltérnek") < tx.indexOf("\n});"), "ellenőrzés a tranzakció törzsében (hiba → ROLLBACK)");
  assert.match(src, /status = 'completed'/);
});

test("admin-API: /outcomes csak olvasó, a lenyomaton kapcsolja a katalógust, helyes-arány szerint rendez", () => {
  const src = read("../server/catalog/admin-routes.ts");
  assert.match(src, /catalogAdminRouter\.get\("\/outcomes"/);
  assert.match(src, /innerJoin\(catalogItemOutcomes, eq\(catalogItemOutcomes\.fingerprint, catalogItems\.fingerprint\)\)/);
  assert.match(src, /orderBy\(asc\(catalogItemOutcomes\.rate\)/);
  assert.match(src, /rate: catalogItemOutcomes\.rate/);
});
