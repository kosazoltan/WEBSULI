import { test } from "node:test";
import assert from "node:assert/strict";
import { learnerHistoryFrom, pickDailyMaterial, pickSmartMaterial, reminderHtml, reminderSubject } from "../shared/daily-reminder";

// docs/specs/2026-10-18-tanuloi-profil.md (S5): ismétlés a gyenge eredményből, a még meg nem nyitott anyag elsőbbsége.
const files = [
  { id: "a", title: "Törtek 1", classroom: 5 },
  { id: "b", title: "Törtek 2", classroom: 5 },
  { id: "c", title: "Törtek 3", classroom: 5 },
  { id: "x", title: "Igék", classroom: 4 },
];
const NOW = new Date("2026-10-19T05:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

test("napló: látott anyagok; anyagonként a legutolsó eredmény számít; csak a 7–30 napos 70% alatti, a legrégebbi elöl", () => {
  const h = learnerHistoryFrom([
    { materialId: "a", kind: "result", percent: 50, createdAt: daysAgo(20) },
    { materialId: "a", kind: "result", percent: 90, createdAt: daysAgo(10) },
    { materialId: "b", kind: "result", percent: 60, createdAt: daysAgo(12) },
    { materialId: "c", kind: "result", percent: 40, createdAt: daysAgo(3) },
    { materialId: "x", kind: "result", percent: 30, createdAt: daysAgo(25) },
    { materialId: "y", kind: "view", percent: null, createdAt: daysAgo(1) },
    { materialId: null, kind: "view", percent: null, createdAt: daysAgo(1) },
  ], NOW);
  assert.deepEqual([...h.seenIds].sort(), ["a", "b", "c", "x", "y"]);
  assert.deepEqual(h.weak, [{ materialId: "x", percent: 30 }, { materialId: "b", percent: 60 }]);
});

test("választás: az ismétlés elsőbbsége; a nemrég kiküldött ismétlés kimarad", () => {
  const history = { seenIds: new Set(["a", "b"]), weak: [{ materialId: "b", percent: 60 }] };
  assert.deepEqual(pickSmartMaterial(files, 5, 0.5, new Set(), history), { file: files[1], repeatPercent: 60 });
  const r = pickSmartMaterial(files, 5, 0.5, new Set(["b"]), history);
  assert.equal(r?.repeatPercent, undefined);
  assert.equal(r?.file.id, "c", "a még meg nem nyitott anyag jön");
});

test("választás: minden látott → a régi viselkedés; tanuló nélkül változatlan", () => {
  const all = { seenIds: new Set(["a", "b", "c"]), weak: [] };
  assert.deepEqual(pickSmartMaterial(files, 5, 0.5, new Set(), all), { file: pickDailyMaterial(files, 5, 0.5, new Set())! });
  assert.deepEqual(pickSmartMaterial(files, 5, 0.5, new Set(["a"]), null), { file: pickDailyMaterial(files, 5, 0.5, new Set(["a"]))! });
  assert.equal(pickSmartMaterial(files, 9, 0.5, new Set(), null), null);
});

test("levél: ismétlésnél jelölt tárgy és címke; a cím escape-elve", () => {
  assert.equal(reminderSubject("Dominik", "Igék", true), "Dominik, ismételjük: Igék");
  assert.equal(reminderSubject("Dominik", "Igék"), "Dominik, a mai tananyagod: Igék");
  const html = reminderHtml({ first: "Dominik", title: "Igék <b>", url: "https://websuli.vip/preview/x", motivation: "Hajrá!", repeatPercent: 62.4 });
  assert.match(html, /ISMÉTLÉS — MÚLTKOR 62% LETT/);
  assert.ok(!html.includes("Igék <b>"));
  assert.match(reminderHtml({ first: "D", title: "T", url: "u", motivation: "m" }), /A MAI TANANYAGOD/);
});

test("review #305: más évfolyam gyenge eredménye nem kerül ismétlésre", () => {
  const history = { seenIds: new Set(["x"]), weak: [{ materialId: "x", percent: 30 }] };
  const r = pickSmartMaterial(files, 5, 0.5, new Set(), history);
  assert.equal(r?.repeatPercent, undefined);
  assert.equal(r?.file.classroom, 5);
});
