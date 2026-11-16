import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isPlayableQuestion } from "../shared/game-quiz-contract";
import { VOCAB_DE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_FR } from "../client/src/data/vocabBank/vocab-fr";
import type { VocabEntry, VocabLang, VocabLevel } from "../client/src/data/vocabBank/types";
import { findFormInText, normalizeTerm } from "../client/src/data/vocabBank/validate";
import { fitsAllViewports } from "../client/src/game-engine/play/promptFit";
import {
  canGameCloze,
  clozeContextWords,
  findTermInExample,
  GAME_CLOZE_MIN_CONTEXT,
  generateVocabQuestion,
  isReflexiveTerm,
  meaningKeys,
  nounArticle,
  phraseShape,
  pickQuestionType,
  topicsRelated,
  type VocabQuiz,
} from "../client/src/game-engine/vocab/questionGenerator";
import { createSeenHistory, createVocabSource } from "../client/src/game-engine/vocab";
import { makeSyntheticBank, memoryStorage, seededRng } from "./support/vocab-fixture";

/**
 * Kanban #50 — a hiányos mondat rövid JÁTÉK-ALAKJA (`clozeStyle: "game"`; végrehajtás K.7). A mérés (teljes bank,
 * 2026-11-16): a régi alak a szint évfolyamán csak 38,3%-ban olvasható 9 mp alatt, és a fordítás 85%-ban elárulja a
 * választ; a játék-alak szintenként 84,1–100%-ban `ok`, és nincs benne fordítás. A küszöbök a mérésből (kis tartalékkal).
 */
const BANKS: Record<VocabLang, readonly VocabEntry[]> = { en: VOCAB_EN, de: VOCAB_DE, fr: VOCAB_FR };
const GRADE_OF_LEVEL: Record<VocabLevel, number> = { 0: 3, 1: 5, 2: 7, 3: 9, 4: 11 };
/** Szintenként a játék-alakú cloze-ok legalább ennyi része fér be és olvasható 9 mp alatt (mért minimum: 84,1%, FR L0). */
const MIN_OK_RATE = 0.82;
/** A cloze-képes bejegyzések legalább ennyi része kap játék-alakú cloze-t (mért: EN 71,7%, DE 45,9%, FR 51,6%). */
const MIN_GAME_SHARE: Record<VocabLang, number> = { en: 0.69, de: 0.43, fr: 0.49 };
/** A játék-alakra alkalmas bejegyzések közül legfeljebb ennyinél nincs 3 megfelelő elterelő (mért: ≤ 3,5% nyelvenként). */
const MAX_NO_DISTRACTOR = 0.04;

const VOWEL = /^[aeiouáàâäéèêëíìîïóòôöúùûüœæ]/iu;
const VOWEL_H = /^[aeiouáàâäéèêëíìîïóòôöúùûüœæh]/iu;
const FR_FULL = new Set(["de", "le", "la", "je", "que", "ne", "se", "me", "te", "ce"]);

