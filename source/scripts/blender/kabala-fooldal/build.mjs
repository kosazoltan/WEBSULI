#!/usr/bin/env node
// A Websuli makija a főoldalon — EGY parancs a modellből a főoldali eszközökig (terv: docs/specs/2026-11-18-kabala-fooldal.md, 4.3).
//
//   node source/scripts/blender/kabala-fooldal/build.mjs [--keep-frames <mappa>] [--frames <mappa>] [--contact <fájl.jpg>]
//
// 1. Blender (fej nélkül; helye: BLENDER_BIN környezeti változó, különben a PATH-on lévő `blender`) a `home_frames.py`-val
//    átlátszó hátterű PNG-képkockákat renderel a figura AKTUÁLIS modelljéből (`../kabala-maki/maki_model.py`, `maki_anim.py`).
// 2. Közös kivágás (minden képkocka ugyanarra a keretre), cellákra méretezés, egyetlen lap, WebP.
// 3. Kimenet: source/client/public/mascot/kabala-fooldal.<hash>.webp (lap), kabala-fooldal-allo.<hash>.webp (álló kép),
//    source/client/src/mascot/home-mascot.manifest.json. A régi hash-ű fájlokat törli. Időbélyeg és gépfüggő útvonal nem kerül a kimenetbe.
//
// --frames <mappa>: meglévő képkockákból dolgozik (Blender nélkül) — a csomagolás hangolásához.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(HERE, "..", "..", "..");
const OUT_DIR = path.join(SOURCE, "client", "public", "mascot");
const MANIFEST = path.join(SOURCE, "client", "src", "mascot", "home-mascot.manifest.json");
const BASENAME = "kabala-fooldal";

/** A renderelt képkocka oldala (px): a cella ≈ 2,2-szerese, a kicsinyítés adja az élsimítást. */
const RENDER_SIZE = 640;
/** A cella magassága (px) = 1,8 × a telefonos megjelenítés (120 CSS px) — a terv 4.3 kerete (mérve: 240 px-nél 282 KB, 216-nál lásd a manifestet). */
const CELL_H = 216;
const COLS = 8;
const PAD = 3;
const WEBP = { quality: 70, alphaQuality: 88, effort: 6, smartSubsample: true };
/** A képek együttes kerete (bájt) — ugyanezt őrzi a tests/home-mascot-assets-guard.test.ts. */
const IMAGE_BUDGET = 300 * 1024;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function renderFrames(dir) {
  const blender = process.env.BLENDER_BIN || "blender";
  const run = spawnSync(blender, ["-b", "--factory-startup", "-P", path.join(HERE, "home_frames.py"), "--", "--out", dir, "--size", String(RENDER_SIZE)], {
    encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) throw new Error(`A Blender nem indítható (${blender}): ${run.error.message}. Állítsd be a BLENDER_BIN környezeti változót.`);
  if (run.status !== 0 || !fs.existsSync(path.join(dir, "frames.json"))) {
    const tail = `${run.stdout ?? ""}\n${run.stderr ?? ""}`.trim().split("\n").slice(-25).join("\n");
    throw new Error(`A Blender hibával állt meg (kilépési kód: ${run.status}).\n${tail}`);
  }
}

async function unionBox(dir, files, size) {
  const box = { l: size, t: size, r: -1, b: -1 };
  for (const f of files) {
    const { data, info } = await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== size || info.height !== size) throw new Error(`Váratlan képméret: ${f} ${info.width}×${info.height}`);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (data[(y * size + x) * 4 + 3] > 8) {
          if (x < box.l) box.l = x;
          if (x > box.r) box.r = x;
          if (y < box.t) box.t = y;
          if (y > box.b) box.b = y;
        }
      }
    }
  }
  if (box.r < 0) throw new Error("Üres képkockák: a figura nem látszik a képen.");
  // Ha a figura a kép szélét éri, a kamera levágta (pl. hosszabb farok az új modellen) — ne gyártsunk csendben csonka képet.
  if (box.l <= 0 || box.t <= 0 || box.r >= size - 1 || box.b >= size - 1) {
    throw new Error(`A figura kilóg a renderelt képből (${JSON.stringify(box)}, kép: ${size} px) — a home_frames.py CAMERA távolságát növelni kell.`);
  }
  return { l: Math.max(0, box.l - PAD), t: Math.max(0, box.t - PAD), r: Math.min(size - 1, box.r + PAD), b: Math.min(size - 1, box.b + PAD) };
}

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

