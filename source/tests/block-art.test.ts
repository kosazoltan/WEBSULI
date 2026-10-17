import { test } from "node:test";
import assert from "node:assert/strict";
import { blockMarker, blockMascot, sectionDivider } from "../shared/block-art";
import type { DesignAsset } from "../shared/design-assets";

// Arculati bank S2–S3 (docs/specs/2026-10-17-arculati-bank-s2-vegrehajtas.md): a választó tiszta függvények.
const a = (id: string, kind: DesignAsset["kind"], band: DesignAsset["band"]): DesignAsset => ({ id, kind, band, subjects: [], keywords: [], alt: "Próba elem leírása.", src: `/design/${band}/${id}.webp`, origin: "MI-generált, saját (Seedream 5.0 Pro)", model: "m", promptHash: "0123456789abcdef", approvedAt: "2026-10-17T00:00:00.000Z" });
const C = [a("marker-explain-studio", "marker", "studio"), a("divider-studio-1", "divider", "studio"), a("divider-studio-2", "divider", "studio"), a("mascot-check", "mascot", "explorer")];

test("blokkjelző a blokktípus és a sáv szerint; ismeretlen típus vagy hiányzó elem: nincs", () => {
  assert.equal(blockMarker("explain", "studio", C)?.id, "marker-explain-studio");
  assert.equal(blockMarker("explain", "future", C), undefined);
  assert.equal(blockMarker("constructor", "studio", C), undefined);
});

test("fejezetdísz váltakozva; kabalapóz csak 1–5. évfolyamon", () => {
  assert.deepEqual([0, 1, 2, 3].map(i => sectionDivider("studio", i, C)?.id), ["divider-studio-1", "divider-studio-2", "divider-studio-1", "divider-studio-2"]);
  assert.equal(blockMascot("check", "adventure", C)?.id, "mascot-check");
  assert.equal(blockMascot("check", "studio", C), undefined, "6–12.: nincs kabala");
  assert.equal(blockMascot("toString", "explorer", C), undefined);
});

test("lefedettség: 6 × 5 blokkjelző, sávonként 2 fejezetdísz és 6 kabalapóz jóváhagyva, létező fájllal", async () => {
  const { existsSync } = await import("node:fs");
  const { DESIGN_ASSET_CATALOG } = await import("../shared/design-asset-catalog");
  const { BLOCK_ART_KINDS } = await import("../shared/block-art");
  const bands = ["explorer", "adventure", "studio", "laboratory", "future"] as const;
  const ids = [...BLOCK_ART_KINDS.flatMap(k => bands.map(b => `marker-${k}-${b}`)), ...bands.flatMap(b => [`divider-${b}-1`, `divider-${b}-2`]), ...BLOCK_ART_KINDS.map(k => `mascot-${k}`)];
  assert.equal(ids.length, 46);
  for (const id of ids) {
    const asset = DESIGN_ASSET_CATALOG.find(x => x.id === id);
    assert.ok(asset, `jóváhagyva: ${id}`);
    assert.ok(existsSync(new URL(`../client/public${asset.src}`, import.meta.url)), `${id}: fájl`);
  }
});
