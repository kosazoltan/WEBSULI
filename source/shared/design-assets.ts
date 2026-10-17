import { z } from "zod";
import { subjectIconIdForBand } from "./subject-icons";

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

/** FNV-1a 32 bites lenyomat: determinisztikus, böngészőben és Node-ban azonos. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** A készlet egy eleme a lenyomat alapján; a „só” miatt a borító, a kabala és az ikon választása egymástól független. */
function rotate<T>(pool: readonly T[], seed: string, salt: string): T | undefined {
  return pool.length ? pool[fnv1a(`${salt}:${seed}`) % pool.length] : undefined;
}
const YOUNG_BANDS = new Set(["explorer", "adventure"]);
const BAND_SUFFIX = new RegExp(`-(${DESIGN_ASSET_BANDS.join("|")})$`);

/**
 * Websuli lecke-hős (docs/specs/2026-10-17-websuli-lecke-hos.md, a „változatos képválasztás” kiegészítéssel): tiszta függvény.
 * - Ugyanaz a lecke (seed: azonosító, ennek hiányában a cím) mindig ugyanazt kapja; a leckék között a képek rotálnak.
 * - A fiatal (1–5.) és az idősebb (6–12.) sávok képei nem keverednek — kivéve a kulcsszavas borítót, ha csak a másik korosztályban van.
 * - Kép: kulcsszavas borító(k) közül; különben a sáv hős-képe (kétszeres súllyal), a korosztály többi sávhőse és az azonos
 *   korosztályú, azonos tárgyú borítók közül.
 * - Kabala csak 1–5.: a pózok közül rotál (a 3–5. sávban a felfedező pózzal együtt). Tárgyikon: a korosztálynak megfelelő változat.
 */
export function pickLessonArt(lesson: { subject: string; title: string; seed?: string }, band: (typeof DESIGN_ASSET_BANDS)[number], catalog: readonly DesignAsset[]): LessonArt {
  const subject = foldText(lesson.subject);
  const title = foldText(lesson.title);
  const seed = lesson.seed || lesson.title;
  const young = YOUNG_BANDS.has(band);
  const sameAge = (a: DesignAsset) => YOUNG_BANDS.has(a.band) === young;
  const subjectHit = (a: DesignAsset) => a.subjects.some(s => { const f = foldText(s); return f.length >= 4 && (subject.includes(f) || f.includes(subject.slice(0, Math.max(4, Math.min(subject.length, 8))))); });
  const keywordHit = (a: DesignAsset) => a.keywords.some(k => { const f = foldText(k); return f.length >= 4 && title.includes(f); });
  const covers = catalog.filter(a => a.kind === "cover");
  // Review #273: a kulcsszavas borítóhoz a tantárgynak is egyeznie kell (a „Sejtések” matematika-lecke ne kapjon sejt-borítót).
  const keyed = covers.filter(a => keywordHit(a) && subjectHit(a));
  const keyedPool = keyed.filter(sameAge).length ? keyed.filter(sameAge) : keyed;
  let cover: DesignAsset | undefined;
  let hero: DesignAsset | undefined;
  if (keyedPool.length) cover = rotate(keyedPool, seed, "cover");
  else {
    // A sáv saját hős-képe kétszeres súllyal; mellette az azonos korosztály többi sávhőse és az azonos tárgyú borítók.
    const heroes = catalog.filter(a => a.kind === "hero" && sameAge(a));
    const own = heroes.filter(a => a.band === band);
    const pool = [...own, ...own, ...heroes.filter(a => a.band !== band), ...covers.filter(a => sameAge(a) && subjectHit(a))];
    const chosen = rotate(pool, seed, "art");
    if (chosen?.kind === "cover") cover = chosen; else hero = chosen;
  }
  const mascots = catalog.filter(a => a.kind === "mascot" && (band === "explorer" ? a.band === "explorer" : YOUNG_BANDS.has(a.band)));
  // Ha a választott kép maga is a kabalát mutatja („kabala” kulcsszó), a portré nem ismétli meg.
  const picture = cover ?? hero;
  const mascot = young && !picture?.keywords.includes("kabala") ? rotate(mascots, seed, "mascot") : undefined;
  // Ikonkészlet (2026-10-17-websuli-ikonkeszlet): a tantárgy saját sávjának ikonja. Ha az még nincs a katalógusban, a korábbi
  // korosztályos ikonok (sáv-utótag nélküliek) közül választ. Review #273: a másik korosztály ikonja helyett nincs ikon.
  const ownId = subjectIconIdForBand(lesson.subject, band);
  const legacy = catalog.filter(a => a.kind === "icon" && !BAND_SUFFIX.test(a.id) && subjectHit(a));
  const subjectIcon = (ownId ? catalog.find(a => a.id === ownId) : undefined) ?? legacy.find(a => a.id.endsWith("-young") === young);
  return { ...(cover ? { cover } : {}), ...(hero ? { hero } : {}), ...(mascot ? { mascot } : {}), ...(subjectIcon ? { subjectIcon } : {}) };
}

/** A leckébe mentett arculat (docs/specs/2026-10-17-lecke-betoltes.md): csak azonosítók; a választás mentéskor dől el. */
export type StoredLessonArt = { subjectIcon?: string; picture?: string; mascot?: string };
export function lessonArtIds(art: LessonArt): StoredLessonArt {
  const picture = art.cover ?? art.hero;
  return { ...(art.subjectIcon ? { subjectIcon: art.subjectIcon.id } : {}), ...(picture ? { picture: picture.id } : {}), ...(art.mascot ? { mascot: art.mascot.id } : {}) };
}

/**
 * A tárolt azonosítókból a lejátszó arculata — újraszámolás nélkül. Csak a lecke mostani sávjának megfelelő elem marad
 * (az évfolyam a mentés óta változhatott): az ikon sáv-utótagja egyezik, a kép a korosztályé, kabala csak 1–5. évfolyamon.
 * Ha a tárolt kép nem érvényes, `null`: a hívó a mai számolásra (`pickLessonArt`) vált.
 */
export function resolveStoredArt(stored: StoredLessonArt | undefined, band: (typeof DESIGN_ASSET_BANDS)[number], catalog: readonly DesignAsset[]): LessonArt | null {
  if (!stored?.picture) return null;
  const byId = (id: string | undefined, kind: DesignAsset["kind"][]) => (id ? catalog.find(a => a.id === id && kind.includes(a.kind)) : undefined);
  const young = YOUNG_BANDS.has(band);
  const picture = byId(stored.picture, ["hero", "cover"]);
  // Review #275: a kulcsszavas borító szándékosan lehet a másik korosztályé (a pickLessonArt is ezt választja, ha csak ott van);
  // a sávhős viszont csak a saját korosztályé lehet (a más korosztályú tárolt hős az évfolyam megváltozását jelzi).
  if (!picture || (picture.kind === "hero" && YOUNG_BANDS.has(picture.band) !== young)) return null;
  const mascot = young ? byId(stored.mascot, ["mascot"]) : undefined;
  const icon = byId(stored.subjectIcon, ["icon"]);
  const subjectIcon = icon && (icon.id.endsWith(`-${band}`) || (!BAND_SUFFIX.test(icon.id) && icon.id.endsWith("-young") === young)) ? icon : undefined;
  return { ...(picture.kind === "cover" ? { cover: picture } : { hero: picture }), ...(mascot ? { mascot } : {}), ...(subjectIcon ? { subjectIcon } : {}) };
}
