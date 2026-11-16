import type { FourChoiceQuiz } from "../../types/gameQuiz";
import type { VocabEntry, VocabKind, VocabLang, VocabLevel, VocabPos, VocabTopic } from "../../data/vocabBank/types";
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
   * A MEGJELENÉSKOR felolvasható célnyelvi szöveg, amely NEM árulja el a helyes választ (kanban #50; ugyanaz a
   * felosztás, mint a Szólétra `speechPlan`-je, #454): cél→magyar és mondat-jelentés: a term; hiányos mondat: a mondat,
   * a hiány helyén „…” (szünet); magyar→cél: nincs. Additív mező; a bekötés a `vocabPlayQuestion`-ben (ORKESZTRÁTOR-KÉRÉS).
   */
  speakText?: string;
  /** A KIMENETEL UTÁN felolvasandó helyes szó (magyar→cél és hiányos mondat: a term); a többi típusnál nincs. */
  speakAfter?: string;
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
 * A hiányos mondat két alakja (kanban #50; végrehajtás K.7):
 *  - `"full"` (alapértelmezés, a korábbi viselkedés): „Melyik illik a mondatba? … _____ … (Magyarul: <exampleHu>)”;
 *  - `"game"` (a játékok: `useVocabQuizSource`): csak a mondat a hiányjellel („… _____ …”), előtag és fordítás nélkül
 *    (a fordítás a mért 85%-ban szó szerint vagy ragozva tartalmazta a helyes választ). A teljes mondat + fordítás a
 *    magyarázatban („Miért?”, megoldás-kijelzés) marad.
 *
 * EGYÉRTELMŰSÉGI SZABÁLY (review #455 / Codex: „I go to school _____.” + „by bus” / „every morning” — fordítás nélkül
 * az azonos szófajú elterelő gyakran ugyanúgy beillik): játék-alakú cloze CSAK akkor készül, ha mindhárom elterelő a
 * hiány helyére NYELVTANILAG nem illik. Ezért
 *  1. csak egyszavas bejegyzésből (kifejezés soha: a határozós / igei kifejezés szabad bővítmény, a mondat nélküle is
 *     teljes), és csak az angol főnév, melléknév, ige, határozószó célszófajból (`GAME_DISTRACTOR_POS`). Német / francia
 *     játék-alakú cloze NINCS: a névelős főnév mellé csak névelős főnév lehetne (az a keretbe illhet), a más szófajú
 *     elterelő pedig a végződésből (-en, -er / -ir / -re) felismerhető — a vak megoldó a német / francia tételek 97%-át
 *     a szavak ismerete nélkül megoldotta, ami ugyanúgy elárulja a választ, mint a fordítás;
 *  2. az elterelő MÁS szófajú, mégpedig olyan, amely a célszófaj helyén nem állhat (`GAME_DISTRACTOR_POS`: főnév
 *     helyett melléknév, melléknév helyett ige, ige helyett melléknév, határozószó helyett ige);
 *  3. a kettős szófajú szó nem elterelő: a bankban a célszófajjal is szerepel, a `DUAL_USE` listán van („clean”,
 *     „open”, „cut” …), vagy szín (főnévként is áll: „a violet” = ibolya — vak ellenőrzés);
 *  4. a keret nem enged „átjárást” (`gameSlotOk`): angol jelzői melléknév (a „swim jacket” összetétel illene), főnév
 *     jelzői helyen, „make / keep / get / be …” mellett ige, segédige / „to” / „go” után határozószó;
 *  5. a hiány előtti „a / an” hangtani kényszere (`onsetRule`) és a jelentés-átfedés tilalma marad.
 * A maradék kockázatot (a gépi „nem illik” ítélet korlátos) a rétegzett vak megoldás méri.
 */
export type ClozeStyle = "full" | "game";
export type VocabQuestionOptions = { clozeStyle?: ClozeStyle };
/** A játék-alakhoz a mondatban a hiányzó szón kívül legalább ennyi szó kell (valódi mondat legyen). */
export const GAME_CLOZE_MIN_CONTEXT = 3;
const TOKEN_HAS_WORD = /[\p{L}\p{N}]/u;

/** Játék-alakú cloze célszófajai nyelvenként, és melyik (a célszófaj helyén nem álló) szófaj lehet elterelő. */
export const GAME_DISTRACTOR_POS: Record<VocabLang, Partial<Record<VocabPos, VocabPos>>> = {
  en: { noun: "adj", adj: "verb", verb: "adj", adv: "verb" },
  de: {},
  fr: {},
};

/**
 * Angol kettős szófajú szavak, amelyek a bankban csak egy szófajjal szerepelnek, de a másik helyén is állhatnak
 * (melléknév = ige / főnév; alapalak = melléknévi igenév). Elterelőnek nem jók.
 */
const DUAL_USE: ReadonlySet<string> = new Set([
    "clean", "open", "close", "empty", "dry", "warm", "cool", "cold", "free", "clear", "calm", "tidy", "slow", "quiet", "wet",
    "smooth", "dirty", "better", "near", "light", "dark", "blind", "busy", "right", "wrong", "last", "fine", "fit", "mean",
    "present", "long", "even", "equal", "double", "total", "faint", "sound", "content", "separate", "perfect", "complete",
    "correct", "direct", "express", "live", "own", "round", "secure", "upset", "welcome", "well", "ill", "lower", "fast",
    "hard", "late", "early", "daily", "weekly", "monthly", "yearly", "only", "kind", "fair", "cheap", "safe", "sick", "brown",
    "black", "white", "red", "green", "blue", "yellow", "orange", "pink", "purple", "grey", "gray", "gold", "silver", "plastic",
    "chemical", "native", "average", "past", "public", "private", "square", "flat", "level", "plain", "major", "minor", "fake",
    "cut", "put", "hit", "set", "shut", "let", "hurt", "cost", "quit", "spread", "read", "run", "come", "become", "burst",
    "cast", "bet", "split", "forecast", "beat", "lie", "dream", "rest", "worry", "care", "work", "play", "walk", "swim",
    "dance", "sleep", "rain", "snow", "cook", "drink", "call", "help", "love", "hope", "smile", "laugh", "cry", "shop",
    "fish", "watch", "book", "water", "plant", "phone", "email", "text", "paint", "brush", "iron", "dust", "film", "picnic",
    "camp", "ski", "skate", "surf", "visit", "travel", "trip", "kiss", "hug", "jump", "climb", "ride", "drive", "fly",
    "sail", "race", "score", "shout", "sing", "hate", "like", "need", "want", "wish", "guess", "answer", "question", "change",
    // főnevesülő melléknév („the old”, „my eldest”, „in the damp” — vak ellenőrzés)
    "old", "young", "rich", "poor", "deaf", "elderly", "unemployed", "homeless", "injured", "dead", "living", "damp", "elder",
    "older", "wealthy", "disabled", "brave", "blond", "blonde", "teenage", "adult", "senior", "junior", "favourite", "favorite",
    // a bank melléknevei közül főnévként / igeként is élők („a cross”, „to prompt”, „the wireless” — vak ellenőrzés)
    "cross", "prompt", "loose", "ready", "short", "bitter", "wireless", "annual", "freelance", "extracurricular", "good",
    "small", "raw", "casual", "renewable", "ancient", "ordinary", "mild", "delayed", "swollen", "tailored",
]);

const EN_FUNCTION_NEXT = new Set([
  "is", "are", "was", "were", "has", "have", "had", "can", "could", "will", "would", "should", "must", "may", "might",
  "and", "or", "but", "of", "in", "on", "at", "for", "with", "to", "from", "by", "near", "under", "behind", "after",
  "before", "into", "over", "every", "today", "tomorrow", "yesterday", "again", "too", "here", "there", "that", "which",
]);
const EN_LINKING = new Set([
  "make", "makes", "made", "making", "keep", "keeps", "kept", "find", "finds", "found", "get", "gets", "got", "leave",
  "leaves", "left", "drive", "drives", "drove", "turn", "turns", "turned", "go", "goes", "went", "come", "comes", "came",
  "stay", "stays", "stayed", "feel", "feels", "felt", "look", "looks", "looked", "seem", "seems", "become", "becomes",
  "became", "be", "is", "are", "was", "were", "am", "been", "being", "sound", "sounds", "smell", "smells", "taste", "tastes",
]);
const EN_VERB_GATE = new Set(["to", "can", "could", "will", "would", "shall", "should", "must", "may", "might", "do", "does", "did", "don't", "doesn't", "didn't", "please", "let's", "won't", "can't"]);
const VOWEL_START = /^[aeiou]/iu;

/**
 * A hiány előtti angol „a / an” hangtani kényszere: az elterelő is feleljen meg, különben a névelő egymagában elárulná a
 * választ („I eat an _____” + egyetlen magánhangzós opció). `null`: nincs kényszer.
 */
function onsetRule(entry: VocabEntry, lang: VocabLang): ((term: string) => boolean) | null {
  const hit = findTermInExample(entry);
  if (!hit) return null;
  const before = entry.example.normalize("NFC").slice(0, hit.start);
  const prev = (before.trim().split(/\s+/u).pop() ?? "").toLowerCase();
  if (lang !== "en") return null;
  if (prev === "an") return t => VOWEL_START.test(t);
  if (prev === "a") return t => !VOWEL_START.test(t);
  return null;
}

const bare = (w: string) => w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’]+$/gu, "");

