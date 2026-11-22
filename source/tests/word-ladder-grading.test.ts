import assert from "node:assert/strict";
import test from "node:test";

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
import { generateVocabQuestion } from "../client/src/game-engine/vocab/questionGenerator";
import {
  LADDER_GRADE_BANDS,
  LADDER_STEP_COUNT,
  LADDER_STEP_OVERRIDES,
  LADDER_SUB_CUTS,
  createLadderStepSession,
  gradedLadderBank,
  isLadderSentence,
  ladderDifficultyInput,
  ladderDifficultyScore,
  ladderGradeWindow,
  ladderItemStep,
  ladderStartStep,
  ladderStepBuckets,
  ladderTermKey,
  vocabEntryScore,
  vocabEntryStep,
  windowLadderSteps,
} from "../client/src/lib/wordLadderGrading";

/**
 * Szólétra szintezés — terv: docs/specs/2026-11-22-szoletra-szintezes.md (6. A1–A8, A12; 13–15. szakasz).
 *
 * SPEC-VÁLTOZÁS 2026-11-22 (terv 15., tulajdonosi döntés „CSAK STRUKTÚRÁLT MEZŐK”): a mérce nem elemzi a prompt szövegét. A
 * vak kör 1–2 heurisztikáinak tesztjei (célnyelvi-oldal választó, prompt-hiány kinyerése, magyar-súgó felismerés) helyére a
 * strukturált szerződés tesztjei léptek (S1–S3); a normalizálás, a monotonitás és a lépés-szabály tesztjei maradtak.
 * SPEC-VÁLTOZÁS 2026-11-22 (terv 16., tulajdonosi döntés „KORLÁT ELHAGYÁSA”): a bankközi szintkorlát és tesztjei (S4, S5)
 * kikerültek; az ND-3 a pontszám-alapú felfelé sorolással teljesül. Új: S6 (szóbanki tételnél a `term` a mérce bemenete),
 * S7 (kötőjeles / aposztrófos szó egy szó a szótag-levonásban).
 */

const MANUAL: Record<WordLadderLanguage, readonly LadderItem[]> = { en: WORD_LADDER_EN, de: WORD_LADDER_DE, fr: WORD_LADDER_FR };
const VOCAB: Record<WordLadderLanguage, readonly VocabEntry[]> = { en: VOCAB_EN, de: VOCAB_DE, fr: VOCAB_FR };
const LANGS: WordLadderLanguage[] = ["en", "de", "fr"];
const GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Graded = { step: number; score: number; declared: number };
function gradedAll(lang: WordLadderLanguage): Graded[] {
  const manual = MANUAL[lang].map((q) => ({
    step: ladderItemStep(q, lang, q.tier),
    score: ladderDifficultyScore(ladderDifficultyInput(q, lang), lang),
    declared: q.tier,
  }));
  const vocab = VOCAB[lang].map((e) => ({ step: vocabEntryStep(e), score: vocabEntryScore(e), declared: e.level }));
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
      const bank = gradedLadderBank(items, lang, band.grades[0]!);
      const win = ladderGradeWindow(band.grades[0]!);
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
  assert.ok(Math.floor(ladderStartStep(3, 10) / 3) <= 1);
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
  for (let i = 0; i < 60; i++) s.answer(false);
  assert.equal(s.step, ladderGradeWindow(5).minStep, "alul a sáv alja");
  s.reset(3, 1);
  for (let i = 0; i < 60; i++) s.answer(true);
  assert.equal(s.step, 5, "3. évfolyamon legfeljebb az 1. szint teteje");
});

test("A7/L7: a reset minden állapotot nulláz — részleges jó / rossz sorozat után új menetben az első válaszok nem örökölnek", () => {
  const s = createLadderStepSession(5, 1);
  s.answer(true);
  s.answer(true);
  s.reset(5, 1);
  s.answer(true);
  assert.equal(s.step, 3, "két jó + új menet + egy jó: nem emel");
  s.answer(true);
  s.answer(true);
  assert.equal(s.step, 4);
  s.answer(false);
  s.reset(5, 1);
  s.answer(false);
  assert.equal(s.step, 3, "egy hiba + új menet + egy hiba: nem könnyít");
  s.reset(9, 1);
  assert.equal(s.step, 9, "más évfolyam: új sáv és belépő");
  for (let i = 0; i < 60; i++) s.answer(false);
  assert.equal(s.step, ladderGradeWindow(9).minStep);
});

