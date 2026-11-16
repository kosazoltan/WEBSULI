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
  /**
   * A válasz ELŐTT felolvasható célnyelvi szöveg, amely NEM árulja el a helyes választ (kanban #50): cél→magyar: a
   * term; mondat-jelentés: a példamondat; hiányos mondat: a mondat, a hiány helyén „…”; magyar→cél: nincs (a term
   * felolvasása maga a megoldás). Additív mező; a felolvasás bekötése a `vocabPlayQuestion`-ben (ORKESZTRÁTOR-KÉRÉS).
   */
  speakText?: string;
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

/**
 * A hiányos mondat két alakja (kanban #50; végrehajtás K „Cloze rövid játék-alak”):
 *  - `"full"` (alapértelmezés, a korábbi viselkedés): „Melyik illik a mondatba? … _____ … (Magyarul: <exampleHu>)”;
 *  - `"game"` (a játékok: `useVocabQuizSource`): csak a mondat a hiányjellel („… _____ …”) — előtag nélkül (a hiányjel
 *    maga mutatja a feladatot; a 2 szavas előtag a 3–4. évfolyamon 9 mp fölé tolta a tételek 5–25%-át) és fordítás
 *    NÉLKÜL (a mért 85%-ban szó szerint vagy ragozva tartalmazta a helyes választ). Csak elég szövegkörnyezetű mondatból
 *    (`canGameCloze`), és az egyértelműséget az elterelők adják: azonos szófaj, de nem azonos és nem rokon téma
 *    (`topicsRelated`: a „___ ist warm” a ruhák közül nem kap másik ruhát); a felszíni jel sem árulhatja el a választ:
 *    azonos névelő (`nounArticle`), kifejezés-alak (`phraseShape`), visszaható névmás (`isReflexiveTerm`), és a hiány
 *    előtti „a / an”, francia elízió hangtani kényszere (`onsetRule`). A teljes fordítás a magyarázatban („Miért?”,
 *    megoldás-kijelzés) marad.
 */
export type ClozeStyle = "full" | "game";
export type VocabQuestionOptions = { clozeStyle?: ClozeStyle };
/**
 * A játék-alakhoz a mondatban a hiányzó részen kívül legalább ennyi szó kell (a mérés: a ≤ 3 szavas keretek —
 * „___ ist warm.”, „Je lis ___.” — adták a több védhető választ; docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md K).
 */
export const GAME_CLOZE_MIN_CONTEXT = 4;
/** Szűk létigés keretnél ennyi szó kell a hiányon kívül (`canGameCloze`). */
export const GAME_CLOZE_MIN_CONTEXT_COPULA = 5;
const TOKEN_HAS_WORD = /[\p{L}\p{N}]/u;

/**
 * Rokon témák (szómező): a játék-alakú cloze elterelője sem az azonos, sem a rokon témából nem jöhet, mert ott a
 * mondatba gyakran ugyanúgy beillik (ruha ~ vásárlás ~ test, város ~ természet ~ utazás …). Szimmetrikus.
 */
const TOPIC_NEIGHBOUR_PAIRS: ReadonlyArray<readonly [VocabTopic, VocabTopic]> = [
  ["family", "work"], ["school", "work"], ["school", "communication"], ["school", "culture"],
  ["food", "shopping"], ["food", "home"], ["food", "everyday"], ["home", "everyday"], ["home", "technology"],
  ["city", "travel"], ["city", "nature"], ["city", "shopping"], ["time", "numbers"], ["time", "everyday"], ["time", "weather"],
  ["body", "health"], ["body", "clothes"], ["body", "sports"], ["clothes", "shopping"], ["clothes", "colors"],
  ["weather", "nature"], ["freetime", "sports"], ["freetime", "culture"], ["freetime", "technology"],
  ["animals", "nature"], ["nature", "travel"], ["nature", "colors"], ["health", "feelings"], ["health", "sports"],
  ["feelings", "communication"], ["work", "technology"], ["technology", "communication"], ["culture", "communication"],
];
const TOPIC_NEIGHBOURS = new Map<VocabTopic, Set<VocabTopic>>();
for (const [a, b] of TOPIC_NEIGHBOUR_PAIRS) {
  for (const [x, y] of [[a, b], [b, a]] as const) {
    let s = TOPIC_NEIGHBOURS.get(x);
    if (!s) TOPIC_NEIGHBOURS.set(x, (s = new Set()));
    s.add(y);
  }
}

