import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { WORD_LADDER_DE } from "../client/src/data/wordLadder/de";
import { WORD_LADDER_EN } from "../client/src/data/wordLadder/en";
import { WORD_LADDER_FR } from "../client/src/data/wordLadder/fr";
import type { LadderItem, WordLadderLanguage } from "../client/src/data/wordLadder/types";
import type { VocabEntry } from "../client/src/data/vocabBank/types";
import { VOCAB_DE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_FR } from "../client/src/data/vocabBank/vocab-fr";
import { ladderTiersFromBank } from "../client/src/data/wordLadder/banks";
import { ladderBaseTier, pickUnseen, type SeenItem } from "../client/src/game-engine/no-repeat";
import { splitBankItemsByTier } from "../client/src/lib/mergeGameQuizBank";
import type { GameQuizBankItemDTO } from "../client/src/types/gameQuiz";
import {
  LADDER_GRADE_BANDS,
  LADDER_SUB_CUTS,
  LADDER_STEP_COUNT,
  LADDER_STEP_OVERRIDES,
  createLadderStepSession,
  gradedLadderBank,
  ladderFloorSources,
  ladderTermFloors,
  ladderTermKey,
  vocabFloorSources,
  ladderDifficultyInput,
  ladderDifficultyScore,
  ladderGradeWindow,
  ladderItemStep,
  ladderStartStep,
  ladderStepBuckets,
  vocabEntryScore,
  vocabEntryStep,
  windowLadderSteps,
} from "../client/src/lib/wordLadderGrading";

/**
 * Szólétra szintezés — terv: docs/specs/2026-11-22-szoletra-szintezes.md (6. A1–A8, A12).
 * A mérce determinisztikus: ugyanaz a tétel mindig ugyanazt a pontot és fokozatot kapja.
 */

const MANUAL: Record<WordLadderLanguage, readonly LadderItem[]> = { en: WORD_LADDER_EN, de: WORD_LADDER_DE, fr: WORD_LADDER_FR };
const VOCAB: Record<WordLadderLanguage, readonly VocabEntry[]> = { en: VOCAB_EN, de: VOCAB_DE, fr: VOCAB_FR };
const LANGS: WordLadderLanguage[] = ["en", "de", "fr"];
const GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Graded = { step: number; score: number; declared: number; phrase: boolean };
function gradedAll(lang: WordLadderLanguage): Graded[] {
  const manual = MANUAL[lang].map((q) => ({
    step: ladderItemStep(q, lang, q.tier),
    score: ladderDifficultyScore(ladderDifficultyInput(q), lang),
    declared: q.tier,
    phrase: q.category === "phrase" || q.category === "everyday",
  }));
  const vocab = VOCAB[lang].map((e) => ({ step: vocabEntryStep(e), score: vocabEntryScore(e), declared: e.level, phrase: e.kind === "phrase" }));
  return [...manual, ...vocab];
}

function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

