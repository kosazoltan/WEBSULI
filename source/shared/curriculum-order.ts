import { schoolYearPosition } from "./school-calendar";

/**
 * Tananyaglista a NAT 2020 tanítási menetrendje szerint (docs/specs/2026-10-17-tanmenet-rendezes.md) — tiszta modul.
 * A szerver anyagonként tanévbeli pozíciót ad (0–1); a lista a mai naphoz legközelebbit teszi előre. A már tanult témák
 * távolsága 1,5-szörös súlyú: előbb a következő hetek, aztán az ismétlés. A tanmenethez nem illeszthető anyag hátul, a régi
 * sorrendben (legújabb elöl).
 */
export type CurriculumHint = { pos: number; label: string } | null | undefined;
type Sortable = { createdAt?: string | Date | null; curriculum?: CurriculumHint };

/** Kb. ±2 tanítási hét (36 hetes tanév). */
export const NOW_WINDOW = 2 / 36;
const PAST_WEIGHT = 1.5;

export const todayPosition = (now: Date = new Date()) => schoolYearPosition(now);

export function curriculumDistance(pos: number, today: number): number {
  const d = pos - today;
  return d >= 0 ? d : -d * PAST_WEIGHT;
}

export const isCurrent = (hint: CurriculumHint, today: number) => !!hint && Math.abs(hint.pos - today) <= NOW_WINDOW;

const created = (f: Sortable) => (f.createdAt ? new Date(f.createdAt).getTime() : 0);

export function curriculumSort<T extends Sortable>(files: readonly T[], today: number): T[] {
  return [...files].sort((a, b) => {
    const ha = a.curriculum, hb = b.curriculum;
    if (ha && hb) return curriculumDistance(ha.pos, today) - curriculumDistance(hb.pos, today) || created(b) - created(a);
    if (ha) return -1;
    if (hb) return 1;
    return created(b) - created(a);
  });
}
