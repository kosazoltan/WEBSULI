/**
 * A tantárgy × sáv ikonkészlet tételeinek felvétele a design-assets/prompts.json-ba (docs/specs/2026-10-17-websuli-ikonkeszlet.md).
 * Idempotens: a már meglévő „icon-<tantárgy>-<sáv>” tételt frissíti. Használat: npx tsx scripts/design-assets/add-subject-icons.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUBJECT_LABELS, type CatalogSubject } from "../../shared/catalog-taxonomy";
import { BAND_ICON_STYLE, BANDS, SUBJECT_BANDS, SUBJECT_MOTIFS } from "./subject-icon-plan";
import type { AssetManifest } from "./lib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const file = path.join(ROOT, "design-assets", "prompts.json");
const manifest = JSON.parse(readFileSync(file, "utf8")) as AssetManifest & { items: Array<AssetManifest["items"][number] & { batch?: number }> };
const GRADES = { explorer: "1–2.", adventure: "3–5.", studio: "6–8.", laboratory: "9–10.", future: "11–12." } as const;
let added = 0;
for (const subject of Object.keys(SUBJECT_BANDS) as CatalogSubject[]) {
  for (const band of SUBJECT_BANDS[subject]) {
    const motif = SUBJECT_MOTIFS[subject][BANDS.indexOf(band)];
    if (!motif) throw new Error(`Hiányzó motívum: ${subject} / ${band}`);
    const label = SUBJECT_LABELS[subject].replace(/\s*\(.*\)\s*$/, "");
    const item = {
      id: `icon-${subject}-${band}`, kind: "icon" as const, band, subjects: [subject], keywords: [subject],
      alt: `${label}, ${GRADES[band]} osztály: tantárgyikon.`, aspect_ratio: "1:1", references: [BAND_ICON_STYLE[band].reference], batch: 2,
      // A referencia csak a megjelenítési stílust adja: a modell a 12 elemes próbában a referencia tárgyát (abakusz, atom) másolta.
      prompt: `Subject of the icon: ${motif}. Render it as a ${BAND_ICON_STYLE[band].style}. The reference image is ONLY a guide for rendering style, material, lighting and palette — do NOT reproduce its object (no abacus, no atom, no orbits unless the subject above asks for them). Centered single object, plain very light background. No letters, digits, words or flags with text.`,
    };
    const at = manifest.items.findIndex(i => i.id === item.id);
    if (at >= 0) manifest.items[at] = item; else { manifest.items.push(item); added++; }
  }
}
writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log(`${added} új ikon-tétel; a készlet: ${manifest.items.filter(i => (i as { batch?: number }).batch === 2).length} pár.`);
