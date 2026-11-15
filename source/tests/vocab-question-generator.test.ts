import assert from "node:assert/strict";
import test from "node:test";
import { isPlayableQuestion } from "../shared/game-quiz-contract";
import { normalizeTerm } from "../client/src/data/vocabBank/validate";
import type { VocabEntry } from "../client/src/data/vocabBank/types";
import {
  findTermInExample,
  generateVocabQuestion,
  pickQuestionType,
  type VocabQuestionType,
} from "../client/src/game-engine/vocab/questionGenerator";
import { makeSyntheticBank, seededRng } from "./support/vocab-fixture";

/** Terv 4.3, A3; végrehajtás S1/7. lépés (+ cloze-pontosítás 2026-11-15, #419 review). */
const TYPES: VocabQuestionType[] = ["hu-to-target", "target-to-hu", "cloze", "phrase-meaning"];

function optionOf(e: VocabEntry, type: VocabQuestionType): string {
  return type === "target-to-hu" ? e.hu : type === "phrase-meaning" ? e.exampleHu : e.term;
}

test("A3: 4000 seedelt kérdés minden típusból — 4 különböző opció, egy helyes, szinonima nélkül, 30–300 karakteres magyarázat", () => {
  const bank = makeSyntheticBank("en", [120, 120, 120, 120, 120], 7);
  const rng = seededRng(2026);
  const perType = new Map<VocabQuestionType, number>();
  const correctAt = [0, 0, 0, 0];
  let made = 0;
  let guard = 0;
  // Típusonként 1000 kérdés = 4000; a nem alkalmazható típus (phrase-meaning word-re) null-t ad, azt kihagyjuk.
  for (const type of TYPES) {
    let count = 0;
    while (count < 1000) {
      assert.ok(guard++ < 50_000, "túl sok null");
      const entry = bank[Math.floor(rng() * bank.length)]!;
      const q = generateVocabQuestion(entry, bank, type, rng);
      if (type === "phrase-meaning" && !(entry.kind === "phrase" && entry.level >= 2)) {
        assert.equal(q, null, "phrase-meaning csak phrase és level ≥ 2");
        continue;
      }
      assert.ok(q, `${entry.id} ${type}: null`);
      count++; made++;
      perType.set(type, (perType.get(type) ?? 0) + 1);

      assert.equal(q.options.length, 4);
      assert.equal(new Set(q.options.map(normalizeTerm)).size, 4, "különböző opciók");
      assert.ok(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex <= 3);
      assert.equal(q.options[q.correctIndex], optionOf(entry, type), "a correctIndex a helyes opció");
      correctAt[q.correctIndex]!++;

      // Rossz válasz: a bank bejegyzése, azonos kind, nem a helyes bejegyzés szinonimája.
      q.options.forEach((opt, i) => {
        if (i === q.correctIndex) return;
        const d = bank.find(e => optionOf(e, type) === opt);
        assert.ok(d, `ismeretlen opció: ${opt}`);
        assert.equal(d.kind, entry.kind, "azonos kind");
        assert.notEqual(normalizeTerm(d.hu), normalizeTerm(entry.hu));
        assert.notEqual(normalizeTerm(d.term), normalizeTerm(entry.term));
      });

      assert.ok(q.explanation && q.explanation.length >= 30 && q.explanation.length <= 300, `magyarázat hossza: ${q.explanation?.length}`);
      assert.ok(q.explanation.includes(q.options[q.correctIndex]!), "a magyarázat megnevezi a helyes választ");
      assert.doesNotMatch(q.explanation, /\b(első|második|harmadik|negyedik)\b/u, "sorrendre nem hivatkozik");
      assert.equal(isPlayableQuestion(q), true);
      assert.equal(q.id, `vocab:${entry.id}:${type}`);
      assert.equal(q.vocabId, entry.id);
      assert.equal(q.lang, "en");
      assert.equal(q.questionType, type);
      assert.equal(q.answerTerm, entry.term);
      // Review #421: a cloze prompt a példamondat magyar fordítását is tartalmazza (egyértelmű a helyes kiegészítés).
      if (type === "cloze") assert.ok(q.prompt.endsWith(`(Magyarul: ${entry.exampleHu})`), q.prompt);
    }
  }
  assert.equal(made, 4000);
  // Egyenletes helyes-index: 25% ± 5 pont mind a 4 helyen (Math.floor(rng()*4), 4000 mintán a szórás ~0,7 pont).
  for (const n of correctAt) {
    const share = n / made;
    assert.ok(share >= 0.2 && share <= 0.3, `helyes index aránya ${(share * 100).toFixed(1)}%`);
  }
});

test("azonos seed → azonos kérdés", () => {
  const bank = makeSyntheticBank("de", [40, 40, 40, 40, 40], 3);
  for (const type of TYPES) {
    const entry = bank.find(e => e.kind === "phrase" && e.level >= 2)!;
    const a = generateVocabQuestion(entry, bank, type, seededRng(99));
    const b = generateVocabQuestion(entry, bank, type, seededRng(99));
    assert.deepEqual(a, b, type);
  }
});

