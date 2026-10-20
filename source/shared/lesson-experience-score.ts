import type { OpenTask } from "./lesson-experience";
import { answerWindow, gradeTypedAnswers } from "./answer-value";

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
  return (negationKind(answer) !== "none" && negationKind(sample, { weak: true }) === "none")
    || (negationKind(sample) === "en" && negationKind(answer, { weak: true }) === "none");
}

export function normalizeAnswer(value: string): string {
  const normalized = value.toLocaleLowerCase("hu").normalize("NFD").replace(/\p{M}/gu, "").replace(/(\d)[,.](?=\d)/g, "$1.").replace(/−/g, "-");
  return (normalized.match(/[+-]?\d+(?:\.\d+)?|[\p{L}]+/gu) ?? []).map(t => t.replace(/^\+(?=\d)/, "")).join(" ");
}
/** v2: a műveleti jel és a törtvonal is token — a „8 : 2” és a „8 · 2”, a „1/2” és a „2/1” különbözik. */
export function normalizeAnswerV2(value: string): string {
  const normalized = value.toLocaleLowerCase("hu").normalize("NFD").replace(/\p{M}/gu, "").replace(/(\d)[,.](?=\d)/g, "$1.").replace(/[−–]/g, "-").replace(/[×*]/g, "·").replace(/÷/g, ":");
  return (normalized.match(/\d+(?:\.\d+)?(?:\/\d+)?|[\p{L}]+|[+\-·:]/gu) ?? []).join(" ");
}
const tokensOf = (s: string) => normalizeAnswer(s).split(/\s+/).filter(Boolean);
const tokensOfV2 = (s: string) => normalizeAnswerV2(s).split(/\s+/).filter(Boolean);
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
  return distance(token, word) <= (Math.max(token.length, word.length) > 8 ? 2 : 1);
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

function conceptHit(tokens: string[], alternatives: readonly string[], tokenize: (s: string) => string[] = tokensOf): boolean {
  return alternatives.some(phrase => tokenize(phrase).every(word => tokens.some(token => wordHit(token, word))));
}
const OPERATOR_TOKEN = /^[+\-·:]$/;
/**
 * Kategóriakvóta (v2): hány KÜLÖNBÖZŐ csoportot talál a válasz úgy, hogy egy válasz-token csak egy csoportot igazolhat
 * (review #159, P2: az „alma” egyetlen előfordulása nem két példa, ha két csoportban is szerepel).
 */
