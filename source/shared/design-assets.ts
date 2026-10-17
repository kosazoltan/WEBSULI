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

/** Ékezettűrő, kisbetűs összevetési alak (a „Természetismeret” és a „termeszet” egyezik). */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export type LessonArt = { cover?: DesignAsset; hero?: DesignAsset; mascot?: DesignAsset; subjectIcon?: DesignAsset };

/**
 * Websuli lecke-hős (docs/specs/2026-10-17-websuli-lecke-hos.md): a katalógusból választ, tiszta függvény.
 * - borító: a lecke tárgyára VAGY címére illeszkedő kulcsszó/tárgy (a kulcsszó-találat erősebb, mint a puszta tárgyegyezés);
 * - hős: a sáv hős-képe; kabala: csak 1–5. évfolyamon (explorer → integető, adventure → felfedező, ha jóváhagyott);
 * - tárgyikon: 1–5. évfolyamon a `-young` változat, egyébként a másik.
 */
export function pickLessonArt(lesson: { subject: string; title: string }, band: (typeof DESIGN_ASSET_BANDS)[number], catalog: readonly DesignAsset[]): LessonArt {
  const subject = foldText(lesson.subject);
  const title = foldText(lesson.title);
  const young = band === "explorer" || band === "adventure";
  const subjectHit = (a: DesignAsset) => a.subjects.some(s => { const f = foldText(s); return f.length >= 4 && (subject.includes(f) || f.includes(subject.slice(0, Math.max(4, Math.min(subject.length, 8))))); });
  const keywordHit = (a: DesignAsset) => a.keywords.some(k => { const f = foldText(k); return f.length >= 4 && title.includes(f); });
  const covers = catalog.filter(a => a.kind === "cover");
  const cover = covers.find(a => keywordHit(a) && subjectHit(a)) ?? covers.find(keywordHit);
  const hero = catalog.find(a => a.kind === "hero" && a.band === band);
  const mascot = young ? catalog.find(a => a.kind === "mascot" && a.id === (band === "adventure" ? "mascot-explorer" : "mascot-hello")) ?? catalog.find(a => a.kind === "mascot" && a.id === "mascot-hello") : undefined;
  const icons = catalog.filter(a => a.kind === "icon" && subjectHit(a));
  const subjectIcon = icons.find(a => a.id.endsWith("-young") === young) ?? icons[0];
  return { ...(cover ? { cover } : {}), ...(hero ? { hero } : {}), ...(mascot ? { mascot } : {}), ...(subjectIcon ? { subjectIcon } : {}) };
}
