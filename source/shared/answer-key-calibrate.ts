/**
 * Tételgyár T2.1b (docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md; tulajdonosi döntés 2026-10-15: gépi kalibráció):
 * a nyílt feladat rubrikája a válaszkulcs-tesztesetekből, MODELLHÍVÁS NÉLKÜL igazodik. Minden lépés után őr: a minta teljes pontot kap, és
 * egyik hibás eset sem — ha sérül, az adott lépés visszavonódik. A pontozó nem változik (a régi leckék pontozása azonos).
 */
import { blockingWrongCases, type AnswerKeyCases } from "./answer-key-tests";
import type { OpenTask } from "./lesson-experience";
import { canonicalAlternative } from "./lesson-experience";
import { ENGLISH_NEGATIONS, ENGLISH_WEAK_NEGATIONS, SENTENCE_CONNECTIVES, evaluateOpenAnswer, isComputedTask, missingAnswerConcepts, missingOrder, missingPhrases, normalizeAnswer, normalizeAnswerV2, orderPosition } from "./lesson-experience-score";
import { inflectedForms, synonymsOf } from "./hu-lexicon";

const NEGATIONS = new Set(["nem", "ne", "sem", "se", "nincs", "sincs"]);
/**
 * S3c: szigorításra nem jelölhető szavak — tagadás (az irány nem tagadással cserélhető) és kötőszó/névelő (nem tartalom). A NYERS kisbetűs
 * alakkal vetjük össze (review #338): ékezet nélkül a „nő” „no”, az „ón” „on”, az „ín” „in” lenne — ezek tartalmi szavak. A kötőszólista
 * ékezet nélküli magyar elemei ezért ékezetes alakjukkal is szerepelnek.
 */
const NOT_DISTINGUISHING = new Set<string>([
  ...NEGATIONS, ...ENGLISH_NEGATIONS, ...ENGLISH_WEAK_NEGATIONS, ...SENTENCE_CONNECTIVES, "és", "ezért", "így", "míg", "tehát",
]);
/**
 * S5b: a kifejezéses szigorításból kizárt tagadásjelek minden támogatott nyelven (review #342) — normalizált (ékezet nélküli, kisbetűs)
 * v2-tokenek. Angol + német, francia, spanyol, olasz; az aposztrófos összevonás maradéka („t”: mustn't, „n”: n'est) is tagadásjel.
 */
const NOT_DISTINGUISHING_NEGATION = new Set<string>([
  ...ENGLISH_NEGATIONS, ...ENGLISH_WEAK_NEGATIONS, "t", "n",
  "nicht", "kein", "keine", "keinen", "keinem", "keiner", "keines", "nie", "niemals", "nichts",
  "ne", "pas", "non", "jamais", "rien", "aucun", "aucune", "ni",
  "nunca", "nada", "ninguno", "ninguna", "ningun", "tampoco", "jamas",
  "mai", "niente", "nulla", "nessuno", "nessuna",
]);
/** S5b: a `requiredPhrases` sémahatárai (`openTaskSchema`): legfeljebb 8 csoport, kifejezésenként legfeljebb 80 karakter. */
const PHRASE_GROUPS_MAX = 8;
const PHRASE_LENGTH_MAX = 80;
const isDistinguishingCandidate = (word: string) => {
  const n = normalizeAnswer(word);
  return n.length >= 2 && !/\d/.test(n) && !NOT_DISTINGUISHING.has(word.toLowerCase());
};
const words = (s: string) => normalizeAnswer(s).split(/\s+/).filter(Boolean);

/** Közös szótő: közös kezdet ≥ 5 betű, és mindkét szó maradéka legfeljebb 5 betű (a „rovar” nem rokona a „rovarbeporzás”-nak). */
function sharedStem(a: string, b: string): boolean {
  if (a === b || /\d/.test(a + b) || NEGATIONS.has(a) || NEGATIONS.has(b)) return false;
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n >= 5 && a.length - n <= 5 && b.length - n <= 5;
}

