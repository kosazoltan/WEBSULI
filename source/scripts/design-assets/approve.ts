/**
 * Websuli képkészlet — a jóváhagyott jelöltek WebP-be, méretre (Playwright-Chromium vásznon, új függőség nélkül),
 * a client/public/design/<sáv>/<id>.webp alá, és bejegyzés a shared/design-assets.json katalógusba.
 * Terv: docs/specs/2026-10-17-websuli-kepkeszlet.md. Használat: npx tsx scripts/design-assets/approve.ts kivalasztas.json
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { composePrompt, loadStyle, type AssetManifest } from "./lib";
import type { DesignAsset } from "../../shared/design-assets";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CANDIDATES = path.join(ROOT, "design-assets", "candidates");
const CATALOG = path.join(ROOT, "shared", "design-asset-catalog.ts");
const WIDTH: Record<string, number> = { hero: 1600, cover: 1200, icon: 512, mascot: 512 };

const selectionFile = process.argv[2];
if (!selectionFile) throw new Error("Add meg a kiválasztás JSON-fájlját.");
const selection = JSON.parse(readFileSync(selectionFile, "utf8")) as Record<string, string>;
const manifest = JSON.parse(readFileSync(path.join(ROOT, "design-assets", "prompts.json"), "utf8")) as AssetManifest;
const style = loadStyle(readFileSync(path.join(ROOT, "design-assets", "style.md"), "utf8"));
// A katalógus TS-modul (a tsconfig nem importál JSON-t); a tömb a „= ” utáni JSON-literál.
const catalog: DesignAsset[] = existsSync(CATALOG) ? JSON.parse(readFileSync(CATALOG, "utf8").replace(/^[\s\S]*?= /, "").replace(/;\s*$/, "")) : [];

// A tsx alatt feloldott Playwright-build böngészője hiányozhat (mérve, 2026-10-17): ekkor a telepített Chrome.
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));
const page = await browser.newPage();
for (const [id, rel] of Object.entries(selection)) {
  const item = manifest.items.find(i => i.id === id);
  if (!item) throw new Error(`Ismeretlen tétel: ${id}`);
  const src = path.join(CANDIDATES, rel);
  const mime = rel.endsWith(".jpg") ? "image/jpeg" : rel.endsWith(".webp") ? "image/webp" : "image/png";
  const dataUrl = `data:${mime};base64,${readFileSync(src).toString("base64")}`;
  const webp = await page.evaluate(async ({ dataUrl, width }) => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    const w = Math.min(width, img.naturalWidth); const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d")!; ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/webp", 0.86);
  }, { dataUrl, width: WIDTH[item.kind] });
  const outDir = path.join(ROOT, "client", "public", "design", item.band);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, `${id}.webp`), Buffer.from(webp.split(",")[1], "base64"));
  const entry: DesignAsset = {
    id, kind: item.kind, band: item.band, subjects: item.subjects, keywords: item.keywords, alt: item.alt,
    src: `/design/${item.band}/${id}.webp`, origin: "MI-generált, saját (Seedream 5.0 Pro)", model: manifest.model,
    promptHash: createHash("sha256").update(composePrompt(item, style)).digest("hex").slice(0, 16), approvedAt: new Date().toISOString(),
  };
  const at = catalog.findIndex(a => a.id === id);
  if (at >= 0) catalog[at] = entry; else catalog.push(entry);
  console.log(`  ✓ ${id} → ${entry.src}`);
}
await browser.close();
catalog.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(CATALOG, `/** GENERÁLT FÁJL — scripts/design-assets/approve.ts. A jóváhagyott, MI-generált saját képek katalógusa. */\nimport type { DesignAsset } from "./design-assets";\n\nexport const DESIGN_ASSET_CATALOG: DesignAsset[] = ${JSON.stringify(catalog, null, 2)};\n`);
console.log(`Katalógus: ${catalog.length} kép (${path.relative(ROOT, CATALOG)}).`);