test("A8: 3. évfolyamon bármely pályán, bármely válaszsorozattal a választott tétel legfeljebb 1. szintű (fokozat ≤ 5)", () => {
  const buckets = windowLadderSteps(ladderStepBuckets(ladderTiersFromBank(WORD_LADDER_EN), "en"), 3);
  const stepOf = new Map(buckets.flatMap((b, step) => b.map((q) => [q.id, step] as const)));
  const bad: string[] = [];
  for (const level of LEVELS) {
    for (let run = 0; run < 20; run++) {
      const rng = seeded(level * 1000 + run);
      const session = createLadderStepSession(3, level);
      const seen: SeenItem[] = [];
      for (let i = 0; i < 40; i++) {
        const q = pickUnseen(buckets, session.step, seen, rng);
        assert.ok(q, "van kérdés");
        if (stepOf.get(q.id)! > 5) bad.push(`${level}/${run}: ${q.id}`);
        seen.push({ id: q.id, prompt: q.prompt });
        session.answer(rng() < run / 19);
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

test("S1: a mérce bemenete csak strukturált mező — `focus`, ha van (hiányos mondatnál a helyes válasszal kitöltve), különben a helyes válasz", () => {
  const goodbye = WORD_LADDER_EN.find((q) => q.id === "en0-008")!;
  assert.deepEqual(ladderDifficultyInput(goodbye, "en"), { term: "Goodbye", sentence: false, category: "everyday" });
  const cloze = WORD_LADDER_EN.find((q) => q.focus && /_{3,}/u.test(q.focus))!;
  const input = ladderDifficultyInput(cloze, "en");
  assert.equal(input.sentence, true);
  assert.equal(input.term, cloze.focus!.replace(/_{3,}/u, cloze.options[cloze.correctIndex]!));
  const noFocus = { prompt: "Melyik illik: She asked me ___ quiet.", options: ["be", "to be", "being", "been"], correctIndex: 1 };
  assert.deepEqual(ladderDifficultyInput(noFocus, "en"), { term: "to be", sentence: false }, "kiemelés nélkül a helyes válasz (dokumentált korlát)");
});

test("S2: a mérce a prompt szövegétől független — ugyanaz a tétel más prompttal azonos pontot és fokozatot kap (mindhárom kézi bank, minden tétel)", () => {
  const bad: string[] = [];
  for (const lang of LANGS) {
    for (const q of MANUAL[lang]) {
      const other = { ...q, prompt: "Melyik helyes? angolul: Mit jelent: „x”? (Magyarul: y)" };
      const a = [ladderDifficultyScore(ladderDifficultyInput(q, lang), lang), ladderItemStep(q, lang, q.tier)];
      const b = [ladderDifficultyScore(ladderDifficultyInput(other, lang), lang), ladderItemStep(other, lang, q.tier)];
      if (a[0] !== b[0] || a[1] !== b[1]) bad.push(`${q.id}: ${a.join("/")} ≠ ${b.join("/")}`);
    }
  }
  assert.deepEqual(bad, []);
});

test("S3/L3: normalizálás — locale-független kisbetű, nyelvenkénti névelő (francia elízió), széli írásjel; a nem törő szóköz és az önálló írásjel nem szó", () => {
  const entry = VOCAB_DE.find((e) => e.id === "de4-culture-007")!;
  const before = [vocabEntryScore(entry), vocabEntryStep(entry), ladderTermKey("Die Inszenierung", "de")];
  const original = String.prototype.toLocaleLowerCase;
  String.prototype.toLocaleLowerCase = function (this: string) {
    return original.call(this.replace(/I/g, "ı"), "tr");
  };
  try {
    assert.deepEqual([vocabEntryScore(entry), vocabEntryStep(entry), ladderTermKey("Die Inszenierung", "de")], before);
  } finally {
    String.prototype.toLocaleLowerCase = original;
  }
  assert.equal(ladderTermKey("Die Inszenierung", "de"), "inszenierung");
  assert.equal(ladderTermKey("L'ami", "fr"), "ami");
  assert.equal(ladderTermKey("l’ami", "fr"), "ami");
  assert.equal(ladderTermKey("to die", "en"), "die");
  assert.equal(ladderTermKey("À mon avis, …", "fr"), ladderTermKey("à mon avis", "fr"));
  assert.equal(ladderTermKey("„Good night”", "en"), "good night");
  assert.equal(ladderTermKey("to achieve (a goal)", "en"), "achieve (a goal)");
  // L3: „comment va ta famille ?” (nem törő szóköz + önálló kérdőjel) négy szó, nem mondat; a pont azonos a kérdőjel nélkülivel.
  const nbsp = "comment va ta famille ?";
  assert.equal(isLadderSentence(nbsp, "fr"), false);
  assert.equal(isLadderSentence("oui , merci – à demain", "fr"), false, "a belső önálló írásjel („,”, „–”) sem szó");
  assert.equal(ladderDifficultyScore({ term: nbsp, sentence: isLadderSentence(nbsp, "fr"), category: "phrase" }, "fr"),
    ladderDifficultyScore({ term: "comment va ta famille", sentence: false, category: "phrase" }, "fr"));
  const fam = VOCAB_FR.find((e) => e.id === "fr1-family-022")!;
  assert.ok(Math.floor(vocabEntryStep(fam) / 3) <= 1, `fr1-family-022 nem esik ki a tipográfia miatt: ${vocabEntryStep(fam)}`);
});

test("O6/L2: a vödrözés a tétel deklarált szintjét használja; a készlet-index csak pótlás (szint nélküli tételnél)", () => {
  const entry = VOCAB_EN.find((e) => e.id === "en2-shopping-010")!;
  const item: LadderItem = { id: `vocab:${entry.id}:phrase-meaning`, prompt: "p", focus: entry.example, options: ["x", "y", "z", "w"], correctIndex: 0, tier: 2, category: "phrase" };
  const buckets = ladderStepBuckets([[], [item], [], [], []], "en");
  assert.ok(Math.floor(buckets.findIndex((b) => b.includes(item)) / 3) >= 2);
  const untagged = { id: "db:x", prompt: "„Kalap” angolul:", options: ["hat", "hot", "hit", "hut"], correctIndex: 0 };
  const b2 = ladderStepBuckets([[], [untagged], [], [], []], "en");
  assert.equal(Math.floor(b2.findIndex((b) => b.includes(untagged)) / 3), 1, "szint nélküli tételnél a készlet-index");
});

test("O6/L4: monotonitás — minden nyelv × évfolyam × szomszédos fokozatpár a sávban (szinten belül szigorú pont-elválás; szinthatáron a 0. alfok mediánja nem csökken)", () => {
  const report: string[] = [];
  const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)]! : Number.NaN; };
  for (const lang of LANGS) {
    const all = gradedAll(lang);
    const byStep = Array.from({ length: LADDER_STEP_COUNT }, (_, s) => all.filter((x) => x.step === s).map((x) => x.score));
    for (const grade of GRADES) {
      const win = ladderGradeWindow(grade);
      for (let k = win.minStep; k < win.maxStep; k++) {
        const a = byStep[k]!;
        const b = byStep[k + 1]!;
        if (Math.floor(k / 3) === Math.floor((k + 1) / 3)) {
          if (!(Math.max(...a) < Math.min(...b))) report.push(`${lang} ${grade}. évf. ${k}→${k + 1}: max ${Math.max(...a)} ≥ min ${Math.min(...b)}`);
        } else if (!(median(b) >= median(byStep[k - 2]!))) {
          report.push(`${lang} ${grade}. évf. szinthatár ${k}→${k + 1}: medián ${median(b)} < ${median(byStep[k - 2]!)}`);
        }
      }
    }
  }
  assert.deepEqual(report, []);
});

test("O6: a fokozat-határpontok szintenként nem csökkennek", () => {
  for (let t = 1; t < LADDER_SUB_CUTS.length; t++) {
    const [a0, b0] = LADDER_SUB_CUTS[t - 1]!;
    const [a1, b1] = LADDER_SUB_CUTS[t]!;
    assert.ok(a1 >= a0 && b1 >= b0 && a1 < b1, `${t - 1}. → ${t}. szint: [${a0}, ${b0}] → [${a1}, ${b1}]`);
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
        if (correct) assert.ok(s.step >= prev, `${grade}/${level}: helyes válaszra csökkent`);
        prev = s.step;
      }
    }
  }
});

