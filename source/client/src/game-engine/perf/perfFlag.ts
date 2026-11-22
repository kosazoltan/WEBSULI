/**
 * A `?perf=1` kapcsoló — külön, apró modul, hogy a játék darabja paraméter nélkül se töltse le a panel statisztikai kódját
 * (review #504 L2; terv: docs/specs/2026-11-17-kockavadasz-telefon.md, 6. szakasz, E-2).
 */
export function perfEnabledFrom(search: string): boolean {
  try {
    return new URLSearchParams(search).get("perf") === "1";
  } catch {
    return false;
  }
}
