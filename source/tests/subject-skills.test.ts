import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { subjectKeyOf } from "../shared/subject-key";
import { buildSubjectSkill, trapExample, verifierTraps, SPARSE_LIMIT } from "../server/catalog/subject-skill-builder";
import { subjectSkillBlock, subjectSkillVersion } from "../server/studio/subject-skills";
import { LESSON_TYPE_SKILLS } from "../shared/lesson-type-skills";
import { LESSON_TYPES } from "../shared/catalog-taxonomy";
import type { BankRow } from "../server/catalog/bank-rows";

/* Spec 2026-10-05-s4-tantargyi-skillek. */

test("tantárgykulcs: a mért éles értékek pontosan képeződnek; kétértelmű és ismeretlen → null (nincs találgatás)", () => {
  const measured: Array<[string, string | null]> = [["Természetismeret", "termeszetismeret"], ["Matematika", "matematika"], ["Történelem", "tortenelem"],
    ["környezetismeret", "kornyezetismeret"], ["magyar nyelv és irodalom", null], ["Informatika", "informatika"], ["földrajz", "foldrajz"],
    ["természetismeret", "termeszetismeret"], ["Történelem és társadalmi ismeretek", "tortenelem"]];
  for (const [text, key] of measured) assert.equal(subjectKeyOf(text), key, text);
  assert.equal(subjectKeyOf("5. osztályos Matematika"), "matematika");
  assert.equal(subjectKeyOf("Kémia"), "kemia");
  assert.equal(subjectKeyOf("Természettudomány és kémia"), null, "összetett → null");
  assert.equal(subjectKeyOf(""), null);
  assert.equal(subjectKeyOf(null), null);
});

const row = (d: Partial<BankRow>): BankRow => ({ subject: "fizika", grade: 7, topicArea: "Hőtan", topic: "Hő", lessonType: "fogalomtanito", kind: "quiz", prompt: "Mi a hő?",
  body: null, options: ["energia", "anyag"], correctIndex: 0, accepted: null, keywordGroups: null, steps: null, pair: null, conceptIds: null,
  provenances: ["legacy_html:a"], trust: "parent_verified", status: "active", checks: [], fingerprint: "f", ...d });
const many = (n: number, d: Partial<BankRow> = {}) => Array.from({ length: n }, (_, i) => row({ fingerprint: `f${String(i).padStart(3, "0")}`, prompt: `Kérdés ${i}`, ...d }));

test("generátor: determinisztikus — a sorrend és az ismétlés nem változtat a szövegen és a verzión", () => {
  const rows = [...many(40), ...many(5, { topicArea: "Mechanika", grade: 8 })];
  const a = buildSubjectSkill("fizika", rows, [], "2026-10-05");
  const b = buildSubjectSkill("fizika", [...rows].reverse(), [], "2026-10-05");
  assert.equal(a.text, b.text);
  assert.equal(a.version, b.version);
  assert.match(a.text, /7\. évf\.: Hőtan — 40 tétel, 1 lecke/);
});

test("minta CSAK aktív, szülő-ellenőrzött, saját tantárgyú tétel; a jelölt, átnézendő, gépi és más bank tétele soha", () => {
  const rows = [...many(SPARSE_LIMIT, { trust: "pipeline_verified" }),
    row({ fingerprint: "a1", prompt: "SZÜLŐI MINTA" }), row({ fingerprint: "a2", prompt: "JELÖLT", status: "flagged" }),
    row({ fingerprint: "a3", prompt: "ÁTNÉZENDŐ", status: "review" }), row({ fingerprint: "a4", prompt: "KÉMIA", subject: "kemia" })];
  const text = buildSubjectSkill("fizika", rows, [], "d").text;
  assert.match(text, /SZÜLŐI MINTA/);
  for (const banned of ["JELÖLT", "ÁTNÉZENDŐ", "KÉMIA", "Kérdés 0"]) assert.doesNotMatch(text, new RegExp(banned), banned);
});

test("ritka tantárgy: jelölve, mintatétel nélkül", () => {
  const s = buildSubjectSkill("fizika", many(SPARSE_LIMIT - 1), [], "d");
  assert.ok(s.sparse);
  assert.doesNotMatch(s.text, /## Mintatételek/);
  assert.match(s.text, /ritka/);
});

test("csapdák: lektor-minta anonim (szám → #, idézet → „…”); gépi leletek osztályozva", () => {
  assert.equal(trapExample("A 3. opció szerint „12 · 2 = 48”, pedig 24."), "A #. opció szerint „…”, pedig #.");
  const traps = verifierTraps("fizika", [row({ status: "flagged", checks: ["ismétlődő válaszlehetőség"] }), row({ status: "flagged", checks: ["hamis egyenlőség: 2 = 3"] }), row({ status: "flagged", subject: "kemia", checks: ["ismétlődő válaszlehetőség"] })]);
  assert.deepEqual(traps.map((t) => `${t.code}:${t.count}`).sort(), ["hamis számítás:1", "ismétlődő válaszlehetőség:1"]);
  assert.match(buildSubjectSkill("fizika", many(40), [{ source: "lektor", code: "coverage_gap", count: 7, example: "x" }], "d").text, /lektor: coverage_gap ×7 — pl\. x/);
});

test("betöltő: lecketípus-skill minden típushoz; ismeretlen tantárgy és típus → nincs blokk; a verzió a szöveggel változik", () => {
  for (const t of LESSON_TYPES) assert.match(LESSON_TYPE_SKILLS[t], /^# Lecketípus:/);
  assert.equal(subjectSkillBlock(null, null), "");
  assert.match(subjectSkillBlock(null, "gyakorlo-feladatlap"), /^=== TANTÁRGY-SKILL: - \/ gyakorlo-feladatlap \(v[0-9a-f]{12}\) ===/);
  assert.notEqual(subjectSkillVersion(null, "gyakorlo-feladatlap"), subjectSkillVersion(null, "fogalomtanito"));
});

test("S6 előtt a gyártás nem kapja meg: egyetlen gyártási modul sem importálja a tantárgyi skillt (promptok és lépés-hashek változatlanok)", () => {
  const dirs = ["../server/studio", "../server/workflows", "../server/improve"];
  for (const dir of dirs) for (const f of readdirSync(new URL(dir, import.meta.url))) {
    if (!f.endsWith(".ts") || f === "subject-skills.ts") continue;
    assert.doesNotMatch(readFileSync(new URL(`${dir}/${f}`, import.meta.url), "utf8"), /subject-skills|lesson-type-skills/, `${dir}/${f}`);
  }
});
