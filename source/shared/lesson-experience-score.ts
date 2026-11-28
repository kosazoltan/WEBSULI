import type { OpenTask } from "./lesson-experience";
import { answerWindow, gradeTypedAnswers } from "./answer-value";
import { classifyOpenTask } from "./practice-policy";
import { balancedCounts } from "./practice-sampling";

/**
 * Spec 2026-09-30-utasitasrendszer-rendbetetel (U1): a pontozó két úton fut.
 * - v1 (`evaluateOpenAnswerV1`): a régi kulcsszó-pontozó, VÁLTOZATLANUL — minden régi lecke és a HTML-leckék `ee_evaluate`
 *   párja így pontozódik (tests/lesson-html-score.test.ts). Ismert maradó hibái: sorrend- és törtvak illesztés (H31),
 *   globális tagadás-heurisztika (H1/H2 nem teljesen lezárt).
 * - v2 (`evaluateOpenAnswerV2`): csak a típusos mezőt (`typedAnswers`, `requiredDistinct`) hordozó feladatra; a részeredmények
 *   értéke dönt, a `required` a szöveges részt méri, a műveleti jel a normalizálásban megmarad.
 * A szabályok szövege a modellnek (`OPEN_ANSWER_RULES_HU`) ugyanezekből a konstansokból generálódik — a skill és a
 * kód nem csúszhat el (B4).
 */

/** Toldalékok, amelyeket a szóillesztés (≥ 4 betűs szónál) egyszer levág. */
export const STEM_SUFFIXES = ["juk", "unk", "ban", "ben", "bol", "rol", "tol", "nak", "nek", "val", "vel", "hoz", "hez", "uk", "ja", "je", "ra", "re", "ba", "be", "ot", "et", "at", "ok", "ek", "k", "t", "n"] as const;
/** Kötőszavak/névelők, amelyek egyike kell a `needsSentence` feladat „mondat” feltételéhez. */
export const SENTENCE_CONNECTIVES = ["mert", "es", "olyan", "ami", "amit", "azt", "hogy", "lehet", "tudom", "tudjuk", "mint", "ezert", "igy", "mivel", "tehat", "ha", "akkor", "vagyis", "mig", "a", "az", "because", "and", "is", "are", "there", "have", "has", "do", "does", "an", "the", "some", "any", "how", "much", "many", "of", "on", "in"] as const;
const NEGATIONS = ["nem", "ne", "not", "no"] as const;
/** Spec 2026-10-20-pontozo-angol-tagadas: aposztróf nélküli angol tagadó alakok (pontos, ékezet nélküli egyezés — a „dönt” nem „dont”). */
export const ENGLISH_NEGATIONS = ["not", "cannot", "dont", "doesnt", "didnt", "cant", "couldnt", "wont", "wouldnt", "shouldnt", "mustnt", "isnt", "arent", "wasnt", "werent", "hasnt", "havent", "hadnt", "neednt"] as const;
/** Review #330: gyenge (nem összevont) angol tagadószavak — a tagadó válasz felismeréséhez („There is no water”, „You must never run”). */
export const ENGLISH_WEAK_NEGATIONS = ["no", "never", "nothing", "nobody", "none", "nowhere", "neither", "nor"] as const;
/**
 * Spec 2026-11-03-pontozo-szoalak: a mintában más szóval kifejezett magyar tagadás („tilos eltemetni”, „sosem hazudott”) — a válasz „nem”-je
 * ilyenkor nem váratlan (mért: 6 helyes, tagadó válasz csak fél pontot kapott).
 */
export const HU_WEAK_NEGATIONS = ["sem", "se", "soha", "sosem", "semmi", "semmit", "senki", "senkit", "sehol", "nincs", "nincsen", "nincsenek", "tilos", "ne"] as const;
/**
 * Fosztóképző a tő után (normalizált alakon): a „boldogtalan”, „jogtalan”, „lelkiismeretlen”, „szénmentes” NEM a tő szava. Review #380:
 * az angol „colourless”, „sugarfree” sem.
 */
const PRIVATIVE_SUFFIX = /^(t?[ae]l[ae]n|[ae]?tl[ae]n|l[ae]n|mentes|less|free)/;
/** Review #380: a jelentést megfordító előtag nem összetételi előtag („disagree”, „dishonest”, „nemdohányzó”). */
const NEGATING_PREFIXES = new Set(["dis", "non", "mis", "anti", "counter", "mal", "nem"]);
/** Az alak-tűrés (képzés, több toldalék, összetett szó) legrövidebb rubrikaszava: rövidebbnél csak a régi szabályok. */
const FORM_MIN_LENGTH = 5;

