import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { subjectKeyOf } from "../shared/subject-key";
import { buildSubjectSkill, trapExample, verifierTraps, SPARSE_LIMIT } from "../server/catalog/subject-skill-builder";
import { subjectSkillBlock, subjectSkillVersion } from "../server/studio/subject-skills";
import { LESSON_TYPE_SKILLS } from "../shared/lesson-type-skills";
import { LESSON_TYPES, CATALOG_SUBJECTS, SUBJECT_LABELS } from "../shared/catalog-taxonomy";
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

test("csapdák: lektor-minta rövidített és maszkolt (szám → #, idézet → „…”; nem garantált anonimizálás); gépi leletek osztályozva", () => {
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

// Dokumentált spec-változás (docs/specs/2026-10-06-s6-katalogus-bekotes.md): az S6 a skillt a gyártásba köti, de KIZÁRÓLAG a kapcsolós
// server/catalog/s6-context.ts modulon át; az őr ereje változatlan (közvetlen import továbbra sincs), csak a cím követi a valóságot.
// A kikapcsolt kapcsoló melletti változatlan promptot a tests/catalog-s6.test.ts őrzi.
test("S6: a gyártási modulok a tantárgyi skillt csak a kapcsolós katalógus-modulon át kapják — közvetlen import nincs", () => {
  const dirs = ["../server/studio", "../server/workflows", "../server/improve"];
  for (const dir of dirs) for (const f of readdirSync(new URL(dir, import.meta.url))) {
    if (!f.endsWith(".ts") || f === "subject-skills.ts") continue;
    assert.doesNotMatch(readFileSync(new URL(`${dir}/${f}`, import.meta.url), "utf8"), /subject-skills|lesson-type-skills/, `${dir}/${f}`);
  }
});

test("v2 (valós korpuszon mérve): ékezet nélküli magyar tétel nem minta (idegen nyelvű bankban igen); a témakör kis-/nagybetűtől független", async () => {
  const { unaccentedHungarian } = await import("../server/catalog/subject-skill-builder");
  assert.equal(unaccentedHungarian("matematika", "Hany kulonbozo jelet hasznal a romai szamiras?"), true);
  assert.equal(unaccentedHungarian("matematika", "Hány különböző jelet használ?"), false);
  assert.equal(unaccentedHungarian("matematika", "270 + 30 = ?"), false, "rövid / számos tétel nem érintett");
  assert.equal(unaccentedHungarian("angol", "What is the capital city of England"), false);
  const rows = [...many(SPARSE_LIMIT, { prompt: "Hany kulonbozo jelet hasznal a romai szamiras?" }).map((r, i) => ({ ...r, fingerprint: `u${i}` })),
    row({ fingerprint: "zz", prompt: "Hány különböző jelet használ a római számírás?" }), row({ fingerprint: "k1", topicArea: "hőtan" })];
  const text = buildSubjectSkill("fizika", rows, [], "d").text;
  assert.doesNotMatch(text, /Hany kulonbozo/);
  assert.match(text, /Hány különböző jelet/);
  assert.equal((text.match(/7\. évf\.: [Hh]őtan/g) ?? []).length, 1, "„Hőtan” és „hőtan” egy témakör");
});

test("review #193 (8): minden hivatalos tantárgynév (SUBJECT_LABELS) a saját bank-kulcsára képeződik", () => {
  for (const s of CATALOG_SUBJECTS) assert.equal(subjectKeyOf(SUBJECT_LABELS[s]), s, SUBJECT_LABELS[s]);
});

test("review #193 (3): a leckeszám és a témakör-térkép csak az egyező besorolású leckékből (agreedProvenances)", () => {
  const rows = many(40, { provenances: ["lesson:agreed", "lesson:review"] });
  const all = buildSubjectSkill("fizika", rows, [], "d");
  assert.equal(all.lessons, 2, "halmaz nélkül minden provenance számít (visszafelé kompatibilis)");
  const s = buildSubjectSkill("fizika", rows, [], "d", new Set(["lesson:agreed"]));
  assert.equal(s.lessons, 1);
  assert.match(s.text, /7\. évf\.: Hőtan — 40 tétel, 1 lecke/);
  assert.match(s.text, /leckék: 1 \|/);
});

test("review #193 (2): a lektor-minta maszkolja az e-mailt és a névszerű szópárt is (egyszerű maszk, nem anonimizálás)", () => {
  assert.equal(trapExample("Kiss Péter ezt írta: pelda@iskola.hu — 3 hiba"), "[név] ezt írta: …@… — # hiba");
  assert.doesNotMatch(trapExample("Nagy Anna Mária és anna@x.hu"), /Anna|Nagy|@x/);
});

test("review #193 (9): a kizárás-listán lévő tétel nem lehet minta, de a bank-számokban marad; a lista indokolt és létező lenyomatú", async () => {
  const { SAMPLE_EXCLUSIONS } = await import("../server/catalog/sample-exclusions");
  const bad = Object.keys(SAMPLE_EXCLUSIONS)[0];
  const rows = [...many(40), row({ fingerprint: bad, prompt: "KIZÁRT MINTA" })];
  const s = buildSubjectSkill("fizika", rows, [], "d");
  assert.doesNotMatch(s.text, /KIZÁRT MINTA/);
  assert.equal(s.activeItems, 41);
  for (const [fp, e] of Object.entries(SAMPLE_EXCLUSIONS)) { assert.match(fp, /^[0-9a-f]{16}$/); assert.ok(e.reason.length > 10 && e.provenance.length > 5); }
  assert.doesNotMatch(readFileSync(new URL("../shared/subject-skills/magyar-nyelvtan.md", import.meta.url), "utf8"), /jegy-gyel/);
});
