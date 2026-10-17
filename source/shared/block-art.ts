import type { DesignAsset } from "./design-assets";
import type { DesignBand } from "./subject-icons";

/**
 * Arculati bank S2–S3 (docs/specs/2026-10-17-arculati-bank-s2-vegrehajtas.md): blokkjelző, fejezetdísz és blokktípusonkénti
 * kabalapóz — tiszta függvények a jóváhagyott katalógusból. Nem található elem: `undefined` (a hívó a régi megjelenést tartja).
 */
export const BLOCK_ART_KINDS = ["explain", "example", "try", "check", "recap", "animate"] as const;
export type BlockArtKind = (typeof BLOCK_ART_KINDS)[number];
const YOUNG = new Set<DesignBand>(["explorer", "adventure"]);
const isKind = (k: string): k is BlockArtKind => (BLOCK_ART_KINDS as readonly string[]).includes(k);
const find = (catalog: readonly DesignAsset[], id: string, kind: DesignAsset["kind"]) => catalog.find(a => a.id === id && a.kind === kind);

export const blockMarker = (kind: string, band: DesignBand, catalog: readonly DesignAsset[]) => (isKind(kind) ? find(catalog, `marker-${kind}-${band}`, "marker") : undefined);
/** Két dísz sávonként, a fejezetek váltakozva kapják (1., 2., 1., …). */
export const sectionDivider = (band: DesignBand, sectionIndex: number, catalog: readonly DesignAsset[]) => find(catalog, `divider-${band}-${(Math.abs(sectionIndex) % 2) + 1}`, "divider");
/** Csak 1–5. évfolyam (a 6–12. sávban nincs kabala — tulajdonosi döntés). */
export const blockMascot = (kind: string, band: DesignBand, catalog: readonly DesignAsset[]) => (YOUNG.has(band) && isKind(kind) ? find(catalog, `mascot-${kind}`, "mascot") : undefined);
