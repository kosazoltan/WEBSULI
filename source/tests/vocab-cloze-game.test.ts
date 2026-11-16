import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isPlayableQuestion } from "../shared/game-quiz-contract";
import { VOCAB_DE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_FR } from "../client/src/data/vocabBank/vocab-fr";
import type { VocabEntry, VocabLang, VocabLevel, VocabPos } from "../client/src/data/vocabBank/types";
import { findFormInText, normalizeTerm } from "../client/src/data/vocabBank/validate";
import { fitsAllViewports } from "../client/src/game-engine/play/promptFit";
import {
  canGameCloze,
  clozeContextWords,
  findTermInExample,
  GAME_CLOZE_MIN_CONTEXT,
  gameSlotOk,
  generateVocabQuestion,
  isGameClozeDistractor,
  meaningKeys,
  pickQuestionType,
  type VocabQuiz,
} from "../client/src/game-engine/vocab/questionGenerator";
import { createSeenHistory, createVocabSource } from "../client/src/game-engine/vocab";
import { makeSyntheticBank, memoryStorage, seededRng } from "./support/vocab-fixture";

/**
 * Kanban #50 — a hiányos mondat rövid JÁTÉK-ALAKJA (`clozeStyle: "game"`; végrehajtás K.7) és az EGYÉRTELMŰSÉGI
 * SZABÁLY (review #455): fordítás nélkül csak akkor készül cloze, ha mindhárom elterelő a hiány helyére nyelvtanilag
 * nem illik — angol egyszavas bejegyzés, a célszófaj helyén nem álló szófajú, nem kettős szófajú elterelő, „átjárást”
 * nem engedő keret; német / francia játék-alakú cloze nincs (a végződés elárulná). A küszöbök a teljes bank mérésből.
 */
const BANKS: Record<VocabLang, readonly VocabEntry[]> = { en: VOCAB_EN, de: VOCAB_DE, fr: VOCAB_FR };
const GRADE_OF_LEVEL: Record<VocabLevel, number> = { 0: 3, 1: 5, 2: 7, 3: 9, 4: 11 };
/** A független ellenőrző szófaj-táblája (a szabály szövegéből, nem a modulból): célszófaj → az elterelő szófaja. */
const RULE: Record<VocabLang, Partial<Record<VocabPos, VocabPos>>> = {
  en: { noun: "adj", adj: "verb", verb: "adj", adv: "verb" },
  de: {},
  fr: {},
};
/** Szintenként a játék-alakú cloze-ok legalább ennyi része fér be és olvasható 9 mp alatt (mért: minden szinten 100%). */
const MIN_OK_RATE = 0.95;
/** A cloze-képes angol bejegyzések legalább ennyi része kap játék-alakú cloze-t (mért: 46,6%). */
const MIN_GAME_SHARE_EN = 0.42;

const VOWEL = /^[aeiou]/iu;

/** Független ellenőrző: a hiány előtti szó hangtani kényszere teljesül-e az opcióra. */
function onsetOk(entry: VocabEntry, lang: VocabLang, option: string): boolean {
  const hit = findTermInExample(entry)!;
  const before = entry.example.normalize("NFC").slice(0, hit.start);
  const prev = (before.trim().split(/\s+/u).pop() ?? "").toLowerCase();
  if (lang === "en" && prev === "an") return VOWEL.test(option);
  if (lang === "en" && prev === "a") return !VOWEL.test(option);
  return true;
}

/** A bank alakjainak szófajai (független index a kettős szófajú elterelő ellenőrzéséhez). */
function posByTerm(bank: readonly VocabEntry[]): Map<string, Set<VocabPos>> {
  const m = new Map<string, Set<VocabPos>>();
  for (const e of bank) m.set(normalizeTerm(e.term), new Set([...(m.get(normalizeTerm(e.term)) ?? []), e.pos]));
  return m;
}

type Gen = { entry: VocabEntry; q: VocabQuiz };
const cache = new Map<VocabLang, { capable: number; made: Gen[] }>();
function gameClozes(lang: VocabLang) {
  const hit = cache.get(lang);
  if (hit) return hit;
  const bank = BANKS[lang];
  const made: Gen[] = [];
  let capable = 0;
  bank.forEach((entry, i) => {
    if (findTermInExample(entry)) capable++;
    const q = generateVocabQuestion(entry, bank, "cloze", seededRng(1000 + i), { clozeStyle: "game" });
    if (!canGameCloze(entry)) assert.equal(q, null, `${entry.id}: nem alkalmas, mégis készült játék-alakú cloze`);
    else if (q) made.push({ entry, q });
  });
  const out = { capable, made };
  cache.set(lang, out);
  return out;
}

