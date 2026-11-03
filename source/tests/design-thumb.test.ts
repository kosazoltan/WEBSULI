import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { forgetThumb, makeThumbnail, thumbnailFor, THUMB_HEIGHT, THUMB_WIDTH } from "../server/design-assets";

test("spec 2026-11-03-fooldal-sebesseg: ugyanarra az azonosítóra 10 egyidejű kérés → egyetlen betöltés és generálás; utána memóriából", async () => {
  let loads = 0, makes = 0;
  const load = async () => { loads++; return { sha256: "abc", bytes: Buffer.from("x") }; };
  const make = async () => { makes++; await new Promise((r) => setTimeout(r, 20)); return Buffer.from("thumb"); };
  const results = await Promise.all(Array.from({ length: 10 }, () => thumbnailFor("cover-egyszeri-proba", load, make)));
  assert.equal(loads, 1);
  assert.equal(makes, 1);
  assert.ok(results.every((r) => r?.buf.toString() === "thumb" && r.sha256 === "abc"));
  await thumbnailFor("cover-egyszeri-proba", load, make);
  assert.equal(loads, 1, "memóriatalálat: nincs újabb DB-olvasás");
  assert.equal(await thumbnailFor("cover-nincs-ilyen", async () => null, make), null);
});

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

test("review #381: a kockázatos dekódolók (SVG, TIFF, GIF) tiltva — ilyen bemenetből nem készül bélyegkép", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  await assert.rejects(makeThumbnail(svg));
  const tiff = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).tiff().toBuffer();
  await assert.rejects(makeThumbnail(tiff));
});

test("más képarányú (16:9-es hős-) képből is 3:2-es, levágott bélyegkép lesz", async () => {
  const hero = await sharp({ create: { width: 1600, height: 900, channels: 3, background: { r: 30, g: 90, b: 160 } } }).webp().toBuffer();
  const meta = await sharp(await makeThumbnail(hero)).metadata();
  assert.equal(meta.width, THUMB_WIDTH);
  assert.equal(meta.height, THUMB_HEIGHT);
});

test("review #385: a generálás közbeni érvénytelenítés után az elavult bélyegkép nem kerül a gyorsítótárba", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let loads = 0;
  const load = async () => { loads++; if (loads === 1) { await gate; return { sha256: "regi", bytes: Buffer.from("r") }; } return { sha256: "uj", bytes: Buffer.from("u") }; };
  const make = async (bytes: Buffer) => Buffer.from(`thumb-${bytes.toString()}`);
  const stale = thumbnailFor("cover-verseny-proba", load, make);
  await new Promise((r) => setImmediate(r));
  forgetThumb("cover-verseny-proba"); // a képszinkron közben felülírta a sort
  release();
  assert.equal((await stale)?.sha256, "regi", "a már futó kérés a saját eredményét kapja");
  const fresh = await thumbnailFor("cover-verseny-proba", load, make);
  assert.equal(fresh?.sha256, "uj", "a következő kérés újra betölt, nem az elavult példányt kapja");
  assert.equal(fresh?.buf.toString(), "thumb-u");
  assert.equal(loads, 2);
  assert.equal((await thumbnailFor("cover-verseny-proba", load, make))?.sha256, "uj", "az új példány már a gyorsítótárból jön");
  assert.equal(loads, 2);
});