test("pickQuestionType: phrase-meaning csak phrase és level ≥ 2; cloze csak ha a term a példában áll", () => {
  const bank = makeSyntheticBank("en", [30, 30, 30, 30, 30], 11);
  const rng = seededRng(5);
  const seen = new Map<string, Set<VocabQuestionType>>();
  for (let i = 0; i < 6000; i++) {
    const e = bank[i % bank.length]!;
    const t = pickQuestionType(e, rng);
    if (t === "phrase-meaning") assert.ok(e.kind === "phrase" && e.level >= 2, `${e.id}: phrase-meaning`);
    const key = e.kind === "phrase" && e.level >= 2 ? "phrase2" : "other";
    if (!seen.has(key)) seen.set(key, new Set());
    seen.get(key)!.add(t);
  }
  assert.deepEqual([...seen.get("phrase2")!].sort(), [...TYPES].sort(), "phrase, L≥2: mind a négy típus előfordul");
  assert.deepEqual([...seen.get("other")!].sort(), ["cloze", "hu-to-target", "target-to-hu"]);
});

const HUND: VocabEntry = { id: "de0-animals-001", term: "der Hund", hu: "kutya", kind: "word", level: 0, topic: "animals", pos: "noun", example: "Der Hund bellt.", exampleHu: "A kutya ugat." };
const DE_FILL: VocabEntry[] = [
  { id: "de0-animals-002", term: "die Katze", hu: "macska", kind: "word", level: 0, topic: "animals", pos: "noun", example: "Die Katze schläft.", exampleHu: "A macska alszik." },
  { id: "de0-animals-003", term: "das Pferd", hu: "ló", kind: "word", level: 0, topic: "animals", pos: "noun", example: "Das Pferd läuft schnell.", exampleHu: "A ló gyorsan fut." },
  { id: "de0-animals-004", term: "der Vogel", hu: "madár", kind: "word", level: 0, topic: "animals", pos: "noun", example: "Der Vogel singt laut.", exampleHu: "A madár hangosan énekel." },
];

test("cloze: „der Hund” → „Der Hund bellt.” (kis-/nagybetű független, szóhatáron)", () => {
  const bank = [HUND, ...DE_FILL];
  const q = generateVocabQuestion(HUND, bank, "cloze", seededRng(1));
  assert.ok(q);
  // SPEC-VÁLTOZÁS 2026-11-15 (review #421, végrehajtás S1/7.): a cloze prompt a példa magyar fordítását is adja.
  assert.equal(q.prompt, "Melyik illik a mondatba? _____ bellt. (Magyarul: A kutya ugat.)");
  assert.equal(q.options[q.correctIndex], "der Hund");
});

test("cloze: a fordítás alapján is illő rossz válasz (a hu-ja szó elején áll az exampleHu-ban) kizárva (review #421)", () => {
  // „Der Hund und die Katze spielen.” — a „macska” a fordításban is szerepel, ezért a „die Katze” nem lehet rossz válasz.
  const hund: VocabEntry = { ...HUND, example: "Der Hund und die Katze spielen.", exampleHu: "A kutya és a macska játszik." };
  const extra: VocabEntry = { id: "de0-animals-005", term: "die Maus", hu: "egér", kind: "word", level: 0, topic: "animals", pos: "noun", example: "Die Maus ist klein.", exampleHu: "Az egér kicsi." };
  const bank = [hund, ...DE_FILL, extra];
  const rng = seededRng(12);
  for (let i = 0; i < 200; i++) {
    const q = generateVocabQuestion(hund, bank, "cloze", rng);
    assert.ok(q);
    assert.ok(!q.options.includes("die Katze"), "a fordításban szereplő jelentésű opció kimarad");
  }
  // A többi típusnál a „die Katze” továbbra is lehet rossz válasz.
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) generateVocabQuestion(hund, bank, "hu-to-target", rng)!.options.forEach(o => seen.add(o));
  assert.ok(seen.has("die Katze"));
});

test("cloze: csak alt (ragozott) alak a példában → 500 próbából egyszer sem jön hiányos mondat", () => {
  const denHund: VocabEntry = { ...HUND, example: "Ich sehe den Hund im Park.", exampleHu: "Látom a kutyát a parkban.", alt: ["den Hund"] };
  const go: VocabEntry = { id: "en0-everyday-001", term: "go", hu: "megy", kind: "word", level: 0, topic: "everyday", pos: "verb", example: "We went home early.", exampleHu: "Korán hazamentünk.", alt: ["went"] };
  const enBank = [go, ...makeSyntheticBank("en", [20, 20, 0, 0, 0], 4)];
  const deBank = [denHund, ...DE_FILL];
  assert.equal(findTermInExample(denHund), null);
  assert.equal(findTermInExample(go), null, "a „go” nem illeszkedik szóhatáron belül sem");
  const rng = seededRng(500);
  for (let i = 0; i < 500; i++) {
    assert.notEqual(pickQuestionType(denHund, rng), "cloze");
    assert.notEqual(pickQuestionType(go, rng), "cloze");
  }
  assert.equal(generateVocabQuestion(denHund, deBank, "cloze", rng), null);
  assert.equal(generateVocabQuestion(go, enBank, "cloze", rng), null);
});