/** A hiány előtti és utáni szavak (kisbetű, írásjel nélkül) és a hiány utáni első jel (szó / írásjel / vég). */
function slotContext(entry: Pick<VocabEntry, "term" | "example">): { before: string[]; after: string[]; nextIsWord: boolean } | null {
  const hit = findTermInExample(entry);
  if (!hit) return null;
  const text = entry.example.normalize("NFC");
  const before = text.slice(0, hit.start).split(/[\s'’]+/u).map(bare).filter(Boolean);
  const tail = text.slice(hit.end);
  const after = tail.split(/[\s'’]+/u).map(bare).filter(Boolean);
  return { before, after, nextIsWord: /^\s*[\p{L}\p{N}]/u.test(tail) };
}

/**
 * A keret engedi-e, hogy a `GAME_DISTRACTOR_POS` szerinti elterelő biztosan ne illjen (4. pont). Óvatos: kétes keret →
 * nincs játék-alakú cloze (a bejegyzés más kérdéstípust kap).
 */
export function gameSlotOk(entry: Pick<VocabEntry, "id" | "term" | "example" | "pos">): boolean {
  const lang = langOfEntry(entry);
  const ctx = slotContext(entry);
  if (!lang || !ctx) return false;
  const near = ctx.before.slice(-3);
  const prev = ctx.before[ctx.before.length - 1] ?? "";
  if (lang === "en") {
    switch (entry.pos) {
      // Főnév helyén melléknév: a főnév nem állhat jelzői helyen (utána csak írásjel / funkciószó jöhet).
      case "noun": return !ctx.nextIsWord || EN_FUNCTION_NEXT.has(ctx.after[0] ?? "");
      // Melléknév helyén ige: csak állítmányi helyen (utána nem jön szó: „a swim jacket”), és nem segédige / „to” után.
      case "adj": return !ctx.nextIsWord && !EN_VERB_GATE.has(prev);
      // Ige helyén melléknév: nem „make / keep / get / be …” után (ott melléknév is állhat).
      case "verb": return !near.some(w => EN_LINKING.has(w));
      // Határozószó helyén ige: nem segédige / „to” / „go, come” után.
      case "adv": return !near.some(w => EN_VERB_GATE.has(w) || EN_LINKING.has(w));
      default: return false;
    }
  }
  // Német / francia: nincs játék-alakú cloze (1. pont).
  return false;
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

/** Játék-alakú cloze készülhet-e a bejegyzésből (1. és 4. pont + elég szövegkörnyezet). */
export function canGameCloze(entry: Pick<VocabEntry, "id" | "term" | "example" | "pos" | "kind">): boolean {
  if (entry.kind !== "word") return false;
  // Nagybetűs cél („Friday”, „Christmas”) mellett a kisbetűs melléknév-elterelők elárulnák a választ (vak ellenőrzés).
  if (/^\p{Lu}/u.test(entry.term)) return false;
  const lang = langOfEntry(entry);
  if (!lang || !GAME_DISTRACTOR_POS[lang][entry.pos]) return false;
  if ((clozeContextWords(entry) ?? 0) < GAME_CLOZE_MIN_CONTEXT) return false;
  return gameSlotOk(entry);
}

/** A bank szavainak szófajai alakonként (kisbetű) — a kettős szófajú elterelő kiszűréséhez (3. pont). */
const posIndexCache = new WeakMap<readonly VocabEntry[], Map<string, Set<VocabPos>>>();
function posIndex(bank: readonly VocabEntry[]): Map<string, Set<VocabPos>> {
  let idx = posIndexCache.get(bank);
  if (!idx) {
    idx = new Map();
    for (const e of bank) {
      const k = `${langOfEntry(e) ?? ""}|${normalizeTerm(e.term)}`;
      let s = idx.get(k);
      if (!s) idx.set(k, (s = new Set()));
      s.add(e.pos);
    }
    posIndexCache.set(bank, idx);
  }
  return idx;
}

/**
 * Lehet-e `c` a játék-alakú cloze elterelője `entry` mellett (2–3. pont + hangtan). Exportált, hogy a teszt a TELJES
 * jelöltkészletet ellenőrizhesse (nem csak a kisorsoltat).
 */
export function isGameClozeDistractor(entry: VocabEntry, c: VocabEntry, bank: readonly VocabEntry[]): boolean {
  const lang = langOfEntry(entry);
  if (!lang || langOfEntry(c) !== lang || c.id === entry.id || c.kind !== "word") return false;
  const want = GAME_DISTRACTOR_POS[lang][entry.pos];
  if (!want || c.pos !== want) return false;
  const term = normalizeTerm(c.term);
  // Felsőfok („my youngest”, „the best”) főnévként is áll.
  if (DUAL_USE.has(term) || c.topic === "colors" || (c.pos === "adj" && /est$/u.test(term))) return false;
  if (posIndex(bank).get(`${lang}|${term}`)?.has(entry.pos)) return false;
  const onset = onsetRule(entry, lang);
  return !onset || onset(c.term);
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
  // Játék-alakú cloze (kanban #50): csak a célszófaj helyén nyelvtanilag nem álló, egyszavas elterelő
  // (`isGameClozeDistractor`; más szófajú, ezért a (2) szomszéd szintű, majd a (3) bármely szintű sorból).
  const game = type === "cloze" && style === "game";
  const tiers: VocabEntry[][] = [[], [], []];
  for (const c of groupOf(bank, lang, game ? "word" : entry.kind)) {
    if (c.id === entry.id) continue;
    if (game && !isGameClozeDistractor(entry, c, bank)) continue;
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
    case "phrase-meaning": return entry.term;
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
  if (type === "hu-to-target" || type === "cloze") quiz.speakAfter = entry.term;
  return isPlayableQuestion(quiz) ? quiz : null;
}
