import type { Block, Lesson } from "../../shared/lesson-schema";

/**
 * Spec 2026-10-14-tananyag-tomorseg-lefedettseg (S1): a lecke hossz- és lefedettség-mérése EGY helyen — a mérőszkript, a
 * próbaharness és később a kapu ugyanezt használja. Determinisztikus, modellhívás nélküli, lexikális mérés.
 *
 * Mért alapvonal (43 tárolt lecke, 2026-10-14): a Tananyag lap medián ~2200 látható szó; kis forrásnál 47× a forrás, nagy
 * forrásnál a forrás-szótövek 17%-a jut a tanításba. A mérés korlátja: magyar ragozás miatt 6 betűs szótő-kulcsokkal
 * hasonlít — a „nem forrásbeli” arányba pedagógiai keretszavak is esnek.
 */

/** Átlagos olvasási tempó (szó/perc) az olvasási-idő becsléshez. */
export const READING_WORDS_PER_MINUTE = 120;
/** A szótő-kulcs hossza: a ragozott alakok (pl. „fogalmat”, „fogalmak”) így egy kulcsra esnek. */
export const TERM_KEY_LENGTH = 6;

const STOPWORDS = new Set(
  ("a az és is hogy nem de vagy mint már még csak ez egy ezt azt amely amelyek ami amik akik aki volt van lesz lett lehet " +
    "kell mert ha akkor így úgy után előtt alatt között által szerint miatt nagyon sok több kevés minden mely melyik milyen " +
    "hogyan miért mikor ahol amikor majd pedig valamint illetve vagyis tehát azonban ezért egyik másik ezek azok ennek annak " +
    "ebben abban erre arra ezzel azzal neki nekik őket ők mi ti te én saját").split(/\s+/),
);

export function words(text: string | null | undefined): string[] {
  return String(text ?? "").toLowerCase().match(/[a-záéíóöőúüű0-9]+/g) ?? [];
}

/** Tartalmi szótő-kulcsok: ≥ 6 betűs, nem töltelékszó → az első 6 betű; 3–4 jegyű szám (évszám) egészben. */
export function termKeys(text: string | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const w of words(text)) {
    if (/^\d{3,4}$/.test(w)) { keys.add(w); continue; }
    if (w.length >= TERM_KEY_LENGTH && !STOPWORDS.has(w) && !/^\d/.test(w)) keys.add(w.slice(0, TERM_KEY_LENGTH));
  }
  return keys;
}

/**
 * A blokk diák által LÁTOTT szövege (client/src/lesson-runtime/LessonRuntime.tsx szerint). `afterAnswer`: csak a válasz után
 * megjelenő rész (check-visszajelzés, tipp) — külön mérjük, mert nem része az elolvasandó tananyagnak.
 */
export function blockVisibleText(block: Block, afterAnswer = false): string {
  if (afterAnswer) return block.kind === "check" ? [...block.feedbackPerOption, block.hint ?? ""].filter(Boolean).join("\n") : "";
  switch (block.kind) {
    case "explain": return block.text;
    case "example": return [block.problem, ...block.steps, block.answer].join("\n");
    case "check": return [block.question, ...block.options].join("\n");
    case "recap": return block.bullets.join("\n");
    case "animate": return block.caption;
    default: return "";
  }
}

/** A Tananyag lap látható szövege: fejezetcímek + blokkok (a gyakorlóbank külön lapon van, nem része). */
export function lessonVisibleText(lesson: Pick<Lesson, "sections">, afterAnswer = false): string {
  return lesson.sections
    .flatMap((s) => [afterAnswer ? "" : s.heading, ...s.blocks.map((b) => blockVisibleText(b, afterAnswer))])
    .filter(Boolean)
    .join("\n");
}

export type TermCoverage = { covered: number; total: number; pct: number | null };

/** A forrás tartalmi szótöveiből hány jelenik meg a cél-szövegben. */
export function termCoverage(sourceText: string, targetText: string): TermCoverage {
  const source = termKeys(sourceText);
  const target = termKeys(targetText);
  const covered = [...source].filter((k) => target.has(k)).length;
  return { covered, total: source.size, pct: source.size ? Math.round((100 * covered) / source.size) : null };
}

/** A szöveg szótöveinek hány százaléka NEM fordul elő a forrásban (felfújás / általános tudás jelzője). */
export function nonSourceShare(sourceText: string, text: string): number | null {
  const source = termKeys(sourceText);
  const own = termKeys(text);
  return own.size ? Math.round((100 * [...own].filter((k) => !source.has(k)).length) / own.size) : null;
}

/** A 6 szavas szövegrészletek hány százaléka ismétlődik a szövegen belül. */
export function repetitionShare(text: string): number {
  const w = words(text);
  const counts = new Map<string, number>();
  for (let i = 0; i + 6 <= w.length; i++) {
    const key = w.slice(i, i + 6).join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (!total) return 0;
  const repeated = [...counts.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
  return Math.round((100 * repeated) / total);
}

export type LessonMetrics = {
  sourceWords: number;
  visibleWords: number;
  afterAnswerWords: number;
  readingMinutes: number;
  sections: number;
  blocks: number;
  blocksByKind: Record<string, number>;
  /** forrás-szótövek a fogalomtérképen (kinyerési veszteség). */
  sourceInMapPct: number | null;
  /** forrás-szótövek a Tananyag lapon (a teljes lánc lefedettsége). */
  sourceInLessonPct: number | null;
  nonSourcePct: number | null;
  repetitionPct: number;
};

export function measureLesson(
  lesson: Pick<Lesson, "sections">,
  context: { sourceText: string; concepts: ReadonlyArray<{ term: string; definition?: string | null; quote?: string | null }> },
): LessonMetrics {
  const visible = lessonVisibleText(lesson);
  const visibleWords = words(visible).length;
  const blocksByKind: Record<string, number> = {};
  for (const s of lesson.sections) for (const b of s.blocks) blocksByKind[b.kind] = (blocksByKind[b.kind] ?? 0) + 1;
  const mapText = context.concepts.map((c) => [c.term, c.definition ?? "", c.quote ?? ""].join(" ")).join("\n");
  return {
    sourceWords: words(context.sourceText).length,
    visibleWords,
    afterAnswerWords: words(lessonVisibleText(lesson, true)).length,
    readingMinutes: Math.round((10 * visibleWords) / READING_WORDS_PER_MINUTE) / 10,
    sections: lesson.sections.length,
    blocks: Object.values(blocksByKind).reduce((a, b) => a + b, 0),
    blocksByKind,
    sourceInMapPct: termCoverage(context.sourceText, mapText).pct,
    sourceInLessonPct: termCoverage(context.sourceText, visible).pct,
    nonSourcePct: nonSourceShare(context.sourceText, visible),
    repetitionPct: repetitionShare(visible),
  };
}
