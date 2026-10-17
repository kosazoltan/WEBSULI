import { test } from "node:test";
import assert from "node:assert/strict";
import { lessonArtIds, pickLessonArt, resolveStoredArt } from "../shared/design-assets";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";
import { lessonSchema } from "../shared/lesson-schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

// Lecke megnyitása (docs/specs/2026-10-17-lecke-betoltes.md): a mentéskor rögzített arculat olvasása, újraszámolás nélkül.
const C = DESIGN_ASSET_CATALOG;

test("a mentett azonosítókból ugyanaz az arculat áll elő, mint a választáskor (oda-vissza)", () => {
  for (const [subject, band] of [["Matematika", "studio"], ["Környezetismeret", "explorer"], ["Történelem", "adventure"], ["Fizika", "future"]] as const) {
    const picked = pickLessonArt({ subject, title: "Próba", seed: "s1" }, band, C);
    const ids = lessonArtIds(picked);
    const back = resolveStoredArt(ids, band, C);
    assert.ok(back, `${subject}/${band}`);
    assert.deepEqual(lessonArtIds(back!), ids);
  }
});

test("a tárolt elem csak a lecke mostani sávjában érvényes; kabala csak 1–5.; ismeretlen kép → null (régi számolás)", () => {
  assert.equal(resolveStoredArt(undefined, "studio", C), null);
  assert.equal(resolveStoredArt({ subjectIcon: "icon-matematika-studio" }, "studio", C), null, "kép nélkül nincs tárolt arculat");
  assert.equal(resolveStoredArt({ picture: "nincs-ilyen-kep" }, "studio", C), null);
  assert.equal(resolveStoredArt({ picture: "hero-explorer" }, "studio", C), null, "fiatal kép idősebb sávban nem marad");
  const older = resolveStoredArt({ picture: "hero-studio", mascot: "mascot-hello", subjectIcon: "icon-matematika-explorer" }, "studio", C)!;
  assert.equal(older.hero?.id, "hero-studio");
  assert.equal(older.mascot, undefined, "6–12.: nincs kabala");
  assert.equal(older.subjectIcon, undefined, "más sáv ikonja nem marad");
  const young = resolveStoredArt({ picture: "hero-adventure", mascot: "mascot-hello", subjectIcon: "icon-matematika-adventure" }, "adventure", C)!;
  assert.equal(young.mascot?.id, "mascot-hello");
  assert.equal(young.subjectIcon?.id, "icon-matematika-adventure");
  assert.equal(resolveStoredArt({ picture: "icon-matematika-studio" }, "studio", C), null, "ikon nem lehet kép");
});

test("a leckeséma elfogadja a tárolt arculatot, és elutasítja az ismeretlen mezőt vagy a hibás azonosítót", () => {
  const base = fusionFixture();
  assert.ok(lessonSchema.safeParse({ ...base, art: { subjectIcon: "icon-matematika-studio", picture: "hero-studio", mascot: "mascot-hello" } }).success);
  assert.equal(lessonSchema.safeParse({ ...base, art: { picture: "../x" } }).success, false);
  assert.equal(lessonSchema.safeParse({ ...base, art: { src: "https://evil.example/x.png" } }).success, false);
});
