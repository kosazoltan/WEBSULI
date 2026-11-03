import { repairHash } from "../../server/lib/canonical-hash";
import { designThemeForClassroom } from "../../shared/lesson-design";
import { lessonCoverId } from "../../shared/lesson-cover";

/**
 * A kézi leckeborító-csere tiszta magja (docs/specs/2026-11-03-leckeborito.md): melyik lecke `art.picture`-je mire változik, és a
 * csere után a `json` minden más része változatlan-e (`art` nélküli kanonikus hash).
 */
/** Az Antigoné-lecke anyaga — a szülő munkamenet állítja helyre a hivatalos apply-úton; a csere nem nyúlhat hozzá. */
export const SKIPPED_FILES: ReadonlySet<string> = new Set(["7900a871-5788-4df1-95d7-77a646a9ffd6"]);

export type PinRow = { id: string; html_file_id: string | null; json: Record<string, unknown> };
export type PinPlan = { id: string; title: string; from: string | null; to: string; art: Record<string, unknown> | null; hash: string };

/** A `json` kanonikus hash-e az `art` mező nélkül. */
export function hashWithoutArt(json: Record<string, unknown>): string {
  const { art: _art, ...rest } = json;
  return repairHash(rest);
}

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

/** Az új `art`: a régi mezői változatlanul, csak a `picture` cserélődik. */
export const pinnedArt = (p: Pick<PinPlan, "art" | "to">) => ({ ...(p.art ?? {}), picture: p.to });

/**
 * A csere utáni sor ellenőrzése: az `art` nélküli hash egyezik, az `art.picture` a cél, az `art` többi mezője a régi.
 * Eltérésnél hibát dob (a hívó tranzakciója visszagördül).
 */
export function verifyPinned(p: PinPlan, after: Record<string, unknown>): void {
  if (hashWithoutArt(after) !== p.hash) throw new Error(`a lecke art-on kívüli tartalma eltér: ${p.id} — semmi sem íródott`);
  if (repairHash(after.art) !== repairHash(pinnedArt(p))) throw new Error(`a lecke art mezője nem a várt: ${p.id} — semmi sem íródott`);
}
