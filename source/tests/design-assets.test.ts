import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildImageRequest, composePrompt, estimateUsd, loadStyle, redact, type AssetManifest } from "../scripts/design-assets/lib";
import { designAssetSchema } from "../shared/design-assets";

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
  const catalog = JSON.parse(read("shared/design-assets.json")) as unknown[];
  for (const raw of catalog) {
    const asset = designAssetSchema.parse(raw);
    assert.ok(existsSync(new URL(`../client/public${asset.src}`, import.meta.url)), `${asset.id}: fájl`);
  }
});
