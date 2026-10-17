import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { CATALOG_SUBJECTS } from "../shared/catalog-taxonomy";
import { pickLessonArt, type DesignAsset } from "../shared/design-assets";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";
import { allSubjectIconIds, SUBJECT_BANDS, subjectIconId } from "../shared/subject-icons";

// Websuli tantárgyi ikonkészlet (docs/specs/2026-10-17-websuli-ikonkeszlet.md).
const manifest = JSON.parse(readFileSync(new URL("../design-assets/prompts.json", import.meta.url), "utf8")) as { items: Array<{ id: string; band: string; subjects: string[] }> };

test("az ikon azonosítója a tantárgykulcsból és az évfolyam sávjából áll; a 0. évfolyam a 6–8. sáv", () => {
  assert.equal(subjectIconId("Matematika", 1), "icon-matematika-explorer");
  assert.equal(subjectIconId("Matematika", 4), "icon-matematika-adventure");
  assert.equal(subjectIconId("Természettudomány", 7), "icon-termeszetismeret-studio");
  assert.equal(subjectIconId("Fizika", 10), "icon-fizika-laboratory");
  assert.equal(subjectIconId("Történelem", 12), "icon-tortenelem-future");
  assert.equal(subjectIconId("Digitális kultúra", 0), "icon-informatika-studio");
});

test("ismeretlen tantárgy vagy a sávban nem tanított tantárgy: nincs ikon", () => {
  assert.equal(subjectIconId("Asztrológia", 5), null);
  assert.equal(subjectIconId("", 5), null);
  assert.equal(subjectIconId(undefined, 5), null);
  assert.equal(subjectIconId("Fizika", 2), null, "fizika az 1–2. sávban nem tanított");
  assert.equal(subjectIconId("Környezetismeret", 9), null);
  // Review #274: az örökölt objektumtulajdonság nem tantárgy, és nem dob kivételt.
  for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty"]) assert.equal(subjectIconId(name, 7), null, name);
});

test("a mátrix minden tantárgyat lefed, és minden párjához van gyártási tétel a promptkészletben", () => {
  assert.deepEqual(Object.keys(SUBJECT_BANDS).sort(), [...CATALOG_SUBJECTS].sort());
  const ids = allSubjectIconIds();
  assert.equal(ids.length, 72);
  for (const id of ids) {
    const item = manifest.items.find(i => i.id === id);
    assert.ok(item, `gyártási tétel: ${id}`);
    assert.ok(id.endsWith(`-${item.band}`), `${id}: a sáv egyezik`);
  }
});

test("a lejátszó a sáv saját ikonját választja; ha az még nincs a katalógusban, a korosztályos régi ikont", () => {
  const own: DesignAsset = { ...DESIGN_ASSET_CATALOG.find(a => a.kind === "icon")!, id: "icon-matematika-studio", band: "studio", subjects: ["matematika"], src: "/design/studio/icon-matematika-studio.webp" };
  const young: DesignAsset = { ...own, id: "icon-matematika-explorer", band: "explorer", src: "/design/explorer/icon-matematika-explorer.webp" };
  const catalog = [...DESIGN_ASSET_CATALOG.filter(a => !a.id.startsWith("icon-matematika-") || !/-(explorer|adventure|studio|laboratory|future)$/.test(a.id)), own, young];
  assert.equal(pickLessonArt({ subject: "Matematika", title: "Törtek" }, "studio", catalog).subjectIcon?.id, "icon-matematika-studio");
  assert.equal(pickLessonArt({ subject: "Matematika", title: "Számolás" }, "explorer", catalog).subjectIcon?.id, "icon-matematika-explorer");
  // A 3–5. sáv saját ikonja itt hiányzik: a korosztályos régi ikon jön, nem egy másik sáv band-ikonja.
  const fallback = pickLessonArt({ subject: "Matematika", title: "Szorzás" }, "adventure", catalog).subjectIcon;
  assert.ok(fallback && !/-(explorer|adventure|studio|laboratory|future)$/.test(fallback.id), `régi ikon: ${fallback?.id}`);
});

test("a mátrix minden párjához van jóváhagyott katalógusikon, a saját sávjában, létező fájllal", () => {
  for (const id of allSubjectIconIds()) {
    const asset = DESIGN_ASSET_CATALOG.find(a => a.id === id);
    assert.ok(asset, `jóváhagyott ikon: ${id}`);
    assert.equal(asset.kind, "icon");
    assert.ok(id.endsWith(`-${asset.band}`), `${id}: sáv`);
    assert.ok(existsSync(new URL(`../client/public${asset.src}`, import.meta.url)), `${id}: fájl`);
  }
});
