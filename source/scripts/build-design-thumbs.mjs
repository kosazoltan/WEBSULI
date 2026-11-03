/**
 * Spec 2026-11-03-fooldal-sebesseg: a katalógus képeiből a BUILD készít főoldali bélyegképet (480×320 WebP, tartalom-hash a
 * fájlnévben) — futásidőben így nincs sharp és DB-hívás, a statikus fájl immutable gyorsítótárral megy ki. Inkrementális:
 * a meglévő azonos nevű fájlt nem gyártja újra; a már nem hivatkozott régit törli. Egy kép hibája nem buktatja a buildet.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const THUMB_WIDTH = 480;
export const THUMB_HEIGHT = 320;

export function thumbFileName(id, bytes) {
  return `${id}.${createHash("sha256").update(bytes).digest("hex").slice(0, 8)}.webp`;
}

async function listWebp(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listWebp(full));
    // Csak a kártyán megjelenő borító és hős-kép kap bélyegképet (ikon, jelölő, kabala nem).
    else if (entry.name.endsWith(".webp") && /^(cover|hero)-/.test(entry.name)) out.push(full);
  }
  return out;
}

/** `srcDir/**\/<id>.webp` → `outDir/<id>.<hash8>.webp` + `outDir/manifest.json` ({ id: fájlnév }). */
export async function buildThumbs({ srcDir, outDir, concurrency = 4, log = console.log }) {
  const { default: sharp } = await import("sharp");
  await mkdir(outDir, { recursive: true });
  const files = await listWebp(srcDir);
  const manifest = {};
  let made = 0, kept = 0, failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++];
      const id = path.basename(file, ".webp");
      try {
        const bytes = await readFile(file);
        const name = thumbFileName(id, bytes);
        const target = path.join(outDir, name);
        if (existsSync(target)) kept++;
        else {
          await writeFile(target, await sharp(bytes, { failOn: "error" }).resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: "cover" }).webp({ quality: 70 }).toBuffer());
          made++;
        }
        manifest[id] = name;
      } catch (error) {
        failed++;
        log(`[design-thumbs] ${id}: kihagyva (${error instanceof Error ? error.message : String(error)}) — futásidőben készül`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  const wanted = new Set(Object.values(manifest));
  let removed = 0;
  for (const name of await readdir(outDir)) {
    if (name.endsWith(".webp") && !wanted.has(name)) { await unlink(path.join(outDir, name)); removed++; }
  }
  await writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest));
  log(`[design-thumbs] ${Object.keys(manifest).length} bélyegkép (új: ${made}, meglévő: ${kept}, törölt: ${removed}, hibás: ${failed})`);
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  await buildThumbs({ srcDir: path.join(root, "client/public/design"), outDir: path.join(root, "client/public/design-thumbs") });
}