/** A NYERS szöveg szavai: kisbetű, az ékezet és az aposztróf megmarad (a normalizálás „mustn t”, „pin t”, „dont” alakjai nem téveszthetők). */
function rawWords(text: string): string[] {
  return text.toLocaleLowerCase("en").normalize("NFC").split(/[^\p{L}'’]+/u).map((w) => w.replace(/^['’]+|['’]+$/g, "")).filter(Boolean);
}

/**
 * Spec 2026-10-20-pontozo-angol-tagadas (mért: Where I Live e1f59f8d — a „You must run” teljes pontot kapott a „You mustn't run”
 * mintára, mert a szótövezés a „mustn” „n”-jét toldalékként levágja) + review #330: a tagadás a NYERS szövegből.
 * „en”: not / cannot / valódi n't-összevonás (aposztróffal: mustn't, don't) / aposztróf nélküli zárt lista; „hu”: nem;
 * `weak`: a gyenge angol tagadószavak (no, never…) is számítanak. A „PIN-t”, a „dönt” és a „legyen t” nem tagadás.
 */
export function negationKind(text: string, opts: { weak?: boolean } = {}): "none" | "hu" | "en" {
  const words = rawWords(text);
  const en = words.some((w) => (ENGLISH_NEGATIONS as readonly string[]).includes(w) || /^[a-z]+n['’]t$/.test(w)
    || (opts.weak === true && (ENGLISH_WEAK_NEGATIONS as readonly string[]).includes(w)));
  if (en) return "en";
  return words.includes("nem") ? "hu" : "none";
}
/**
 * Kétirányú tagadásőr: (1) erős tagadású válasz (nem / not / n't) teljesen állító mintára; (2) állító válasz ANGOLUL tagadó mintára —
 * a válaszban a gyenge tagadószó (no, never…) is tagadásnak számít. A magyar fordított irány változatlan.
 */
function unexpectedNegation(answer: string, sample: string): boolean {
  const sampleNegates = negationKind(sample, { weak: true }) !== "none" || rawWords(sample).some((w) => (HU_WEAK_NEGATIONS as readonly string[]).includes(w));
  return (negationKind(answer) !== "none" && !sampleNegates)
    || (negationKind(sample) === "en" && negationKind(answer, { weak: true }) === "none");
}

/**
 * Spec 2026-11-23-pontozo-rubrika-visszamasolas (T-2): kisbetűs alak; `keepAccents` = az ékezet megmarad (NFC) — a rövid rubrikaszó
 * ékezet-összevetéséhez. A két alak tokenjei egy az egyben megfelelnek egymásnak (az NFC ékezetes betű egy betű, a `\p{L}` része).
 */
function lowerText(value: string, keepAccents: boolean): string {
  const lower = value.toLocaleLowerCase("hu");
  return keepAccents ? lower.normalize("NFC") : lower.normalize("NFD").replace(/\p{M}/gu, "");
}
// A `normalizeAnswer` egyparaméteres marad: `.map(normalizeAnswer)` hívással is fut (experience-builder), a második argumentum az index lenne.
export function normalizeAnswer(value: string): string {
  return normalizeV1(value, false);
}
function normalizeV1(value: string, keepAccents: boolean): string {
  const normalized = lowerText(value, keepAccents).replace(/(\d)[,.](?=\d)/g, "$1.").replace(/−/g, "-")
    // Spec 2026-10-20-v1-kotojeles-szam: a betű / számjegy utáni számjel nem előjel — a „552-270” két szám, nem „552 -270”. Review #348:
    // lookbehind nélkül (a régebbi Safari a lookbehindos regexet be sem tölti) — a jel szóközre cserélődik.
    .replace(/([\p{L}\d])[+-](?=\d)/gu, "$1 ");
  return (normalized.match(/[+-]?\d+(?:\.\d+)?|[\p{L}]+/gu) ?? []).map(t => t.replace(/^\+(?=\d)/, "")).join(" ");
}
/** v2: a műveleti jel és a törtvonal is token — a „8 : 2” és a „8 · 2”, a „1/2” és a „2/1” különbözik. */
export function normalizeAnswerV2(value: string): string {
  return normalizeV2(value, false);
}
function normalizeV2(value: string, keepAccents: boolean): string {
  const normalized = lowerText(value, keepAccents).replace(/(\d)[,.](?=\d)/g, "$1.").replace(/[−–]/g, "-").replace(/[×*]/g, "·").replace(/÷/g, ":");
  return (normalized.match(/\d+(?:\.\d+)?(?:\/\d+)?|[\p{L}]+|[+\-·:]/gu) ?? []).join(" ");
}
const tokensOf = (s: string) => normalizeAnswer(s).split(/\s+/).filter(Boolean);
const tokensOfV2 = (s: string) => normalizeAnswerV2(s).split(/\s+/).filter(Boolean);
const rawTokensOf = (s: string) => normalizeV1(s, true).split(/\s+/).filter(Boolean);
const rawTokensOfV2 = (s: string) => normalizeV2(s, true).split(/\s+/).filter(Boolean);
function stem(w: string): string {
  for (const suffix of STEM_SUFFIXES) {
    if (w.length > suffix.length + 3 && w.endsWith(suffix)) return w.slice(0, -suffix.length);
  }
  return w;
}
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const row = [i + 1];
    for (let j = 0; j < b.length; j++) row.push(Math.min(row[j] + 1, prev[j + 1] + 1, prev[j] + Number(a[i] !== b[j])));
    prev = row;
  }
  return prev[b.length];
}
function wordHit(token: string, word: string): boolean {
  if (token === word) return true;
  // Numbers, negation and short words may never be "corrected" into another answer.
  if (/\d/.test(token + word) || (NEGATIONS as readonly string[]).includes(word)) return false;
  if (Math.min(token.length, word.length) >= 4 && (stem(token) === word || token === stem(word) || stem(token) === stem(word))) return true;
  if (Math.min(token.length, word.length) < 5) return false;
  return distance(token, word) <= (Math.max(token.length, word.length) > 8 ? 2 : 1) || formHit(token, word);
}
/**
 * Spec 2026-11-03-pontozo-szoalak (mért: a vak helyes diákválaszok pontvesztésének fő oka): a ≥ 5 betűs rubrikaszó (vagy egytoldalékos töve)
 * képzett / többszörösen ragozott alakja (a szóval kezdődő hosszabb szó — „makacsságában”, „lelkiismeretével”, „megkövezéssel”), kivéve a
 * fosztóképzőset; az összetett szó utótagja (≥ 3 betűs előtaggal — „sziklabarlangba”); és a tövek elütése.
 */
function formHit(token: string, word: string): boolean {
  const bases = [...new Set([word, stem(word)])].filter((b) => b.length >= FORM_MIN_LENGTH);
  // Review #380: a fosztóképző a TELJES szó után is tilt (haszon+talan, oxigén+mentes) — a rövidebb tő („haszo|ntalan”) nem kerülheti meg.
  if (bases.some((b) => token.startsWith(b) && privativeBetween(token, b.length, word.length))) return false;
  for (const base of bases) {
    if (token.length > base.length && token.startsWith(base)) return true;
    if ([token, stem(token)].some((t) => t.length - base.length >= 3 && t.endsWith(base) && !NEGATING_PREFIXES.has(t.slice(0, t.length - base.length)))) return true;
  }
  const [a, b] = [stem(token), stem(word)];
  return Math.min(a.length, b.length) >= FORM_MIN_LENGTH && distance(a, b) <= (Math.max(a.length, b.length) > 8 ? 2 : 1);
}
/** A `from` (az alap vége) és a `to` (a teljes szó vége) közti bármely ponton kezdődő fosztóképző. */
function privativeBetween(token: string, from: number, to: number): boolean {
  for (let i = from; i <= Math.max(from, to); i++) if (PRIVATIVE_SUFFIX.test(token.slice(i))) return true;
  return false;
}
/**
 * J1 (docs/specs/2026-10-16-egyfutas-atvilagitas.md): a `candidate` válasz normalizált tokenjei között szerepel-e a `covered` válasz
 * MINDEN normalizált tokenje, PONTOSAN. Ha igen, egy szócsoport-rubrika — amely a `covered` választ teljes ponttal elfogadja — a
 * `candidate`-et sem utasíthatja el: a szórendet és a viszonyt a pontozó nem méri. Review #263: csak pontos azonosság bizonyít — a pontozó
 * elütés- és szótő-tűrése nem tranzitív (a „porta” / „torta” esetet egy további csoport szétválasztaná). A pontozást nem változtatja.
 */
export function answerTokensCover(candidate: string, covered: string): boolean {
  const have = new Set(tokensOf(candidate));
  const need = tokensOf(covered);
  return need.length > 0 && need.every((word) => have.has(word));
}

/**
 * Spec 2026-11-23-pontozo-rubrika-visszamasolas (T-2, #132): a válasz ékezetes tokenjei — csak ha a válaszban VAN ékezetes betű (a tanuló
 * ékezettel ír, tehát a rövid szó ékezete jelentést hordoz: „hát” ≠ „hat”). Ékezet nélküli válasznál null: a mai tűrés marad (nem tudni,
 * van-e ékezet a tanuló billentyűzetén). Null akkor is, ha a két tokenlista nem felel meg egymásnak (kóbor kombináló jel).
 */
function accentedTokens(answer: string, tokens: readonly string[], v2: boolean): string[] | null {
  if (!/\p{M}/u.test(answer.normalize("NFD"))) return null;
  const raw = (v2 ? rawTokensOfV2 : rawTokensOf)(answer).slice(0, tokens.length);
  return raw.length === tokens.length ? raw : null;
}
/**
 * T-2: a rövid (< FORM_MIN_LENGTH betűs) rubrikaszó és a válasz-token KÖZÖS TÖVÉNEK ékezete azonos („kór” ≠ „kor”); a toldalék ékezete
 * nem számít („szívről” = „szív”, a toldaléklista ékezet nélküli).
 */
function accentAgrees(rawToken: string, rawWord: string, token: string, word: string): boolean {
  const n = Math.min(stem(token).length, stem(word).length);
  return rawToken.slice(0, n) === rawWord.slice(0, n);
}
/** T-2: a rubrika-alternatíva szavai és (ékezetes válasznál) ékezetes párjuk; `rawWords` null, ha nem kell / nem felel meg. */
function phraseWords(phrase: string, tokenize: (s: string) => string[], raw: readonly string[] | null): { words: string[]; rawWords: string[] | null } {
  const words = tokenize(phrase);
  const rawWords = raw ? (tokenize === tokensOfV2 ? rawTokensOfV2 : rawTokensOf)(phrase) : null;
  return { words, rawWords: rawWords && rawWords.length === words.length ? rawWords : null };
}
/** A válasz `i`. tokenje a rubrika `k`. szava-e — a szóillesztés tűrésével, rövid szónál (ékezetes válaszban) az ékezet-őrrel. */
function tokenHit(tokens: readonly string[], raw: readonly string[] | null, i: number, words: readonly string[], rawWords: readonly string[] | null, k: number): boolean {
  const token = tokens[i], word = words[k];
  return wordHit(token, word) && (!raw || !rawWords || word.length >= FORM_MIN_LENGTH || accentAgrees(raw[i], rawWords[k], token, word));
}
function conceptHit(tokens: string[], alternatives: readonly string[], tokenize: (s: string) => string[] = tokensOf, raw: readonly string[] | null = null): boolean {
  return alternatives.some(phrase => {
    const { words, rawWords } = phraseWords(phrase, tokenize, raw);
    return words.every((_, k) => tokens.some((_t, i) => tokenHit(tokens, raw, i, words, rawWords, k)));
  });
}

/**
 * T-2 (#130): a „nem tudom” nem válasz — a szavai (a „nem” is) nem adnak rubrika-találatot és nem tagadnak. Vesszővel elválasztva („Nem,
 * tudom, hogy …”) igen/nem válasz + mondat, nem nem-válasz. Lookbehind nélkül (régebbi Safari): a megelőző nem-betű a találat része.
 */
// Review #553 (Copilot): csak a tagmondatot LEZÁRÓ kifejezés nem-válasz (utána szövegvég vagy írásjel) — a „Nem tudok úszni.” érdemi tagadó
// mondat, nem törlődik.
const NON_ANSWER = /(^|[^\p{L}'’])(?:nem\s+(?:tudom|tudok|tudjuk|tudnám|tudnam|tom)|nemtom|fogalmam\s+sincs(?:en)?|i\s+(?:don['’]?t|do\s+not)\s+know|idk)(?=\s*(?:$|[.,;:!?…]))/giu;
/**
 * Review #553 (Copilot): ha a mintaválaszban is van ilyen kifejezés (fordítás: „Fordítsd angolra: Nem tudom.” → „I don't know.”), az a
 * feladat elvárt tartalma — ekkor nem törlődik.
 */