test("L8: kimerülésnél a kért fokozat (a keresési sorrend első nem üres vödre) legrégebben látott tétele jön", () => {
  const mk = (id: string) => ({ id, prompt: id, options: ["a", "b", "c", "d"], correctIndex: 0 });
  const seen: SeenItem[] = ["x2", "x1a", "x0", "x1b"].map((id) => ({ id, prompt: id }));
  assert.equal(pickUnseen([[mk("x0")], [mk("x1a"), mk("x1b")], [mk("x2")]], 1, seen, () => 0)?.id, "x1a");
  assert.equal(pickUnseen([[mk("y0")], [], [mk("y2")]], 1, [{ id: "y0", prompt: "y0" }, { id: "y2", prompt: "y2" }], () => 0)?.id, "y0");
});

test("S6/L2: szóbanki tételnél a mérce a `term`-et (célnyelvi alak) méri — a generált kérdés irányától függetlenül azonos a nyers bejegyzéssel", () => {
  const bad: string[] = [];
  let n = 0;
  for (const lang of LANGS) {
    const bank = VOCAB[lang];
    for (const e of bank.filter((_, i) => i % 7 === 0)) {
      for (const type of ["hu-to-target", "target-to-hu"] as const) {
        const q = generateVocabQuestion(e, bank, type, seeded(n++));
        if (!q) continue;
        const item = { id: q.id, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, focus: q.focus, term: q.answerTerm, category: (e.kind === "phrase" ? "phrase" : "word") as LadderItem["category"] };
        if (ladderDifficultyScore(ladderDifficultyInput(item, lang), lang) !== vocabEntryScore(e)) bad.push(`${q.id}`);
        if (ladderItemStep(item, lang, e.level) !== vocabEntryStep(e)) bad.push(`${q.id}: fokozat`);
      }
    }
  }
  assert.ok(n > 900, `mért kérdés: ${n}`);
  assert.deepEqual(bad.slice(0, 5), []);
  const piano = VOCAB_EN.find((e) => e.id === "en0-freetime-019")!;
  const huToEn = generateVocabQuestion(piano, VOCAB_EN, "hu-to-target", seeded(1))!;
  assert.equal(ladderDifficultyInput({ ...huToEn, term: huToEn.answerTerm }, "en").term, "play the piano", "nem a magyar „zongorázik”");
});

