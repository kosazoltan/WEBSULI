import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import sharp from "sharp";

import manifest from "../client/src/mascot/home-mascot.manifest.json";

// docs/specs/2026-11-18-kabala-fooldal.md 4.3 (K6, K15): a főoldali kabala gyártott eszközeinek őre.
// Újragyártás: `node source/scripts/blender/kabala-fooldal/build.mjs` (BLENDER_BIN).
const dir = new URL("../client/public/mascot/", import.meta.url);
const read = (name: string) => readFileSync(new URL(name, dir));

/** A képek együttes kerete (a terv K6 pontja: az összes eszköz ≤ 350 KB átvitt; a képekre ≤ 300 KB marad a JS / CSS mellett). */
const IMAGE_BUDGET = 300 * 1024;
/** A kibontott lap kerete (szélesség × magasság × 4 bájt). */
const DECODED_BUDGET = 8 * 1024 * 1024;
/** A telefonos megjelenítés magassága (home-mascot.css: --hm-h) — a cella legalább 1,5-szöröse. */
const PHONE_HEIGHT = 140;
const CLIPS = ["idle", "blink", "wave", "cheer", "point-in", "point", "hop"];

test("K15: a manifest fájljai léteznek, a hash és a bájtszám egyezik; nincs árva (régi hash-ű) fájl", () => {
  for (const entry of [manifest.sheet, manifest.poster]) {
    const data = read(entry.file);
    assert.equal(data.length, entry.bytes, entry.file);
    const digest = createHash("sha256").update(data).digest("hex");
    assert.equal(digest, entry.sha256, entry.file);
    assert.ok(entry.file.includes(`.${digest.slice(0, 8)}.`), "a fájlnév a tartalom hash-ét viseli");
  }
  assert.deepEqual(readdirSync(dir).sort(), [manifest.poster.file, manifest.sheet.file].sort());
});

test("K6: a képek összesen ≤ 300 KB; a lap kibontva ≤ 8 MiB", () => {
  const total = manifest.sheet.bytes + manifest.poster.bytes;
  assert.ok(total <= IMAGE_BUDGET, `${total} B > ${IMAGE_BUDGET} B`);
  const decoded = manifest.sheet.width * manifest.sheet.height * 4;
  assert.ok(decoded <= DECODED_BUDGET, `${decoded} B`);
});

test("K15: a lap valódi mérete a manifest szerinti rács; a cella elég nagy a telefonos megjelenítéshez; átlátszó", async () => {
  const sheet = await sharp(read(manifest.sheet.file)).metadata();
  assert.equal(sheet.format, "webp");
  assert.equal(sheet.hasAlpha, true);
  assert.equal(sheet.width, manifest.sheet.width);
  assert.equal(sheet.height, manifest.sheet.height);
  assert.equal(manifest.sheet.width, manifest.cols * manifest.cell.width);
  assert.equal(manifest.sheet.height, Math.ceil(manifest.frames / manifest.cols) * manifest.cell.height);
  assert.ok(manifest.cell.height >= 1.5 * PHONE_HEIGHT, `cella ${manifest.cell.height} px`);
  const poster = await sharp(read(manifest.poster.file)).metadata();
  assert.equal(poster.width, manifest.poster.width);
  assert.equal(poster.height, manifest.poster.height);
  // a CSS a cella arányát 130 / 216-ként ismeri (--hm-w): az újragyártott lap aránya ettől legfeljebb 3%-kal térhet el
  const ratio = manifest.cell.width / manifest.cell.height;
  assert.ok(Math.abs(ratio - 130 / 216) / (130 / 216) <= 0.03, `cellaarány ${ratio.toFixed(4)} — a home-mascot.css --hm-w értékét igazítani kell`);
});

test("K15: a hét klip megvan; a képkocka-indexek a lapon belül, átfedés nélkül; fps és emelkedés rendben", () => {
  assert.deepEqual(Object.keys(manifest.clips).sort(), [...CLIPS].sort());
  const used: number[] = [];
  for (const [name, clip] of Object.entries(manifest.clips)) {
    assert.ok(clip.frames.length >= 3, `${name}: ${clip.frames.length} képkocka`);
    assert.equal(clip.lift.length, clip.frames.length, name);
    assert.ok(clip.fps >= 4 && clip.fps <= 15, `${name}: ${clip.fps} fps`);
    assert.ok(clip.lift.every((v) => v >= 0 && v <= 0.4), `${name}: emelkedés a cella 0–40%-a`);
    used.push(...clip.frames);
  }
  assert.deepEqual([...used].sort((a, b) => a - b), Array.from({ length: manifest.frames }, (_, i) => i));
  assert.equal(manifest.clips.idle.loop, true);
  assert.equal(manifest.clips.point.loop, true);
  // az ugrásnak van íve (a lap animációja adja), és a figura a klip elején a talajon van
  for (const name of ["cheer", "hop"] as const) {
    assert.ok(Math.max(...manifest.clips[name].lift) > 0.03, name);
    assert.equal(manifest.clips[name].lift[0], 0, name);
  }
});

test("K15: minden cellában van figura (nem üres és nem a teljes cellát kitöltő kép)", async () => {
  const { data, info } = await sharp(read(manifest.sheet.file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: cw, height: ch } = manifest.cell;
  for (let i = 0; i < manifest.frames; i++) {
    const x0 = (i % manifest.cols) * cw;
    const y0 = Math.floor(i / manifest.cols) * ch;
    let opaque = 0;
    let samples = 0;
    for (let y = 0; y < ch; y += 2) {
      for (let x = 0; x < cw; x += 2) {
        samples++;
        if (data[((y0 + y) * info.width + x0 + x) * 4 + 3] > 128) opaque++;
      }
    }
    const share = opaque / samples;
    assert.ok(share > 0.12 && share < 0.75, `${i}. cella: ${(share * 100).toFixed(1)}% fedett`);
  }
});

test("K15: a gyártó szkriptekben nincs gépfüggő útvonal, és a Blender helye a BLENDER_BIN-ből jön", () => {
  for (const name of ["build.mjs", "home_frames.py"]) {
    const text = readFileSync(new URL(`../scripts/blender/kabala-fooldal/${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(text, /\b[A-Za-z]:[\\/]/, `${name}: meghajtóbetűs útvonal`);
    assert.doesNotMatch(text, /\/(Users|home)\//, `${name}: felhasználói mappa`);
    assert.doesNotMatch(text, /Program Files/, name);
  }
  assert.match(readFileSync(new URL("../scripts/blender/kabala-fooldal/build.mjs", import.meta.url), "utf8"), /process\.env\.BLENDER_BIN \|\| "blender"/);
  assert.equal(manifest.generator, "source/scripts/blender/kabala-fooldal/build.mjs");
});
