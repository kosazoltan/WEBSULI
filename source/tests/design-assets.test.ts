import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildImageRequest, composePrompt, estimateUsd, loadStyle, redact, type AssetManifest } from "../scripts/design-assets/lib";
import { designAssetSchema } from "../shared/design-assets";
import { DESIGN_ASSET_CATALOG } from "../shared/design-asset-catalog";

// Websuli képkészlet (docs/specs/2026-10-17-websuli-kepkeszlet.md).
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const manifest = JSON.parse(read("design-assets/prompts.json")) as AssetManifest;
const style = loadStyle(read("design-assets/style.md"));

test("a képkészlet modellje a tulajdonosi döntés szerinti Seedream 5.0 Pro", () => {
  assert.equal(manifest.model, "bytedance-seed/seedream-5-0-pro");
});

test("minden tételhez van közös, sáv- és típusstílus; a prompt tiltja a szöveget és a nemi sztereotípiát", () => {
  const ids = new Set<string>();
  for (const item of manifest.items) {
    assert.ok(!ids.has(item.id), `egyedi id: ${item.id}`); ids.add(item.id);
    const prompt = composePrompt(item, style);
    assert.match(prompt, /no text, letters, numbers/i);
    assert.match(prompt, /Gender-neutral/);
    assert.ok(item.alt.length >= 8, `${item.id}: alt szöveg`);
    for (const ref of item.references ?? []) assert.ok(manifest.items.some(i => i.id === ref), `${item.id}: létező referencia ${ref}`);
  }
});

test("a kérés a /api/v1/images szerinti alakú, a kulcs nincs benne; a kitakarás a kulcsot és a tokent is elrejti", () => {
  const item = manifest.items[0];
  const body = buildImageRequest(manifest.model, item, style, ["data:image/png;base64,AAAA"]);
  assert.deepEqual(Object.keys(body).sort(), ["aspect_ratio", "input_references", "model", "n", "prompt", "resolution"]);
  assert.equal(body.resolution, "2K");
  assert.deepEqual(body.input_references, [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }]);
  const key = "sk-or-v1-abcdef0123456789";
  assert.ok(!JSON.stringify(body).includes(key));
  assert.equal(redact(`hiba ${key} Bearer ${key}`, key).includes("abcdef"), false);
  assert.equal(redact("Authorization: Bearer xyz.123", ""), "Authorization: Bearer [kulcs]");
});

test("a becsült ár az OpenRouter 2026-10-17-i ára: 2K kép 0,09 USD, referencia 0,003 USD", () => {
  assert.equal(estimateUsd(12, 2).toFixed(3), "1.086");
});

test("a katalógus minden eleme séma szerinti, MI-generált saját kép, és a fájl létezik", () => {
  for (const raw of DESIGN_ASSET_CATALOG) {
    const asset = designAssetSchema.parse(raw);
    assert.ok(existsSync(new URL(`../client/public${asset.src}`, import.meta.url)), `${asset.id}: fájl`);
  }
});

// Websuli lecke-hős (docs/specs/2026-10-17-websuli-lecke-hos.md): a választás szabályai, rögzített mintakatalóguson.
test("pickLessonArt: kulcsszavas borító, sávhős, kabala csak 1–5., ékezettűrő tárgyikon (-young a fiataloknak)", async () => {
  const { pickLessonArt, foldText } = await import("../shared/design-assets");
  const a = (id: string, kind: "mascot" | "hero" | "icon" | "cover", band: "explorer" | "adventure" | "studio" | "laboratory" | "future", subjects: string[], keywords: string[]) =>
    ({ id, kind, band, subjects, keywords, alt: "Minta kép leírása", src: `/design/${band}/${id}.webp`, origin: "MI-generált, saját (Seedream 5.0 Pro)", model: "m", promptHash: "0123456789abcdef", approvedAt: "2026-10-17" });
  const catalog = [
    a("cover-sejt", "cover", "laboratory", ["biológia"], ["sejt", "sejtmag"]),
    a("hero-studio", "hero", "studio", [], ["Föld"]), a("hero-explorer", "hero", "explorer", [], []),
    a("mascot-hello", "mascot", "explorer", [], ["kabala"]),
    a("icon-kornyezet-young", "icon", "explorer", ["kornyezet"], []), a("icon-biologia", "icon", "laboratory", ["biologia"], []),
    a("icon-matematika-young", "icon", "explorer", ["matematika"], []), a("icon-matematika", "icon", "laboratory", ["matematika"], []),
  ];
  assert.equal(foldText("Természetismeret"), "termeszetismeret");
  const bio = pickLessonArt({ subject: "Biológia", title: "Sejtmembrán, transzport, sejtmag" }, "laboratory", catalog);
  assert.equal(bio.cover?.id, "cover-sejt");
  assert.equal(bio.mascot, undefined, "9–10. évfolyamon nincs kabala");
  assert.equal(bio.subjectIcon?.id, "icon-biologia");
  const math7 = pickLessonArt({ subject: "Matematika", title: "Medve Szabadtéri Csapatverseny" }, "studio", catalog);
  assert.equal(math7.cover, undefined, "kulcsszó nélkül nincs borító");
  assert.equal(math7.hero?.id, "hero-studio");
  assert.equal(math7.subjectIcon?.id, "icon-matematika");
  const env2 = pickLessonArt({ subject: "Környezetismeret", title: "Az évszakok" }, "explorer", catalog);
  assert.equal(env2.hero?.id, "hero-explorer");
  assert.equal(env2.mascot?.id, "mascot-hello");
  assert.equal(env2.subjectIcon?.id, "icon-kornyezet-young");
  assert.equal(pickLessonArt({ subject: "Matematika", title: "Törtek" }, "adventure", catalog).subjectIcon?.id, "icon-matematika-young");
  assert.deepEqual(pickLessonArt({ subject: "Kémia", title: "Oldatok" }, "future", catalog), {});
});
