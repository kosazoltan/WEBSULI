import type { Block, Lesson } from "../../shared/lesson-schema";
import { blockText } from "./grounding";

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
 * A blokk diák által LÁTOTT szövege. Review #210: ugyanazt a mezőkészletet méri, amit a megalapozási kapu (`grounding.ts`
 * `blockText`): explain/example/check szövege, az ábra RENDERELT szövege (idővonal-események, folyamatlépések, címkék) és a
 * `try` feladat látható része (hiányos szöveg, rendezendő elemek, párok); a recap pontjai külön. `afterAnswer`: a válasz után
 * megjelenő rész — a kliens CSAK a kiválasztott opció visszajelzését mutatja, ezért egy (a helyes válaszé) számít.
 */
export function blockVisibleText(block: Block, afterAnswer = false): string {
  if (afterAnswer) return block.kind === "check" ? block.feedbackPerOption[block.correctIndex] ?? "" : "";
  if (block.kind === "recap") return block.bullets.join("\n");
  return blockText(block as unknown as Record<string, unknown>);
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

/**
 * Tényszintű kulcsok egy fogalomhoz: minden szám (évszám, adat, példa-szám), a fogalom NEVÉNEK szótövei és a definíció/idézet
 * tulajdonnevei (nagybetűs, nem mondatkezdő szó). Mérve (2026-10-14, Oszthatóság): a teljes szótő-lefedettség a rövidebb
 * leckében kötőszavak és igealakok („tovább”, „látjuk”, „amilyen”) hiánya miatt 9 ponttal esett, miközben egyetlen szám vagy
 * fogalomnév sem hiányzott — a „nem tartalmaz mindent” panasz a TÉNYEKRE vonatkozik.
 */
export function factKeys(concept: { term: string; definition?: string | null; quote?: string | null }): Set<string> {
  const keys = new Set<string>();
  // Tankönyvi hivatkozás nem tény („(4. ábra)”, „3. kép”, „12. oldal”): a lecke a TANÍTÁSI SZERZŐDÉS 4. pontja szerint a
  // forrásra nem hivatkozhat — mérve (Zöldségek, 2026-10-14): a „hiányzó” számok mind ábraszámok voltak.
  const withoutRefs = (s: string) => s.replace(/\(?\b\d+\.\s*(ábr\p{L}*|kép\p{L}*|oldal\p{L}*|old\.|o\.|táblázat\p{L}*|feladat\p{L}*)\)?/giu, " ");
  const body = withoutRefs(`${concept.definition ?? ""} ${concept.quote ?? ""}`);
  for (const n of `${withoutRefs(concept.term)} ${body}`.match(/\d+(?:[.,]\d+)?/g) ?? []) keys.add(n.replace(",", "."));
  // Review #213: a fogalom NEVÉNEK minden szava kulcs, a hosszától függetlenül (≥ 3 betű, nem töltelékszó) — a `termKeys` a
  // 6 betűnél rövidebbet eldobná, így a „gumó” vagy „sejt” fogalom teljes hiánya nem csökkentené a mérést.
  for (const k of nameKeys(concept.term)) keys.add(k);
  // tulajdonnév: nagybetűs, legalább 4 betűs szó, amely nem mondat elején áll
  const tokens = body.split(/\s+/).filter(Boolean);
  tokens.forEach((token, i) => {
    const word = token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    const sentenceStart = i === 0 || /[.!?:]$/.test(tokens[i - 1]);
    if (!sentenceStart && /^\p{Lu}\p{Ll}{3,}$/u.test(word) && !STOPWORDS.has(word.toLowerCase())) keys.add(word.toLowerCase().slice(0, TERM_KEY_LENGTH));
  });
  return keys;
}

/** Név-kulcsok: minden ≥ 3 betűs, nem töltelék, nem szám szó első (legfeljebb) 6 betűje — a ragozott alak is ugyanide esik. */
function nameKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const w of words(text)) if (w.length >= 3 && !STOPWORDS.has(w) && !/^\d/.test(w)) keys.add(w.slice(0, TERM_KEY_LENGTH));
  return keys;
}

/** A szöveg tény-kulcsai: számok és név-kulcsok (a factKeys-szel összevethető alakban). */
function textFactKeys(text: string): Set<string> {
  const keys = nameKeys(text);
  for (const n of text.match(/\d+(?:[.,]\d+)?/g) ?? []) keys.add(n.replace(",", "."));
  return keys;
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
  /**
   * A KÖTELEZŐ (nem `extra`) fogalmak szótöveiből (term + definition + quote) hány van a Tananyag lapon. Témafókusznál ez a
   * tisztességes lefedettség: a fókuszon kívüli forrásrész szándékosan marad ki, a teljes-forrás arány ott félrevezet.
   */
  requiredConceptTermsPct: number | null;
  /** A kötelező fogalmak TÉNYEIBŐL (számok, fogalomnév, tulajdonnevek — `factKeys`) hány szerepel a Tananyag lapon. */
  requiredFactsPct: number | null;
};

export function measureLesson(
  lesson: Pick<Lesson, "sections">,
  context: { sourceText: string; concepts: ReadonlyArray<{ term: string; definition?: string | null; quote?: string | null; examWeight?: string | null }> },
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
    requiredConceptTermsPct: termCoverage(
      context.concepts.filter((c) => c.examWeight !== "extra").map((c) => [c.term, c.definition ?? "", c.quote ?? ""].join(" ")).join("\n"),
      visible,
    ).pct,
    requiredFactsPct: (() => {
      const have = textFactKeys(visible);
      const facts = new Set(context.concepts.filter((c) => c.examWeight !== "extra").flatMap((c) => [...factKeys(c)]));
      return facts.size ? Math.round((100 * [...facts].filter((k) => have.has(k)).length) / facts.size) : null;
    })(),
  };
}
