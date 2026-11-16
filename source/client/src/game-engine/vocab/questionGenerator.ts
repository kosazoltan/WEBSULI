import type { FourChoiceQuiz } from "../../types/gameQuiz";
import type { VocabEntry, VocabKind, VocabLang, VocabLevel, VocabTopic } from "../../data/vocabBank/types";
import { findFormInText, normalizeTerm } from "../../data/vocabBank/validate";
import { isPlayableQuestion } from "../../../../shared/game-quiz-contract";

/**
 * Szóbankos kérdésgenerátor (terv 4.3; végrehajtás S1/7. lépés). Tiszta modul: a véletlen kívülről jön, azonos
 * seed → azonos kérdés.
 */
export type VocabQuestionType = "hu-to-target" | "target-to-hu" | "cloze" | "phrase-meaning";

export type VocabQuiz = FourChoiceQuiz & {
  vocabId: string;
  lang: VocabLang;
  level: VocabLevel;
  topic: VocabTopic;
  kind: VocabKind;
  questionType: VocabQuestionType;
  /** A bejegyzés term-je (naplózáshoz, dedupe-hoz). */
  answerTerm: string;
};

const LANG_SUFFIX: Record<VocabLang, string> = { en: "angolul", de: "németül", fr: "franciául" };
const BLANK = "_____";
const EXPLANATION_MAX = 300;
const EXPLANATION_MIN = 30;

export function langOfEntry(entry: Pick<VocabEntry, "id">): VocabLang | null {
  const p = entry.id.slice(0, 2);
  return p === "en" || p === "de" || p === "fr" ? p : null;
}

const termHitCache = new WeakMap<object, { term: string; example: string; hit: { start: number; end: number } | null }>();

/**
 * A `term` szó szerinti előfordulása a példában (kis-/nagybetűtől függetlenül, szóhatáron, a szóközök bármely
 * — nem törő — szóközzel egyeznek). Csak a term számít, az `alt` nem (szerződés-pontosítás 2026-11-15, #419
 * review: ragozott alakból hiányos mondat nem készül, mert a helyes opció a term).
 */
