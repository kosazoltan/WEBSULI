/**
 * Kanban #101 — a quiz-bank évfolyam-változatának tiszta szabálya (spec: docs/specs/2026-11-17-kerdesbank-karcsusitas.md 10.1).
 * Külön modul, hogy adatbázis nélkül tesztelhető legyen.
 */

/** Kanban #101: az évfolyam-változat alsó küszöbe — ennél kevesebb tételnél bővítünk, végül a teljes bank megy. */
export const MIN_CLASSROOM_ITEMS = 200;
export const MIN_CLASSROOM = 0;
export const MAX_CLASSROOM = 12;
/** A valódi évfolyamok sávja. A 0 külön sáv („Programozási alapismeretek”, `shared/classrooms.ts`), nem évfolyam. */
const FIRST_GRADE = 1;

/**
 * Az évfolyam-változat évfolyamai (determinisztikus, spec 10.1):
 * - a 0. sáv (programozás) önálló: `{0}`, ha legalább `MIN_CLASSROOM_ITEMS` tétel, különben `null`; sosem szomszédja egy évfolyamnak
 *   (review #101 K1: különben az 1. évfolyam változatának 88 %-a programozási tétel lenne);
 * - 1–12. évfolyam: `{N}`, ha legalább `MIN_CLASSROOM_ITEMS`; különben `{N−1, N, N+1}` az 1–12 sávra vágva, ha az legalább annyi;
 *   különben `null` = a teljes bank.
 */
export function pickClassroomSet(n: number, count: (classrooms: readonly number[]) => number): number[] | null {
  const own = [n];
  if (count(own) >= MIN_CLASSROOM_ITEMS) return own;
  if (n < FIRST_GRADE) return null;
  const near = [n - 1, n, n + 1].filter((c) => c >= FIRST_GRADE && c <= MAX_CLASSROOM);
  if (count(near) >= MIN_CLASSROOM_ITEMS) return near;
  return null;
}
