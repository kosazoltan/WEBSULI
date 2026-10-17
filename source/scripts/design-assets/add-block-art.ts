/**
 * Arculati bank S2–S3 (docs/specs/2026-10-17-arculati-bank-s2-vegrehajtas.md): blokkjelzők, fejezetdíszek és kabalapózok
 * felvétele a design-assets/prompts.json-ba. Idempotens. Használat: npx tsx scripts/design-assets/add-block-art.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BAND_ICON_STYLE, BANDS } from "./subject-icon-plan";
import type { AssetManifest } from "./lib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const file = path.join(ROOT, "design-assets", "prompts.json");
const manifest = JSON.parse(readFileSync(file, "utf8")) as AssetManifest & { items: Array<AssetManifest["items"][number] & { batch?: number }> };
const NO_TEXT = "No letters, digits, words or symbols with text.";

/** Blokktípus → [magyar név, a jelző motívuma, a kabalapóz]. */
export const BLOCK_KINDS = {
  explain: ["Magyarázat", "an open book with a small glowing lightbulb above it", "the fox pointing at a small blank chalkboard, explaining kindly"],
  example: ["Példa", "a magnifying glass over a small sheet with simple shapes", "the fox holding a magnifying glass, curious"],
  try: ["Próbáld ki", "a single pencil drawing a short curved line that ends in a small target dot, the pencil is an object (no face, no arms)", "the fox writing eagerly with a big pencil"],
  check: ["Ellenőrzés", "a round badge with a bold check mark", "the fox giving a cheerful thumbs up"],
  recap: ["Összefoglalás", "a neat stack of index cards with a pin", "the fox holding a small stack of cards, satisfied"],
  animate: ["Mozgókép", "a rounded play button with small motion lines", "the fox watching a small floating play button with wonder"],
} as const;
const DIVIDER_MOTIFS: Record<string, [string, string]> = {
  explorer: ["two small leaves and a tiny daisy, symmetrical", "a small rainbow arc with two tiny clouds"],
  adventure: ["a small compass rose with two tiny flags", "a small mountain peak with a tiny path line"],
  studio: ["a small geometric star made of overlapping triangles", "a small spiral of glowing dots"],
  laboratory: ["a small hexagon with a tiny atom inside", "a thin wave line with a dot at its centre"],
  future: ["a thin horizon line with a small rising sun", "a small abstract light streak with a star"],
};
const LABEL: Record<string, string> = { explorer: "1–2.", adventure: "3–5.", studio: "6–8.", laboratory: "9–10.", future: "11–12." };

const items: Array<AssetManifest["items"][number] & { batch: number }> = [];
for (const [kind, [hu, marker]] of Object.entries(BLOCK_KINDS)) for (const band of BANDS) {
  items.push({ id: `marker-${kind}-${band}`, kind: "marker", band, subjects: [], keywords: [kind], alt: `${hu} — blokkjelző (${LABEL[band]} osztály).`, aspect_ratio: "1:1", batch: 4,
    // Próba (2026-10-17): a sáv tájképes stílusa hátteret rajzolt (hegyek, repülő) — 24 px-en olvashatatlan; a jelző izolált tárgy.
    prompt: `Subject of the icon: ${marker}. Render it as a ${BAND_ICON_STYLE[band].style}. ISOLATED single object only: no scenery, no landscape, no clouds, no background elements at all, plain flat very light background, bold simple silhouette that stays recognisable at 24 pixels. ${NO_TEXT}` } as never);
}
for (const band of BANDS) DIVIDER_MOTIFS[band].forEach((motif, i) => items.push({ id: `divider-${band}-${i + 1}`, kind: "divider", band, subjects: [], keywords: ["divider"], alt: `Fejezetdísz (${LABEL[band]} osztály).`,
  aspect_ratio: "1:1", batch: 4, prompt: `Subject of the ornament: ${motif}. ISOLATED small ornament only: no scenery, no landscape, no photograph, no people, plain flat very light empty background around it. ${NO_TEXT}` } as never));
for (const [kind, [hu, , pose]] of Object.entries(BLOCK_KINDS)) items.push({ id: `mascot-${kind}`, kind: "mascot", band: "explorer", subjects: [], keywords: ["kabala", kind],
  alt: `A Websuli rókája — ${hu}.`, aspect_ratio: "1:1", references: ["mascot-base"], batch: 4,
  prompt: `Subject: ${pose}. Exactly the same fox character as in the reference image (same fur colors, eyes, proportions and little backpack). Full body, centered. ${NO_TEXT}` } as never);

let added = 0;
for (const item of items) { const at = manifest.items.findIndex(i => i.id === item.id); if (at >= 0) manifest.items[at] = item; else { manifest.items.push(item); added++; } }
writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log(`${added} új tétel; a 4. köteg: ${manifest.items.filter(i => (i as { batch?: number }).batch === 4).length} (${Object.keys(LABEL).length} sáv).`);
