/**
 * A témaköri borítók tételeinek felvétele a design-assets/prompts.json-ba (docs/specs/2026-10-17-arculati-bank.md, S1).
 * Idempotens: a már meglévő „cover-<tantárgy>-<sáv>-<témakör>” tételt frissíti. Használat: npx tsx scripts/design-assets/add-topic-covers.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUBJECT_LABELS } from "../../shared/catalog-taxonomy";
import { TOPICS, topicCoverId } from "../../shared/topic-taxonomy";
import type { AssetManifest } from "./lib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const file = path.join(ROOT, "design-assets", "prompts.json");
const manifest = JSON.parse(readFileSync(file, "utf8")) as AssetManifest & { items: Array<AssetManifest["items"][number] & { batch?: number; topic?: string }> };
const GRADES = { explorer: "1–2.", adventure: "3–5.", studio: "6–8.", laboratory: "9–10.", future: "11–12." } as const;
let added = 0;
for (const t of TOPICS) {
  const subject = SUBJECT_LABELS[t.subject].replace(/\s*\(.*\)\s*$/, "");
  const item = {
    id: topicCoverId(t), kind: "cover" as const, band: t.band, subjects: [t.subject], keywords: [t.label, ...t.keywords], topic: t.key,
    alt: `${subject}, ${GRADES[t.band]} osztály — ${t.label}: témaköri borítókép.`, aspect_ratio: "3:2", batch: 3,
    // Próbakör (2026-10-17): a sávhős referenciaként a hős tájképét másolta (hegycsúcs, túrázó) — a borító referencia NÉLKÜL
    // készül, a sáv stílusát a style.md sávleírása adja; a tárgy áll elöl.
    prompt: `Subject of the illustration: ${t.motif}. The subject fills the scene clearly and is easy to recognise. Wide scene with calm space, no people's faces in close-up. No letters, digits, words or flags with text.`,
  };
  const at = manifest.items.findIndex(i => i.id === item.id);
  if (at >= 0) manifest.items[at] = item; else { manifest.items.push(item); added++; }
}
writeFileSync(file, JSON.stringify(manifest, null, 2) + "\n");
console.log(`${added} új borító-tétel; a témaköri borítók: ${manifest.items.filter(i => i.batch === 3).length}.`);