export function stripNonAnswer(answer: string, sample = ""): string {
  const text = answer.normalize("NFC");
  return new RegExp(NON_ANSWER.source, "iu").test(sample.normalize("NFC")) ? text : text.replace(NON_ANSWER, "$1 ");
}
const CHOICE_WORDS = new Set(["vagy", "avagy", "or"]);
export const QUESTION_COPY_REASON = "A válasz csak a kérdést ismétli. Írd le a saját válaszodat.";
/**
 * T-2 (#132): a válasz CSAK a kérdés visszamásolása — minden szava a kérdés legalább 3 szavas, folytonos szakaszaiból áll, és ezek a kérdés
 * szavainak legalább felét kiadják (a kérdés ≥ 4, a válasz ≥ 3 szó). Az új információt is adó vagy a választó kérdésből csak egy részt
 * kiemelő válasz nem ilyen.
 */
export function copiesQuestionOnly(answer: string, question: string | undefined): boolean {
  if (!question) return false;
  const q = tokensOf(question), a = tokensOf(answer).slice(0, 500);
  if (q.length < 4 || a.length < 3 || a.length * 2 < q.length) return false;
  // Review #553 (Codex, Copilot, Vercel): a választó kérdés („Fagy vagy forr a víz 100 fokon?”) egyik lehetőségét kiemelő folytonos részlet
  // („Forr a víz 100 fokon.”) választás, nem másolat — csak a választó szót („vagy”, „or”) is megismétlő válasz az.
  if (q.some((w) => CHOICE_WORDS.has(w)) && !a.some((w) => CHOICE_WORDS.has(w))) return false;
  const covered = new Array<boolean>(a.length).fill(false);
  for (let i = 0; i < a.length; i++) {
    let best = 0;
    for (let j = 0; j < q.length; j++) {
      let l = 0;
      while (i + l < a.length && j + l < q.length && a[i + l] === q[j + l]) l++;
      best = Math.max(best, l);
    }
    if (best >= 3) covered.fill(true, i, i + best);
  }
  return covered.every(Boolean);
}
const questionCopy = (): AnswerScore => ({ state: "fail", score: 0, reason: QUESTION_COPY_REASON });
const OPERATOR_TOKEN = /^[+\-·:]$/;
/**
 * Kategóriakvóta (v2): hány KÜLÖNBÖZŐ csoportot talál a válasz úgy, hogy egy válasz-token csak egy csoportot igazolhat
 * (review #159, P2: az „alma” egyetlen előfordulása nem két példa, ha két csoportban is szerepel).
 */
