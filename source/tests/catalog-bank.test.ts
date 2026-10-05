import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { placeLesson, summarize, toBankRows, trustOf, UNSORTED_SUBJECT, type LessonClassification } from "../server/catalog/bank-rows";
import type { CatalogItemDraft } from "../server/catalog/catalog-item";
import type { Classification } from "../server/catalog/classify";

/* Spec 2026-10-05-s3-katalogus-bank — öröklött tantárgy, státusz-szabály, bizalmi szint, lenyomat-összevonás, tárolás. */

const cls = (subject: string, extra: Partial<Classification> = {}): Classification => ({ subject, secondarySubjects: [], grade: 5, topicArea: "Tört", topic: "Törtek összeadása", lessonType: "gyakorlo-feladatlap", confidence: "high", evidence: "e", ...extra }) as Classification;
const quiz = (provenance: string, fingerprint: string, d: Partial<CatalogItemDraft> = {}): CatalogItemDraft & { classroom: number | null } =>
  ({ kind: "quiz", provenance, prompt: "Mennyi 2 + 3?", options: ["4", "5", "6"], correctIndex: 1, fingerprint, classroom: null, ...d });

const agreed = (provenance: string, subject: string, extra: Partial<Classification> = {}): LessonClassification => ({ provenance, status: "agreed", classification: cls(subject, extra) });

test("a tétel a lecke tantárgyát örökli; minden tantárgy és ág külön bank (nincs közös természettudományi bank)", () => {
  const rows = toBankRows([quiz("legacy_html:a", "f1"), quiz("legacy_html:b", "f2"), quiz("legacy_html:c", "f3")],
    [agreed("legacy_html:a", "fizika"), agreed("legacy_html:b", "kemia"), agreed("legacy_html:c", "biologia")]);
  assert.deepEqual(rows.map((r) => r.subject).sort(), ["biologia", "fizika", "kemia"]);
  assert.ok(rows.every((r) => r.status === "active" && r.trust === "parent_verified"));
});

test("státusz-szabály: egyező → aktív, gépi lelet → jelölt, eltérő besorolás → átnézendő, besorolatlan → nem bank", () => {
  const items = [quiz("legacy_html:a", "ok"), quiz("legacy_html:a", "bad", { options: ["4", "5", "5"] }), quiz("legacy_html:r", "rv"), quiz("legacy_html:u", "un"), quiz("legacy_html:a", "nokey", { kind: "quiz_unkeyed", correctIndex: undefined })];
  const rows = toBankRows(items, [agreed("legacy_html:a", "matematika"),
    { provenance: "legacy_html:r", status: "review", candidates: [{ model: "m1", classification: cls("tortenelem") }, { model: "m2", classification: cls("termeszetismeret") }], reason: "eltérő" }]);
  const by = Object.fromEntries(rows.map((r) => [r.fingerprint, r]));
  assert.equal(by.ok.status, "active");
  assert.equal(by.bad.status, "flagged");
  assert.match(by.bad.checks.join(), /ismétlődő/);
  assert.equal(by.nokey.status, "flagged", "kulcs nélküli kvíz szó szerint nem vehető át");
  assert.ok(by.rv.status === "review" && by.rv.subject === "tortenelem");
  assert.ok(by.un.status === "review" && by.un.subject === UNSORTED_SUBJECT, "hiányzó besorolás → besorolatlan sor");
});

test("admin-döntés felülírja a besorolást, és egyezőként kezeli", () => {
  const rows = toBankRows([quiz("legacy_html:r", "f")], [{ provenance: "legacy_html:r", status: "review", candidates: [{ model: "m", classification: cls("tortenelem") }], reason: "x" }], new Map([["legacy_html:r", "termeszetismeret"]]));
  assert.ok(rows[0].subject === "termeszetismeret" && rows[0].status === "active");
});

test("összevonás: ugyanaz a tétel több leckében egy sor, minden forrással; a szülő-ellenőrzött bizalom és témája nyer; a legkisebb évfolyam", () => {
  const rows = toBankRows([quiz("lesson:fus", "same", { classroom: 6 }), quiz("legacy_html:old", "same", { classroom: 4 })],
    [agreed("lesson:fus", "matematika", { topic: "Gépi téma" }), agreed("legacy_html:old", "matematika", { topic: "Szülői téma" })]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].provenances, ["legacy_html:old", "lesson:fus"]);
  assert.equal(rows[0].trust, "parent_verified");
  assert.equal(rows[0].topic, "Szülői téma");
  assert.equal(rows[0].grade, 4);
  assert.equal(trustOf("lesson:x"), "pipeline_verified");
  assert.equal(toBankRows([quiz("legacy_html:a", "x"), quiz("legacy_html:b", "x")], [agreed("legacy_html:a", "fizika"), agreed("legacy_html:b", "kemia")]).length, 2, "más bankban külön sor");
});

test("évfolyam: a lecke saját mezője elsőbb; összesítés bankonként", () => {
  assert.equal(placeLesson(agreed("p", "fizika", { grade: 7 }), 8).grade, 8);
  assert.equal(placeLesson(agreed("p", "fizika", { grade: 7 }), 0).grade, 7);
  const s = summarize(toBankRows([quiz("legacy_html:a", "1"), quiz("legacy_html:a", "2", { options: ["1", "1"] })], [agreed("legacy_html:a", "fizika")]));
  assert.deepEqual(s.fizika, { total: 2, active: 1, flagged: 1, review: 0 });
});

test("migráció: additív és idempotens; egyediség (subject, fingerprint); a státusz-értékek szűkítve", () => {
  const sql = readFileSync(new URL("../migrations/0022_subject_catalog.sql", import.meta.url), "utf8");
  for (const stmt of sql.split("--> statement-breakpoint").map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean)) assert.match(stmt, /^CREATE (?:UNIQUE )?(?:TABLE|INDEX) IF NOT EXISTS/, stmt.slice(0, 60));
  assert.match(sql, /UNIQUE INDEX IF NOT EXISTS catalog_items_subject_fingerprint_idx ON catalog_items \(subject, fingerprint\)/);
  assert.match(sql, /status IN \('active','flagged','review','rejected'\)/);
  assert.doesNotMatch(sql, /^\s*(?:DROP|ALTER|DELETE|TRUNCATE)\b/im, "nincs romboló utasítás (az ON DELETE SET NULL hivatkozási szabály nem az)");
});

test("admin-API: csak olvasó, admin-hitelesítés mögött, bekötve", () => {
  const src = readFileSync(new URL("../server/catalog/admin-routes.ts", import.meta.url), "utf8");
  assert.match(src, /catalogAdminRouter\.use\(isAuthenticatedAdmin\)/);
  assert.doesNotMatch(src, /\.(?:post|put|patch|delete)\(/);
  assert.doesNotMatch(src, /db\.(?:insert|update|delete)\(/);
  assert.match(readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8"), /app\.use\("\/api\/admin\/catalog", catalogAdminRouter\)/);
});

test("import: alapból dry-run; írás csak teljes besorolással; az admin-státuszt nem írja felül, admin-érintett sort nem töröl", () => {
  const src = readFileSync(new URL("../scripts/catalog/import.mts", import.meta.url), "utf8");
  assert.match(src, /if \(!write\) process\.exit\(0\)/);
  assert.match(src, /missing\.length\) \{ console\.error/);
  assert.match(src, /CASE WHEN catalog_items\.status_by_admin THEN catalog_items\.status ELSE EXCLUDED\.status END/);
  assert.match(src, /DELETE FROM catalog_items c WHERE NOT c\.status_by_admin/);
});
