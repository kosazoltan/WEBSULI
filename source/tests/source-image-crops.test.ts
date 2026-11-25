import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { sanitizeSourceVisuals, SOURCE_VISUALS_CONTRACT, type SourceVisual } from "../shared/source-visuals";
import { lessonSchema, type Lesson } from "../shared/lesson-schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { placeSourceImages, sourceImagesEnabled, dropUnknownSourceImages, SOURCE_IMAGES_PER_LESSON } from "../server/studio/source-image-crops";
import { sourceVisualsBlock } from "../server/studio/step-io";
import { sourceCoverageGate } from "../server/studio/gates/source-coverage-gate";

/** D1H-2 (docs/specs/2026-11-25-d1h-kivagott-kep-vegrehajtas.md): fénykép / nehezen rajzolható ábra kivágása képforrásból. */

const lesson = () => structuredClone(fusionFixture()) as Lesson;
const covers = (b: unknown): string[] => (b as { coversConceptIds?: string[] }).coversConceptIds ?? [];
const conceptOf = (l: Lesson, section: number) => covers(l.sections[section].blocks.find((b) => covers(b).length))[0];
async function twoColor(): Promise<string> {
  // 200×100: bal fele piros, jobb fele kék — a kivágás helye a színből ellenőrizhető.
  const left = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 220, g: 20, b: 20 } } }).png().toBuffer();
  const img = await sharp({ create: { width: 200, height: 100, channels: 3, background: { r: 20, g: 20, b: 220 } } }).composite([{ input: left, left: 0, top: 0 }]).png().toBuffer();
  return `data:image/png;base64,${img.toString("base64")}`;
}
const photo = (id: string, sourceFile: string, conceptIds: string[], crop?: unknown): SourceVisual =>
  ({ id, kind: "photo", sourceFile, page: 1, role: "A vulkán felépítése a fényképen", conceptIds, data: { depicts: "Rétegvulkán kitörés közben" }, ...(crop ? { crop } : {}) }) as SourceVisual;

test("leltár: a photo fajta és a crop keret; hibás keret elmarad, a tétel marad; a szerződés kimondja", () => {
  const ctx = { fileNames: ["kep.png"], conceptIds: new Set(["c1"]) };
  const ok = sanitizeSourceVisuals([{ id: "v1", kind: "photo", sourceFile: "kep.png", page: 1, role: "Vulkán", conceptIds: ["c1"], data: { depicts: "Vulkán" }, crop: { x: 0.5, y: 0, w: 0.5, h: 1 } }], ctx);
  assert.equal(ok.visuals.length, 1);
  assert.deepEqual((ok.visuals[0] as { crop?: unknown }).crop, { x: 0.5, y: 0, w: 0.5, h: 1 });
  const bad = sanitizeSourceVisuals([{ id: "v1", kind: "photo", sourceFile: "kep.png", page: 1, role: "Vulkán", data: { depicts: "Vulkán" }, crop: { x: 0.9, y: 0, w: 0.5, h: 1 } }], ctx);
  assert.equal(bad.visuals.length, 1);
  assert.equal((bad.visuals[0] as { crop?: unknown }).crop, undefined);
  assert.match(SOURCE_VISUALS_CONTRACT, /"photo"/);
  assert.match(SOURCE_VISUALS_CONTRACT, /"crop"/);
});

test("a rajzoló promptok leltára a photo tételt nem kapja (a program illeszti be), a keretet sem", () => {
  const diagram = { id: "v2", kind: "diagram", sourceFile: "a.png", page: 1, role: "Ábra", conceptIds: [], data: { description: "Ábra", parts: [] }, crop: { x: 0, y: 0, w: 1, h: 1 } } as SourceVisual;
  const text = sourceVisualsBlock({ visuals: [photo("v1", "a.png", []), diagram] }, "author").join("\n");
  assert.doesNotMatch(text, /"v1"/);
  assert.match(text, /"v2"/);
  assert.doesNotMatch(text, /"crop"/);
});

test("placeSourceImages: kivágás a keret szerint, tárolás, sourceImage a fogalmat tanító fejezetben, forrásmegjelöléssel", async () => {
  const l = lesson();
  const concept = conceptOf(l, l.sections.length - 1);
  const stored: Array<{ bytes: Buffer; meta: Record<string, unknown> }> = [];
  const store = async (bytes: Buffer, meta: Record<string, unknown>) => { stored.push({ bytes, meta }); return String(stored.length).padStart(64, "a"); };
  const files = [
    { name: "01-nkp.txt-kep-1.png", kind: "image" as const, content: await twoColor() },
    { name: "01-nkp.txt-forras.txt", kind: "text" as const, content: "Forrás: https://www.nkp.hu/foldrajz?id=42\nCím: Földrajz 7. — Vulkánok\n\n…" },
    { name: "feltoltott.png", kind: "image" as const, content: await twoColor() },
  ];
  const visuals = [photo("v1", "01-nkp.txt-kep-1.png", [concept], { x: 0.5, y: 0, w: 0.5, h: 1 }), photo("v2", "feltoltott.png", [concept], { x: 0, y: 0, w: 0.5, h: 1 }), photo("v3", "feltoltott.png", [concept])];
  const { lesson: out, placed, skipped } = await placeSourceImages(l, visuals, files, { store });
  assert.deepEqual(placed, ["v1", "v2"]);
  assert.deepEqual(skipped.map((s) => s.id), ["v3"], "keret nélkül kimarad");
  const meta = await sharp(stored[0].bytes).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, 100);
  const { dominant } = await sharp(stored[0].bytes).stats();
  assert.ok(dominant.b > 150 && dominant.r < 80, "a jobb (kék) fél került kivágásra");
  assert.equal(stored[0].meta.sourceUrl, "https://www.nkp.hu/foldrajz?id=42");
  assert.match(String(stored[0].meta.credit), /Földrajz 7\. — Vulkánok/);
  assert.match(String(stored[1].meta.credit), /Feltöltött forrás: feltoltott\.png/);
  const blocks = out.sections.flatMap((s, i) => s.blocks.map((b) => ({ ...b, section: i }))).filter((b) => b.kind === "animate" && b.animKind === "sourceImage");
  assert.equal(blocks.length, 2);
  assert.ok(blocks.every((b) => b.section === l.sections.length - 1 && covers(b).includes(concept)));
  assert.deepEqual(blocks.map((b) => (b as { sourceVisualId?: string }).sourceVisualId), ["v1", "v2"]);
  assert.equal((blocks[0] as { params: { sourceUrl?: string } }).params.sourceUrl, "https://www.nkp.hu/foldrajz?id=42");
  assert.equal(lessonSchema.safeParse(out).success, true);
});