test("cloze: részszó nem találat (szóhatár) — „cat” nem illeszkedik a „category” szóra", () => {
  assert.equal(findTermInExample({ term: "cat", example: "This category is new." }), null);
  assert.ok(findTermInExample({ term: "cat", example: "My cat, Tom, is old." }));
});

test("cloze: a francia nem törő szóköz megmarad (`Tu viens\\u00A0?`)", () => {
  const viens: VocabEntry = { id: "fr2-communication-001", term: "tu viens", hu: "jössz", kind: "phrase", level: 2, topic: "communication", pos: "phrase", example: "Tu viens\u00A0?", exampleHu: "Jössz?" };
  const fill: VocabEntry[] = [
    { id: "fr2-communication-002", term: "bonne idée", hu: "jó ötlet", kind: "phrase", level: 2, topic: "communication", pos: "phrase", example: "C'est une bonne idée\u00A0!", exampleHu: "Ez jó ötlet!" },
    { id: "fr2-communication-003", term: "pas de souci", hu: "semmi gond", kind: "phrase", level: 2, topic: "communication", pos: "phrase", example: "Pas de souci, je t'aide.", exampleHu: "Semmi gond, segítek." },
    { id: "fr2-communication-004", term: "à bientôt", hu: "hamarosan találkozunk", kind: "phrase", level: 2, topic: "communication", pos: "phrase", example: "Merci et à bientôt\u00A0!", exampleHu: "Köszönöm, és hamarosan találkozunk!" },
  ];
  const q = generateVocabQuestion(viens, [viens, ...fill], "cloze", seededRng(3));
  assert.ok(q);
  assert.equal(q.prompt, "Melyik illik a mondatba? _____\u00A0? (Magyarul: Jössz?)");
  const pm = generateVocabQuestion(viens, [viens, ...fill], "phrase-meaning", seededRng(3));
  assert.ok(pm);
  assert.ok(pm.prompt.includes("Tu viens\u00A0?"), "a phrase-meaning prompt is megtartja");
});

test("kevés jelölt a szinten → a rossz válasz a szomszéd szintről jön; ha a kind-ban sincs 3, null", () => {
  // L2-n csak a kérdezett bejegyzés van; L1 és L3 adja a rossz válaszokat (azonos kind).
  const bank = makeSyntheticBank("en", [0, 6, 1, 6, 0], 21);
  const target = bank.find(e => e.level === 2)!;
  const q = generateVocabQuestion(target, bank, "hu-to-target", seededRng(8));
  assert.ok(q);
  q.options.forEach((opt, i) => {
    if (i === q.correctIndex) return;
    const d = bank.find(e => e.term === opt)!;
    assert.ok(Math.abs(d.level - 2) === 1, `szomszéd szint: ${d.id}`);
  });
  // Csak 3 bejegyzés ugyanabból a kind-ból összesen → nincs 3 rossz válasz.
  const tiny = makeSyntheticBank("en", [2, 0, 0, 0, 0], 1).filter(e => e.kind === "word");
  assert.equal(generateVocabQuestion(tiny[0]!, tiny, "hu-to-target", seededRng(1)), null);
});

test("távoli szint csak akkor, ha a szomszéd szintek kevesek (ugyanabból a kind-ból)", () => {
  const bank = makeSyntheticBank("en", [9, 0, 1, 0, 0], 2);
  const target = bank.find(e => e.level === 2)!;
  const q = generateVocabQuestion(target, bank, "target-to-hu", seededRng(4));
  assert.ok(q, "L0-ból pótol");
});

test("szinonima (azonos hu) soha nem rossz válasz", () => {
  const dog: VocabEntry = { id: "en0-animals-001", term: "dog", hu: "kutya", kind: "word", level: 0, topic: "animals", pos: "noun", example: "The dog barks loudly.", exampleHu: "A kutya hangosan ugat." };
  const hound: VocabEntry = { id: "en0-animals-002", term: "hound", hu: "kutya", kind: "word", level: 0, topic: "animals", pos: "noun", example: "The hound runs fast.", exampleHu: "A vadászkutya gyorsan fut." };
  const bank = [dog, hound, ...makeSyntheticBank("en", [6, 0, 0, 0, 0], 9)];
  const rng = seededRng(77);
  for (let i = 0; i < 300; i++) {
    for (const type of ["hu-to-target", "target-to-hu", "cloze"] as const) {
      const q = generateVocabQuestion(dog, bank, type, rng);
      assert.ok(q);
      assert.ok(!q.options.includes("hound"), "a szinonima term nem opció");
    }
  }
});
