import { test } from "node:test";
import assert from "node:assert/strict";
import { coversByFile, shownPictureId } from "../shared/lesson-cover";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";
import { pickLessonArt, resolveStoredArt } from "../shared/design-assets";
import { designThemeForClassroom } from "../shared/lesson-design";

// Spec 2026-11-03-fooldal-boritokartyak (review #381): a főoldali kártya ugyanazt a kezdőképet mutatja, mint a lecke-lejátszó.
const antigone = { subject: "Magyar nyelv és irodalom", title: "Szophoklész: Antigoné", classroom: 9, art: { picture: "cover-gorog-drama", subjectIcon: "icon-magyar" } };

test("a tárolt, illeszkedő borító marad; a lejátszó által elvetett tárolt kép helyett a friss választás jön (mint lessonArtFor)", () => {
  assert.equal(shownPictureId(antigone, "lesson-1"), "cover-gorog-drama");
  const misfit = { ...antigone, art: { picture: "hero-explorer" } }; // fiatal sáv hőse 9. évfolyamon — a lejátszó elveti
  const band = designThemeForClassroom(9);
  assert.equal(resolveStoredArt(misfit.art, band, DESIGN_ASSET_CATALOG, misfit), null, "a lejátszó ezt a tárolt képet nem mutatja");
  const picked = pickLessonArt({ subject: misfit.subject, title: misfit.title, seed: "lesson-1" }, band, DESIGN_ASSET_CATALOG);
  assert.equal(shownPictureId(misfit, "lesson-1"), (picked.cover ?? picked.hero)!.id);
  assert.notEqual(shownPictureId(misfit, "lesson-1"), "hero-explorer");
  const legacy = { subject: antigone.subject, title: antigone.title, classroom: 9 };
  assert.ok(shownPictureId(legacy, "lesson-1"), "arculat nélküli régi lecke: a lejátszó választása");
  assert.equal(shownPictureId({ title: "x" }, "lesson-1"), null, "hiányos lecke: nincs kép (a kliens a sáv hős-képét mutatja)");
});

test("fájlonként a legújabb publikált lecke dönt, akkor is, ha nincs tárolt képe — régebbi lecke borítója nem kerül elé", () => {
  const newest = { subject: antigone.subject, title: antigone.title, classroom: 9 };
  const covers = coversByFile([
    { id: "new", htmlFileId: "f1", lesson: newest },
    { id: "old", htmlFileId: "f1", lesson: antigone },
    { id: "other", htmlFileId: "f2", lesson: antigone },
    { id: "orphan", htmlFileId: null, lesson: antigone },
  ]);
  assert.equal(covers.get("f1"), shownPictureId(newest, "new"));
  assert.equal(covers.get("f2"), "cover-gorog-drama");
  assert.equal(covers.size, 2);
});
