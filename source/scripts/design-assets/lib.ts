/** Websuli képkészlet — tiszta, tesztelhető segédfüggvények (docs/specs/2026-10-17-websuli-kepkeszlet.md). */
export type AssetKind = "mascot" | "hero" | "icon" | "cover";
export type AssetBand = "explorer" | "adventure" | "studio" | "laboratory" | "future";
export type AssetItem = {
  id: string; kind: AssetKind; band: AssetBand; subjects: string[]; keywords: string[]; alt: string;
  aspect_ratio: string; prompt: string; references?: string[]; trial?: boolean;
};
export type AssetManifest = { model: string; items: AssetItem[] };
export type Style = { common: string; band: Record<string, string>; kind: Record<string, string> };

/** A style.md „COMMON:”, „BAND_X:”, „KIND_X:” sorai (a prefix után a sor vége a szöveg). */
export function loadStyle(markdown: string): Style {
  const style: Style = { common: "", band: {}, kind: {} };
  for (const line of markdown.split(/\r?\n/)) {
    const m = /(COMMON|BAND_([A-Z]+)|KIND_([A-Z]+)):\s*(.+)$/.exec(line);
    if (!m) continue;
    if (m[1] === "COMMON") style.common = m[4].trim();
    else if (m[2]) style.band[m[2].toLowerCase()] = m[4].trim();
    else if (m[3]) style.kind[m[3].toLowerCase()] = m[4].trim();
  }
  return style;
}

export function composePrompt(item: AssetItem, style: Style): string {
  const band = style.band[item.band];
  const kind = style.kind[item.kind];
  if (!style.common || !band || !kind) throw new Error(`${item.id}: hiányzó stílusleírás (${item.band}/${item.kind}).`);
  return [item.prompt, kind, band, style.common].join(" ");
}

/** A Seedream 5.0 Pro képkérése (POST /api/v1/images); a kulcs nem része a törzsnek. */
export function buildImageRequest(model: string, item: AssetItem, style: Style, references: string[]) {
  return {
    model, prompt: composePrompt(item, style), aspect_ratio: item.aspect_ratio, resolution: "2K", n: 1,
    ...(references.length ? { input_references: references.map(url => ({ type: "image_url", image_url: { url } })) } : {}),
  };
}

/** Az OpenRouter-ár (2026-10-17, /endpoints): 2K kép 0,09 USD, referenciakép 0,003 USD. */
export function estimateUsd(images: number, references: number): number {
  return images * 0.09 + references * 0.003;
}

/** Review #273: a fizetős hívások darabkorlátja csak nemnegatív, biztonságos egész lehet; hiányzó érték esetén az alapértelmezés. */
export function parseMax(raw: string | undefined, fallback = 12): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new Error(`Hibás --max érték: ${raw} (nemnegatív egész kell).`);
  const n = Number(raw.trim());
  if (!Number.isSafeInteger(n)) throw new Error(`Hibás --max érték: ${raw}.`);
  return n;
}

export type GenerationRecord = { model: string; promptHash: string };
/**
 * Review #273: a kiválasztott fájl eredete a SAJÁT sikeres generálási naplóbejegyzéséből (log.jsonl), nem az aktuális manifestből —
 * ha a prompt vagy a stílus azóta változott, a katalógus akkor is a kép valódi eredetét rögzíti. Hiányzó bejegyzés: hiba.
 */
export function provenanceFor(logText: string, relFile: string): GenerationRecord {
  const want = relFile.replace(/\\/g, "/");
  for (const line of logText.split(/\r?\n/).reverse()) {
    if (!line.trim()) continue;
    let row: { status?: string; file?: string; model?: string; promptHash?: string };
    try { row = JSON.parse(line); } catch { continue; } // sérült sor: kihagyjuk, a keresés folytatódik
    if (row.status === "ok" && row.file?.replace(/\\/g, "/") === want && row.model && row.promptHash) return { model: row.model, promptHash: row.promptHash };
  }
  throw new Error(`Nincs sikeres generálási naplóbejegyzés ehhez a fájlhoz: ${relFile}`);
}

/** A kulcs és bármely Bearer-token kitakarása szöveges hibából vagy naplóból. */
export function redact(text: string, key: string): string {
  let out = key ? text.split(key).join("[kulcs]") : text;
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [kulcs]").replace(/sk-or-[A-Za-z0-9_-]+/g, "[kulcs]");
  return out;
}
