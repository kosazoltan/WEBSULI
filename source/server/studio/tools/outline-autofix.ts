import { OUTLINE_MAX_SECTIONS } from "../step-io";

/**
 * Eszköz (2026-09-19): a tervkészítő vázlatának determinisztikus tisztítása a séma- és
 * fedettség-ellenőrzés ELŐTT, hogy formai hiba ne indítson új Opus-hívást.
 * Csak elhagy, egyértelműsít és összevon; fogalmat vagy fejezetet nem talál ki.
 */

export type OutlineAutofixResult = { outline: unknown; fixes: string[] };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const key = (s: string) => s.normalize("NFC").trim().toLocaleLowerCase("hu");

export function autofixOutline(raw: unknown, concepts: ReadonlyArray<{ localId: string }>, maxSections = OUTLINE_MAX_SECTIONS): OutlineAutofixResult {
  if (!isObj(raw) || !Array.isArray(raw.sections)) return { outline: raw, fixes: [] };
  const known = new Set(concepts.map(c => c.localId));
  const fixes: string[] = [];
  const outline = structuredClone(raw);
  const sections: Obj[] = [];
  for (const [i, section] of (outline.sections as unknown[]).entries()) {
    if (!isObj(section)) continue;
    if (isStrArr(section.conceptIds)) {
      const kept = [...new Set(section.conceptIds.filter(id => known.has(id)))];
      if (kept.length !== section.conceptIds.length) {
        if (!kept.length) { fixes.push(`fejezet ${i + 1}: csak ismeretlen fogalom, elhagyva`); continue; }
        fixes.push(`fejezet ${i + 1}: ismeretlen/ismétlődő fogalom-azonosító elhagyva`);
        section.conceptIds = kept;
      }
    }
    if (isStrArr(section.animationSuggestions)) {
      const original = section.animationSuggestions;
      const clipped = original.map(s => s.trim()).filter(Boolean).map(s => (s.length > 120 ? s.slice(0, 117).trimEnd() + "…" : s));
      if (clipped.length !== original.length || clipped.some((s, n) => s !== original[n])) {
        section.animationSuggestions = clipped; fixes.push(`fejezet ${i + 1}: ábra-javaslat rövidítve`);
      }
    }
    sections.push(section);
  }
  const headings = new Map<string, number>();
  for (const [i, section] of sections.entries()) {
    if (typeof section.heading !== "string") continue;
    const k = key(section.heading);
    const n = headings.get(k) ?? 0;
    headings.set(k, n + 1);
    if (n > 0) { section.heading = `${section.heading.trim()} (${n + 1})`; fixes.push(`fejezet ${i + 1}: ismétlődő cím egyértelműsítve`); }
  }
  if (sections.length > maxSections) {
    const last = sections[maxSections - 1];
    for (const extra of sections.slice(maxSections)) {
      last.conceptIds = [...new Set([...(isStrArr(last.conceptIds) ? last.conceptIds : []), ...(isStrArr(extra.conceptIds) ? extra.conceptIds : [])])];
      last.plannedBlocks = [...(isStrArr(last.plannedBlocks) ? last.plannedBlocks : []), ...(isStrArr(extra.plannedBlocks) ? extra.plannedBlocks : [])];
      last.animationSuggestions = [...(isStrArr(last.animationSuggestions) ? last.animationSuggestions : []), ...(isStrArr(extra.animationSuggestions) ? extra.animationSuggestions : [])].slice(0, 4);
    }
    fixes.push(`${sections.length - maxSections} fejezet a(z) ${maxSections}. fejezetbe olvasztva`);
    sections.length = maxSections;
  }
  outline.sections = sections;
  if (Array.isArray(outline.misconceptions)) {
    const kept = (outline.misconceptions as unknown[]).filter(m => isObj(m) && typeof m.conceptId === "string" && known.has(m.conceptId));
    if (kept.length !== outline.misconceptions.length) { fixes.push("tévhit ismeretlen fogalommal elhagyva"); outline.misconceptions = kept; }
  }
  return { outline, fixes };
}