export function findTermInExample(entry: Pick<VocabEntry, "term" | "example">): { start: number; end: number } | null {
  // Objektumonként egyszer (a Unicode-tulajdonságos regex fordítása a teljes bankon a futásidő nagy része volt);
  // a gyorsítótár a term + példa párra érvényes, így a módosított objektum újraszámolódik.
  const cached = termHitCache.get(entry);
  if (cached && cached.term === entry.term && cached.example === entry.example) return cached.hit;
  const hit = findFormInText(entry.term, entry.example);
  termHitCache.set(entry, { term: entry.term, example: entry.example, hit });
  return hit;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Magyar szó a magyar mondatban szó ELEJÉN (a toldalék megengedett: „kutya” ~ „A kutyát”) — a cloze rossz válaszai
 * közül kizárja azt, amelyik a fordítás alapján is illene (review #421). Visszatekintés nélkül, és regex-építés
 * nélkül (a jelöltenként új `\p{L}`-es regex fordítása a teljes bankon a futásidő nagy része volt): mindkét oldal
 * `normalizeTerm` (kisbetű, a (nem törő) szóközök egy szóközzé), és a találat előtt nem állhat betű / szám.
 */
function huAppearsIn(hu: string, sentenceHu: string): boolean {
  const h = normalizeTerm(hu).replace(/[?!.…,;:]+$/u, "");
  if (!h) return false;
  const s = normalizeTerm(sentenceHu);
  for (let i = s.indexOf(h); i !== -1; i = s.indexOf(h, i + 1)) {
    if (i === 0 || !WORD_CHAR.test(s.charAt(i - 1))) return true;
  }
  return false;
}

function canCloze(entry: VocabEntry): boolean {
  return findTermInExample(entry) !== null;
}

function canPhraseMeaning(entry: VocabEntry): boolean {
  return entry.kind === "phrase" && entry.level >= 2;
}

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

/**
 * Lusta Fisher–Yates: elemenként húz, így csak annyi véletlen szám és csere fut, ahány jelöltet ténylegesen
 * megnézünk (a teljes bankon a szint több száz jelöltjéből jellemzően 3–5 elég). Azonos seed → azonos sorrend.
 */
function* shuffled<T>(items: readonly T[], rng: () => number): Generator<T> {
  // Virtuális tömb: csak a cserélt pozíciókat tároljuk (a teljes másolat helyett).
  const n = items.length;
  const moved = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const j = i + Math.min(n - 1 - i, Math.floor(rng() * (n - i)));
    const atJ = moved.get(j) ?? j;
    moved.set(j, moved.get(i) ?? i);
    moved.delete(i);
    yield items[atJ]!;
  }
}

/** `phrase` és level ≥ 2 → a négy típusból egyenletesen; különben hu→cél, cél→hu, (ha lehet) hiányos mondat. */
export function pickQuestionType(entry: VocabEntry, rng: () => number): VocabQuestionType {
  const types: VocabQuestionType[] = ["hu-to-target", "target-to-hu"];
  if (canCloze(entry)) types.push("cloze");
  if (canPhraseMeaning(entry)) types.push("phrase-meaning");
  return pick(types, rng);
}

function optionOf(entry: VocabEntry, type: VocabQuestionType): string {
  if (type === "target-to-hu") return entry.hu;
  if (type === "phrase-meaning") return entry.exampleHu;
  return entry.term;
}

/** A szélekről levágott írásjelek (terv 4.3 utójavítás, K.7.2/a): `? ! . … „ ” " '` és a szóköz. */
const EDGE_PUNCT = /^[\s?!.…„”"']+|[\s?!.…„”"']+$/gu;

function stripEdgePunct(s: string): string {
  return s.replace(EDGE_PUNCT, "").trim();
}

/**
 * A `term` összevetési kulcsa: `normalizeTerm` + a szélső írásjelek levágása („How old are you?” = „how old are
 * you”). A névelő nélküli alakot nem veti össze (az adatoldal kezeli).
 */
export function termKey(term: string): string {
  return stripEdgePunct(normalizeTerm(term));
}

/**
 * A magyar jelentés kulcsai (K.7.2/a jelentés-átfedés szabály): a zárójeles részek kiesnek, darabolás `,` `;` `/`
 * mentén, darabonként NFC + kisbetű + szóköz-összevonás + szélső írásjelek levágva; az üres darab kimarad.
 * „dzseki, bomberdzseki” → [„dzseki”, „bomberdzseki”]; „mennyibe kerül ez?” → [„mennyibe kerül ez”];
 * „sok (valamiből)” → [„sok”] (a zárójel csak pontosítás, ezért a „sok”-kal ÁTFED). Ha a `hu` csupa zárójel, a
 * teljes szöveg (zárójellel) az egyetlen kulcs, hogy a bejegyzésnek legyen összevethető jelentése.
 */
export function meaningKeys(hu: string): string[] {
  const keys = new Set<string>();
  for (const part of hu.replace(/\([^)]*\)/g, " ").split(/[,;/]/)) {
    const k = stripEdgePunct(normalizeTerm(part));
    if (k) keys.add(k);
  }
  if (keys.size === 0) {
    const whole = stripEdgePunct(normalizeTerm(hu));
    if (whole) keys.add(whole);
  }
  return [...keys];
}

/** Igaz, ha a két `hu` jelentés-kulcsainak van közös eleme (csak TELJES kulcs-egyezés: „ág” ≠ „világ”). */
export function meaningsOverlap(a: string, b: string): boolean {
  const ka = meaningKeys(a);
  return meaningKeys(b).some(k => ka.includes(k));
}

type EntryKeys = { term: string; meanings: readonly string[]; exampleHu: string; hu: string };
/** Bejegyzésenként egyszer normalizálunk (a bank objektumai nem változnak futás közben). */
const keyCache = new WeakMap<VocabEntry, EntryKeys>();
function keysOf(e: VocabEntry): EntryKeys {
  let k = keyCache.get(e);
  if (!k) {
    k = { term: termKey(e.term), meanings: meaningKeys(e.hu), exampleHu: normalizeTerm(e.exampleHu), hu: normalizeTerm(e.hu) };
    keyCache.set(e, k);
  }
  return k;
}

function hitsAny(keys: readonly string[], used: ReadonlySet<string>): boolean {
  return keys.some(k => used.has(k));
}

function optionKey(e: VocabEntry, type: VocabQuestionType): string {
  const k = keysOf(e);
  return type === "target-to-hu" ? k.hu : type === "phrase-meaning" ? k.exampleHu : k.term;
}

/**
 * A bank nyelv + kind szerinti csoportjai, bankonként egyszer (a teljes bankon kérdésenként a teljes tömb szűrése
 * volt a futásidő nagy része). A bank tömbjét a hívók nem módosítják; hossz-eltérésnél újraépül.
 */
const groupCache = new WeakMap<readonly VocabEntry[], { length: number; groups: Map<string, VocabEntry[]> }>();
function groupOf(bank: readonly VocabEntry[], lang: VocabLang, kind: VocabKind): readonly VocabEntry[] {
  let cached = groupCache.get(bank);
  if (!cached || cached.length !== bank.length) {
    const groups = new Map<string, VocabEntry[]>();
    for (const e of bank) {
      const g = `${langOfEntry(e) ?? ""}|${e.kind}`;
      const list = groups.get(g);
      if (list) list.push(e); else groups.set(g, [e]);
    }
    cached = { length: bank.length, groups };
    groupCache.set(bank, cached);
  }
  return cached.groups.get(`${lang}|${kind}`) ?? [];
}

function pickDistractors(entry: VocabEntry, lang: VocabLang, bank: readonly VocabEntry[], type: VocabQuestionType, rng: () => number): VocabEntry[] | null {
  const { term: entryTerm, meanings: entryMeanings } = keysOf(entry);
  // A 4 opció bejegyzéseinek jelentés-kulcsai páronként diszjunktak (K.7.2/a): a helyesé eleve foglalt.
  const meanings = new Set(entryMeanings);
  // Sorrend: (1) szomszéd szint + azonos szófaj, (2) szomszéd szint, (3) bármely szint — mindegyik a kind-on belül.
  // A kizárási szabályok (term, jelentés, opció, cloze) lustán, a keverés sorrendjében futnak: a kevert sorrendből
  // az érvényeseket véve ugyanúgy egyenletes a választás, de csak a ténylegesen megnézett jelölt kerül pénzbe.
  const tiers: VocabEntry[][] = [[], [], []];
  for (const c of groupOf(bank, lang, entry.kind)) {
    if (c.id === entry.id) continue;
    if (Math.abs(c.level - entry.level) > 1) tiers[2]!.push(c);
    else if (c.pos === entry.pos) tiers[0]!.push(c);
    else tiers[1]!.push(c);
  }
  const chosen: VocabEntry[] = [];
  const terms = new Set([entryTerm]);
  const opts = new Set([optionKey(entry, type)]);
  for (const tier of tiers) {
    if (chosen.length === 3) break;
    for (const c of shuffled(tier, rng)) {
      const { term: t, meanings: m } = keysOf(c);
      const o = optionKey(c, type);
      if (terms.has(t) || hitsAny(m, meanings) || opts.has(o)) continue;
      // Cloze: a fordítás alapján is illő rossz válasz kizárva (pl. a „kutya” jelentésű, ha a mondat „A kutya …”).
      if (type === "cloze" && huAppearsIn(c.hu, entry.exampleHu)) continue;
      chosen.push(c);
      terms.add(t); opts.add(o);
      for (const k of m) meanings.add(k);
      if (chosen.length === 3) break;
    }
  }
  return chosen.length === 3 ? chosen : null;
}

function promptFor(entry: VocabEntry, type: VocabQuestionType, lang: VocabLang): string | null {
  switch (type) {
    case "hu-to-target": return `„${entry.hu}” ${LANG_SUFFIX[lang]}:`;
    case "target-to-hu": return `Mit jelent: „${entry.term}”?`;
    case "phrase-meaning": return `Mit jelent ez a mondat? „${entry.example}”`;
    case "cloze": {
      const hit = findTermInExample(entry);
      if (!hit) return null;
      const text = entry.example.normalize("NFC");
      // A magyar fordítás egyértelművé teszi, melyik opció illik (review #421: nyelvtanilag több is illhetne).
      return `Melyik illik a mondatba? ${text.slice(0, hit.start)}${BLANK}${text.slice(hit.end)} (Magyarul: ${entry.exampleHu})`;
    }
  }
}

function explanationFor(entry: VocabEntry, correct: string): string {
  const head = `A helyes válasz: „${correct}”. ${entry.term} = ${entry.hu}.`;
  let text = `${head} Példa: „${entry.example}” (${entry.exampleHu})`;
  if (text.length > EXPLANATION_MAX) text = head;
  if (text.length < EXPLANATION_MIN) text = `${text} Szó: ${entry.term}.`;
  return text;
}

/** Egy kérdés a bejegyzésből; `null`, ha a típus nem alkalmazható, vagy nincs 3 megfelelő rossz válasz. */
export function generateVocabQuestion(entry: VocabEntry, bank: readonly VocabEntry[], type: VocabQuestionType, rng: () => number): VocabQuiz | null {
  const lang = langOfEntry(entry);
  if (!lang) return null;
  if (type === "cloze" && !canCloze(entry)) return null;
  if (type === "phrase-meaning" && !canPhraseMeaning(entry)) return null;
  const prompt = promptFor(entry, type, lang);
  if (!prompt) return null;
  const distractors = pickDistractors(entry, lang, bank, type, rng);
  if (!distractors) return null;

  const correct = optionOf(entry, type);
  const correctIndex = Math.min(3, Math.floor(rng() * 4));
  const wrong = distractors.map(d => optionOf(d, type));
  const options = [...wrong.slice(0, correctIndex), correct, ...wrong.slice(correctIndex)];

  const quiz: VocabQuiz = {
    id: `vocab:${entry.id}:${type}`,
    prompt,
    options,
    correctIndex,
    explanation: explanationFor(entry, correct),
    vocabId: entry.id,
    lang,
    level: entry.level,
    topic: entry.topic,
    kind: entry.kind,
    questionType: type,
    answerTerm: entry.term,
  };
  return isPlayableQuestion(quiz) ? quiz : null;
}
