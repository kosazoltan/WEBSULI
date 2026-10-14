/**
 * Spec 2026-10-14-tananyag-tomorseg-lefedettseg (S2): a Tananyag lap terjedelmi kerete a TANÍTANDÓ fogalmakból és az
 * évfolyamból — nem fix fejezet-sablonból.
 *
 * Mérve (43 tárolt lecke, docs/measurements/2026-10-14-lesson-length-coverage.json): a hossz nem függött a forrástól
 * (r = −0,10), medián 2210 látható szó ≈ 18 perc olvasás; a leckék fele a 12 fejezetes plafonon; a 46 szavas forrásból
 * 2756 szavas lecke lett. A szülők szerint „túl hosszú”. A fogalmankénti szókeret kiinduló érték — a próbaharness
 * (scripts/measure/lesson-trial.mts) kalibrálja.
 */

/** A vázlat abszolút fejezet-plafonja (step-io OUTLINE_MAX_SECTIONS-szel egyezik; ott a séma kényszeríti). */
const ABSOLUTE_MAX_SECTIONS = 12;
/** Kb. ennyi tanítandó fogalom fér egy fejezetbe. */
const CONCEPTS_PER_SECTION = 3;
const MIN_SECTIONS = 2;
const MIN_TARGET_WORDS = 250;
/** A keret fölötti tűréshatár (a szerzőnek „legfeljebb”-ként adjuk meg). */
const MAX_OVER_TARGET = 1.2;

type GradeBudget = { perConcept: number; cap: number };

/**
 * Látható szó / tanítandó fogalom és felső plafon évfolyam-csoportonként.
 * Kalibrálva (próbaharness, 2026-10-14, 4 térkép): a kezdeti 45/60/75/90 szó/fogalom keret 61–89%-kal rövidített, de a kötelező
 * fogalmak tartalmának lefedettsége 9–17 ponttal esett (pl. Mezopotámia 573 szó → 80% vs 2756 szó → 94%) — a modell nem
 * tömörebben mondta, hanem kihagyott. Ezért a nagyobb keret + a szerzőnek tényvédelmi szabály.
 */
export function gradeBudget(classroom: number): GradeBudget {
  if (classroom >= 1 && classroom <= 4) return { perConcept: 70, cap: 1600 };
  if (classroom >= 5 && classroom <= 6) return { perConcept: 90, cap: 2600 };
  if (classroom >= 7 && classroom <= 8) return { perConcept: 110, cap: 3200 };
  // 9+ és a 0 (évfolyam nélküli, pl. programozás) — a középiskolai keret
  return { perConcept: 130, cap: 3800 };
}

export type LessonLengthBudget = {
  /** A lefedettség által megkövetelt fogalmak (nem `extra`). */
  requiredConcepts: number;
  maxSections: number;
  /** A Tananyag lap célzott látható szószáma. */
  targetWords: number;
  /** Ennél hosszabb Tananyag lap terjedelmi túllépés. */
  maxWords: number;
};

export function lessonLengthBudget(input: { classroom: number; concepts: ReadonlyArray<{ examWeight?: string | null }> }): LessonLengthBudget {
  const requiredConcepts = input.concepts.filter((c) => c.examWeight !== "extra").length;
  const { perConcept, cap } = gradeBudget(input.classroom);
  const maxSections = Math.min(ABSOLUTE_MAX_SECTIONS, Math.max(MIN_SECTIONS, Math.ceil(requiredConcepts / CONCEPTS_PER_SECTION)));
  const targetWords = Math.min(cap, Math.max(MIN_TARGET_WORDS, requiredConcepts * perConcept));
  return { requiredConcepts, maxSections, targetWords, maxWords: Math.round(targetWords * MAX_OVER_TARGET) };
}
