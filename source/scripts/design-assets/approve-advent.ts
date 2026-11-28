/**
 * Adventi naptár — a tulajdonos által KIVÁLASZTOTT képek beépítése (docs/specs/2026-11-18-adventi-naptar.md 13.6, S3c):
 * WebP-be, a képhely pontos méretére vágva (Playwright-Chromium vásznon, új függőség nélkül — mint az approve.ts), a bájtcélhoz
 * illő minőséggel, tartalom-hashes néven a client/public/advent/2026/ alá; végül a shared/advent/art-manifest.ts jegyzék.
 *
 * Hálózati hívás és fizetős művelet NINCS: csak a már legyártott jelölteket (design-assets/candidates/advent/) olvassa.
 * Használat (a source mappából): npx.cmd tsx scripts/design-assets/approve-advent.ts kivalasztas.json [--dry-run]
 *   kivalasztas.json: { "advent-door-01": "advent-door-01/2026-…jpg", … } — a ki nem választott képhely helyőrző marad.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { ADVENT_ART } from "../../shared/advent/art-manifest";
import { ADVENT_ART_SPECS, ADVENT_ART_TOTAL_MAX_BYTES } from "../../shared/advent/art";
import { artFileName, checkSelection, fitToBudget, renderArtManifest, totalWithin, type AdventSelection } from "./advent-approve-lib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CANDIDATES = path.join(ROOT, "design-assets", "candidates", "advent");
const OUT_DIR = path.join(ROOT, "client", "public", "advent", "2026");
const MANIFEST = path.join(ROOT, "shared", "advent", "art-manifest.ts");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const selectionFile = args.find((a) => !a.startsWith("--"));
if (!selectionFile) throw new Error("Add meg a kiválasztás JSON-fájlját: approve-advent.ts kivalasztas.json [--dry-run]");

const selection = JSON.parse(readFileSync(selectionFile, "utf8")) as AdventSelection;
const specIds = Object.keys(ADVENT_ART_SPECS);
const check = checkSelection(selection, specIds, (rel) => existsSync(path.join(CANDIDATES, rel)));
if (check.errors.length) {
  console.error(`HIBÁS KIVÁLASZTÁS — semmi nem íródott:\n${check.errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}
if (check.missing.length) console.log(`Nincs kiválasztva (helyőrző marad): ${check.missing.join(", ")}`);

// A tsx alatt feloldott Playwright-build böngészője hiányozhat: ekkor a telepített Chrome (mint az approve.ts-ben).
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const page = await browser.newPage();
const results: Array<{ id: string; file: string; bytes: Uint8Array; quality: number }> = [];
const tooBig: string[] = [];
try {
  for (const [id, rel] of Object.entries(selection)) {
    const spec = ADVENT_ART_SPECS[id]!;
    const mime = /\.jpe?g$/i.test(rel) ? "image/jpeg" : /\.webp$/i.test(rel) ? "image/webp" : "image/png";
    const dataUrl = `data:${mime};base64,${readFileSync(path.join(CANDIDATES, rel)).toString("base64")}`;
    // „cover” vágás a képhely pontos méretére: a kép közepe marad (a főoldali sáv 16:9-ből 4:1-re vágva).
    const encode = async (quality: number): Promise<Uint8Array> => {
      const out = await page.evaluate(async ({ dataUrl, width, height, quality }) => {
        const img = new Image(); img.src = dataUrl; await img.decode();
        const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
        const sw = width / scale; const sh = height / scale;
        const c = document.createElement("canvas"); c.width = width; c.height = height;
        const ctx = c.getContext("2d")!; ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, width, height);
        return c.toDataURL("image/webp", quality);
      }, { dataUrl, width: spec.width, height: spec.height, quality });
      return Buffer.from(out.split(",")[1]!, "base64");
    };
    const fitted = await fitToBudget(encode, spec.maxBytes);
    if (!fitted) { tooBig.push(`${id} (cél: ${spec.maxBytes} bájt)`); continue; }
    results.push({ id, file: artFileName(id, fitted.bytes), bytes: fitted.bytes, quality: fitted.quality });
    console.log(`  ${dryRun ? "·" : "✓"} ${id}: ${spec.width}×${spec.height}, ${fitted.bytes.byteLength} bájt (cél ≤ ${spec.maxBytes}), minőség ${fitted.quality}`);
  }
} finally {
  await browser.close();
}

if (tooBig.length) {
  console.error(`BÁJTCÉL FÖLÖTT a legalacsonyabb minőségen is — semmi nem íródott: ${tooBig.join(", ")}. Válassz másik jelöltet.`);
  process.exit(1);
}
const approved = Object.fromEntries(results.map((r) => [r.id, r.file]));
const sizes: Record<string, number> = {};
for (const [id, file] of Object.entries({ ...ADVENT_ART })) if (!approved[id] && existsSync(path.join(OUT_DIR, file))) sizes[id] = readFileSync(path.join(OUT_DIR, file)).byteLength;
for (const r of results) sizes[r.id] = r.bytes.byteLength;
const total = totalWithin(sizes, ADVENT_ART_TOTAL_MAX_BYTES);
console.log(`Összesen: ${Object.keys(sizes).length} kép, ${total.total} bájt (keret: ${ADVENT_ART_TOTAL_MAX_BYTES}).`);
if (!total.ok) { console.error("A TELJES KÉSZLET a bájtkeret fölött van — semmi nem íródott."); process.exit(1); }

if (dryRun) { console.log("Száraz futás: semmi nem íródott."); process.exit(0); }

mkdirSync(OUT_DIR, { recursive: true });
for (const r of results) {
  // Ugyanannak a képhelynek a korábbi (más hash-ű) fájlja kikerül, hogy ne maradjon árva kép a csomagban.
  for (const old of readdirSync(OUT_DIR)) if (old.startsWith(`${r.id}.`) && old !== r.file) unlinkSync(path.join(OUT_DIR, old));
  writeFileSync(path.join(OUT_DIR, r.file), r.bytes);
}
writeFileSync(MANIFEST, renderArtManifest(ADVENT_ART, approved));
console.log(`Kész: ${results.length} kép a client/public/advent/2026/ alatt, a jegyzék frissítve (shared/advent/art-manifest.ts).`);
