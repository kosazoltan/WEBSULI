import { test } from "node:test";
import assert from "node:assert/strict";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";
import { pickLessonArt, resolveStoredArt, type DesignAsset } from "../shared/design-assets";
import { isLessonCoverId, lessonCoverId } from "../shared/lesson-cover";
import { computeLessonArt } from "../shared/lesson-art-compute";

// docs/specs/2026-11-03-leckeborito.md — leckénkénti, tartalomkulcsú, kézzel tervezett borító a katalógusban.

const lesson = { subject: "Történelem", classroom: 6, title: "Hunyadi János, a kormányzó" };
const coverId = lessonCoverId(lesson, "studio");
const own: DesignAsset = {
  id: coverId, kind: "cover", band: "studio", subjects: ["Történelem"], keywords: [lesson.title], alt: "Középkori vár a Duna felett hajnalban.",
  src: `/design/studio/${coverId}.webp`, origin: "MI-generált, saját (Seedream 5.0 Pro)", model: "bytedance-seed/seedream-5-0-pro",
  promptHash: "0123456789abcdef", approvedAt: "2026-11-03T00:00:00.000Z",
};
/** A katalógus a leckeborítók nélkül (a választási szabály izolált vizsgálatához), és egy kézi leckeborítóval. */
const base = DESIGN_ASSET_CATALOG.filter(a => !isLessonCoverId(a.id));
const catalog = [...base, own];
const ids = (list: readonly DesignAsset[]) => new Set(list.map(a => a.id));

test("a tartalomkulcs ékezet-, írásjel- és kis-nagybetű-tűrő; más cím vagy sáv más kulcs", () => {
  const a = lessonCoverId({ subject: "Magyar irodalom", title: "Arany János: Családi kör" }, "adventure");
  assert.match(a, /^cover-l-[a-f0-9]{16}$/);
  assert.ok(isLessonCoverId(a));
  assert.equal(lessonCoverId({ subject: "magyar  IRODALOM", title: "arany janos – csaladi kor!" }, "adventure"), a);
  assert.notEqual(lessonCoverId({ subject: "Magyar irodalom", title: "Arany János: Toldi" }, "adventure"), a, "más cím");
  assert.notEqual(lessonCoverId({ subject: "Magyar irodalom", title: "Arany János: Családi kör" }, "studio"), a, "más sáv");
  assert.equal(isLessonCoverId("cover-gorog-drama"), false);
});

test("a katalógusban lévő tartalomkulcsú borító nyer a sávhős előtt; más lecke nem kapja", () => {
  assert.equal(pickLessonArt(lesson, "studio", base).hero?.kind, "hero", "nélküle sávhős");
  const art = pickLessonArt(lesson, "studio", catalog);
  assert.equal(art.cover?.id, coverId);
  assert.equal(art.hero, undefined);
  assert.notEqual(pickLessonArt({ subject: "Történelem", title: "Mátyás király" }, "studio", catalog).cover?.id, coverId, "más cím");
  assert.notEqual(pickLessonArt(lesson, "laboratory", catalog).cover?.id, coverId, "más sáv");
  assert.equal(computeLessonArt(lesson, "l1", ids(catalog), catalog)?.picture, coverId, "mentéskor is");
});

test("a kézi leckeborító mentéskor megmarad (átnevezés után is), más sávban nem", () => {
  const renamed = { ...lesson, title: "Hunyadi János kormányzósága" };
  assert.notEqual(computeLessonArt(renamed, "l1", ids(catalog), catalog)?.picture, coverId, "pin nélkül újraválasztás");
  assert.equal(computeLessonArt(renamed, "l1", ids(catalog), catalog, coverId)?.picture, coverId, "pin");
  assert.notEqual(computeLessonArt({ ...lesson, classroom: 9 }, "l1", ids(catalog), catalog, coverId)?.picture, coverId, "más sáv");
  assert.notEqual(computeLessonArt(renamed, "l1", ids(base), catalog, coverId)?.picture, coverId, "nincs a táblában");
  assert.notEqual(computeLessonArt(renamed, "l1", ids(catalog), catalog, "hero-studio")?.picture, "cover-l-0000000000000000", "nem leckeborító pin nem köt");
});

test("a lejátszó a tárolt leckeborítót mutatja (átnevezés után is), más sávban nem", () => {
  assert.equal(resolveStoredArt({ picture: coverId }, "studio", catalog, lesson)?.cover?.id, coverId);
  assert.equal(resolveStoredArt({ picture: coverId }, "studio", catalog, { ...lesson, title: "Mátyás király" })?.cover?.id, coverId);
  assert.equal(resolveStoredArt({ picture: coverId }, "laboratory", catalog, lesson), null);
});

test("a kurált görög dráma borító (Antigoné) marad; a leckeborító nem kerül a kulcsszavas készletbe", () => {
  const antigone = { subject: "Magyar nyelv és irodalom", classroom: 9, title: "Szophoklész: Antigoné" };
  assert.equal(computeLessonArt(antigone, "a", ids(catalog), catalog)?.picture, "cover-gorog-drama");
  const keywordTwin: DesignAsset = { ...own, id: lessonCoverId({ subject: "Történelem", title: "x" }, "studio"), keywords: ["Mátyás"] };
  assert.notEqual(pickLessonArt({ subject: "Történelem", title: "Mátyás király" }, "studio", [...catalog, keywordTwin]).cover?.id, keywordTwin.id);
});

test("a generátor 1K-s kérése fél áron megy, és csak 1K / 2K fogadható el", async () => {
  const { buildImageRequest, estimateUsd, parseResolution } = await import("../scripts/design-assets/lib");
  const style = { common: "c", band: { studio: "b" }, kind: { cover: "k" } };
  const item = { id: coverId, kind: "cover" as const, band: "studio" as const, subjects: [], keywords: [], alt: "alt szöveg", aspect_ratio: "3:2", prompt: "p" };
  assert.equal(buildImageRequest("m", item, style, [], parseResolution("1K")).resolution, "1K");
  assert.equal(buildImageRequest("m", item, style, []).resolution, "2K");
  assert.equal(parseResolution(undefined), "2K");
  assert.throws(() => parseResolution("4K"));
  assert.equal(estimateUsd(210, 0, "1K").toFixed(2), "9.45");
});

test("withLessonArt: a valódi katalógusból a Hunyadi-lecke a saját borítóját kapja, és az átnevezés után is megtartja", async () => {
  const { withLessonArt } = await import("../server/design-assets");
  const real = DESIGN_ASSET_CATALOG.find(a => a.id === coverId);
  assert.ok(real, "a Hunyadi-lecke borítója a katalógusban");
  const executor = { select: () => ({ from: async () => DESIGN_ASSET_CATALOG.map(a => ({ id: a.id })) }) } as never;
  const fresh = await withLessonArt({ ...lesson, art: { picture: "hero-studio" } }, "l1", executor) as { art?: { picture?: string } };
  assert.equal(fresh.art?.picture, coverId, "mentéskor a tartalomkulcsú borító");
  const renamed = await withLessonArt({ ...lesson, title: "Hunyadi János kormányzósága", art: { picture: coverId } }, "l1", executor) as { art?: { picture?: string } };
  assert.equal(renamed.art?.picture, coverId, "a kézi kép az újraválasztás után is marad");
});