async function main() {
  const given = arg("--frames");
  const keep = arg("--keep-frames");
  const temp = given ? null : keep ? path.resolve(keep) : fs.mkdtempSync(path.join(os.tmpdir(), "kabala-fooldal-"));
  const dir = given ? path.resolve(given) : temp;
  try {
    if (!given) {
      fs.mkdirSync(dir, { recursive: true });
      renderFrames(dir);
    }
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "frames.json"), "utf8"));
    const files = meta.clips.flatMap((c) => c.frames);
    const box = await unionBox(dir, files, meta.size);
    const bw = box.r - box.l + 1;
    const bh = box.b - box.t + 1;
    const cellH = CELL_H;
    const cellW = Math.round(((bw / bh) * cellH) / 2) * 2;
    const rows = Math.ceil(files.length / COLS);
    const cut = (f, w, h) => sharp(path.join(dir, f)).extract({ left: box.l, top: box.t, width: bw, height: bh }).resize(w, h, { fit: "fill", kernel: "lanczos3" }).png().toBuffer();

    const tiles = [];
    for (let i = 0; i < files.length; i++) {
      tiles.push({ input: await cut(files[i], cellW, cellH), left: (i % COLS) * cellW, top: Math.floor(i / COLS) * cellH });
    }
    const sheetPng = await sharp({ create: { width: COLS * cellW, height: rows * cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(tiles).png().toBuffer();
    const sheet = await sharp(sheetPng).webp(WEBP).toBuffer();
    const poster = await sharp(await cut(files[0], cellW, cellH)).webp({ ...WEBP, quality: 80 }).toBuffer();
    if (sheet.length + poster.length > IMAGE_BUDGET) {
      throw new Error(`A képek túllépik a keretet: ${sheet.length + poster.length} B > ${IMAGE_BUDGET} B (lap ${sheet.length}, álló kép ${poster.length}).`);
    }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const old of fs.readdirSync(OUT_DIR)) {
      if (old.startsWith(`${BASENAME}.`) || old.startsWith(`${BASENAME}-allo.`)) fs.rmSync(path.join(OUT_DIR, old));
    }
    const sheetSha = sha(sheet);
    const posterSha = sha(poster);
    const sheetName = `${BASENAME}.${sheetSha.slice(0, 8)}.webp`;
    const posterName = `${BASENAME}-allo.${posterSha.slice(0, 8)}.webp`;
    fs.writeFileSync(path.join(OUT_DIR, sheetName), sheet);
    fs.writeFileSync(path.join(OUT_DIR, posterName), poster);

    let index = 0;
    const clips = {};
    for (const clip of meta.clips) {
      clips[clip.name] = {
        frames: clip.frames.map(() => index++),
        fps: clip.fps,
        loop: clip.loop,
        // emelkedés a cella magasságának hányadában (a lap ezt szorozza a megjelenített magassággal)
        lift: clip.lift.map((m) => Math.round(((m * meta.pxPerMeter) / bh) * 10000) / 10000),
      };
    }
    const manifest = {
      name: "A Websuli makija — főoldali képkocka-lap",
      generator: "source/scripts/blender/kabala-fooldal/build.mjs",
      sheet: { file: sheetName, sha256: sheetSha, bytes: sheet.length, width: COLS * cellW, height: rows * cellH },
      poster: { file: posterName, sha256: posterSha, bytes: poster.length, width: cellW, height: cellH },
      cell: { width: cellW, height: cellH },
      cols: COLS,
      frames: files.length,
      clips,
      source: { triangles: meta.triangles, engine: meta.engine, renderSize: meta.size, crop: box, camera: meta.camera },
    };
    fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    const contact = arg("--contact");
    if (contact) {
      await sharp({ create: { width: COLS * cellW, height: rows * cellH, channels: 4, background: "#141a3d" } }).composite([{ input: sheetPng }]).jpeg({ quality: 86 }).toFile(path.resolve(contact));
    }
    console.log(`KABALA-FOOLDAL-BUILD ${JSON.stringify({ sheet: sheetName, poster: posterName, bytes: sheet.length + poster.length, frames: files.length, cell: `${cellW}x${cellH}`, decodedMiB: Math.round(((COLS * cellW * rows * cellH * 4) / 1048576) * 10) / 10 })}`);
  } finally {
    if (temp && !keep) fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`KABALA-FOOLDAL-BUILD HIBA: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
