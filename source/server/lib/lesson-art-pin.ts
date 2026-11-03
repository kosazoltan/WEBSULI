import { repairHash } from "./canonical-hash";

/**
 * Az `art.picture`-csere közös ellenőrzése (docs/specs/2026-11-03-leckeborito.md, -auto.md): a kézi cserét végző szkript és az
 * automatikus leckeborító ugyanezzel igazolja, hogy a lecke `json`-jának az `art` mezőn kívüli része nem változott.
 */
/** Az Antigoné-lecke anyaga — a szülő munkamenet állítja helyre a hivatalos apply-úton; a borítócsere nem nyúlhat hozzá. */
export const SKIPPED_FILES: ReadonlySet<string> = new Set(["7900a871-5788-4df1-95d7-77a646a9ffd6"]);

/** A `json` kanonikus hash-e az `art` mező nélkül. */
export function hashWithoutArt(json: Record<string, unknown>): string {
  const { art: _art, ...rest } = json;
  return repairHash(rest);
}

export type ArtPin = { id: string; art: Record<string, unknown> | null; to: string; hash: string };
/** Az új `art`: a régi mezői változatlanul, csak a `picture` cserélődik. */
export const pinnedArt = (p: Pick<ArtPin, "art" | "to">) => ({ ...(p.art ?? {}), picture: p.to });

/**
 * A csere utáni sor ellenőrzése: az `art` nélküli hash egyezik, az `art.picture` a cél, az `art` többi mezője a régi.
 * Eltérésnél hibát dob (a hívó tranzakciója visszagördül).
 */
export function verifyPinned(p: ArtPin, after: Record<string, unknown>): void {
  if (hashWithoutArt(after) !== p.hash) throw new Error(`a lecke art-on kívüli tartalma eltér: ${p.id} — semmi sem íródott`);
  if (repairHash(after.art) !== repairHash(pinnedArt(p))) throw new Error(`a lecke art mezője nem a várt: ${p.id} — semmi sem íródott`);
}