for (const lang of ["en", "de", "fr"] as const) {
  test(`${lang}: egyértelműségi szabály a TELJES jelöltkészletre — minden alkalmas bejegyzés × minden lehetséges elterelő`, () => {
    const bank = BANKS[lang];
    const byTerm = posByTerm(bank);
    let entries = 0;
    let pairs = 0;
    for (const entry of bank) {
      if (!canGameCloze(entry)) {
        // Kifejezésből, a táblán kívüli szófajból soha nincs játék-alak.
        if (entry.kind === "phrase" || !RULE[lang][entry.pos]) assert.equal(canGameCloze(entry), false);
        continue;
      }
      entries++;
      assert.equal(entry.kind, "word", entry.id);
      assert.ok(RULE[lang][entry.pos], `${entry.id}: célszófaj ${entry.pos}`);
      assert.ok((clozeContextWords(entry) ?? 0) >= GAME_CLOZE_MIN_CONTEXT, entry.id);
      for (const c of bank) {
        if (!isGameClozeDistractor(entry, c, bank)) continue;
        pairs++;
        const where = `${entry.id} (${entry.pos}) ← ${c.id} „${c.term}” (${c.pos})`;
        assert.equal(c.kind, "word", where);
        assert.equal(c.pos, RULE[lang][entry.pos], where);
        assert.notEqual(c.pos, entry.pos, where);
        assert.ok(!byTerm.get(normalizeTerm(c.term))?.has(entry.pos), `${where}: kettős szófajú (a bankban ${entry.pos} is)`);
        assert.ok(c.topic !== "colors", `${where}: szín (főnévként is áll)`);
        assert.ok(!(c.pos === "adj" && normalizeTerm(c.term).endsWith("est")), `${where}: felsőfok (főnévként is áll)`);
        assert.ok(onsetOk(entry, lang, c.term), `${where}: névelő`);
      }
    }
    if (lang === "en") {
      assert.ok(entries > 1000, `${lang}: ${entries} alkalmas bejegyzés`);
      assert.ok(pairs > entries * 3, `${lang}: ${pairs} jelölt-pár`);
    } else {
      assert.equal(entries, 0, `${lang}: német / francia játék-alakú cloze nincs`);
    }
  });

  test(`${lang}: minden generált játék-alakú cloze — egy helyes opció, nincs fordítás, nem árulja el, csak szabályos elterelő`, () => {
    const bank = BANKS[lang];
    const byId = new Map(bank.map(e => [`${e.kind}|${e.term}`, e]));
    const { made } = gameClozes(lang);
    if (lang !== "en") {
      assert.equal(made.length, 0, `${lang}: nincs játék-alakú cloze`);
      return;
    }
    assert.ok(made.length > 1000, `${lang}: ${made.length} játék-alakú cloze`);
    for (const { entry, q } of made) {
      const where = `${entry.id}: ${q.prompt} | ${q.options.join(" / ")}`;
      assert.ok(isPlayableQuestion(q), where);
      assert.equal(q.options.filter(o => normalizeTerm(o) === normalizeTerm(entry.term)).length, 1, where);
      assert.equal(normalizeTerm(q.options[q.correctIndex]!), normalizeTerm(entry.term), where);
      assert.ok(q.prompt.includes("_____") && !q.prompt.includes("Magyarul") && !q.prompt.includes(entry.exampleHu), where);
      assert.equal(q.prompt.replace("_____", entry.term.normalize("NFC")).toLowerCase(), entry.example.normalize("NFC").toLowerCase(), where);
      assert.equal(findFormInText(entry.term, q.prompt), null, where);
      for (const k of meaningKeys(entry.hu)) assert.equal(findFormInText(k, q.prompt), null, `${where} (hu: ${k})`);
      assert.ok(q.speakText && findFormInText(entry.term, q.speakText) === null, `${where}: a felolvasás elárulná`);
      assert.equal(q.speakAfter, entry.term, where);
      q.options.forEach((o, i) => {
        if (i === q.correctIndex) return;
        const d = byId.get(`word|${o}`);
        assert.ok(d && isGameClozeDistractor(entry, d, bank), `${where} — „${o}”`);
      });
    }
  });

  test(`${lang}: a játék-alakú cloze szintenként ≥ ${MIN_OK_RATE * 100}%-ban befér és 9 mp alatt olvasható; mennyiség`, () => {
    const { capable, made } = gameClozes(lang);
    if (lang !== "en") return;
    assert.ok(made.length / capable >= MIN_GAME_SHARE_EN, `${lang}: ${made.length}/${capable}`);
    for (const level of [0, 1, 2, 3, 4] as const) {
      const at = made.filter(m => m.entry.level === level);
      assert.ok(at.length > 0, `${lang} L${level}: nincs játék-alakú cloze`);
      const ok = at.filter(m => fitsAllViewports(m.q, { grade: GRADE_OF_LEVEL[level] }).ok).length;
      assert.ok(ok / at.length >= MIN_OK_RATE, `${lang} L${level}: ${ok}/${at.length} ok`);
    }
  });
}