/** Független ellenőrző: a hiány előtti szó hangtani kényszere teljesül-e az opcióra. */
function onsetOk(entry: VocabEntry, lang: VocabLang, option: string): boolean {
  const hit = findTermInExample(entry)!;
  const before = entry.example.normalize("NFC").slice(0, hit.start);
  const prev = (before.trim().split(/\s+/u).pop() ?? "").toLowerCase();
  if (lang === "en" && prev === "an") return VOWEL.test(option);
  if (lang === "en" && prev === "a") return !VOWEL.test(option);
  if (lang === "fr" && /['’]$/u.test(before)) return VOWEL_H.test(option);
  if (lang === "fr" && FR_FULL.has(prev)) return !VOWEL.test(option);
  return true;
}

type Gen = { entry: VocabEntry; q: VocabQuiz };
const cache = new Map<VocabLang, { eligible: number; capable: number; made: Gen[] }>();
function gameClozes(lang: VocabLang) {
  const hit = cache.get(lang);
  if (hit) return hit;
  const bank = BANKS[lang];
  const made: Gen[] = [];
  let eligible = 0;
  let capable = 0;
  bank.forEach((entry, i) => {
    if (findTermInExample(entry)) capable++;
    if (!canGameCloze(entry)) {
      assert.equal(generateVocabQuestion(entry, bank, "cloze", seededRng(i), { clozeStyle: "game" }), null, `${entry.id}: rövid keret`);
      return;
    }
    assert.ok((clozeContextWords(entry) ?? 0) >= GAME_CLOZE_MIN_CONTEXT, entry.id);
    eligible++;
    const q = generateVocabQuestion(entry, bank, "cloze", seededRng(1000 + i), { clozeStyle: "game" });
    if (q) made.push({ entry, q });
  });
  const out = { eligible, capable, made };
  cache.set(lang, out);
  return out;
}

for (const lang of ["en", "de", "fr"] as const) {
  test(`${lang}: minden játék-alakú cloze — egy helyes opció, nincs fordítás, a prompt nem árulja el a választ, elterelő-invariánsok`, () => {
    const bank = BANKS[lang];
    const byTerm = new Map<string, VocabEntry[]>();
    for (const e of bank) byTerm.set(`${e.kind}|${e.term}`, [...(byTerm.get(`${e.kind}|${e.term}`) ?? []), e]);
    const { eligible, made } = gameClozes(lang);
    assert.ok(made.length > 500, `${lang}: kevés játék-alakú cloze (${made.length})`);
    assert.ok((eligible - made.length) / eligible <= MAX_NO_DISTRACTOR, `${lang}: ${eligible - made.length}/${eligible} tételnél nincs elterelő`);
    for (const { entry, q } of made) {
      const where = `${entry.id}: ${q.prompt} | ${q.options.join(" / ")}`;
      assert.ok(isPlayableQuestion(q), where);
      assert.equal(q.questionType, "cloze");
      // Pontosan egy helyes opció: a term, a correctIndex-en.
      const termKeyOf = (s: string) => normalizeTerm(s);
      assert.equal(q.options.filter(o => termKeyOf(o) === termKeyOf(entry.term)).length, 1, where);
      assert.equal(termKeyOf(q.options[q.correctIndex]!), termKeyOf(entry.term), where);
      // A prompt: a mondat a hiányjellel, előtag és fordítás nélkül.
      assert.ok(q.prompt.includes("_____"), where);
      assert.ok(!q.prompt.includes("Magyarul"), where);
      assert.ok(!q.prompt.includes(entry.exampleHu), where);
      assert.equal(q.prompt.replace("_____", entry.term.normalize("NFC")).toLowerCase(), entry.example.normalize("NFC").toLowerCase(), where);
      // Nem árulja el: sem a helyes opció, sem a magyar jelentése nincs benne.
      assert.equal(findFormInText(entry.term, q.prompt), null, where);
      for (const k of meaningKeys(entry.hu)) assert.equal(findFormInText(k, q.prompt), null, `${where} (hu: ${k})`);
      // A felolvasható szöveg sem árulja el.
      assert.ok(q.speakText && findFormInText(entry.term, q.speakText) === null, where);
      // Elterelők: azonos kind + szófaj, nem azonos / rokon téma, páronként diszjunkt jelentés, hangtani kényszer.
      const used = new Set(meaningKeys(entry.hu));
      q.options.forEach((o, i) => {
        if (i === q.correctIndex) return;
        const cands = (byTerm.get(`${entry.kind}|${o}`) ?? []).filter(c => c.id !== entry.id);
        const d = cands.find(c => c.pos === entry.pos && !topicsRelated(c.topic, entry.topic));
        assert.ok(d, `${where} — elterelő „${o}”: szófaj / téma`);
        assert.ok(onsetOk(entry, lang, o), `${where} — elterelő „${o}”: névelő / elízió`);
        assert.equal(isReflexiveTerm(o), isReflexiveTerm(entry.term), `${where} — elterelő „${o}”: visszaható névmás`);
        if (entry.kind === "phrase") assert.equal(phraseShape(o, lang), phraseShape(entry.term, lang), `${where} — elterelő „${o}”: kifejezés-alak`);
        if (entry.pos === "noun") assert.equal(nounArticle(o, lang), nounArticle(entry.term, lang), `${where} — elterelő „${o}”: névelő`);
        for (const k of meaningKeys(d.hu)) {
          assert.ok(!used.has(k), `${where} — elterelő „${o}”: jelentés-átfedés (${k})`);
          used.add(k);
        }
      });
    }
  });

  test(`${lang}: a játék-alakú cloze szintenként ≥ ${MIN_OK_RATE * 100}%-ban befér és 9 mp alatt olvasható a szint évfolyamán; a cloze nem tűnik el`, () => {
    const { capable, made } = gameClozes(lang);
    assert.ok(made.length / capable >= MIN_GAME_SHARE[lang], `${lang}: ${made.length}/${capable} cloze-képes bejegyzésből készül játék-alak`);
    for (const level of [0, 1, 2, 3, 4] as const) {
      const at = made.filter(m => m.entry.level === level);
      assert.ok(at.length > 0, `${lang} L${level}: nincs játék-alakú cloze`);
      const ok = at.filter(m => fitsAllViewports(m.q, { grade: GRADE_OF_LEVEL[level] }).ok).length;
      assert.ok(ok / at.length >= MIN_OK_RATE, `${lang} L${level}: ${ok}/${at.length} ok`);
    }
  });
}

test("a régi (full) alak változatlan: alapértelmezés, fordítással; azonos seed → azonos kérdés a kifejezett „full”-lal", () => {
  const bank = VOCAB_EN;
  let checked = 0;
  for (let i = 0; i < bank.length && checked < 200; i += 7) {
    const e = bank[i]!;
    const a = generateVocabQuestion(e, bank, "cloze", seededRng(i));
    const b = generateVocabQuestion(e, bank, "cloze", seededRng(i), { clozeStyle: "full" });
    assert.deepEqual(a, b);
    if (!a) continue;
    checked++;
    assert.ok(a.prompt.startsWith("Melyik illik a mondatba? "), a.prompt);
    assert.ok(a.prompt.endsWith(`(Magyarul: ${e.exampleHu})`), a.prompt);
  }
  assert.ok(checked > 100);
});

test("rövid keret (< 4 szó a hiányon kívül): játék-alakban soha nem cloze; a full alakban lehet", () => {
  const short: VocabEntry = { id: "en0-clothes-901", term: "jumper", hu: "pulóver", kind: "word", level: 0, topic: "clothes", pos: "noun", example: "My jumper is warm.", exampleHu: "A pulóverem meleg." };
  assert.equal(clozeContextWords(short), 3);
  const bank = [short, ...makeSyntheticBank("en", [40, 40, 0, 0, 0], 4)];
  const rng = seededRng(5);
  const full = new Set<string>();
  for (let i = 0; i < 300; i++) {
    assert.notEqual(pickQuestionType(short, rng, { clozeStyle: "game" }), "cloze");
    full.add(pickQuestionType(short, rng));
  }
  assert.ok(full.has("cloze"));
  assert.equal(generateVocabQuestion(short, bank, "cloze", rng, { clozeStyle: "game" }), null);
});

test("szűk létigés keret (4 szó, benne létige) → nem játék-alakú cloze; 5 szóval, vagy létige nélkül igen; nyelvenkénti létige-lista", () => {
  const mk = (id: string, term: string, example: string): VocabEntry => ({ id, term, hu: "x", kind: "word", level: 1, topic: "feelings", pos: "adj", example, exampleHu: "x" });
  assert.equal(canGameCloze(mk("en1-feelings-901", "cheerful", "Our teacher is always cheerful.")), false);
  assert.equal(canGameCloze(mk("en1-feelings-902", "cheerful", "Our teacher was really very cheerful.")), true);
  assert.equal(canGameCloze(mk("en1-feelings-903", "cheerful", "Our teacher smiles, always cheerful.")), true);
  assert.equal(canGameCloze(mk("fr1-feelings-904", "chaud", "Le thé est très chaud.")), false);
  assert.equal(canGameCloze(mk("fr1-feelings-905", "contente", "Elle est très contente aujourd'hui.")), false, "4 szó, létigével");
  // A német „es” névmás, nem létige (a francia „es” csak a francia listában van).
  assert.equal(canGameCloze(mk("de1-feelings-906", "kalt", "Heute wird es sehr kalt.")), true);
  assert.equal(canGameCloze(mk("de1-feelings-907", "alt", "Das Haus ist sehr alt.")), false);
});

test("phraseShape: a vak ellenőrzés jelzett kifejezései a várt alakot kapják", () => {
  const cases: Array<[string, VocabLang, string]> = [
    ["at the weekend", "en", "adverbial"], ["in the nick of time", "en", "adverbial"], ["next year", "en", "adverbial"],
    ["close your eyes", "en", "verbal"], ["bark at", "en", "verbal"], ["I'm thirsty", "en", "sentence"], ["It's delicious", "en", "sentence"],
    ["good evening", "en", "sentence"], ["a block of", "en", "nominal"], ["dark blue", "en", "other"],
    ["zweimal am Tag", "de", "adverbial"], ["die Zunge herausstrecken", "de", "verbal"], ["Spaß haben", "de", "verbal"],
    ["Ich bin einverstanden", "de", "sentence"], ["das ist mein Vater", "de", "sentence"], ["ein Glas Wasser", "de", "nominal"],
    ["regarder la télé", "fr", "verbal"], ["se renseigner", "fr", "verbal"], ["de temps en temps", "fr", "adverbial"],
    ["j'ai mal à la tête", "fr", "sentence"], ["le roi de la jungle", "fr", "nominal"], ["l'heure de pointe", "fr", "nominal"],
  ];
  for (const [term, lang, want] of cases) assert.equal(phraseShape(term, lang), want, `${lang}: ${term}`);
});

test("nounArticle: német / francia névelő (nem, szám), az angolnak nincs", () => {
  assert.equal(nounArticle("die Hochzeit", "de"), "die");
  assert.equal(nounArticle("Der Bär", "de"), "der");
  assert.equal(nounArticle("les pantoufles", "fr"), "les");
  assert.equal(nounArticle("l’oreille", "fr"), "l'");
  assert.equal(nounArticle("l'école", "fr"), "l'");
  assert.equal(nounArticle("la compétence", "fr"), "la");
  assert.equal(nounArticle("apple", "en"), null);
  assert.equal(nounArticle("Eltern", "de"), null);
});

test("„a / an” és francia elízió: a névelő nem árulja el a választ", () => {
  const apple = VOCAB_EN.find(e => e.example.includes(" an ") && (clozeContextWords(e) ?? 0) >= 4 && findTermInExample(e) && /\ban$/u.test(e.example.slice(0, findTermInExample(e)!.start).trim()));
  assert.ok(apple, "van „an _____” mondat a bankban");
  for (let s = 0; s < 50; s++) {
    const q = generateVocabQuestion(apple, VOCAB_EN, "cloze", seededRng(s), { clozeStyle: "game" });
    if (!q) continue;
    for (const o of q.options) assert.ok(VOWEL.test(o), `${q.prompt} | ${o}`);
  }
  const elided = VOCAB_FR.find(e => { const h = findTermInExample(e); return h && /['’]$/u.test(e.example.slice(0, h.start)) && (clozeContextWords(e) ?? 0) >= 4; });
  assert.ok(elided, "van elidált („d’_____”) mondat a bankban");
  for (let s = 0; s < 50; s++) {
    const q = generateVocabQuestion(elided, VOCAB_FR, "cloze", seededRng(s), { clozeStyle: "game" });
    if (!q) continue;
    for (const o of q.options) assert.ok(VOWEL_H.test(o), `${q.prompt} | ${o}`);
  }
});

test("speakText: magyar→cél kérdésnél nincs (a term felolvasása a megoldás); cél→magyar: a term; cloze: a mondat „…”-tal", () => {
  const bank = VOCAB_DE;
  const e = bank.find(x => canGameCloze(x) && generateVocabQuestion(x, bank, "cloze", seededRng(1), { clozeStyle: "game" }) !== null)!;
  const huTo = generateVocabQuestion(e, bank, "hu-to-target", seededRng(1))!;
  assert.equal(huTo.speakText, undefined);
  assert.equal(generateVocabQuestion(e, bank, "target-to-hu", seededRng(1))!.speakText, e.term);
  const c = generateVocabQuestion(e, bank, "cloze", seededRng(1), { clozeStyle: "game" })!;
  assert.ok(c.speakText!.includes("…"));
  assert.equal(findFormInText(e.term, c.speakText!), null);
});

test("VocabSource: alapból full alak; clozeStyle „game” → játék-alakú cloze; a useVocabQuizSource a játék-alakot kéri", () => {
  for (const [style, marker] of [[undefined, "Magyarul"], ["game", null]] as const) {
    const src = createVocabSource({ lang: "fr", entries: VOCAB_FR, history: createSeenHistory(memoryStorage()), rng: seededRng(9), ...(style ? { clozeStyle: style } : {}) });
    let clozes = 0;
    for (let i = 0; i < 400 && clozes < 20; i++) {
      const q = src.next((i % 5) as VocabLevel, { types: ["cloze"] });
      if (!q || q.questionType !== "cloze") continue;
      clozes++;
      if (marker) assert.ok(q.prompt.includes(marker), q.prompt);
      else assert.ok(!q.prompt.includes("Magyarul") && !q.prompt.startsWith("Melyik"), q.prompt);
    }
    assert.ok(clozes >= 20, `${style ?? "full"}: ${clozes} cloze`);
  }
  const hook = readFileSync(new URL("../client/src/game-engine/vocab/useVocabQuizSource.ts", import.meta.url), "utf8");
  assert.match(hook, /createVocabSource\(\{[^}]*clozeStyle: "game"[^}]*\}\)/u);
});
