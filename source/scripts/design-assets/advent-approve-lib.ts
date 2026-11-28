/**
 * Adventi naptár — a kiválasztott képek beépítésének tiszta lépései (docs/specs/2026-11-18-adventi-naptar.md 13.3, 13.6, 14.5;
 * A40, A41). Hálózat és böngésző nélkül tesztelhető: a kiválasztás ellenőrzése, a tartalom-hashes fájlnév, a bájtcélhoz illő
 * minőség kiválasztása és a jegyzék (`shared/advent/art-manifest.ts`) forrásszövege.
 */
import { createHash } from "node:crypto";

export type ArtSpecLike = { width: number; height: number; maxBytes: number };

/** A tulajdonos válogatása: képhely-azonosító → a jelölt fájl a `design-assets/candidates/advent/` alatt. */
export type AdventSelection = Record<string, string>;

export type SelectionCheck = { errors: string[]; missing: string[] };

/**
 * A kiválasztás ellenőrzése, MIELŐTT bármi íródna: ismeretlen azonosító, a jelöltmappából kilépő vagy nem létező fájl, nem
 * támogatott kiterjesztés → hiba. A ki nem választott képhely nem hiba (a felület ott helyőrzőt mutat), de listázzuk.
 */
export function checkSelection(selection: unknown, specIds: readonly string[], exists: (rel: string) => boolean): SelectionCheck {
  const errors: string[] = [];
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) return { errors: ["a kiválasztás nem objektum (azonosító → fájl)"], missing: [...specIds] };
  const known = new Set(specIds);
  const entries = Object.entries(selection as Record<string, unknown>);
  for (const [id, rel] of entries) {
    if (!known.has(id)) { errors.push(`ismeretlen képhely: ${id}`); continue; }
    if (typeof rel !== "string" || !rel.trim()) { errors.push(`${id}: hiányzó fájlnév`); continue; }
    const normalized = rel.replace(/\\/g, "/");
    if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized) || normalized.split("/").includes("..")) { errors.push(`${id}: a fájl a jelöltmappán kívülre mutat`); continue; }
    if (!/\.(jpe?g|png|webp)$/i.test(normalized)) { errors.push(`${id}: nem támogatott képformátum (${normalized})`); continue; }
    if (!exists(normalized)) errors.push(`${id}: a jelölt nem található (${normalized})`);
  }
  const chosen = new Set(entries.map(([id]) => id));
  return { errors, missing: specIds.filter((id) => !chosen.has(id)) };
}

/** Tartalom-hashes fájlnév: új kép = új név, ezért a kiszolgálás `immutable` lehet. */
export function artFileName(id: string, bytes: Uint8Array): string {
  return `${id}.${createHash("sha256").update(bytes).digest("hex").slice(0, 10)}.webp`;
}

/** A kipróbált WebP-minőségek, a legjobbtól lefelé. */
export const QUALITY_STEPS: readonly number[] = [0.86, 0.8, 0.74, 0.68, 0.62, 0.56, 0.5];

/**
 * A legjobb minőség, amely még belefér a bájtcélba. `encode(q)` a kész WebP bájtjait adja; ha a legalsó lépés sem fér bele,
 * `null` — ilyenkor a futás megáll (a kép túl részletes a kerethez: másik jelölt vagy tulajdonosi döntés kell).
 */
export async function fitToBudget(encode: (quality: number) => Promise<Uint8Array>, maxBytes: number, steps: readonly number[] = QUALITY_STEPS): Promise<{ bytes: Uint8Array; quality: number } | null> {
  for (const quality of steps) {
    const bytes = await encode(quality);
    if (bytes.byteLength <= maxBytes) return { bytes, quality };
  }
  return null;
}

/** A jegyzék forrásszövege: a meglévő bejegyzések megmaradnak, a most jóváhagyottak felülírják a sajátjukat; rendezve. */
export function renderArtManifest(existing: Readonly<Record<string, string>>, approved: Readonly<Record<string, string>>): string {
  const merged = { ...existing, ...approved };
  const lines = Object.keys(merged).sort().map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(merged[id])},`);
  return [
    "/**",
    " * Adventi naptár — a KÉSZ képek jegyzéke: azonosító → fájlnév a `client/public/advent/2026/` alatt (tartalom-hash a névben).",
    " * GENERÁLT FÁJL — a tulajdonos válogatása után a `scripts/design-assets/approve-advent.ts` írja (S3c). Ami nincs benne,",
    " * ott a felület azonos méretű helyőrzőt mutat.",
    " */",
    'export const ADVENT_ART_BASE = "/advent/2026/";',
    lines.length ? `export const ADVENT_ART: Readonly<Record<string, string>> = {\n${lines.join("\n")}\n};` : "export const ADVENT_ART: Readonly<Record<string, string>> = {};",
    "",
  ].join("\n");
}

/** Az összesített bájtméret ellenőrzése (terv 13.3). */
export function totalWithin(sizes: Readonly<Record<string, number>>, maxTotal: number): { total: number; ok: boolean } {
  const total = Object.values(sizes).reduce((sum, n) => sum + n, 0);
  return { total, ok: total <= maxTotal };
}