function distinctHits(tokens: string[], groups: ReadonlyArray<readonly string[]>, raw: readonly string[] | null = null): number {
  const used = new Set<number>();
  let found = 0;
  for (const group of groups) {
    let hit: number[] | null = null;
    for (const phrase of group) {
      const indices: number[] = [];
      // Review #553 (Copilot): a kvóta-illesztés is ékezet-őrzött („bőr” ≠ „bor” ékezetes válaszban), a rubrikával azonos szabállyal.
      const { words, rawWords } = phraseWords(phrase, tokensOfV2, raw);
      const complete = words.every((_, w) => {
        const i = tokens.findIndex((_t, k) => !used.has(k) && !indices.includes(k) && tokenHit(tokens, raw, k, words, rawWords, w));
        if (i >= 0) indices.push(i);
        return i >= 0;
      });
      if (complete) { hit = indices; break; }
    }
    if (hit) { hit.forEach(i => used.add(i)); found++; }
  }
  return found;
}
/** Generation diagnostics use the exact learner-side matcher, not another approximation. */
export function missingAnswerConcepts(answer: string, task: Pick<OpenTask, "required"> & { sample?: string }): string[][] {
  const text = stripNonAnswer(answer, task.sample);
  const tokens = tokensOf(text).slice(0, 500);
  const raw = accentedTokens(text, tokens, false);
  return task.required.filter(group => !conceptHit(tokens, group, tokensOf, raw));
}
export type AnswerScore = { state: "ok" | "partial" | "fail"; score: number; reason: string };

/**
 * Spec 2026-11-17-nyilt-feladat-rovid-valasz: a `minWords`-nél rövidebb válasz üzenetei és ítélete. A tartalmilag teljes (minden kötelező
 * tartalmi feltételt teljesítő) rövid válasz FÉL pont — a 2026-09-11-i szerződés szerint a puszta kulcsszólista részpont, nem nulla —,
 * teljes pontot rövid válasz soha nem kap. Az üzenet megmondja a teendőt, és nem utal írásjelre / mondatformára.
 */
