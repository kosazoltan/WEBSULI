/**
 * Spec 2026-11-03-egyseges-kartya-leiras: a főoldali kártya leírása a lecke saját bevezetője (az első fejezet első magyarázó blokkja,
 * jelölés nélkül, egész mondatokra rövidítve) — a publikálás korábbi, minden leckén azonos helyőrzője helyett. DOM-mentes.
 */
export const LESSON_PLACEHOLDER_DESCRIPTION = "Websuli lecke — a lecke-futtató jeleníti meg.";
export const TEASER_MAX = 160;

export function isPlaceholderDescription(description: string | null | undefined): boolean {
  const d = description?.trim();
  return !d || d === LESSON_PLACEHOLDER_DESCRIPTION;
}

/** A tanítószöveg elejéből kártyaleírás: jelölés ki, első bekezdés, egész mondatok ≤ `max`; különben szóhatáron vágva „…”-tal. */
export function teaserFromText(text: unknown, max = TEASER_MAX): string | null {
  if (typeof text !== "string") return null;
  const paragraph = text
    .replace(/^\s*#+\s*/gm, "")
    .replace(/(\*\*|__|`)/g, "")
    .replace(/(^|[\s(])[*_](\S[^*_]*?)[*_](?=[\s).,!?:;]|$)/g, "$1$2")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .find((p) => p.length > 0);
  if (!paragraph) return null;
  if (paragraph.length <= max) return paragraph;
  // Review #383: mondathatár csak szóköz vagy szövegvég előtti zárójelnél (a „1.000”, „$3.14$”, „websuli.vip” pontja nem az), a záró
  // idézőjel / zárójel az előző mondaté; a szöveg az EREDETIBŐL szeletelődik (nincs újraösszefűzés, az írásjelek változatlanok).
  let out = "";
  for (const m of paragraph.matchAll(/[.!?…]+["”’»)\]]*(?=\s|$)/g)) {
    const end = m.index! + m[0].length;
    if (end > max) break;
    out = paragraph.slice(0, end);
  }
  if (out) return out;
  const cut = paragraph.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, "")}…`;
}

/**
 * Review #383: a lecke változásakor (javítás alkalmazása) az AUTOMATIKUS leírás — helyőrző, üres vagy pontosan az előző lecke
 * bevezetője — az új lecke bevezetőjére frissül; a kézzel írt leírásnál `undefined` (érintetlen).
 */
export function descriptionAfterLessonChange(description: string | null | undefined, previousLesson: unknown, nextLesson: unknown): string | undefined {
  const automatic = isPlaceholderDescription(description) || description === lessonTeaser(previousLesson);
  return automatic ? lessonTeaser(nextLesson) ?? LESSON_PLACEHOLDER_DESCRIPTION : undefined;
}

/** A lecke első fejezetének első magyarázó blokkja (ennek hiányában az első szöveges blokk) → kártyaleírás. */
export function lessonTeaser(json: unknown): string | null {
  const sections = (json as { sections?: Array<{ blocks?: Array<{ kind?: unknown; text?: unknown }> }> } | null)?.sections;
  const blocks = Array.isArray(sections) && Array.isArray(sections[0]?.blocks) ? sections[0].blocks! : [];
  const block = blocks.find((b) => b?.kind === "explain" && typeof b.text === "string") ?? blocks.find((b) => typeof b?.text === "string");
  return teaserFromText(block?.text);
}
