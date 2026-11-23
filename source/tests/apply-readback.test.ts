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

test("több mentés (alkalmazás + visszaállítás): sorrendtől függetlenül a tényleges állapot dönt", () => {
  const restored = { ...candidate, title: "Visszaállított" };
  const restoreBackup = { improvedFileId: "fix-1", backupData: { expectedCurrentHash: repairHash(restored) } };
  assert.equal(appliedLessonMatches(saved, candidate, [restoreBackup, applyBackup], "fix-1"), true);
  assert.equal(appliedLessonMatches(saved, candidate, [applyBackup, restoreBackup], "fix-1"), true);
  assert.equal(appliedLessonMatches(restored, candidate, [applyBackup, restoreBackup], "fix-1"), false, "visszaállított lecke nem számít alkalmazottnak");
});

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (11. szakasz 6. pont; V12): a változatossági jelölőt a mentés írja (mint az
// arculatot) — a visszaolvasás nem bukhat rajta, a tartalmi eltérés továbbra is bukik.
test("V12: eltérő változatossági jelölő, egyező tranzakció-hash → az alkalmazás igazolt", () => {
  const marked = { ...saved, variety: { version: "valtozatossag-2", openingForm: "eset" } };
  assert.equal(appliedLessonMatches(marked, candidate, [{ improvedFileId: "fix-1", backupData: { expectedCurrentHash: repairHash(marked) } }], "fix-1"), true);
  const markedEdited = { ...marked, title: "Más cím" };
  assert.equal(appliedLessonMatches(markedEdited, candidate, [{ improvedFileId: "fix-1", backupData: { expectedCurrentHash: repairHash(markedEdited) } }], "fix-1"), false);
});