/** S7b: a „tömör, de teljes” ág egyedi indoklás-előtagja — a döntőbíró ezzel ismeri fel az ágat (új mező nélkül). */
export const SHORT_COMPLETE_PREFIX = "A lényeg megvan.";
export const isShortComplete = (s: { state: string; reason: string }): boolean => s.state === "partial" && s.reason.startsWith(SHORT_COMPLETE_PREFIX);
export const shortButCompleteReason = (minWords: number): string => `${SHORT_COMPLETE_PREFIX} Teljes pontért fejtsd ki egész mondatban, legalább ${minWords} szóval.`;
export const shortAndIncompleteReason = (minWords: number): string => `Még nincs benne minden fontos fogalom, és rövid is: írj legalább ${minWords} szót.`;
export const NEEDS_SENTENCE_REASON = "A fogalmak megvannak. Teljes pontért kösd össze őket kötőszóval (mert, hogy, és, ezért…) — az írásjel nem számít.";
/** S7a: a minWords alatti, minden kötelező feltételt teljesítő (tömör) válasz pontja — a modellnek adott szabályszöveg is ezt mondja. */
export const SHORT_COMPLETE_SCORE = 0.5;
/** S7a: a nyílt válasz szabályszövegének verziója (a csomag-hash és a telemetria része; a lenyomat-őr teszt vele együtt változik). */
export const OPEN_ANSWER_RULES_VERSION = "open-answer-2" as const;

function shortVerdict(complete: boolean, minWords: number): AnswerScore {
  return complete ? { state: "partial", score: SHORT_COMPLETE_SCORE, reason: shortButCompleteReason(minWords) } : { state: "fail", score: 0, reason: shortAndIncompleteReason(minWords) };
}

/** A típusos (v2) feladat ismérve: van részeredmény-lista vagy kategóriakvóta. */
export const isTypedTask = (task: Pick<OpenTask, "typedAnswers" | "requiredDistinct" | "requiredPhrases" | "requiredOrder">): boolean => Boolean(task.typedAnswers?.length || task.requiredDistinct?.length || task.requiredPhrases?.length || task.requiredOrder?.length);

/**
 * Spec 2026-10-20-s6-fogalom-sorrend (S6a): a fogalomcsoport első előfordulása a válaszban (token-index), alternatívánként tűréssel
 * (`wordHit`). -1: nincs. Review #346: a több tokenre bomló alternatíva (kötőjeles összetett szó: „szén-dioxid” → „szen dioxid”) csak
 * EGYMÁS UTÁNI illeszkedéssel kap pozíciót — különben egy korábbi, önálló „szén” horgonyozná, és a fordított sorrend is teljesülne. A
 * műveleti jel (a kötőjel is) az egymásutániságban nem számít („szén dioxid” = „szén-dioxid”), kivéve a csak jelből álló alternatívát.
 */
