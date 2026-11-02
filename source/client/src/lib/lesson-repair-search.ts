/**
 * Tananyagjavító — választható anyagok és keresés (docs/specs/2026-10-19-javito-valaszto-mobil.md).
 * A régi HTML-tananyag is javítható (a szerver `html` módban javítja); a PDF nem.
 */
export type RepairableFile = { title?: string; contentType?: string; classroom?: number | null };

export function isRepairable(contentType: string | undefined): boolean {
  return contentType === undefined || contentType === "lesson" || contentType === "html" || contentType === "text/html";
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Kis szinonimaszótár: a régi címek gyakran angolul nevezik meg a tárgyat. Csoportonként kétirányú (review #318). */
const SYNONYM_GROUPS = [["angol", "english"], ["nemet", "german", "deutsch"], ["matek", "matematika", "math"]];
/** `Map`, nem objektum-literál: az örökölt kulcs („constructor”) ne adjon vissza függvényt (review #318). */
const SYNONYMS = new Map<string, string[]>(SYNONYM_GROUPS.flatMap((g) => g.map((w) => [w, g] as [string, string[]])));

/** „osztályos”, „osztálynak”, „osztály” → az évfolyam jelölése. */
const isGradeWord = (w: string) => /^osztaly/.test(w);

export function matchesRepairQuery(file: RepairableFile, query: string): boolean {
  const words = fold(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return true;
  const title = fold(file.title ?? "");
  const grade = typeof file.classroom === "number" ? file.classroom : null;
  const haystack = `${title} ${grade !== null ? `${grade}. osztaly` : ""}`;
  return words.every((w) => {
    if (/^\d+$/.test(w)) {
      return grade === Number(w) || new RegExp(`(^|\\D)${w}(\\D|$)`).test(title);
    }
    if (isGradeWord(w)) return grade !== null || title.includes("osztaly");
    // Szókezdetre illik: a „barangolás” ne találja az „angol”-t.
    return (SYNONYMS.get(w) ?? [w]).some((s) => haystack.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(s)));
  });
}
