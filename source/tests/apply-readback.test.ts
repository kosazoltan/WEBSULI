import { test } from "node:test";
import assert from "node:assert/strict";
import { appliedLessonMatches } from "../server/workflows/apply";
import { repairHash } from "../server/studio/structured-improvement";

// Spec 2026-11-03-apply-visszaolvasas: a mentés újraválasztja az arculatot, a visszaolvasás a tranzakció hash-ét igazolja.
const candidate = { title: "Szophoklész: Antigoné", subject: "Magyar nyelv és irodalom", classroom: 9, sections: [{ heading: "A mű", blocks: [] }], art: { picture: "hero-laboratory", subjectIcon: "icon-magyar" } };
const saved = { ...candidate, art: { picture: "cover-gorog-drama", subjectIcon: "icon-magyar" } };
const applyBackup = { improvedFileId: "fix-1", backupData: { expectedCurrentHash: repairHash(saved) } };

test("eltérő arculat, egyező tranzakció-hash → az alkalmazás igazolt", () => {
  assert.equal(appliedLessonMatches(saved, candidate, [applyBackup], "fix-1"), true);
});

test("az arculaton kívüli tartalmi eltérés → nem igazolt", () => {
  const edited = { ...saved, title: "Más cím" };
  assert.equal(appliedLessonMatches(edited, candidate, [{ improvedFileId: "fix-1", backupData: { expectedCurrentHash: repairHash(edited) } }], "fix-1"), false);
});

test("a tranzakció hash-étől eltérő mentett lecke → nem igazolt", () => {
  assert.equal(appliedLessonMatches(candidate, candidate, [applyBackup], "fix-1"), false);
});

test("nincs a javításhoz tartozó mentés vagy hiányzik a hash → nem igazolt", () => {
  assert.equal(appliedLessonMatches(saved, candidate, [], "fix-1"), false);
  assert.equal(appliedLessonMatches(saved, candidate, [{ ...applyBackup, improvedFileId: "fix-2" }], "fix-1"), false);
  assert.equal(appliedLessonMatches(saved, candidate, [{ improvedFileId: "fix-1", backupData: { content: "régi" } }], "fix-1"), false);
  assert.equal(appliedLessonMatches(saved, candidate, [{ improvedFileId: "fix-1", backupData: null }], "fix-1"), false);
});

test("több mentés (csökkenő időrend): a legkorábbi, alkalmazáskori számít, nem a későbbi visszaállításé", () => {
  const restoreBackup = { improvedFileId: "fix-1", backupData: { expectedCurrentHash: repairHash({ ...candidate, title: "Visszaállított" }) } };
  assert.equal(appliedLessonMatches(saved, candidate, [restoreBackup, applyBackup], "fix-1"), true);
  assert.equal(appliedLessonMatches(saved, candidate, [applyBackup, restoreBackup], "fix-1"), false);
});