function distinctHits(tokens: string[], groups: ReadonlyArray<readonly string[]>): number {
  const used = new Set<number>();
  let found = 0;
  for (const group of groups) {
    let hit: number[] | null = null;
    for (const phrase of group) {
      const indices: number[] = [];
      const complete = tokensOfV2(phrase).every(word => {
        const i = tokens.findIndex((token, k) => !used.has(k) && !indices.includes(k) && wordHit(token, word));
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
export function missingAnswerConcepts(answer: string, task: Pick<OpenTask, "required">): string[][] {
  const tokens = tokensOf(answer).slice(0, 500);
  return task.required.filter(group => !conceptHit(tokens, group));
}
export type AnswerScore = { state: "ok" | "partial" | "fail"; score: number; reason: string };

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
export function evaluateOpenAnswerV1(answer: string, task: OpenTask): AnswerScore {
  const tokens = tokensOf(answer).slice(0, 500);
  if (tokens.length < task.minWords) return { state: "fail", score: 0, reason: "A válasz még túl rövid." };
  const hits = task.required.filter(c => conceptHit(tokens, c)).length;
  if (hits < Math.ceil(task.required.length / 2)) return { state: "fail", score: 0, reason: "A lényegi fogalmak még hiányoznak." };
  // A correct sentence may use only rubric words. Off-rubric filler cannot prove
  // originality, and adding a bonus term must never lower an otherwise correct score.
  const connective = tokens.some(t => (SENTENCE_CONNECTIVES as readonly string[]).includes(t));
  const hasUnexpectedNegation = unexpectedNegation(answer, task.sample);
  if (hits < task.required.length || (task.needsSentence && !connective) || hasUnexpectedNegation) {
    const reason = hits < task.required.length ? `Részben jó. Még ${task.required.length - hits} kötelező fogalom hiányzik.` : hasUnexpectedNegation ? "A tagadás eltér a mintaválasz állításától; ellenőrizd a jelentést." : "A fogalmak megvannak; fogalmazd őket összefüggő mondattá.";
    return { state: "partial", score: 0.5, reason };
  }
  return { state: "ok", score: 1, reason: "A szükséges fogalmak és a megfogalmazás is rendben vannak." };
}

/**
 * v2 — típusos feladat. Elsőbbség: a részeredmények értéke dönt a számról (mind helyes → tovább a szöveges rubrikára;
 * egy sem → 0; némelyik → legfeljebb fél pont); a kategóriakvóta különböző elemeket számol (egy szinonimacsoport = 1 elem);
 * a `required` a szöveges részt méri; minWords/needsSentence/tagadás a v1 szabálya szerint.
 */
export function evaluateOpenAnswerV2(rawAnswer: string, task: OpenTask): AnswerScore {
  // Review #159: a v2 tokenlista műveleti jelet is tartalmaz — a szószám (1. szabály: az írásjel 0 szó) és a típusos érték
  // ugyanabból az 500 szavas ablakból számol.
  const answer = answerWindow(rawAnswer);
  const tokens = tokensOfV2(answer);
  const wordCount = tokens.filter(t => !OPERATOR_TOKEN.test(t)).length;
  if (wordCount < task.minWords) return { state: "fail", score: 0, reason: "A válasz még túl rövid." };
  let partialReason: string | null = null;
  if (task.typedAnswers?.length) {
    const grade = gradeTypedAnswers(answer, task.typedAnswers);
    if (grade.undecidable) return { state: "fail", score: 0, reason: "A feladat referenciaértéke nem értelmezhető; szólj a tanárnak." };
    if (grade.correct === 0) return { state: "fail", score: 0, reason: grade.verdicts[0]?.reason ?? "A végeredmény hiányzik vagy hibás." };
    if (grade.correct < grade.total) partialReason = `Részben jó: ${grade.total - grade.correct} részeredmény hibás vagy hiányzik. ${grade.verdicts.find(v => !v.ok)?.reason ?? ""}`.trim();
  }
  for (const rule of task.requiredDistinct ?? []) {
    const distinct = distinctHits(tokens, rule.from);
    if (distinct === 0) return { state: "fail", score: 0, reason: `A(z) „${rule.category}” kategóriából egy példa sincs a válaszban.` };
    if (distinct < rule.count) partialReason ??= `Részben jó: a(z) „${rule.category}” kategóriából ${rule.count} különböző példa kell, ${distinct} van.`;
  }
  // S5a: a kifejezéscsoportok a kötelező csoportokkal együtt számítanak (fele- és összes-szabály).
  const phraseGroups = task.requiredPhrases ?? [];
  const phraseHits = phraseGroups.filter(g => phraseHit(tokens, g)).length;
  const conceptHits = task.required.filter(c => conceptHit(tokens, c, tokensOfV2)).length;
  // S6a: a sorrendi szabály EGY kötelező feltétel (fele- és összes-szabály).
  const hasOrder = Boolean(task.requiredOrder?.length);
  const orderHit = hasOrder && orderSatisfied(tokens, task.requiredOrder!);
  const hits = conceptHits + phraseHits + (orderHit ? 1 : 0);
  const total = task.required.length + phraseGroups.length + (hasOrder ? 1 : 0);
  if (total && hits < Math.ceil(total / 2) && !task.typedAnswers?.length) return { state: "fail", score: 0, reason: "A lényegi fogalmak még hiányoznak." };
  const connective = tokens.some(t => (SENTENCE_CONNECTIVES as readonly string[]).includes(t));
  const hasUnexpectedNegation = unexpectedNegation(answer, task.sample);
  if (partialReason || hits < total || (task.needsSentence && !connective) || hasUnexpectedNegation) {
    const reason = partialReason ?? (conceptHits < task.required.length ? `Részben jó. Még ${task.required.length - conceptHits} kötelező fogalom hiányzik.` : phraseHits < phraseGroups.length ? "Részben jó. A helyes nyelvtani alak vagy szórend még hiányzik." : hasOrder && !orderHit ? "Részben jó. A lépések / fogalmak sorrendje nem megfelelő." : hasUnexpectedNegation ? "A tagadás eltér a mintaválasz állításától; ellenőrizd a jelentést." : "A fogalmak megvannak; fogalmazd őket összefüggő mondattá.");
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
  `1. Szó = szám vagy betűsor; a kötőjeles szó 2 szó, az írásjel 0 szó; csak az első 500 szó számít. minWords: ennél kevesebb szó = 0 pont — a minWords a LEGRÖVIDEBB teljes helyes válasz szószáma legyen, nem a minta hosszáé.`,
  `2. required = ÉS-csoportok; egy csoporton belül VAGY-alternatívák. Többszavas alternatíva: minden szava külön, bármilyen sorrendben. Szóillesztés: azonos alak; ≥ 4 betűs szónál EGY toldalék (${STEM_SUFFIXES.join(", ")}) lehagyva is; ≥ 5 betűnél 1 elütés (8 betű fölött 2). Szám és a tagadószavak (${NEGATIONS.join(", ")}) csak pontosan.`,
  "3. Pontérték: a csoportok kevesebb mint felének találata → 0; nem mind → 0,5 („Még N kötelező fogalom hiányzik”); mind → 1, ha a needsSentence és a tagadás is rendben.",
  `4. needsSentence: legalább egy kötőszó/névelő kell ezek közül: ${SENTENCE_CONNECTIVES.slice(0, 19).join(", ")}; különben 0,5. Tagadás: a nem/not, a cannot és az aposztrófos angol n't (don't, mustn't, can't…) tagadásnak számít; ha a válaszban van ilyen tagadás, a mintában semmilyen (no/never sem) → 0,5; ha a minta angolul tagadó (not / n't), a válaszban pedig nincs tagadás (a no, never, nothing… is annak számít) → 0,5. (A „must” és a „mustn't” így nem cserélhető fel.)`,
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

/** Keep oral practice present in every round, not only somewhere in the full bank. */
export function sampleTaskIds(bank: readonly OpenTask[], count = 15, random = Math.random): string[] {
  const oral = new Set(sampleIds(bank.filter(t => t.mode === "oral"), Math.min(2, count), random));
  const selected = [...oral, ...sampleIds(bank.filter(t => !oral.has(t.id)), count - oral.size, random)];
  return sampleIds(selected.map(id => ({ id })), count, random);
}