/** A válasz azon szavai/kifejezései, amelyek a csoport valamely tagjával igazoltan rokonok (adatbank vagy közös szótő). */
function relatedForms(group: readonly string[], answer: string): string[] {
  const out = new Set<string>();
  const answerWords = new Set(words(answer));
  for (const member of group) {
    for (const form of inflectedForms(member, answer)) out.add(form);
    for (const syn of synonymsOf(member)) if (words(syn).every((w) => answerWords.has(w))) out.add(syn);
    const parts = words(member);
    if (parts.length === 1) for (const w of answerWords) if (sharedStem(parts[0], w)) out.add(w);
  }
  const existing = new Set(group.map((m) => normalizeAnswer(m)));
  return [...out].filter((f) => !existing.has(normalizeAnswer(f)));
}

/** Az őr: a minta `ok`, egyik BLOKKOLÓ hibás eset sem `ok` (J1: ugyanaz a predikátum, mint az `answerKeyProblems`-ben — review #338). */
function guardHolds(task: OpenTask, cases: AnswerKeyCases): boolean {
  return evaluateOpenAnswer(task.sample, task).state === "ok" && blockingWrongCases(task, cases).every((w) => evaluateOpenAnswer(w.text, task).state !== "ok");
}

export type Calibration = { task: OpenTask; changes: string[] };
type Tightening = Calibration & { tightened: string[][]; tightenedPhrases: string[][]; tightenedOrder: boolean };

/** A bónuszba sorolás küszöbe: hány helyes esetből kell hiányoznia a csoportnak (alapból legalább 2 — második tulajdonosi döntés 2026-10-15). */
export type CalibrationOptions = {
  demoteWhenMissingIn?: (correctCount: number) => number;
  /**
   * S5b: kifejezéses (sorrendes) szigorítás — csak idegen nyelvi leckén (a hívó a lecke nyelvéből dönti el). A magyar szórend szabad
   * („változatlan marad” = „marad változatlan”), ott a sorrend nem megkülönböztető jel.
   */
  phrases?: boolean;
  /**
   * Spec 2026-10-21-ciklus7: magyar (nem idegen nyelvi) leckén a CSAK toldalékban eltérő hibás próba (pl. „anyának” az „anyával” helyett —
   * a pontozó toldaléktűrő) egyszavas pontos-alak csoporttal (`requiredPhrases`) különböztethető meg; egy szónál a szórend nem számít.
   */
  exactForms?: boolean;
  /**
   * Spec 2026-10-21-ciklus6 + review #357: a lektor által kifogásolt feladatra SEMMILYEN gépi szigorítás (szó, csoport, kifejezés, sorrend)
   * nem fut — különben a lektor által önkényesnek ítélt követelmény a javítás után azonnal visszakerül (mért: „Tulajdonságot kifejező
   * szavak”, 2× elbukott). A lazítás (helyes válasz visszaengedése) továbbra is fut.
   */
  lektorReviewed?: boolean;
};
const AT_LEAST_TWO = (n: number) => Math.min(2, n);

/**
 * Spec 2026-10-20-eroforras-s3c-rubrika-szigoritas: a teljes pontot kapó HIBÁS válasz kizárása modellhívás nélkül. Mért: a bank javítóköreinek
 * fő oka a „fordított irányú” (irányszót cserélő: „csökken” a „nő” helyett) teljes pontos hibás válasz volt, és a kalibráció ilyenkor
 * semmit sem tett. A minta egy olyan szava lesz új kötelező csoport (igazolt rokon alakjaival), amely MINDEN teljes pontos helyes válaszban
 * megvan, a hibás válaszban nincs; csak ha utána a minta és a helyesek teljes pontosak maradnak, a hibás pedig nem. Különben `null`.
 */
