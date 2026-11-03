import { hashWithoutArt, SKIPPED_FILES } from "../../server/lib/lesson-art-pin";
import { designThemeForClassroom } from "../../shared/lesson-design";
import { lessonCoverId } from "../../shared/lesson-cover";
// A hash-ellenőrzés közös a szerver automatikus leckeborítójával (docs/specs/2026-11-03-leckeborito-auto.md).
export { hashWithoutArt, pinnedArt, SKIPPED_FILES, verifyPinned } from "../../server/lib/lesson-art-pin";

/**
 * A kézi leckeborító-csere tiszta magja (docs/specs/2026-11-03-leckeborito.md): melyik lecke `art.picture`-je mire változik, és a
 * csere után a `json` minden más része változatlan-e (`art` nélküli kanonikus hash).
 */
export type PinRow = { id: string; html_file_id: string | null; json: Record<string, unknown> };
export type PinPlan = { id: string; title: string; from: string | null; to: string; art: Record<string, unknown> | null; hash: string };

/** Azok a leckék, amelyek tartalomkulcsú borítója a katalógusban van és még nem az a képük. */
export function planPins(rows: readonly PinRow[], catalogCoverIds: ReadonlySet<string>, skipFiles: ReadonlySet<string> = SKIPPED_FILES): PinPlan[] {
  const plans: PinPlan[] = [];
  for (const r of rows) {
    const j = r.json;
    if ((r.html_file_id && skipFiles.has(r.html_file_id)) || typeof j.subject !== "string" || typeof j.title !== "string" || typeof j.classroom !== "number") continue;
    const to = lessonCoverId({ subject: j.subject, title: j.title }, designThemeForClassroom(j.classroom));
    if (!catalogCoverIds.has(to)) continue;
    const art = j.art && typeof j.art === "object" && !Array.isArray(j.art) ? (j.art as Record<string, unknown>) : null;
    const from = typeof art?.picture === "string" ? art.picture : null;
    if (from === to) continue;
    plans.push({ id: r.id, title: j.title, from, to, art, hash: hashWithoutArt(j) });
  }
  return plans;
}