test("placeSourceImages: PDF-forrás (D1H-3), a már megrajzolt ábra és a keret fölötti darab kimarad; tárhiba nem töri a futást", async () => {
  const l = lesson();
  const concept = conceptOf(l, 0);
  (l.sections[0].blocks[0] as { sourceVisualId?: string }).sourceVisualId = "d1";
  const img = await twoColor();
  const files = [{ name: "a.png", kind: "image" as const, content: img }, { name: "b.pdf", kind: "pdf" as const, content: "data:application/pdf;base64,JVBERi0=" }];
  const crop = { x: 0, y: 0, w: 1, h: 1 };
  const diagram = { id: "d1", kind: "diagram", sourceFile: "a.png", page: 1, role: "Ábra", conceptIds: [concept], data: { description: "Ábra", parts: [] }, crop } as SourceVisual;
  const many = Array.from({ length: SOURCE_IMAGES_PER_LESSON + 2 }, (_, i) => photo(`p${i}`, "a.png", [concept], crop));
  let calls = 0;
  const store = async () => { calls++; if (calls === 1) throw new Error("tár hiba"); return "b".repeat(64); };
  const res = await placeSourceImages(l, [diagram, photo("pdf1", "b.pdf", [concept], crop), ...many], files, { store });
  assert.ok(!res.placed.includes("d1"), "a megrajzolt ábra nem kap képet");
  assert.ok(res.skipped.some((s) => s.id === "pdf1"));
  // Az első tárhiba (p0) kimarad, utána legfeljebb SOURCE_IMAGES_PER_LESSON kép kerül be.
  assert.equal(res.placed.length, SOURCE_IMAGES_PER_LESSON);
  assert.ok(res.skipped.some((s) => /legfeljebb/.test(s.reason)));
  assert.ok(res.skipped.some((s) => s.id === "p0" && /tár/.test(s.reason)));
});

test("dropUnknownSourceImages: a tárban nem létező azonosítójú sourceImage blokk eldobva, a többi marad", async () => {
  const l = lesson();
  const concept = conceptOf(l, 0);
  const img = (id: string) => ({ kind: "animate", animKind: "sourceImage", caption: "Kép.", coversConceptIds: [concept], params: { imageId: id, alt: "Kép", credit: "Forrás" } });
  l.sections[0].blocks.push(img("a".repeat(64)) as never, img("f".repeat(64)) as never);
  const before = l.sections[0].blocks.length;
  const out = await dropUnknownSourceImages(l, async (ids) => new Set(ids.filter((i) => i.startsWith("a"))));
  assert.equal(out.sections[0].blocks.length, before - 1);
  assert.ok(out.sections[0].blocks.some((b) => b.kind === "animate" && (b.params as { imageId?: string }).imageId === "a".repeat(64)));
  const untouched = lesson();
  assert.equal(await dropUnknownSourceImages(untouched, async () => { throw new Error("nem kellene hívni"); }), untouched, "kép nélkül nincs lekérdezés");
});

test("forrásfedettség: a photo és a diagram tétel a sourceImage blokkal megjelent", () => {
  const l = lesson();
  const concept = conceptOf(l, 0);
  for (const id of ["v1", "d1"]) l.sections[0].blocks.push({ kind: "animate", animKind: "sourceImage", caption: "Kép.", coversConceptIds: [concept], sourceVisualId: id, params: { imageId: "a".repeat(64), alt: "Kép", credit: "Forrás" } } as never);
  const diagram = { id: "d1", kind: "diagram", sourceFile: "a.png", page: 1, role: "Ábra", conceptIds: [concept], data: { description: "Ábra", parts: [{ label: "kráter", meaning: "a csúcs mélyedése" }] } } as SourceVisual;
  const result = sourceCoverageGate(l as never, [photo("v1", "a.png", [concept]), diagram]);
  assert.deepEqual(result.items.map((i) => [i.id, i.state]), [["v1", "shown"], ["d1", "shown"]]);
});

test("kapcsoló: STUDIO_SOURCE_IMAGES csak pontos on-ra BE", () => {
  assert.equal(sourceImagesEnabled({ STUDIO_SOURCE_IMAGES: "on" } as NodeJS.ProcessEnv), true);
  for (const v of [undefined, "", "off", "1", "true", "ON"]) assert.equal(sourceImagesEnabled({ STUDIO_SOURCE_IMAGES: v } as NodeJS.ProcessEnv), false, String(v));
});