test("S7/L4: a szótag-levonás ugyanazokon a szavakon fut, mint a szószám — a kötőjeles / aposztrófos alak egy szó", () => {
  const rainbow = VOCAB_FR.find((e) => e.id === "fr1-weather-004")!;
  // „arc-en-ciel”: 9 betű / 1,2 + 2 × (3 magánhangzó-csoport − 1 szó) = 11,5
  assert.equal(vocabEntryScore(rainbow), 11.5);
  assert.equal(vocabEntryStep(rainbow), 4);
  // Aposztrófos szó a szó belsejében (nem névelő): „aujourd'hui” egy szó — 10 betű / 1,2 + 2 × (3 csoport: au, ou, ui − 1).
  assert.equal(ladderDifficultyScore({ term: "aujourd'hui", sentence: false, category: "word" }, "fr"),
    Math.round(((10 / 1.2) + 2 * (3 - 1)) * 10) / 10);
});

/*
 * PR #528 Copilot-észrevételek (2026-11-22): (1) a szótag-osztály minden érintett nyelv magánhangzóját ismeri (a magyar
 * `focus` is a mérce bemenete: á í ó ő ú ű); (2) a kézi felülíró táblában csak saját, szám értékű kulcs számít.
 */
const VOWELS = ["a", "e", "i", "o", "u", "y", "á", "é", "í", "ó", "ö", "ő", "ú", "ü", "ű", "ä", "à", "â", "æ", "è", "ê", "ë", "ì", "î", "ï", "ò", "ô", "œ", "ù", "û", "ÿ"];

test("C1: a szótag-osztály minden magánhangzót ismer (magyar, német, francia) — egy magánhangzó egy csoport, két elválasztott két csoport", () => {
  const bad: string[] = [];
  for (const v of VOWELS) {
    const one = ladderDifficultyScore({ term: `b${v}b`, sentence: false, category: "word" }, "en");
    const two = ladderDifficultyScore({ term: `b${v}b${v}b`, sentence: false, category: "word" }, "en");
    // két további betű (2 pont) + egy plusz szótag (2 pont)
    if (Math.round((two - one) * 10) / 10 !== 4) bad.push(`${v}: ${one} → ${two}`);
  }
  assert.deepEqual(bad, []);
  const barat = WORD_LADDER_EN.find((q) => q.id === "en0-018")!;
  assert.equal(ladderDifficultyScore(ladderDifficultyInput(barat, "en"), "en"), 7, "„Barát”: 5 betű + 2 × (2 csoport − 1)");
  assert.equal(ladderItemStep(barat, "en", 0), 1);
});

test("C2: a felülíró tábla csak saját, szám értékű kulcsot vesz figyelembe — örökölt tulajdonság-nevű azonosító nem hiba", () => {
  const base = { prompt: "p", options: ["house", "a", "b", "c"], correctIndex: 0 };
  const expected = ladderItemStep({ ...base, id: "x-normal" }, "en", 0);
  for (const id of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    assert.equal(ladderItemStep({ ...base, id }, "en", 0), expected, id);
  }
  assert.doesNotThrow(() => ladderStepBuckets([[{ ...base, id: "constructor" }, { ...base, id: "__proto__" }]], "en"));
});