const VOWEL_START = /^[aeiouáàâäéèêëíìîïóòôöúùûüœæ]/iu;
const VOWEL_OR_H_START = /^[aeiouáàâäéèêëíìîïóòôöúùûüœæh]/iu;
const FR_FULL_FORM = new Set(["de", "le", "la", "je", "que", "ne", "se", "me", "te", "ce"]);

/**
 * A hiány előtti szó hangtani kényszere (kanban #50, vak ellenőrzés): angol „a / an”, francia elízió („d’”, „l’”) vagy
 * a nem elidált alak („de”, „le”, „je” …). Ha a helyes válasz ennek megfelel, az elterelő is feleljen meg, különben a
 * névelő egymagában elárulná a választ („I eat an _____” + egyetlen magánhangzós opció). `null`: nincs kényszer.
 */
function onsetRule(entry: VocabEntry, lang: VocabLang): ((term: string) => boolean) | null {
  const hit = findTermInExample(entry);
  if (!hit) return null;
  const before = entry.example.normalize("NFC").slice(0, hit.start);
  const prev = (before.trim().split(/\s+/u).pop() ?? "").toLowerCase();
  if (lang === "en") {
    if (prev === "an") return t => VOWEL_START.test(t);
    if (prev === "a") return t => !VOWEL_START.test(t);
    return null;
  }
  if (lang === "fr") {
    if (/['’]$/u.test(before)) return t => VOWEL_OR_H_START.test(t);
    if (FR_FULL_FORM.has(prev)) return t => !VOWEL_START.test(t);
  }
  return null;
}

/** Visszaható ige / kifejezés („sich freuen”, „se lever”, „s’habituer”): az elterelő ebben egyezzen a helyes válasszal. */
export function isReflexiveTerm(term: string): boolean {
  return /^(sich|se)\s|^s['’]/iu.test(term.normalize("NFC").trim());
}

/** A kifejezés (kind: phrase) mondattani alakja — a játék-alakú cloze elterelője ebben egyezzen a helyes válasszal. */
export type PhraseShape = "sentence" | "verbal" | "adverbial" | "nominal" | "other";

const SHAPE_WORDS: Record<VocabLang, { sentence: ReadonlySet<string>; adverbial: ReadonlySet<string>; nominal: ReadonlySet<string> }> = {
  en: {
    sentence: new Set([
      "i", "i'm", "i’m", "it's", "it’s", "that's", "that’s", "let's", "let’s", "what", "how", "where", "when", "who", "why",
      // köszönés, indulatszó
      "good", "thanks", "thank", "excuse", "happy", "merry", "see", "no", "yes", "please", "sorry", "hello", "bye", "goodbye", "well",
    ]),
    adverbial: new Set(["at", "in", "on", "by", "for", "from", "with", "without", "under", "over", "after", "before", "during", "next", "last", "every", "this", "once", "twice", "all", "out", "to", "as", "within", "ahead", "inside", "outside", "upside"]),
    nominal: new Set(["a", "an", "the", "some", "any", "much", "many", "lots", "plenty", "few", "one", "two", "three"]),
  },
  de: {
    sentence: new Set(["das", "guten", "gute", "frohe", "herzlichen", "vielen", "alles"]),
    adverbial: new Set(["am", "im", "in", "an", "auf", "mit", "nach", "vor", "zu", "zum", "zur", "bei", "beim", "ab", "aus", "für", "ohne", "um", "über", "unter", "seit", "jeden", "jede", "einmal", "zweimal", "dreimal", "heute", "morgen", "gestern", "immer", "schritt", "von", "vom"]),
    nominal: new Set(["ein", "eine", "einen", "einem", "der", "die", "den", "dem", "viele"]),
  },
  fr: {
    sentence: new Set(["je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles", "c'est", "c’est", "ça", "quel", "quelle", "comment", "où", "quand", "bonne", "bon", "bonjour", "merci", "bravo", "joyeux", "joyeuse"]),
    adverbial: new Set(["à", "au", "aux", "en", "dans", "par", "pour", "avec", "sans", "sous", "sur", "chez", "tous", "toutes", "tout", "toute", "de", "du", "trop", "très", "depuis", "pendant", "avant", "après", "près", "loin"]),
    nominal: new Set(["un", "une", "le", "la", "les", "des"]),
  },
};
/** Angol: leíró (melléknévi / fokozó) kezdet — „too big”, „dark blue” — nem igei. */
const EN_DESCRIPTIVE = new Set(["too", "very", "so", "quite", "really", "dark", "light", "pale", "bright", "big", "little", "small"]);
const DE_INFINITIVE = /^\p{Ll}[\p{L}]*(?:en|ern|eln)$/u;
const FR_INFINITIVE = /(?:er|ir|re|oir)$/u;
/** Német: személyes / kérdő névmással kezdődő kifejezés mondat, akkor is, ha -en-re végződik („Ich bin einverstanden”). */
const DE_PRONOUN_START = new Set(["ich", "du", "er", "es", "wir", "ihr", "wie", "was", "wo", "wann", "warum", "wer"]);
const shapeCache = new Map<string, PhraseShape>();

/**
 * A kifejezés alakja zárt szólisták + végződés alapján (közelítés, a vak ellenőrzés jelzései szerint: a „We visit our
 * cousins _____.” mellé ne kerüljön igei kifejezés, mert a határozós egyetlen opció felszíni jelből kitalálható).
 * Angol: „?/!/.”-ra végződő vagy nagybetűs → mondat; névelő / számnév → névszói; elöljárószó / „next, every” → határozói;
 * különben igei. Német: utolsó szó kisbetűs főnévi igenév (-en / -ern / -eln) → igei (előtte a személyes névmásos mondat).
 * Francia: első szó főnévi igenév (-er / -ir / -re / -oir) vagy visszaható → igei.
 */
export function phraseShape(term: string, lang: VocabLang): PhraseShape {
  const key = `${lang}|${term}`;
  let hit = shapeCache.get(key);
  if (!hit) shapeCache.set(key, (hit = computePhraseShape(term, lang)));
  return hit;
}

function computePhraseShape(term: string, lang: VocabLang): PhraseShape {
  const t = term.normalize("NFC").trim();
  const words = t.split(/\s+/u);
  const first = (words[0] ?? "").toLowerCase();
  const firstBare = first.replace(/[,.!?…]+$/u, "");
  const last = (words[words.length - 1] ?? "").replace(/[,.!?…]+$/u, "");
  if (/[?!.]$/u.test(t)) return "sentence";
  const w = SHAPE_WORDS[lang];
  if (lang === "en") {
    if (/^\p{Lu}/u.test(t) || w.sentence.has(firstBare)) return "sentence";
    if (w.nominal.has(firstBare)) return "nominal";
    if (w.adverbial.has(firstBare)) return "adverbial";
    if (EN_DESCRIPTIVE.has(firstBare)) return "other";
    return "verbal";
  }
  if (lang === "de") {
    if (DE_PRONOUN_START.has(firstBare)) return "sentence";
    if (words.length > 1 && DE_INFINITIVE.test(last)) return "verbal";
    if (w.sentence.has(firstBare)) return "sentence";
    if (w.adverbial.has(firstBare)) return "adverbial";
    if (w.nominal.has(firstBare)) return "nominal";
    return "other";
  }
  if (/^j['’]/u.test(first) || w.sentence.has(firstBare)) return "sentence";
  if (isReflexiveTerm(t)) return "verbal";
  if (/^(?:d|l)['’]/u.test(first)) return /^l['’]/u.test(first) ? "nominal" : "adverbial";
  if (FR_INFINITIVE.test(firstBare)) return "verbal";
  if (w.adverbial.has(firstBare)) return "adverbial";
  if (w.nominal.has(firstBare)) return "nominal";
  return "other";
}

const ARTICLES: Partial<Record<VocabLang, ReadonlySet<string>>> = {
  de: new Set(["der", "die", "das", "ein", "eine"]),
  fr: new Set(["le", "la", "les", "un", "une", "des"]),
};

/** A német / francia főnév névelője („der”, „la”, „l’”), kisbetűvel; `null`, ha nincs (angol, vagy névelő nélküli term). */
export function nounArticle(term: string, lang: VocabLang): string | null {
  const t = term.normalize("NFC").trim().toLowerCase();
  if (lang === "fr" && /^l['’]/u.test(t)) return "l'";
  const first = t.split(/\s+/u)[0] ?? "";
  return ARTICLES[lang]?.has(first) ? first : null;
}

/** Azonos vagy rokon téma (a játék-alakú cloze elterelőjénél kizáró ok). */
export function topicsRelated(a: VocabTopic, b: VocabTopic): boolean {
  return a === b || (TOPIC_NEIGHBOURS.get(a)?.has(b) ?? false);
}

function contextTokens(entry: Pick<VocabEntry, "term" | "example">): string[] | null {
  const hit = findTermInExample(entry);
  if (!hit) return null;
  const text = entry.example.normalize("NFC");
  const rest = `${text.slice(0, hit.start)} ${text.slice(hit.end)}`;
  return rest.split(/\s+/u).filter(t => TOKEN_HAS_WORD.test(t));
}

/** A példamondat szavai a hiányzó részen (a term találatán) kívül; `null`, ha a term nincs a példában. */
export function clozeContextWords(entry: Pick<VocabEntry, "term" | "example">): number | null {
  return contextTokens(entry)?.length ?? null;
}

/** Létige-alakok (a „_____ ist alt und groß.” típusú, szűk kopulás keret felismeréséhez). */
const COPULAS: Record<VocabLang, ReadonlySet<string>> = {
  en: new Set(["is", "are", "was", "were", "am"]),
  de: new Set(["ist", "sind", "war", "waren", "bin", "bist", "seid"]),
  fr: new Set(["est", "sont", "était", "étaient", "suis", "es", "sommes", "êtes"]),
};

/**
 * Játék-alakú cloze készülhet-e a bejegyzésből: a hiányon kívül ≥ `GAME_CLOZE_MIN_CONTEXT` szó, és ha a keret éppen a
 * minimum és létigés („_____ ist alt und groß.”, „Our teacher is always _____.”), akkor eggyel több kell
 * (`GAME_CLOZE_MIN_CONTEXT_COPULA`) — a vak ellenőrzésben ezeknél volt a több védhető válasz aránya háromszoros.
 */
export function canGameCloze(entry: Pick<VocabEntry, "id" | "term" | "example">): boolean {
  const lang = langOfEntry(entry);
  const toks = contextTokens(entry);
  if (!lang || !toks || toks.length < GAME_CLOZE_MIN_CONTEXT) return false;
  if (toks.length >= GAME_CLOZE_MIN_CONTEXT_COPULA) return true;
  const cop = COPULAS[lang];
  return !toks.some(t => t.split(/['’]/u).some(w => cop.has(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""))));
}

function canCloze(entry: VocabEntry, style: ClozeStyle = "full"): boolean {
  if (style === "game") return canGameCloze(entry);
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
export function pickQuestionType(entry: VocabEntry, rng: () => number, opts?: VocabQuestionOptions): VocabQuestionType {
  const types: VocabQuestionType[] = ["hu-to-target", "target-to-hu"];
  if (canCloze(entry, opts?.clozeStyle)) types.push("cloze");
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

function pickDistractors(entry: VocabEntry, lang: VocabLang, bank: readonly VocabEntry[], type: VocabQuestionType, rng: () => number, style: ClozeStyle = "full"): VocabEntry[] | null {
  const { term: entryTerm, meanings: entryMeanings } = keysOf(entry);
  // A 4 opció bejegyzéseinek jelentés-kulcsai páronként diszjunktak (K.7.2/a): a helyesé eleve foglalt.
  const meanings = new Set(entryMeanings);
  // Sorrend: (1) szomszéd szint + azonos szófaj, (2) szomszéd szint, (3) bármely szint — mindegyik a kind-on belül.
  // A kizárási szabályok (term, jelentés, opció, cloze) lustán, a keverés sorrendjében futnak: a kevert sorrendből
  // az érvényeseket véve ugyanúgy egyenletes a választás, de csak a ténylegesen megnézett jelölt kerül pénzbe.
  // Játék-alakú cloze (kanban #50): CSAK azonos szófajú és MÁS témájú jelölt — (1) szomszéd szint, (3) bármely szint;
  // a (2) (más szófaj) kimarad, mert a német / francia főnév névelője vagy a szófaj maga elárulná a választ.
  const game = type === "cloze" && style === "game";
  const onset = game ? onsetRule(entry, lang) : null;
  const shape = game && entry.kind === "phrase" ? phraseShape(entry.term, lang) : null;
  const nounGame = game && entry.pos === "noun";
  const article = nounGame ? nounArticle(entry.term, lang) : null;
  const tiers: VocabEntry[][] = [[], [], []];
  for (const c of groupOf(bank, lang, entry.kind)) {
    if (c.id === entry.id) continue;
    if (game && (c.pos !== entry.pos || topicsRelated(c.topic, entry.topic))) continue;
    if (onset && !onset(c.term)) continue;
    // A visszaható névmás egymagában elárulná a választ („dein Handy _____” + három „sich …” opció; vak ellenőrzés).
    if (game && isReflexiveTerm(c.term) !== isReflexiveTerm(entry.term)) continue;
    // Kifejezésnél az alak is egyezzen (határozói a határozói, igei az igei mellé — vak ellenőrzés, kanban #50).
    if (game && entry.kind === "phrase" && phraseShape(c.term, lang) !== shape) continue;
    // Német / francia főnév: azonos névelő (nem és szám; névelő nélküli mellé névelő nélküli) — különben a mondat egyeztetése („sont”, „principale”) egymagában
    // elárulná a választ (vak ellenőrzés, kanban #50).
    if (nounGame && nounArticle(c.term, lang) !== article) continue;
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

function promptFor(entry: VocabEntry, type: VocabQuestionType, lang: VocabLang, style: ClozeStyle = "full"): string | null {
  switch (type) {
    case "hu-to-target": return `„${entry.hu}” ${LANG_SUFFIX[lang]}:`;
    case "target-to-hu": return `Mit jelent: „${entry.term}”?`;
    case "phrase-meaning": return `Mit jelent ez a mondat? „${entry.example}”`;
    case "cloze": {
      const hit = findTermInExample(entry);
      if (!hit) return null;
      const text = entry.example.normalize("NFC");
      const sentence = `${text.slice(0, hit.start)}${BLANK}${text.slice(hit.end)}`;
      // Játék-alak: fordítás nélkül (az egyértelműséget az elterelők adják, `pickDistractors`).
      if (style === "game") return sentence;
      // A magyar fordítás egyértelművé teszi, melyik opció illik (review #421: nyelvtanilag több is illhetne).
      return `Melyik illik a mondatba? ${sentence} (Magyarul: ${entry.exampleHu})`;
    }
  }
}

/** A válasz előtt felolvasható szöveg (`VocabQuiz.speakText`); `null`, ha minden felolvasás elárulná a választ. */
function speakTextFor(entry: VocabEntry, type: VocabQuestionType): string | null {
  switch (type) {
    case "target-to-hu": return entry.term;
    case "phrase-meaning": return entry.example;
    case "hu-to-target": return null;
    case "cloze": {
      const hit = findTermInExample(entry);
      if (!hit) return null;
      const text = entry.example.normalize("NFC");
      return `${text.slice(0, hit.start)}…${text.slice(hit.end)}`;
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
export function generateVocabQuestion(
  entry: VocabEntry,
  bank: readonly VocabEntry[],
  type: VocabQuestionType,
  rng: () => number,
  opts?: VocabQuestionOptions,
): VocabQuiz | null {
  const style = opts?.clozeStyle ?? "full";
  const lang = langOfEntry(entry);
  if (!lang) return null;
  if (type === "cloze" && !canCloze(entry, style)) return null;
  if (type === "phrase-meaning" && !canPhraseMeaning(entry)) return null;
  const prompt = promptFor(entry, type, lang, style);
  if (!prompt) return null;
  const distractors = pickDistractors(entry, lang, bank, type, rng, style);
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
  const speak = speakTextFor(entry, type);
  if (speak) quiz.speakText = speak;
  return isPlayableQuestion(quiz) ? quiz : null;
}
