import { z } from "zod";

/**
 * Websuli képkészlet katalógusa (shared/design-assets.json) — MI-generált, kurált saját képek a szabályterv 2.3 szerint
 * (docs/specs/2026-10-17-websuli-kepkeszlet.md). Külső vagy ismeretlen forrású kép nem kerülhet bele.
 */
export const DESIGN_ASSET_BANDS = ["explorer", "adventure", "studio", "laboratory", "future"] as const;
export const designAssetSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{3,64}$/),
  kind: z.enum(["mascot", "hero", "icon", "cover"]),
  band: z.enum(DESIGN_ASSET_BANDS),
  subjects: z.array(z.string()),
  keywords: z.array(z.string()),
  alt: z.string().min(8),
  src: z.string().regex(/^\/design\/[a-z]+\/[a-z0-9-]+\.webp$/),
  origin: z.string().startsWith("MI-generált, saját"),
  model: z.string(),
  promptHash: z.string().regex(/^[a-f0-9]{16}$/),
  approvedAt: z.string(),
}).strict();
export type DesignAsset = z.infer<typeof designAssetSchema>;
