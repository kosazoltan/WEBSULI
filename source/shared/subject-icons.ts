import type { CatalogSubject } from "./catalog-taxonomy";
import { designThemeForClassroom } from "./lesson-design";
import { subjectKeyOf } from "./subject-key";

/**
 * Websuli tantárgyi ikonkészlet (docs/specs/2026-10-17-websuli-ikonkeszlet.md): minden tanított tantárgy × évfolyamsáv párhoz
 * előre gyártott, jóváhagyott ikon tartozik. Az azonosító: `icon-<tantárgykulcs>-<sáv>`.
 */
export type DesignBand = "explorer" | "adventure" | "studio" | "laboratory" | "future";

/** NAT 2020: a tantárgy mely sávokban tanítható (1–2., 3–5., 6–8., 9–10., 11–12.). */
export const SUBJECT_BANDS: Record<CatalogSubject, DesignBand[]> = {
  matematika: ["explorer", "adventure", "studio", "laboratory", "future"],
  "magyar-nyelvtan": ["explorer", "adventure", "studio", "laboratory", "future"],
  "magyar-irodalom": ["explorer", "adventure", "studio", "laboratory", "future"],
  kornyezetismeret: ["explorer", "adventure"],
  termeszetismeret: ["adventure", "studio"],
  tortenelem: ["adventure", "studio", "laboratory", "future"],
  "tarsadalmi-ismeretek": ["studio", "laboratory", "future"],
  biologia: ["studio", "laboratory", "future"],
  kemia: ["studio", "laboratory", "future"],
  fizika: ["studio", "laboratory", "future"],
  foldrajz: ["studio", "laboratory", "future"],
  angol: ["explorer", "adventure", "studio", "laboratory", "future"],
  nemet: ["adventure", "studio", "laboratory", "future"],
  francia: ["adventure", "studio", "laboratory", "future"],
  informatika: ["adventure", "studio", "laboratory", "future"],
  "enek-zene": ["explorer", "adventure", "studio", "laboratory"],
  "hit-es-erkolcstan": ["explorer", "adventure", "studio", "laboratory", "future"],
  "vizualis-kultura": ["explorer", "adventure", "studio", "laboratory", "future"],
  technika: ["explorer", "adventure", "studio"],
};

/** A sáv ikonja a tantárgy szövegéből; ismeretlen tantárgy vagy a sávban nem tanított tantárgy: null (nincs ikon). */
export function subjectIconIdForBand(subject: string | null | undefined, band: DesignBand): string | null {
  const key = subjectKeyOf(subject);
  // Review #274: csak a mátrix saját kulcsa számít (az örökölt objektumtulajdonság, pl. „constructor”, nem tantárgy).
  if (!key || !Object.hasOwn(SUBJECT_BANDS, key) || !SUBJECT_BANDS[key].includes(band)) return null;
  return `icon-${key}-${band}`;
}

/** A lecke tantárgyából és évfolyamából (0–12) az ikon azonosítója. */
export function subjectIconId(subject: string | null | undefined, classroom: number): string | null {
  return subjectIconIdForBand(subject, designThemeForClassroom(classroom));
}

/** A mátrix összes azonosítója (a katalógus-teljesség teszthez és a gyártáshoz). */
export function allSubjectIconIds(): string[] {
  return (Object.keys(SUBJECT_BANDS) as CatalogSubject[]).flatMap(s => SUBJECT_BANDS[s].map(b => `icon-${s}-${b}`));
}