function tighten(task: OpenTask, cases: AnswerKeyCases, phrases = false, exactForms = false): Tightening | null {
  if (evaluateOpenAnswer(task.sample, task).state !== "ok") return null;
  const okCorrect = cases.correct.filter((a) => evaluateOpenAnswer(a, task).state === "ok");
  // Bizonyíték nélkül nem szigorítunk: legalább 2 (kevesebb esetnél mind) teljes pontos helyes válasz kell, különben a „minden helyesben megvan” üres igazság.
  if (okCorrect.length < Math.max(1, AT_LEAST_TWO(cases.correct.length))) return null;
  let current: OpenTask = { ...task, required: task.required.map((g) => [...g]), bonus: task.bonus.map((g) => [...g]) };
  const changes: string[] = [];
  const added: string[][] = [];
  const addedPhrases: string[][] = [];
  let addedOrder = false;
  // Az aposztrófos összevonás egy szó (review #338: a „mustn't” ne essen „mustn” + „t” részre); a tagadó összevonás és minden aposztrófos
  // alak kimarad (a pontozó normalizálása szétbontja).
  const raw = [...new Set(task.sample.match(/[\p{L}\d]+(?:['’][\p{L}\d]+)*/gu) ?? [])]
    .filter((w) => !/['’]/.test(w) && isDistinguishingCandidate(w))
    .sort((a, b) => b.length - a.length);
  // A blokkoló kör az eredeti rubrikán mérve; a szigorítás a teljes pontos helyeseket megtartja, így a kör nem változik.
  // Review #347 (P1): a J1 miatt NEM blokkoló, de teljes pontos hibás próba (egy helyes válasz minden szava benne van — pl. ugyanazok a
  // lépések fordított sorrendben) szóval / kifejezéssel elvben sem különböztethető meg, sorrenddel igen: csak a sorrendi lépést kapja, és
  // ha az sem segít, kimarad (nem blokkol, mint eddig).
  const blocking = new Set(blockingWrongCases(task, cases));
  for (const wrong of cases.wrong) {
    const isBlocking = blocking.has(wrong);
    if (evaluateOpenAnswer(wrong.text, current).state !== "ok") continue;
    let fixed = false;
    for (const word of isBlocking ? raw : []) {
      const group = [word, ...new Set(okCorrect.flatMap((a) => relatedForms([word], a)))];
      if (missingAnswerConcepts(wrong.text, { required: [group] }).length === 0) continue; // a hibás válasz is tartalmazza
      if (okCorrect.some((a) => missingAnswerConcepts(a, { required: [group] }).length > 0)) continue; // nem minden helyesben van meg
      const next: OpenTask = { ...current, required: [...current.required, group] };
      if (evaluateOpenAnswer(next.sample, next).state !== "ok") continue;
      if (okCorrect.some((a) => evaluateOpenAnswer(a, next).state !== "ok")) continue;
      if (evaluateOpenAnswer(wrong.text, next).state === "ok") continue;
      current = next;
      added.push(group);
      changes.push(`szigorítás: + kötelező csoport ${JSON.stringify(group)} (megkülönbözteti a hibás (${wrong.kind}) választ)`);
      fixed = true;
      break;
    }
    // Spec 2026-10-21-ciklus1-csoportos-szigoritas (S3d): ha EGY szó nem különböztet meg (a helyesek eltérő szinonimákkal fogalmaznak — mért:
    // a bank 271 javítókörének 76%-a „fordított” próba), egy legfeljebb 6 tagú VAGY-csoport, amelyből minden teljes pontos helyesben és a
    // mintában van tag, a hibásban egy sem. Gépi szigorításként jelölve (S4: a tanulói mérés lazíthat).
    const cover = fixed || !isBlocking ? null : coverGroup(task.sample, okCorrect, wrong.text);
    if (cover) {
      const next: OpenTask = { ...current, required: [...current.required, cover] };
      if (evaluateOpenAnswer(next.sample, next).state === "ok" && okCorrect.every((a) => evaluateOpenAnswer(a, next).state === "ok")
        && evaluateOpenAnswer(wrong.text, next).state !== "ok") {
        current = next;
        added.push(cover);
        changes.push(`szigorítás (csoport): + kötelező csoport ${JSON.stringify(cover)} (megkülönbözteti a hibás (${wrong.kind}) választ)`);
        fixed = true;
      }
    }
    // Spec 2026-10-20-s5-sorrendes-kifejezes (S5b): ha szó nem különböztet meg (azonos szavak, más alak / sorrend: „there are a sofa”),
    // a minta 3- és 2-tokenes, egymás utáni kifejezései közül az első, amely minden teljes pontos helyesben EGYMÁS UTÁN megvan, a hibásban
    // nincs, és felvétele után a minta / a helyesek ok, a hibás nem.
    // Review #342 (P1): a csoportszám sémahatárán (8) nincs kifejezéses szigorítás — a javítókör dönt, érvénytelen feladat nem keletkezik.
    const room = (current.requiredPhrases?.length ?? 0) < PHRASE_GROUPS_MAX;
    for (const phrase of fixed || !phrases || !room || !isBlocking ? [] : phraseCandidates(task.sample)) {
      const probe = { requiredPhrases: [[phrase]] };
      if (missingPhrases(wrong.text, probe).length === 0) continue;
      if (okCorrect.some((a) => missingPhrases(a, probe).length > 0)) continue;
      const next: OpenTask = { ...current, requiredPhrases: [...(current.requiredPhrases ?? []), [phrase]] };
      if (evaluateOpenAnswer(next.sample, next).state !== "ok") continue;
      if (okCorrect.some((a) => evaluateOpenAnswer(a, next).state !== "ok")) continue;
      if (evaluateOpenAnswer(wrong.text, next).state === "ok") continue;
      current = next;
      addedPhrases.push([phrase]);
      changes.push(`szigorítás (kifejezés): + requiredPhrases ${JSON.stringify([phrase])} (megkülönbözteti a hibás (${wrong.kind}) választ)`);
      fixed = true;
      break;
    }
    // Spec 2026-10-21-ciklus7: magyar leckén a csak toldalékban eltérő hibás próba — a minta egy szavának pontos alakja (a helyes próbák
    // pontos alakjaival VAGY-csoportban) kerül a requiredPhrases-be, ha a hibásban a szó töve megvan, de a pontos alakja nincs.
    const exactRoom = (current.requiredPhrases?.length ?? 0) < PHRASE_GROUPS_MAX;
    for (const word of fixed || !exactForms || !exactRoom || !isBlocking ? [] : raw) {
      if (word.length > PHRASE_MAX_LENGTH) continue; // a séma 80 karakteres korlátja (review #359)
      const exact = { requiredPhrases: [[word]] };
      if (missingPhrases(wrong.text, exact).length === 0) continue; // a hibásban a pontos alak is megvan
      // Review #359: a pontozó elütéstűrő — a toldalékeltérést elütéstűrés NÉLKÜL, közös tővel kell igazolni („világ” ≠ „virág”).
      if (!sharesStem(wrong.text, word)) continue;
      // Review #359: a minta szavát tartalmazó kötelező csoport más tövű, helyes próbákkal igazolt alternatívái is (pl. „késsel”, „apával”).
      const siblings = current.required.find((g) => g.some((alt) => normalizeAnswerV2(alt) === normalizeAnswerV2(word))) ?? [];
      const forms = [...new Set([word, ...okCorrect.flatMap((a) => (missingPhrases(a, exact).length
        ? [...relatedForms([word], a), ...siblings.filter((alt) => !/\s/.test(alt.trim()) && missingPhrases(a, { requiredPhrases: [[alt]] }).length === 0)] : []))])]
        .filter((f) => f.length <= PHRASE_MAX_LENGTH);
      const group = { requiredPhrases: [forms] };
      if (missingPhrases(wrong.text, group).length === 0) continue; // egy helyes próba alakja a hibás alak — nem különböztet meg
      if (okCorrect.some((a) => missingPhrases(a, group).length > 0)) continue;
      const next: OpenTask = { ...current, requiredPhrases: [...(current.requiredPhrases ?? []), forms] };
      if (evaluateOpenAnswer(next.sample, next).state !== "ok") continue;
      if (okCorrect.some((a) => evaluateOpenAnswer(a, next).state !== "ok")) continue;
      if (evaluateOpenAnswer(wrong.text, next).state === "ok") continue;
      current = next;
      addedPhrases.push(forms);
      changes.push(`szigorítás (pontos alak): + requiredPhrases ${JSON.stringify(forms)} (megkülönbözteti a toldalékban eltérő hibás (${wrong.kind}) választ)`);
      fixed = true;
      break;
    }
    // Spec 2026-10-20-s6-fogalom-sorrend (S6b): ha sem szó, sem kifejezés nem különböztet meg (ugyanazok a fogalmak, fordított sorrendben:
    // „először szorzunk, utána emelünk négyzetre”), két kötelező csoport egyszavas alternatíváiból a minta sorrendje lesz a szabály — ha
    // minden teljes pontos helyes válasz ugyanígy tartja, a hibás mindkét fogalmat tartalmazza, de fordítva. Minden nyelven (a sorrend a
    // fogalmak első előfordulása, nem a szórend). Feladatonként legfeljebb egy sorrendi szabály; meglévőhöz nem nyúlunk.
    for (const order of fixed || current.requiredOrder?.length ? [] : orderCandidates(current)) {
      const probe = { requiredOrder: order };
      if (order.some((g) => orderPosition(wrong.text, g) < 0) || !missingOrder(wrong.text, probe)) continue;
      if (okCorrect.some((a) => missingOrder(a, probe))) continue;
      const next: OpenTask = { ...current, requiredOrder: order };
      if (evaluateOpenAnswer(next.sample, next).state !== "ok") continue;
      if (okCorrect.some((a) => evaluateOpenAnswer(a, next).state !== "ok")) continue;
      if (evaluateOpenAnswer(wrong.text, next).state === "ok") continue;
      current = next;
      addedOrder = true;
      changes.push(`szigorítás (sorrend): + requiredOrder ${JSON.stringify(order)} (megkülönbözteti a hibás (${wrong.kind}) választ)`);
      fixed = true;
      break;
    }
    if (!fixed && isBlocking) return null;
  }
  return { task: current, changes, tightened: added, tightenedPhrases: addedPhrases, tightenedOrder: addedOrder };
}

/**
 * S6b: sorrendi jelöltpárok a kötelező csoportokból — csoportonként az EGYSZAVAS alternatívák (a séma S6a-szabálya, review #346), közös
 * alternatíva nélkül; az irány a minta első előfordulásaiból. A minta sorrendjében, a korábbi csoportpár előre.
 */
/** Review #359: a requiredPhrases tagjának sémahatára. */
const PHRASE_MAX_LENGTH = 80;
/**
 * Review #359: elütéstűrés nélküli toldalékeltérés — a hibás válasz valamely szava a minta szavával közös tövű (a közös előtag legalább a
 * rövidebb szó hossza − 3, de legalább 3 betű), és nem azonos vele. Így a „világ” / „virág” (más szó, 2 közös betű) nem számít toldaléknak.
 */
function sharesStem(text: string, word: string): boolean {
  const w = word.toLowerCase();
  return (text.toLowerCase().match(/[\p{L}\d]+/gu) ?? []).some((t) => {
    if (t === w) return false;
    let k = 0;
    while (k < t.length && k < w.length && t[k] === w[k]) k++;
    return k >= Math.max(3, Math.min(t.length, w.length) - 3);
  });
}

function orderCandidates(task: OpenTask): string[][][] {
  const single = task.required.map((g) => [...new Set(g.filter((a) => canonicalAlternative(a).split(" ").filter(Boolean).length === 1))]);
  const out: string[][][] = [];
  for (let i = 0; i < single.length; i++) for (let j = i + 1; j < single.length; j++) {
    const [a, b] = [single[i], single[j]];
    if (!a.length || !b.length) continue;
    const seen = new Set(a.map(canonicalAlternative));
    if (b.some((x) => seen.has(canonicalAlternative(x)))) continue;
    const [pa, pb] = [orderPosition(task.sample, a), orderPosition(task.sample, b)];
    if (pa < 0 || pb < 0 || pa === pb) continue;
    out.push(pa < pb ? [a, b] : [b, a]);
  }
  return out;
}

/** S5b: a minta egymás utáni 3- és 2-tokenes kifejezései (v2-tokenek, műveleti jel nélkül), legalább egy nem kötőszó tokennel; a hosszabb előre. */
/** S3d: a csoport legfeljebb ennyi tagú (a túl széles csoport már nem megkülönböztető, csak a hibást zárja ki). */
export const COVER_GROUP_MAX = 6;

/**
 * Spec 2026-10-21-ciklus1-csoportos-szigoritas (S3d), tiszta: mohó lefedés — a minta és a teljes pontos helyesek megkülönböztető szavaiból
 * (a hibásban a pontozó tűrő illesztésével sincs meg) a legtöbb még le nem fedett választ tartalmazó szó, amíg minden (a minta is) le nem
 * fedett. `null`, ha nincs ilyen csoport legfeljebb `COVER_GROUP_MAX` taggal.
 */
export function coverGroup(sample: string, okCorrect: readonly string[], wrongText: string): string[] | null {
  const answers = [sample, ...okCorrect];
  const has = (answer: string, word: string) => missingAnswerConcepts(answer, { required: [[word]] }).length === 0;
  const pool = [...new Set(answers.flatMap((a) => a.match(/[\p{L}\d]+(?:['’][\p{L}\d]+)*/gu) ?? []))]
    // Review #353: a rubrika tagja legfeljebb 160 karakter (séma) — hosszabb jelölt nem kerülhet a csoportba.
    .filter((w) => w.length <= 160 && !/['’]/.test(w) && isDistinguishingCandidate(w) && !has(wrongText, w));
  const group: string[] = [];
  let uncovered = answers.map((_, i) => i);
  while (uncovered.length) {
    let best: string | null = null;
    let bestHits: number[] = [];
    for (const w of pool) {
      if (group.includes(w)) continue;
      const hits = uncovered.filter((i) => has(answers[i], w));
      if (hits.length > bestHits.length || (hits.length === bestHits.length && hits.length > 0 && best !== null && w.length > best.length)) { best = w; bestHits = hits; }
    }
    if (!best || !bestHits.length || group.length >= COVER_GROUP_MAX) return null;
    group.push(best);
    uncovered = uncovered.filter((i) => !bestHits.includes(i));
  }
  // A csoport egésze sem lehet a hibásban (a tagok külön-külön sem voltak benne; a csoport-illesztés ugyanaz a predikátum).
  return group.length && missingAnswerConcepts(wrongText, { required: [group] }).length > 0 ? group : null;
}

function phraseCandidates(sample: string): string[] {
  const tokens = normalizeAnswerV2(sample).split(/\s+/).filter((t) => t && /\p{L}/u.test(t));
  // Review #342: a tagadó összevonás MINDKÉT töredéke tagadásjel („mustn t”: a „mustn” is) — a „t” előtti pozíció is tiltott, hogy az
  // ablak ne végződhessen az első töredéken („the pupils mustn”).
  const negated = new Set<number>();
  tokens.forEach((t, i) => {
    if (NEGATIONS.has(t) || NOT_DISTINGUISHING_NEGATION.has(t)) negated.add(i);
    if (t === "t" && i > 0) negated.add(i - 1);
  });
  const out: string[] = [];
  for (const n of [3, 2]) for (let i = 0; i + n <= tokens.length; i++) {
    const gram = tokens.slice(i, i + n);
    if (gram.every((t) => NOT_DISTINGUISHING.has(t))) continue;
    // Tagadás nem lehet a megkülönböztető kifejezés része (S3c-szerződés, review #338: a „mustn t run” egy helyes „must not run”-t is
    // elutasítana) — a tagadószó és az összevonás mindkét töredéke.
    if (gram.some((_, k) => negated.has(i + k))) continue;
    const phrase = gram.join(" ");
    if (phrase.length > PHRASE_LENGTH_MAX) continue; // review #342: a séma kifejezés-hosszkorlátja
    if (!out.includes(phrase)) out.push(phrase);
  }
  return out;
}

export function calibrateRubric(original: OpenTask, cases: AnswerKeyCases | null, options: CalibrationOptions = {}): Calibration {
  if (!cases || isComputedTask(original)) return { task: original, changes: [] };
  // Spec 2026-10-20-eroforras-s3c-rubrika-szigoritas: ha egy hibás eset teljes pontot kap, előbb szigorítunk (különben a rubrika változatlan).
  // Review #347: az őr teljesülésekor is fut (a J1 miatt nem blokkoló, csak sorrendben eltérő hibás próba sorrendi szigorítása); ha ez nem
  // sikerül, az eredeti rubrika marad a kiinduló pont.
  const untouched: Tightening = { task: original, changes: [], tightened: [], tightenedPhrases: [], tightenedOrder: false };
  const attempt = options.lektorReviewed ? null : tighten(original, cases, options.phrases === true, options.exactForms === true);
  const tightened: Tightening | null = attempt && guardHolds(attempt.task, cases) ? attempt : guardHolds(original, cases) ? untouched : null;
  if (!tightened) return { task: original, changes: [] };
  let task: OpenTask = { ...tightened.task, required: tightened.task.required.map((g) => [...g]), bonus: tightened.task.bonus.map((g) => [...g]) };
  const changes: string[] = [...tightened.changes];
  const failing = () => cases.correct.filter((a) => evaluateOpenAnswer(a, task).state !== "ok");
  const tryStep = (next: OpenTask, change: string) => {
    if (!guardHolds(next, cases)) return false;
    task = next;
    changes.push(change);
    return true;
  };

  // 1. Alakfelvétel: a helyes válasz rokon szóalakja a hiányzó csoportba.
  // Az index stabil: ez a lépés csoportot nem vesz ki, csak bővít (a csoport tömbje lépésenként új).
  for (const answer of failing()) {
    const missingIdx = task.required.map((g, i) => (missingAnswerConcepts(answer, { required: [g] }).length ? i : -1)).filter((i) => i >= 0);
    for (const index of missingIdx) {
      const group = task.required[index];
      const forms = relatedForms(group, answer);
      if (!forms.length) continue;
      const required = task.required.map((g, i) => (i === index ? [...g, ...forms] : g));
      tryStep({ ...task, required }, `alak: ${JSON.stringify(group[0])} csoport + ${JSON.stringify(forms)}`);
    }
  }

  // 2. Bónuszba sorolás: a helyes esetek többségéből hiányzó kötelező csoport, a legritkábban teljesülővel kezdve; ≥ 1 kötelező marad.
  const missCount = (g: readonly string[]) => cases.correct.filter((a) => missingAnswerConcepts(a, { required: [g as string[]] }).length > 0).length;
  const threshold = (options.demoteWhenMissingIn ?? AT_LEAST_TWO)(cases.correct.length);
  const candidates = task.required.filter((g) => missCount(g) >= threshold).sort((a, b) => missCount(b) - missCount(a));
  for (const group of candidates) {
    if (task.required.length <= 1) break;
    const next = { ...task, required: task.required.filter((g) => g !== group), bonus: [...task.bonus, group] };
    tryStep(next, `bónuszba: ${JSON.stringify(group[0])} (a helyes válaszok ${missCount(group)}/${cases.correct.length}-ából hiányzik)`);
  }

  // 3–4. Mondatfeltétel és szóminimum — egymást elfedhetik (a rövid válasz a kötőszó hiányát is mutatja), ezért legfeljebb két körben.
  const shortest = Math.max(1, Math.min(...cases.correct.map((a) => words(a).length)));
  for (let round = 0; round < 2; round++) {
    // 3. Mondatfeltétel: ha a helyes eset csak a kötőszó hiánya miatt nem teljes pont.
    if (task.needsSentence && failing().some((a) => evaluateOpenAnswer(a, { ...task, needsSentence: false }).state === "ok")) {
      tryStep({ ...task, needsSentence: false }, "mondatfeltétel kikapcsolva (a helyes válasz csak a kötőszó miatt bukott)");
    }
    // 4. Szóminimum: ha a helyes eset csak a hossza miatt bukik.
    if (shortest < task.minWords && failing().some((a) => evaluateOpenAnswer(a, { ...task, minWords: shortest }).state === "ok")) {
      tryStep({ ...task, minWords: shortest }, `szóminimum ${task.minWords} → ${shortest}`);
    }
  }
  // Spec 2026-10-20-s4 (S4a): a szigorítás nyoma a feladaton — a korábbi és az új jelölés egyesítve (review #339), a végső `required`-ben
  // bent maradt alakkal.
  const marked = retainTightened([...(original.tightened ?? []), ...tightened.tightened], task.required);
  // S5b: a kifejezéses szigorítás nyoma — csak a `requiredPhrases`-ben (pontosan) bent maradt kifejezés.
  const markedPhrases = retainTightenedPhrases([...(original.tightenedPhrases ?? []), ...tightened.tightenedPhrases], task.requiredPhrases ?? []);
  // S6b: a sorrend-szigorítás nyoma — a kalibráció lépései a `requiredOrder`-hez nem nyúlnak, így a korábbi vagy az új jelölés marad.
  const markedOrder = Boolean(task.requiredOrder?.length) && (tightened.tightenedOrder || original.tightenedOrder === true);
  const { tightened: _previous, tightenedPhrases: _previousPhrases, tightenedOrder: _previousOrder, ...untagged } = task;
  return { task: { ...untagged, ...(marked.length ? { tightened: marked } : {}), ...(markedPhrases.length ? { tightenedPhrases: markedPhrases } : {}), ...(markedOrder ? { tightenedOrder: true } : {}) }, changes };
}

/** S5b: a kifejezéses szigorítás csoportjai közül a `requiredPhrases`-ben bent maradtak (a csoport aktuális alakjával). */
export function retainTightenedPhrases(tightened: readonly (readonly string[])[], phrases: readonly (readonly string[])[]): string[][] {
  const out: string[][] = [];
  for (const g of tightened) {
    const hit = phrases.find((r) => g.every((m) => r.includes(m)));
    if (hit && !out.some((o) => JSON.stringify(o) === JSON.stringify(hit))) out.push([...hit]);
  }
  return out;
}

/**
 * S4a: a szigorítással felvett csoportok közül a `required`-ben bent maradtak, a `required` AKTUÁLIS alakjával (a lazító lépés vagy a
 * bankjavítás alakot vehet fel: azonos első elem, a régi tagok mind benne). Duplikátum nélkül; a bónuszba sorolt / törölt kimarad.
 */
export function retainTightened(tightened: readonly (readonly string[])[], required: readonly (readonly string[])[]): string[][] {
  const out: string[][] = [];
  for (const g of tightened) {
    const hit = required.find((r) => r[0] === g[0] && g.every((m) => r.includes(m)));
    if (hit && !out.some((o) => JSON.stringify(o) === JSON.stringify(hit))) out.push([...hit]);
  }
  return out;
}