function firstPosition(tokens: readonly string[], group: readonly string[]): number {
  const wordAt = tokens.map((_, i) => i).filter((i) => !OPERATOR_TOKEN.test(tokens[i]));
  let best = -1;
  for (const alternative of group) {
    const all = tokensOfV2(alternative);
    const words = all.filter((w) => !OPERATOR_TOKEN.test(w));
    const at = words.length
      ? wordAt[wordAt.findIndex((_, j) => j + words.length <= wordAt.length && words.every((word, k) => wordHit(tokens[wordAt[j + k]], word)))] ?? -1
      : tokens.findIndex((_, i) => all.length > 0 && i + all.length <= tokens.length && all.every((sign, k) => tokens[i + k] === sign));
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  return best;
}
/** S6a: minden sorrendi csoport megvan, és az első előfordulásuk szigorúan növekvő. */
function orderSatisfied(tokens: readonly string[], groups: readonly (readonly string[])[]): boolean {
  let previous = -1;
  for (const group of groups) {
    const at = firstPosition(tokens, group);
    if (at < 0 || at <= previous) return false;
    previous = at;
  }
  return true;
}
/** S6b: a sorrendi csoport első pozíciója a válaszban (-1: nincs) — a gépi sorrend-szigorítás iránya és próbája, a pontozóval azonos módon. */
export function orderPosition(answer: string, group: readonly string[]): number {
  return firstPosition(tokensOfV2(answerWindow(answer)), group);
}
/** S6a: a sorrendi szabály nem teljesül (diagnosztika, válaszkulcs-tesztek, J1). */
export function missingOrder(answer: string, task: Pick<OpenTask, "requiredOrder">): boolean {
  if (!task.requiredOrder?.length) return false;
  return !orderSatisfied(tokensOfV2(answerWindow(answer)), task.requiredOrder);
}

/**
 * S5a: számolós (`typedAnswers`) vagy kategóriakvótás (`requiredDistinct`) feladat — ezt a válaszkulcs-tesztek, a minta-igazítás és a
 * kalibráció kihagyja. A csak kifejezéses (`requiredPhrases`) feladat a v2 úton pontoz, de szöveges rubrika: tesztelt és kalibrált.
 */
export const isComputedTask = (task: Pick<OpenTask, "typedAnswers" | "requiredDistinct">): boolean => Boolean(task.typedAnswers?.length || task.requiredDistinct?.length);

/**
 * Spec 2026-10-20-s5-sorrendes-kifejezes (S5a): a kifejezés-alternatíva normalizált (v2) tokenjei a válaszban EGYMÁS UTÁN, ebben a
 * sorrendben, PONTOSAN (tűrés nélkül — a nyelvtani alak a lényeg: „is” ≠ „are”, „feed” ≠ „feeds”).
 */
function phraseHit(tokens: readonly string[], alternatives: readonly string[]): boolean {
  return alternatives.some((phrase) => {
    const need = tokensOfV2(phrase);
    if (!need.length || need.length > tokens.length) return false;
    for (let i = 0; i + need.length <= tokens.length; i++) if (need.every((w, k) => tokens[i + k] === w)) return true;
    return false;
  });
}
/** S5a: a válaszból hiányzó kifejezéscsoportok (diagnosztika, válaszkulcs-tesztek, J1). */
export function missingPhrases(answer: string, task: Pick<OpenTask, "requiredPhrases">): string[][] {
  const tokens = tokensOfV2(answerWindow(answer));
  return (task.requiredPhrases ?? []).filter((group) => !phraseHit(tokens, group));
}

/** v1 — a régi kulcsszó-pontozó, változatlan viselkedéssel (régi leckék, HTML-pontozó paritás). */
export function evaluateOpenAnswerV1(rawAnswer: string, task: OpenTask): AnswerScore {
  // T-2: a „nem tudom” szavai nem számítanak; a csak a kérdést ismétlő válasz 0; ékezetes válaszban a rövid szó ékezete is számít.
  const answer = stripNonAnswer(rawAnswer, task.sample);
  if (copiesQuestionOnly(answer, task.q)) return questionCopy();
  const tokens = tokensOf(answer).slice(0, 500);
  const raw = accentedTokens(answer, tokens, false);
  const hits = task.required.filter(c => conceptHit(tokens, c, tokensOf, raw)).length;
  if (tokens.length < task.minWords) return shortVerdict(task.required.length > 0 && hits === task.required.length, task.minWords);
  if (hits < Math.ceil(task.required.length / 2)) return { state: "fail", score: 0, reason: "A lényegi fogalmak még hiányoznak." };
  // A correct sentence may use only rubric words. Off-rubric filler cannot prove
  // originality, and adding a bonus term must never lower an otherwise correct score.
  const connective = tokens.some(t => (SENTENCE_CONNECTIVES as readonly string[]).includes(t));
  const hasUnexpectedNegation = unexpectedNegation(answer, task.sample);
  if (hits < task.required.length || (task.needsSentence && !connective) || hasUnexpectedNegation) {
    const reason = hits < task.required.length ? `Részben jó. Még ${task.required.length - hits} kötelező fogalom hiányzik.` : hasUnexpectedNegation ? "A tagadás eltér a mintaválasz állításától; ellenőrizd a jelentést." : NEEDS_SENTENCE_REASON;
    return { state: "partial", score: 0.5, reason };
  }
  return { state: "ok", score: 1, reason: "A szükséges fogalmak és a megfogalmazás is rendben vannak." };
}

/**
 * Review K1 (2026-11-17): számolós feladat rövid, HIBÁS válaszánál a tényleges ok jelenik meg (hibás / hiányzó végeredmény, hiányzó
 * mértékegység, kért alak) — a hosszú ág üzeneteivel azonos szöveggel —, nem a „nincs benne minden fogalom”. Null, ha nincs típusos
 * rész, vagy minden részeredmény helyes (akkor a rövid ág általános ítélete dönt).
 */
function typedShortFailure(answer: string, task: OpenTask): AnswerScore | null {
  if (!task.typedAnswers?.length) return null;
  const grade = gradeTypedAnswers(answer, task.typedAnswers);
  if (grade.undecidable) return { state: "fail", score: 0, reason: "A feladat referenciaértéke nem értelmezhető; szólj a tanárnak." };
  if (grade.correct === grade.total) return null;
  return { state: "fail", score: 0, reason: grade.verdicts.find(v => !v.ok)?.reason ?? "A végeredmény hiányzik vagy hibás." };
}

/**
 * A v2 feladat rövid válasza tartalmilag teljes-e. Számolós feladatnál (van `typedAnswers`) a tartalom a VÉGEREDMÉNY: minden részeredmény
 * helyes (és a kvóták megvannak) — a szöveges `required` hiánya itt sem nulláz, ahogy az elég hosszú válasznál sem (lent: a típusos
 * feladat a hiányzó fogalmak miatt nem bukik, csak fél pontra esik). Szöveges feladatnál minden fogalom, kifejezés és a sorrend kell.
 */
function contentCompleteV2(answer: string, tokens: string[], task: OpenTask, raw: readonly string[] | null): boolean {
  const typed = task.typedAnswers ?? [], distinct = task.requiredDistinct ?? [], phrases = task.requiredPhrases ?? [];
  const hasOrder = Boolean(task.requiredOrder?.length);
  if (!(typed.length + distinct.length + task.required.length + phrases.length + (hasOrder ? 1 : 0))) return false;
  if (typed.length) { const grade = gradeTypedAnswers(answer, typed); if (grade.undecidable || grade.correct < grade.total) return false; }
  if (distinct.some(rule => distinctHits(tokens, rule.from, raw) < rule.count)) return false;
  if (typed.length) return true;
  if (task.required.some(c => !conceptHit(tokens, c, tokensOfV2, raw)) || phrases.some(g => !phraseHit(tokens, g))) return false;
  return !hasOrder || orderSatisfied(tokens, task.requiredOrder!);
}

/**
 * v2 — típusos feladat. Elsőbbség: a részeredmények értéke dönt a számról (mind helyes → tovább a szöveges rubrikára;
 * egy sem → 0; némelyik → legfeljebb fél pont); a kategóriakvóta különböző elemeket számol (egy szinonimacsoport = 1 elem);
 * a `required` a szöveges részt méri; minWords/needsSentence/tagadás a v1 szabálya szerint.
 */
export function evaluateOpenAnswerV2(rawAnswer: string, task: OpenTask): AnswerScore {
  // Review #159: a v2 tokenlista műveleti jelet is tartalmaz — a szószám (1. szabály: az írásjel 0 szó) és a típusos érték
  // ugyanabból az 500 szavas ablakból számol.
  // T-2: a „nem tudom” szavai nem számítanak; a csak a kérdést ismétlő válasz 0 (a v1-gyel azonos szabály).
  const answer = answerWindow(stripNonAnswer(rawAnswer, task.sample));
  if (copiesQuestionOnly(answer, task.q)) return questionCopy();
  const tokens = tokensOfV2(answer);
  const raw = accentedTokens(answer, tokens, true);
  const wordCount = tokens.filter(t => !OPERATOR_TOKEN.test(t)).length;
  if (wordCount < task.minWords) return typedShortFailure(answer, task) ?? shortVerdict(contentCompleteV2(answer, tokens, task, raw), task.minWords);
  let partialReason: string | null = null;
  if (task.typedAnswers?.length) {
    const grade = gradeTypedAnswers(answer, task.typedAnswers);
    if (grade.undecidable) return { state: "fail", score: 0, reason: "A feladat referenciaértéke nem értelmezhető; szólj a tanárnak." };
    if (grade.correct === 0) return { state: "fail", score: 0, reason: grade.verdicts[0]?.reason ?? "A végeredmény hiányzik vagy hibás." };
    if (grade.correct < grade.total) partialReason = `Részben jó: ${grade.total - grade.correct} részeredmény hibás vagy hiányzik. ${grade.verdicts.find(v => !v.ok)?.reason ?? ""}`.trim();
  }
  for (const rule of task.requiredDistinct ?? []) {
    const distinct = distinctHits(tokens, rule.from, raw);
    if (distinct === 0) return { state: "fail", score: 0, reason: `A(z) „${rule.category}” kategóriából egy példa sincs a válaszban.` };
    if (distinct < rule.count) partialReason ??= `Részben jó: a(z) „${rule.category}” kategóriából ${rule.count} különböző példa kell, ${distinct} van.`;
  }
  // S5a: a kifejezéscsoportok a kötelező csoportokkal együtt számítanak (fele- és összes-szabály).
  const phraseGroups = task.requiredPhrases ?? [];
  const phraseHits = phraseGroups.filter(g => phraseHit(tokens, g)).length;
  const conceptHits = task.required.filter(c => conceptHit(tokens, c, tokensOfV2, raw)).length;
  // S6a: a sorrendi szabály EGY kötelező feltétel (fele- és összes-szabály).
  const hasOrder = Boolean(task.requiredOrder?.length);
  const orderHit = hasOrder && orderSatisfied(tokens, task.requiredOrder!);
  const hits = conceptHits + phraseHits + (orderHit ? 1 : 0);
  const total = task.required.length + phraseGroups.length + (hasOrder ? 1 : 0);
  if (total && hits < Math.ceil(total / 2) && !task.typedAnswers?.length) return { state: "fail", score: 0, reason: "A lényegi fogalmak még hiányoznak." };
  const connective = tokens.some(t => (SENTENCE_CONNECTIVES as readonly string[]).includes(t));
  const hasUnexpectedNegation = unexpectedNegation(answer, task.sample);
  if (partialReason || hits < total || (task.needsSentence && !connective) || hasUnexpectedNegation) {
    const reason = partialReason ?? (conceptHits < task.required.length ? `Részben jó. Még ${task.required.length - conceptHits} kötelező fogalom hiányzik.` : phraseHits < phraseGroups.length ? "Részben jó. A helyes nyelvtani alak vagy szórend még hiányzik." : hasOrder && !orderHit ? "Részben jó. A lépések / fogalmak sorrendje nem megfelelő." : hasUnexpectedNegation ? "A tagadás eltér a mintaválasz állításától; ellenőrizd a jelentést." : NEEDS_SENTENCE_REASON);
    return { state: "partial", score: 0.5, reason };
  }
  return { state: "ok", score: 1, reason: "A végeredmény, a szükséges fogalmak és a megfogalmazás is rendben vannak." };
}

/** A tanulói és a mintaválasz pontozója: a feladat mezői döntik el az utat (típusos → v2, különben a változatlan v1). */
export function evaluateOpenAnswer(answer: string, task: OpenTask): AnswerScore {
  return isTypedTask(task) ? evaluateOpenAnswerV2(answer, task) : evaluateOpenAnswerV1(answer, task);
}

/**
 * B4: a pontozó szerződése a bank-szerepnek — a KÓD konstansaiból generálva, nem kézzel írt utánzat.
 * (U2 köti a bank promptjába.)
 */
export const OPEN_ANSWER_RULES_HU = [
  "A NYÍLT FELADAT PONTOZÓJA (program, nem ember — ezek a tényleges szabályok):",
  `1. Szó = szám vagy betűsor; a kötőjeles szó 2 szó, az írásjel 0 szó; csak az első 500 szó számít. minWords alatt: ha MINDEN kötelező feltétel teljesül (számolósnál minden részeredmény helyes) → ${String(SHORT_COMPLETE_SCORE).replace(".", ",")} (tömör válasz), különben 0; 1 pont csak minWords-től. A minWords a legrövidebb, egész mondatban KIFEJTETT helyes válasz szószáma, nem a mintáé.`,
  `2. required = ÉS-csoportok; egy csoporton belül VAGY-alternatívák. Többszavas alternatíva: minden szava külön, bármilyen sorrendben. Szóillesztés: azonos alak; ≥ 4 betűs szónál EGY toldalék (${STEM_SUFFIXES.join(", ")}) lehagyva is; ≥ 5 betűnél 1 elütés (8 betű fölött 2); ≥ ${FORM_MIN_LENGTH} betűnél a képzett (makacsságában) és összetett (sziklabarlangba) alak is, -talan/-telen nem. Szám és a tagadószavak (${NEGATIONS.join(", ")}) csak pontosan.`,
  "3. Pontérték minWords-től: a kötelező feltételek (required, requiredPhrases, requiredOrder) kevesebb mint fele → 0 (számolósnál ez nem nulláz); nem mind → 0,5 („Még N kötelező fogalom hiányzik”); mind → 1, ha a needsSentence és a tagadás is rendben.",
  `4. needsSentence: legalább egy kötőszó/névelő kell ezek közül: ${SENTENCE_CONNECTIVES.slice(0, 19).join(", ")}; különben 0,5. Tagadás: a nem/not, a cannot és az aposztrófos angol n't (don't, mustn't, can't…) tagadásnak számít; ha a válaszban van ilyen tagadás, a mintában semmilyen (no/never/tilos/soha sem) → 0,5; ha a minta angolul tagadó (not / n't), a válaszban pedig nincs tagadás (a no, never, nothing… is annak számít) → 0,5. (A „must” és a „mustn't” így nem cserélhető fel.)`,
  "5. TÍPUSOS (zárt matematikai) feladat: typedAnswers = [{part, kind: number|fraction|expression, value, unit?, form?}] részfeladatonként, SORRENDBEN (felcserélt részeredmény hibás). Az érték dönt: 2/1 ≠ 1/2; 0,5 = 1/2 csak form: any esetén; form: simplified-fraction → csak egyszerűsített tört (2/4, 0,5 nem); form: decimal → tizedes/egész alak; form: intermediate-step → a KÉRT köztes kifejezés szerepeljen (35 + 64 − 12), az értékazonos más alak (35 + 8 · 8 − 12) nem; unit → a szám után a mértékegység kötelező. Betűs (algebrai) végeredmény: kind: polynomial, value a teljes kifejezés („x² + 10x + 25”); a program a kifejtett, összevont normálalakot hasonlítja (tagsorrend, szóköz, x^2/x² nem számít); form: expanded (alapértelmezés) → kifejtett, összevont alak kell, a zárójeles (a kérdés másolata) nem; form: factored → szorzattá alakított, zárójeles alak kell. A required ekkor csak a szöveges részt méri; a végeredményt NE tedd required-csoportba.",
  "6. requiredDistinct = [{category, from: [[szinonimák]…], count}]: kategóriánként legalább count KÜLÖNBÖZŐ elem; egy szinonimacsoport egy elem (két szinonima nem két példa). Ezt használd, ha a kérdés „N példát” kér egy halmazból — ne tegyél önkényes mintát kötelezővé.",
  "7. requiredPhrases = [[kifejezés, …]] (nyelvtani alak / szórend): a kifejezés szavai EGYMÁS UTÁN, PONTOSAN (tűrés nélkül; az aposztróf elválaszt: mustn't = mustn t); ÉS-csoportok, csoporton belül VAGY; kötelező feltétel, hiányában ≤ 0,5. A sample-ből vett 2–5 szavas kifejezés; a required a tartalmat méri.",
  "8. requiredOrder = [[fogalom, …], …] (2–4, egyszavas alternatívák — a megkülönböztető szó; sorrendi / műveleti sorrend feladat): a csoportok első előfordulása ebben a sorrendben (tűréssel, a köztes szavak szabadok); kötelező feltétel, fordított sorrend ≤ 0,5.",
  "9. A sample-nek a saját rubrikán 1 pontot kell kapnia (a program ellenőrzi); a program a referenciaértéket a kérdés kifejezéséből újraszámolja — eltérés csomaghiba.",
].join("\n");

export function scoreSummary(points: number, total: number) {
  const percent = total > 0 ? Math.round(100 * points / total) : 0;
  const grade = percent >= 90 ? 5 : percent >= 75 ? 4 : percent >= 60 ? 3 : percent >= 40 ? 2 : 1;
  const label = ["", "Elégtelen", "Elégséges", "Közepes", "Jó", "Jeles"][grade];
  return { points, total, percent, grade, label };
}
export function sampleIds<T extends { id: string }>(bank: readonly T[], count: number, random = Math.random): string[] {
  const ids = bank.map(t => t.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, count);
}

/** Stable display order; saved picks and feedback always retain the original bank index. */
export function quizOptionIndices(question: { id: string; question: string; options: readonly string[] }): number[] {
  let seed = 2166136261;
  for (const character of `${question.id}:${question.question}`) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  const indices = question.options.map((_, index) => index);
  for (let i = indices.length - 1; i > 0; i--) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    const j = (seed >>> 0) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

/**
 * Keep oral practice present in every round, not only somewhere in the full bank.
 * TG-P6: the rest of the round is balanced to 60–75% applied tasks (`balancedCounts`), counting the oral picks too.
 */
export function sampleTaskIds(bank: readonly OpenTask[], count = 15, random = Math.random): string[] {
  const isApply = (t: OpenTask) => classifyOpenTask({ q: t.q, sample: t.sample }).kind === "alkalmazas";
  const oral = new Set(sampleIds(bank.filter(t => t.mode === "oral"), Math.min(2, count), random));
  const rest = bank.filter(t => !oral.has(t.id));
  const oralApply = bank.filter(t => oral.has(t.id) && isApply(t)).length;
  const want = balancedCounts(Math.min(count, bank.length), rest.filter(isApply).length, rest.filter(t => !isApply(t)).length, oralApply, oral.size - oralApply);
  const selected = [...oral, ...sampleIds(rest.filter(isApply), want.apply, random), ...sampleIds(rest.filter(t => !isApply(t)), want.other, random)];
  return sampleIds(selected.map(id => ({ id })), count, random);
}