test("A1/A3: minden kézi- és szóbank-tétel véges pontot és 0–14 fokozatot kap; a fokozat szintje ≥ a bank szintje; pont ≥ 20 / 40 → szint ≥ 1 / 2", () => {
  const bad: string[] = [];
  for (const lang of LANGS) {
    for (const g of gradedAll(lang)) {
      if (!Number.isFinite(g.score) || g.score < 0) bad.push(`${lang}: pont ${g.score}`);
      if (!Number.isInteger(g.step) || g.step < 0 || g.step >= LADDER_STEP_COUNT) bad.push(`${lang}: fokozat ${g.step}`);
      const tier = Math.floor(g.step / 3);
      if (tier < g.declared) bad.push(`${lang}: lefelé sorolva (${g.declared} → ${tier})`);
      if (g.score >= 20 && tier < 1) bad.push(`${lang}: pont ${g.score} a 0. szinten`);
      if (g.score >= 40 && tier < 2) bad.push(`${lang}: pont ${g.score} a 0–1. szinten`);
    }
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

test("A1: a mérce determinisztikus és a célrészt méri (hiányos mondat a kitöltéssel, „… angolul” kérdésnél a helyes opció)", () => {
  const house = WORD_LADDER_EN.find((q) => q.id === "en0-001")!;
  assert.deepEqual(ladderDifficultyInput(house), { term: "house", sentence: false, category: "topic" });
  const cloze = WORD_LADDER_EN.find((q) => q.focus && /_{3,}/u.test(q.focus))!;
  const input = ladderDifficultyInput(cloze);
  assert.equal(input.sentence, true);
  assert.ok(input.term.includes(cloze.options[cloze.correctIndex]!), input.term);
  assert.equal(ladderDifficultyScore(input, "en"), ladderDifficultyScore(ladderDifficultyInput(cloze), "en"));
  // Névelő nem számít; a német hosszabb szavait a nyelvi szorzó kiegyenlíti.
  assert.equal(ladderDifficultyScore({ term: "der Hund", sentence: false, category: "word" }, "de"),
    ladderDifficultyScore({ term: "Hund", sentence: false, category: "word" }, "de"));
  assert.ok(ladderDifficultyScore({ term: "open the door", sentence: false, category: "phrase" }, "en")
    > ladderDifficultyScore({ term: "door", sentence: false, category: "word" }, "en"));
});

test("A2: a fokozat-szintek átlagpontja szigorúan nő, és minden nyelv × szint × alfok legalább max(10, 5%) tételt tartalmaz", () => {
  const report: string[] = [];
  for (const lang of LANGS) {
    const all = gradedAll(lang);
    const means: number[] = [];
    for (let tier = 0; tier < 5; tier++) {
      const inTier = all.filter((g) => Math.floor(g.step / 3) === tier);
      means.push(inTier.reduce((s, g) => s + g.score, 0) / inTier.length);
      for (let sub = 0; sub < 3; sub++) {
        const n = inTier.filter((g) => g.step % 3 === sub).length;
        if (n < Math.max(10, 0.05 * inTier.length)) report.push(`${lang} ${tier}.${sub}: ${n}/${inTier.length}`);
      }
    }
    for (let i = 1; i < means.length; i++) if (!(means[i]! > means[i - 1]!)) report.push(`${lang}: átlagpont ${means.map((m) => m.toFixed(1)).join(" / ")}`);
  }
  assert.deepEqual(report, []);
});

test("A4: évfolyam-sávonként az osztályozott bank minden fokozatán ≥ 20 tétel; szintenként a 0. alfokon ≥ 20 egyes szó, a 2. alfokon ≥ 20 kifejezés (mindhárom nyelv)", () => {
  const report: string[] = [];
  for (const lang of LANGS) {
    const items: LadderItem[] = [
      ...MANUAL[lang],
      ...VOCAB[lang].map((e): LadderItem => ({
        id: `vocab:${e.id}:target-to-hu`, prompt: `Mit jelent: „${e.term}”?`, focus: e.term, options: [e.hu, "a", "b", "c"], correctIndex: 0,
        tier: e.level, category: e.kind === "phrase" ? "phrase" : "word",
      })),
    ];
    for (const band of LADDER_GRADE_BANDS) {
      const bank = gradedLadderBank(items, lang, band.grades[0]);
      const win = ladderGradeWindow(band.grades[0]);
      for (let step = win.minStep; step <= win.maxStep; step++) {
        const list = bank[step] ?? [];
        const words = list.filter((q) => q.category !== "phrase" && q.category !== "everyday").length;
        const phrases = list.length - words;
        if (list.length < 20) report.push(`${lang} ${band.label} ${step}. fokozat: ${list.length} tétel`);
        if (step % 3 === 0 && words < 20) report.push(`${lang} ${band.label} ${step}. fokozat (0. alfok): ${words} szó`);
        if (step % 3 === 2 && phrases < 20) report.push(`${lang} ${band.label} ${step}. fokozat (2. alfok): ${phrases} kifejezés`);
      }
      for (let step = 0; step < LADDER_STEP_COUNT; step++) {
        if ((step < win.minStep || step > win.maxStep) && (bank[step]?.length ?? 0) > 0) report.push(`${lang} ${band.label}: sávon kívüli ${step}. fokozat nem üres`);
      }
    }
  }
  assert.deepEqual(report, []);
});

test("A5/A6: belépés az évfolyamból — 1. pálya = alapszint legkönnyebb alfoka, pályánként nem csökken, legfeljebb alapszint + 1; ismeretlen évfolyam = 4. évfolyam", () => {
  for (const grade of GRADES) {
    const base = ladderBaseTier(grade);
    const win = ladderGradeWindow(grade);
    assert.equal(win.baseStep, base * 3);
    assert.equal(win.minStep, Math.max(0, base - 1) * 3);
    assert.equal(win.maxStep, Math.min(4, base + 1) * 3 + 2);
    const starts = LEVELS.map((l) => ladderStartStep(grade, l));
    assert.equal(starts[0], base * 3, `${grade}. évf. 1. pálya`);
    for (let i = 1; i < starts.length; i++) assert.ok(starts[i]! >= starts[i - 1]!, `${grade}. évf.: ${starts.join(",")}`);
    assert.ok(starts[9]! <= Math.min(win.maxStep, (base + 1) * 3), `${grade}. évf. 10. pálya: ${starts[9]}`);
    assert.ok(starts[9]! > starts[0]! || win.maxStep === win.baseStep, `${grade}. évf.: a 10. pálya nehezebben indul`);
  }
  // 3. évfolyam: a 10. pálya is legfeljebb az 1. szinten (a régi szabály szerint B2 volt).
  assert.ok(Math.floor(ladderStartStep(3, 10) / 3) <= 1);
  // Ismeretlen / érvénytelen évfolyam és pálya: óvatos alacsony kezdés.
  assert.equal(ladderStartStep(Number.NaN, 1), 0);
  assert.equal(ladderStartStep(1, Number.NaN), 0);
  assert.equal(ladderStartStep(99, 99), ladderStartStep(12, 10));
});

test("A7: 3 jó → +1 fokozat, 2 rossz → −1, megszakított sorozatnál nem nő, és a fokozat a sávban marad", () => {
  const s = createLadderStepSession(5, 1);
  assert.equal(s.step, 3);
  s.answer(true);
  s.answer(true);
  assert.equal(s.step, 3, "két jó még nem emel");
  s.answer(true);
  assert.equal(s.step, 4, "három jó emel");
  s.answer(true);
  s.answer(true);
  s.answer(false);
  s.answer(true);
  s.answer(true);
  assert.equal(s.step, 4, "hibával megszakított sorozat nem emel");
  s.answer(false);
  assert.equal(s.step, 4, "egy hiba még nem könnyít");
  s.answer(false);
  assert.equal(s.step, 3, "két hiba könnyít");
  for (let i = 0; i < 60; i++) s.answer(true);
  assert.equal(s.step, ladderGradeWindow(5).maxStep, "felül a sáv teteje");
  assert.equal(s.tier, Math.floor(ladderGradeWindow(5).maxStep / 3));
  for (let i = 0; i < 60; i++) s.answer(false);
  assert.equal(s.step, ladderGradeWindow(5).minStep, "alul a sáv alja");
  s.reset(3, 1);
  assert.equal(s.step, 0);
  for (let i = 0; i < 60; i++) s.answer(true);
  assert.equal(s.step, 5, "3. évfolyamon legfeljebb az 1. szint teteje");
});

test("A8: 3. évfolyamon bármely pályán, bármely válaszsorozattal a választott tétel legfeljebb 1. szintű (fokozat ≤ 5)", () => {
  const tiers = ladderTiersFromBank(WORD_LADDER_EN);
  const buckets = windowLadderSteps(ladderStepBuckets(tiers, "en"), 3);
  const bad: string[] = [];
  const stepOf = new Map(buckets.flatMap((b, step) => b.map((q) => [q.id, step] as const)));
  for (const level of LEVELS) {
    for (let run = 0; run < 20; run++) {
      const rng = seeded(level * 1000 + run);
      const session = createLadderStepSession(3, level);
      const seen: SeenItem[] = [];
      const pCorrect = run / 19;
      for (let i = 0; i < 40; i++) {
        const q = pickUnseen(buckets, session.step, seen, rng);
        assert.ok(q, "van kérdés");
        const step = stepOf.get(q.id)!;
        if (step > 5) bad.push(`${level}/${run}: ${q.id} (${step})`);
        seen.push({ id: q.id, prompt: q.prompt });
        session.answer(rng() < pCorrect);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("A12: a kézi felülíró tábla létező azonosítókra mutat, 0–14 fokozattal", () => {
  const ids = new Set(LANGS.flatMap((l) => MANUAL[l].map((q) => q.id)));
  for (const [id, step] of Object.entries(LADDER_STEP_OVERRIDES)) {
    assert.ok(ids.has(id), id);
    assert.ok(Number.isInteger(step) && step >= 0 && step < LADDER_STEP_COUNT, `${id}: ${step}`);
  }
});

/*
 * Vak kör 1 (2026-11-22) leletei osztályszinten — terv 13. szakasz:
 *  O1 szöveg-normalizálás / determinizmus (L2 locale, L3 francia elízió) · O2 célrész-szerződés és a két besorolási út
 *  egyezése (L1 bankközi, L4 mondat, L5 kérdésirány) · O4 állapot-visszaállítás tesztfedése (L7) · O3 kimerülési szabály (L8).
 */

test("O1/L2: a pont és a fokozat nem függ a futtató alapértelmezett nyelvi környezetétől (török kisbetűsítés mellett is azonos)", () => {
  const entry = VOCAB_DE.find((e) => e.id === "de4-culture-007")!;
  const before = [vocabEntryScore(entry), vocabEntryStep(entry), ladderTermKey("Die Inszenierung", "de")] as const;
  const original = String.prototype.toLocaleLowerCase;
  // Török alapértelmezés modellje: a nagy I → pont nélküli ı.
  String.prototype.toLocaleLowerCase = function (this: string) {
    return original.call(this.replace(/I/g, "ı"), "tr");
  };
  try {
    assert.deepEqual([vocabEntryScore(entry), vocabEntryStep(entry), ladderTermKey("Die Inszenierung", "de")], [...before]);
  } finally {
    String.prototype.toLocaleLowerCase = original;
  }
  assert.equal(ladderTermKey("Die Inszenierung", "de"), "inszenierung");
});

test("O1/L3: a névelő nyelvenként és írásmódonként levágva — francia elízió mindkét aposztróffal, szóköz nélkül", () => {
  const ami = ladderDifficultyScore({ term: "ami", sentence: false, category: "word" }, "fr");
  assert.equal(ladderDifficultyScore({ term: "l'ami", sentence: false, category: "word" }, "fr"), ami);
  assert.equal(ladderDifficultyScore({ term: "l’ami", sentence: false, category: "word" }, "fr"), ami);
  assert.equal(ladderTermKey("L'ami", "fr"), "ami");
  assert.equal(ladderTermKey("les amis", "fr"), "amis");
  assert.equal(ladderTermKey("der Hund", "de"), "hund");
  assert.equal(ladderTermKey("the cat", "en"), "cat");
  // Nyelvenkénti: az angol „to die” névelő-levágása nem vágja tovább a német névelőként is olvasható „die”-t.
  assert.equal(ladderTermKey("to die", "en"), "die");
  const fr050 = WORD_LADDER_FR.find((q) => q.id === "fr0-050")!;
  assert.equal(ladderItemStep(fr050, "fr", 0), ladderItemStep({ ...fr050, focus: "ami", prompt: "Mit jelent: „ami”?" }, "fr", 0));
});

test("O2/L4: azonos célszöveg a nyers szóbanki és a kérdés-úton azonos pontot kap (közös mondatfelismerő)", () => {
  const bad: string[] = [];
  for (const lang of LANGS) {
    for (const e of VOCAB[lang]) {
      const lang2 = e.id.slice(0, 2) as WordLadderLanguage;
      const cat = e.kind === "phrase" ? "phrase" : "word";
      const toHu = ladderDifficultyScore(ladderDifficultyInput({ prompt: `Mit jelent: „${e.term}”?`, focus: e.term, options: [e.hu, "x", "y", "z"], correctIndex: 0, category: cat }), lang2);
      const toForeign = ladderDifficultyScore(ladderDifficultyInput({ prompt: `„${e.hu}” ${lang2 === "en" ? "angolul" : lang2 === "de" ? "németül" : "franciául"}:`, focus: e.hu, options: [e.term, "x", "y", "z"], correctIndex: 0, category: cat }), lang2);
      const raw = vocabEntryScore(e);
      if (toHu !== raw || toForeign !== raw) bad.push(`${e.id}: nyers ${raw}, cél→hu ${toHu}, hu→cél ${toForeign}`);
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} eltérés`);
  const dog = VOCAB_DE.find((e) => e.id === "de0-animals-020")!;
  assert.ok(vocabEntryScore(dog) >= 40, `ötszavas kifejezés mondatként: ${vocabEntryScore(dog)}`);
});

test("O2/L5: a mérce a célnyelvi oldalt méri — a magyar kiemelésű „Melyik helyes” tételnél a helyes idegen opciót", () => {
  const en114 = WORD_LADDER_EN.find((q) => q.id === "en1-114")!;
  assert.equal(ladderDifficultyInput(en114).term, en114.options[en114.correctIndex]);
  const goodbye = WORD_LADDER_EN.find((q) => q.id === "en0-008")!;
  assert.equal(ladderDifficultyInput(goodbye).term, "Goodbye");
  // Helyzetleírás, magyar válasszal („Mire kíváncsi?”): a kiemelt francia kérdés a célnyelvi oldal.
  const fr086 = WORD_LADDER_FR.find((q) => q.id === "fr2-086")!;
  assert.equal(ladderDifficultyInput(fr086).term, fr086.focus);
  // Osztályszintű őr: a mért célrész soha nem tartalmaz csak magyarban előforduló betűt (í, ó, ú, ő, ű).
  const hungarian: string[] = [];
  for (const lang of LANGS) {
    for (const q of MANUAL[lang]) {
      const t = ladderDifficultyInput(q).term;
      // A zárójeles magyar magyarázat („Sie (ő, lány) …”) és a mondat belsejében álló tulajdonnév („Győr”) kivétel.
      const words = t.replace(/\([^)]*\)/gu, " ").split(/\s+/u).filter((w, i) => w && (i === 0 || w[0] === w[0]!.toLowerCase()));
      if (/[íóúőű]/iu.test(words.join(" "))) hungarian.push(`${q.id}: ${t}`);
    }
  }
  assert.deepEqual(hungarian, []);
});

test("O2/L1: azonos célnyelvi alak a két bankban azonos szintről indul — a kisebb besorolás emelkedik (scissors / olló)", () => {
  const manual = WORD_LADDER_EN.find((q) => q.id === "en0-097")!;
  const entry = VOCAB_EN.find((e) => e.id === "en1-school-005")!;
  const floors = ladderTermFloors([...ladderFloorSources(WORD_LADDER_EN), ...vocabFloorSources(VOCAB_EN)], "en");
  assert.equal(floors.get(ladderTermKey("scissors", "en")), 1);
  const a = ladderItemStep(manual, "en", manual.tier, floors);
  const b = vocabEntryStep(entry, floors);
  assert.equal(a, b, "azonos fokozat");
  assert.ok(Math.floor(a / 3) >= 1, `legalább 1. szint: ${a}`);
  // Összevont készletben (gradedLadderBank) is: a 3–4. évfolyam sávjában az 1. szintre kerül.
  const asItem: LadderItem = { id: "vocab:en1-school-005:target-to-hu", prompt: "Mit jelent: „scissors”?", focus: "scissors", options: ["olló", "a", "b", "c"], correctIndex: 0, tier: 1, category: "word" };
  const bank = gradedLadderBank([manual, asItem], "en", 3);
  const stepOf = (id: string) => bank.findIndex((bucket) => bucket.some((q) => q.id === id));
  assert.equal(stepOf("en0-097"), stepOf(asItem.id));
  // Lefelé soha: a magasabb besorolás nem csökken.
  assert.ok(vocabEntryStep(entry, floors) >= vocabEntryStep(entry));
});

test("O4/L7: a reset minden állapotot nulláz — részleges jó / rossz sorozat után új menetben az első válaszok nem örökölnek", () => {
  const s = createLadderStepSession(5, 1);
  s.answer(true);
  s.answer(true);
  s.reset(5, 1);
  s.answer(true);
  assert.equal(s.step, 3, "két jó + új menet + egy jó: nem emel");
  s.answer(true);
  assert.equal(s.step, 3);
  s.answer(true);
  assert.equal(s.step, 4, "az új menet saját három jó válasza emel");
  s.answer(false);
  s.reset(5, 1);
  s.answer(false);
  assert.equal(s.step, 3, "egy hiba + új menet + egy hiba: nem könnyít");
  s.reset(9, 1);
  assert.equal(s.step, 9, "más évfolyam: új sáv és belépő");
  for (let i = 0; i < 60; i++) s.answer(false);
  assert.equal(s.step, ladderGradeWindow(9).minStep, "a reset a sávot is cseréli");
});

test("O3/L8: kimerülésnél a kért fokozat (a keresési sorrend első nem üres vödre) legrégebben látott tétele jön", () => {
  const mk = (id: string) => ({ id, prompt: id, options: ["a", "b", "c", "d"], correctIndex: 0 });
  const buckets = [[mk("x0")], [mk("x1a"), mk("x1b")], [mk("x2")]];
  const seen: SeenItem[] = ["x2", "x1a", "x0", "x1b"].map((id) => ({ id, prompt: id }));
  // A kért 1. fokozat teljesen látott: a saját legrégebbije (x1a), akkor is, ha a szomszédban régebbi (x2) is van.
  assert.equal(pickUnseen(buckets, 1, seen, () => 0)?.id, "x1a");
  // Ha a kért vödör üres, a keresési sorrend (előbb a könnyebb) következő vödre.
  assert.equal(pickUnseen([[mk("y0")], [], [mk("y2")]], 1, [{ id: "y0", prompt: "y0" }, { id: "y2", prompt: "y2" }], () => 0)?.id, "y0");
});

/*
 * Vak kör 2 (2026-11-22) — terv 14. szakasz:
 *  O5 célrész-kinyerés (L1 focus nélküli szerverbanki mondatkiegészítés, L3 magyar zárójeles súgó, L5 széli írásjel a kulcsban)
 *  O6 monotonitás (L2 a vödrözés a deklarált szintet használja, L4 fokozatváltás — invariáns minden évfolyam × szomszédos pár).
 */

/** A migrációs szerverbank Szólétra-tételei (`source/migrations/0005_game_quiz_items.sql`) — a valódi DTO-alak. */
function serverBankItems(): GameQuizBankItemDTO[] {
  const sql = readFileSync(fileURLToPath(new URL("../migrations/0005_game_quiz_items.sql", import.meta.url)), "utf8").replace(/\r\n/g, "\n");
  const rows = [...sql.matchAll(/\('word-ladder-hu-en', '(\w+)', '([^']*)', '((?:[^']|'')*)', '(\[[^\]]*\])'::jsonb, (\d+)\)/gu)];
  return rows.map((m, i) => ({
    id: `seed-${i}`, tier: m[1] as GameQuizBankItemDTO["tier"], topic: m[2]!, prompt: m[3]!.replace(/''/g, "'"), options: JSON.parse(m[4]!) as string[],
    correctIndex: Number(m[5]), explanation: null, sourceMaterialId: null,
  }));
}

/** O5 osztály-mérés: a kinyert célrész hibái egy tételen (üres = rendben). */
function targetProblems(term: string, key: string, correct: string, hadBlank: boolean): string[] {
  const p: string[] = [];
  if (/_{3,}/u.test(term)) p.push("a hiány bent maradt");
  if (hadBlank && normalizeWs(term) === normalizeWs(correct)) p.push("mondatkiegészítésből csak a válasz maradt");
  if (/\([^)]*[íóúőűÍÓÚŐŰ][^)]*\)/u.test(term)) p.push("magyar zárójeles súgó a célrészben");
  // A célnyelvi zárójeles pontosítás („achieve (a goal)”) záró zárójele a szerződés szerint marad (terv 14.).
  const bare = /\([^)]*\)$/u.test(key) ? key.replace(/\)$/u, "x") : key;
  if (/^[^\p{L}\p{N}(]|[^\p{L}\p{N}]$/u.test(bare)) p.push("széli írásjel a kulcsban");
  return p;
}
const normalizeWs = (s: string) => s.replace(/\s+/gu, " ").trim().toLowerCase();

test("O5: célrész-kinyerés minden forrásfajtán — kézi bankok, szóbank, migrációs szerverbank: 0 hiba (hiány, csak-válasz, magyar súgó, széli írásjel)", () => {
  const report: string[] = [];
  for (const lang of LANGS) {
    for (const q of MANUAL[lang]) {
      const t = ladderDifficultyInput(q).term;
      const hadBlank = /_{3,}/u.test(q.focus ?? "") || (!q.focus && /_{3,}/u.test(q.prompt));
      for (const x of targetProblems(t, ladderTermKey(t, lang), q.options[q.correctIndex]!, hadBlank)) report.push(`${q.id}: ${x}`);
    }
    for (const e of VOCAB[lang]) {
      for (const x of targetProblems(e.term, ladderTermKey(e.term, lang), "", false)) report.push(`${e.id}: ${x}`);
    }
  }
  const server = serverBankItems();
  assert.equal(server.length, 4, "a migráció 4 Szólétra-tétele");
  const { easy, medium, hard } = splitBankItemsByTier(server);
  for (const q of [...easy, ...medium, ...hard]) {
    const t = ladderDifficultyInput(q).term;
    for (const x of targetProblems(t, ladderTermKey(t, "en"), q.options[q.correctIndex]!, /_{3,}/u.test(q.prompt))) report.push(`${String(q.id)}: ${x}`);
  }
  assert.deepEqual(report, []);
});

test("O5/L1: focus nélküli szerverbanki mondatkiegészítés — a kitöltött célnyelvi mondat, mint a focus-os alaknál (valódi DTO → adapter → mérce)", () => {
  const { hard } = splitBankItemsByTier(serverBankItems());
  const q = hard.find((x) => /She asked me/u.test(x.prompt))!;
  const input = ladderDifficultyInput(q);
  assert.equal(input.term, "She asked me to be quiet.");
  assert.equal(input.sentence, true);
  const withFocus = { ...q, focus: "She asked me ___ quiet." };
  assert.equal(ladderItemStep(q, "en", 2), ladderItemStep(withFocus, "en", 2));
  assert.ok(ladderItemStep(q, "en", 2) >= 7, `nem a 2. szint legkönnyebb alfoka: ${ladderItemStep(q, "en", 2)}`);
  // A szóbank teljes cloze-alakja: a „(Magyarul: …)” fordítás nem része a célrésznek.
  const full = ladderDifficultyInput({ prompt: "Melyik illik a mondatba? I _____ to school. (Magyarul: Iskolába megyek.)", options: ["go", "goes", "going", "gone"], correctIndex: 0 });
  assert.equal(full.term, "I go to school.");
});

test("O5/L3: a magyar zárójeles súgó nem része a mérce bemenetének; a célnyelvi zárójeles pontosítás igen", () => {
  const de097 = WORD_LADDER_DE.find((q) => q.id === "de0-097")!;
  const plain = { ...de097, prompt: de097.prompt.replace(" (ő, lány)", ""), focus: de097.focus!.replace(" (ő, lány)", "") };
  assert.equal(ladderDifficultyScore(ladderDifficultyInput(de097), "de"), ladderDifficultyScore(ladderDifficultyInput(plain), "de"));
  assert.equal(ladderItemStep(de097, "de", 0), ladderItemStep(plain, "de", 0));
  assert.equal(ladderTermKey("to achieve (a goal)", "en"), "achieve (a goal)");
});

test("O5/L5: széli ellipszis és tipográfiai idézőjel nem része a bankközi kulcsnak", () => {
  assert.equal(ladderTermKey("À mon avis, …", "fr"), ladderTermKey("à mon avis", "fr"));
  assert.equal(ladderTermKey("„Good night”", "en"), "good night");
  assert.equal(ladderTermKey("«bonjour»", "fr"), "bonjour");
  assert.equal(ladderTermKey("...hello...", "en"), "hello");
});

test("O6/L2: a vödrözés a tétel deklarált szintjét használja; a készlet-index csak pótlás (szint nélküli tételnél)", () => {
  const entry = VOCAB_EN.find((e) => e.id === "en2-shopping-010")!;
  const item: LadderItem = { id: `vocab:${entry.id}:phrase-meaning`, prompt: `Mit jelent ez a mondat? „${entry.example}”`, focus: entry.example, options: ["x", "y", "z", "w"], correctIndex: 0, tier: 2, category: "phrase" };
  const buckets = ladderStepBuckets([[], [item], [], [], []], "en");
  const step = buckets.findIndex((b) => b.includes(item));
  assert.ok(Math.floor(step / 3) >= 2, `a 2. szintű tétel nem sorolódik vissza az 1-es készletből: ${step}`);
  const untagged = { id: "db:x", prompt: "„Kalap” angolul:", options: ["hat", "hot", "hit", "hut"], correctIndex: 0 };
  const b2 = ladderStepBuckets([[], [untagged], [], [], []], "en");
  assert.equal(Math.floor(b2.findIndex((b) => b.includes(untagged)) / 3), 1, "szint nélküli tételnél a készlet-index");
});

test("O6/L4: monotonitás — minden nyelv × évfolyam × szomszédos fokozatpár a sávban (szinten belül szigorú pont-elválás; szinthatáron azonos alfok mediánja nem csökken)", () => {
  const report: string[] = [];
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : Number.NaN; };
  for (const lang of LANGS) {
    const floors = ladderTermFloors([...ladderFloorSources(MANUAL[lang]), ...vocabFloorSources(VOCAB[lang])], lang);
    const scored: { step: number; score: number }[] = [
      ...MANUAL[lang].map((q) => ({ step: ladderItemStep(q, lang, q.tier, floors), score: ladderDifficultyScore(ladderDifficultyInput(q), lang) })),
      ...VOCAB[lang].map((e) => ({ step: vocabEntryStep(e, floors), score: vocabEntryScore(e) })),
    ];
    const byStep = Array.from({ length: LADDER_STEP_COUNT }, (_, s) => scored.filter((x) => x.step === s).map((x) => x.score));
    for (const grade of GRADES) {
      const win = ladderGradeWindow(grade);
      for (let k = win.minStep; k < win.maxStep; k++) {
        const a = byStep[k]!;
        const b = byStep[k + 1]!;
        if (Math.floor(k / 3) === Math.floor((k + 1) / 3)) {
          if (!(Math.max(...a) < Math.min(...b))) report.push(`${lang} ${grade}. évf. ${k}→${k + 1}: max ${Math.max(...a)} ≥ min ${Math.min(...b)}`);
        } else {
          // Szinthatár (2. alfok → következő szint 0. alfoka): a bank szintje elsőbbséget élvez (terv 14.); az elvárás: a
          // következő szint 0. alfokának mediánja ≥ az előző szint 0. alfokának mediánja, és a szint-átlag szigorúan nő.
          const prevSub0 = byStep[k - 2]!;
          if (!(median(b) >= median(prevSub0))) report.push(`${lang} ${grade}. évf. szinthatár ${k}→${k + 1}: medián ${median(b)} < ${median(prevSub0)}`);
        }
      }
    }
  }
  assert.deepEqual(report, []);
});

test("O6: a fokozat-határpontok szintenként nem csökkennek (az alfok-sávok a szintek között nem csúsznak lefelé)", () => {
  for (let t = 1; t < LADDER_SUB_CUTS.length; t++) {
    const [a0, b0] = LADDER_SUB_CUTS[t - 1]!;
    const [a1, b1] = LADDER_SUB_CUTS[t]!;
    assert.ok(a1 >= a0 && b1 >= b0, `${t - 1}. → ${t}. szint: [${a0}, ${b0}] → [${a1}, ${b1}]`);
    assert.ok(a1 < b1, `${t}. szint: a 0. és 1. alfok határa a 2. előtt`);
  }
});

test("O6: a futás fokozata helyes válaszra soha nem csökken, egy válaszra legfeljebb 1-et lép — minden évfolyam × pálya", () => {
  for (const grade of GRADES) {
    for (const level of LEVELS) {
      const s = createLadderStepSession(grade, level);
      const rng = seeded(grade * 31 + level);
      let prev = s.step;
      for (let i = 0; i < 80; i++) {
        const correct = rng() < 0.6;
        s.answer(correct);
        assert.ok(Math.abs(s.step - prev) <= 1, `${grade}/${level}: ugrás ${prev}→${s.step}`);
        if (correct) assert.ok(s.step >= prev, `${grade}/${level}: helyes válaszra csökkent ${prev}→${s.step}`);
        prev = s.step;
      }
    }
  }
});