test("regresszió (review #455): „I go to school _____.” (by bus) — kifejezés, fordítás nélkül soha nem cloze", () => {
  const e = VOCAB_EN.find(x => x.id === "en0-city-024")!;
  assert.ok(e, "en0-city-024 a bankban");
  assert.equal(e.kind, "phrase");
  assert.equal(canGameCloze(e), false);
  for (let s = 0; s < 100; s++) {
    assert.equal(generateVocabQuestion(e, VOCAB_EN, "cloze", seededRng(s), { clozeStyle: "game" }), null);
    assert.notEqual(pickQuestionType(e, seededRng(s), { clozeStyle: "game" }), "cloze");
  }
  // A régi (full) alak a fordítással továbbra is készülhet.
  assert.ok(generateVocabQuestion(e, VOCAB_EN, "cloze", seededRng(24)));
});

test("keret-őrök: a célszófaj helyére az elterelő szófaja is beállhat → nincs játék-alak", () => {
  const mk = (id: string, term: string, pos: VocabPos, example: string): VocabEntry => ({ id, term, hu: "x", kind: "word", level: 1, topic: "everyday", pos, example, exampleHu: "x" });
  // Angol jelzői melléknév: „a swim jacket” összetétel illene.
  assert.equal(gameSlotOk(mk("en1-everyday-901", "warm", "adj", "He wears a warm jacket in winter.")), false);
  assert.equal(gameSlotOk(mk("en1-everyday-902", "tired", "adj", "After the long trip I was tired.")), true);
  // Angol főnév jelzői helyen: „the big shop” — a melléknév illene.
  assert.equal(gameSlotOk(mk("en1-everyday-903", "book", "noun", "The book shop opens at nine.")), false);
  assert.equal(gameSlotOk(mk("en1-everyday-904", "book", "noun", "I read a good book.")), true);
  // Angol ige „make / get / be …” után: melléknév is állhat.
  assert.equal(gameSlotOk(mk("en1-everyday-905", "cry", "verb", "Sad films make me cry.")), false);
  // Angol határozószó „go” után: „go swim”.
  assert.equal(gameSlotOk(mk("en1-everyday-906", "home", "adv", "We go home after school.")), false);
  // Német / francia: soha (a végződés elárulná a választ).
  assert.equal(gameSlotOk(mk("de1-everyday-908", "spielen", "verb", "Wir wollen draußen spielen.")), false);
  assert.equal(gameSlotOk(mk("fr1-everyday-911", "malade", "adj", "Le chat est malade.")), false);
});

test("„a / an”: a névelő nem árulja el a választ", () => {
  const e = VOCAB_EN.find(x => { const h = findTermInExample(x); return h && canGameCloze(x) && /\ban$/u.test(x.example.slice(0, h.start).trim()); });
  assert.ok(e, "van „an _____” mondat");
  for (let s = 0; s < 30; s++) {
    const q = generateVocabQuestion(e, VOCAB_EN, "cloze", seededRng(s), { clozeStyle: "game" });
    if (q) for (const o of q.options) assert.ok(VOWEL.test(o), `${q.prompt} | ${o}`);
  }
});

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

test("rövid keret: játék-alakban nem cloze; a full alakban lehet", () => {
  const short: VocabEntry = { id: "en0-feelings-901", term: "happy", hu: "boldog", kind: "word", level: 0, topic: "feelings", pos: "adj", example: "I am happy.", exampleHu: "Boldog vagyok." };
  assert.ok((clozeContextWords(short) ?? 0) < GAME_CLOZE_MIN_CONTEXT);
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

test("felolvasás: a megjelenéskor semmi nem árulja el a választ; a helyes szó csak a kimenetel után (speakAfter)", () => {
  const bank = VOCAB_EN;
  const e = bank.find(x => canGameCloze(x) && generateVocabQuestion(x, bank, "cloze", seededRng(1), { clozeStyle: "game" }) !== null)!;
  const huTo = generateVocabQuestion(e, bank, "hu-to-target", seededRng(1))!;
  assert.equal(huTo.speakText, undefined);
  assert.equal(huTo.speakAfter, e.term);
  const toHu = generateVocabQuestion(e, bank, "target-to-hu", seededRng(1))!;
  assert.equal(toHu.speakText, e.term);
  assert.equal(toHu.speakAfter, undefined);
  const c = generateVocabQuestion(e, bank, "cloze", seededRng(1), { clozeStyle: "game" })!;
  assert.ok(c.speakText!.includes("…"));
  assert.equal(findFormInText(e.term, c.speakText!), null);
  assert.equal(c.speakAfter, e.term);
});

test("VocabSource: alapból full alak; clozeStyle „game” → játék-alakú cloze; a useVocabQuizSource a játék-alakot kéri", () => {
  for (const [style, marker] of [[undefined, "Magyarul"], ["game", null]] as const) {
    const src = createVocabSource({ lang: "en", entries: VOCAB_EN, history: createSeenHistory(memoryStorage()), rng: seededRng(9), ...(style ? { clozeStyle: style } : {}) });
    let clozes = 0;
    for (let i = 0; i < 600 && clozes < 20; i++) {
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
