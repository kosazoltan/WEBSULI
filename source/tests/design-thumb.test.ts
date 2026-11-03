import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { makeThumbnail, THUMB_HEIGHT, THUMB_WIDTH } from "../server/design-assets";

// Spec 2026-11-03-fooldal-boritokartyak: a főoldali kártya bélyegképe a tárolt borítóból — 480×320-as WebP, jóval kisebb a borítónál.
test("a borítóból 480×320-as WebP bélyegkép készül, a borító méretének töredékével", async () => {
  const cover = readFileSync(new URL("../client/public/design/laboratory/cover-gorog-drama.webp", import.meta.url));
  const thumb = await makeThumbnail(cover);
  const meta = await sharp(thumb).metadata();
  assert.equal(meta.format, "webp");
  assert.equal(meta.width, THUMB_WIDTH);
  assert.equal(meta.height, THUMB_HEIGHT);
  assert.ok(thumb.length < cover.length / 3, `bélyegkép ${thumb.length} B, borító ${cover.length} B`);
});

test("más képarányú (16:9-es hős-) képből is 3:2-es, levágott bélyegkép lesz", async () => {
  const hero = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 30, g: 90, b: 160 } } }).webp().toBuffer();
  const meta = await sharp(await makeThumbnail(hero)).metadata();
  assert.equal(meta.width, THUMB_WIDTH);
  assert.equal(meta.height, THUMB_HEIGHT);
});
