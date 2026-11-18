/** Websuli képkészlet — tiszta, tesztelhető segédfüggvények (docs/specs/2026-10-17-websuli-kepkeszlet.md). */
export type AssetKind = "mascot" | "hero" | "icon" | "cover" | "background" | "door" | "ornament";
export type AssetBand = "explorer" | "adventure" | "studio" | "laboratory" | "future" | "advent";
export type AssetItem = {
  id: string; kind: AssetKind; band: AssetBand; subjects: string[]; keywords: string[]; alt: string;
  aspect_ratio: string; prompt: string; references?: string[]; trial?: boolean;
  /** Külön készletnél (`--set`): hány jelölt készüljön a tételből (alap: 1), és milyen felbontásban (alap: a `--resolution`). */
  candidates?: number; resolution?: "1K" | "2K";
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
export type Resolution = "1K" | "2K";
export function buildImageRequest(model: string, item: AssetItem, style: Style, references: string[], resolution: Resolution = "2K") {
  return {
    model, prompt: composePrompt(item, style), aspect_ratio: item.aspect_ratio, resolution, n: 1,
    ...(references.length ? { input_references: references.map(url => ({ type: "image_url", image_url: { url } })) } : {}),
  };
}

/** Az OpenRouter-ár (2026-10-17, /endpoints): 2K kép 0,09 USD, 1K kép 0,045 USD, referenciakép 0,003 USD. */
export function estimateUsd(images: number, references: number, resolution: Resolution = "2K"): number {
  return images * (resolution === "1K" ? 0.045 : 0.09) + references * 0.003;
}

/** Külön készlet neve (`--set advent` → design-assets/advent/): csak kisbetű, szám, kötőjel — útvonal nem lehet. */
export function parseSetName(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(raw) || raw === "candidates") throw new Error(`Hibás --set érték: ${raw}.`);
  return raw;
}

/** A `--max-usd` költségplafon: pozitív szám; hiányzó érték: nincs plafon. */
export function parseMaxUsd(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (!/^\d+(\.\d+)?$/.test(raw.trim()) || !(Number(raw) > 0)) throw new Error(`Hibás --max-usd érték: ${raw} (pozitív szám kell).`);
  return Number(raw);
}

export type ImageJob = { item: AssetItem; resolution: Resolution; estUsd: number };
export type JobPlan = { jobs: ImageJob[]; totalUsd: number; requested: number; cutBy: "max" | "max-usd" | null };

/**
 * A futás képenkénti terve (spec 2026-11-18-adventi-naptar 13.6): tételenként `candidates` kép, a tétel saját felbontásával;
 * a `max` a KÉPEK számát korlátozza, a `maxUsd` kemény plafon — az a kép, amellyel a becsült összeg túllépné, már nem kerül a
 * tervbe (és utána egy sem). Tiszta függvény: a száraz futás és az éles futás ugyanebből dolgozik.
 */
export function planJobs(items: readonly AssetItem[], opts: { resolution: Resolution; max: number; maxUsd: number | null }): JobPlan {
  const all: ImageJob[] = items.flatMap(item => {
    const resolution = item.resolution ?? opts.resolution;
    const estUsd = estimateUsd(1, item.references?.length ?? 0, resolution);
    const count = Number.isSafeInteger(item.candidates) && (item.candidates as number) > 0 ? (item.candidates as number) : 1;
    return Array.from({ length: count }, () => ({ item, resolution, estUsd }));
  });
  const jobs: ImageJob[] = [];
  let totalUsd = 0;
  let cutBy: JobPlan["cutBy"] = null;
  for (const job of all) {
    if (jobs.length >= opts.max) { cutBy = "max"; break; }
    if (opts.maxUsd !== null && totalUsd + job.estUsd > opts.maxUsd + 1e-9) { cutBy = "max-usd"; break; }
    jobs.push(job);
    totalUsd += job.estUsd;
  }
  return { jobs, totalUsd, requested: all.length, cutBy };
}

/** Spec 2026-11-03-leckeborito: a `--resolution` kapcsoló (1K a 1200 px-es borítóhoz elég); hiányzó érték: 2K. */
export function parseResolution(raw: string | undefined): Resolution {
  if (raw === undefined) return "2K";
  if (raw !== "1K" && raw !== "2K") throw new Error(`Hibás --resolution érték: ${raw} (1K vagy 2K).`);
  return raw;
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
