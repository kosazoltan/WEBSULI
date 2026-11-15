import assert from "node:assert/strict";
import test from "node:test";

import { WORD_LADDER_DE } from "../client/src/data/wordLadder/de";
import { ladderTiersFromBank } from "../client/src/data/wordLadder/banks";
import type { LadderItem } from "../client/src/data/wordLadder/types";
import type { VocabLevel } from "../client/src/data/vocabBank/types";
import { normalizePrompt, pickUnseen, type SeenItem } from "../client/src/game-engine/no-repeat";
import { createSeenHistory } from "../client/src/game-engine/vocab/seenHistory";
import { createVocabSource } from "../client/src/game-engine/vocab/vocabSource";
import { landSquashY } from "../client/src/game-engine/scenes/LadderScene3D";
import { mergeVocabTiers, VOCAB_POOL_PER_LEVEL, vocabIdOfLadderItem as vocabIdOf } from "../client/src/lib/wordLadderVocab";
import { isPlayableQuestion } from "../shared/game-quiz-contract";
import { makeSyntheticBank, memoryStorage, seededRng } from "./support/vocab-fixture";

/**
 * S6 — Szólétra + központi szóbank (terv A7, 4.4, 4.6/2; végrehajtás S6/7–8. lépés és „Megírandó teszt”).
 * A lap a `buildPool` → `toLadderItem` → `mergeVocabTiers` (benne `dedupeTiersByContent`) → `pickUnseen` láncot
 * használja; ez a teszt ugyanezt a láncot futtatja szintetikus szóbankkal és a valódi német kézi bankkal.
 */

const LEVELS: VocabLevel[] = [0, 1, 2, 3, 4];
const POOL_PER_LEVEL = 60; // a végrehajtás S6/8. lépése szerint
const mergeTiers = (manual: LadderItem[][], vocab: LadderItem[][]) => mergeVocabTiers(manual, vocab);

test("a lap készletmérete a végrehajtás szerinti 60", () => {
  assert.equal(VOCAB_POOL_PER_LEVEL, POOL_PER_LEVEL);
});

test("A7: 5 szint × 60 szóbankos tétel + a német kézi bank — 300 húzás között nincs ismétlődő id és prompt", () => {
  // Szintenként 80 bejegyzés: a 60-as készlet a saját szintjéből telik, és marad rossz-válasz-jelölt.
  const entries = makeSyntheticBank("de", [80, 80, 80, 80, 80], 11);
  const source = createVocabSource({ lang: "de", entries, history: createSeenHistory(memoryStorage()), rng: seededRng(3) });

  const vocabTiers = LEVELS.map((l) => source.buildPool(l, POOL_PER_LEVEL).map((q) => source.toLadderItem(q)));
  for (const [l, tier] of vocabTiers.entries()) {
    assert.equal(tier.length, POOL_PER_LEVEL, `L${l}: a készlet mérete`);
    for (const item of tier) {
      assert.ok(item.category === "word" || item.category === "phrase", `${item.id}: category ${item.category}`);
      assert.equal(item.tier, l, `${item.id}: tier = a szint`);
      assert.ok(isPlayableQuestion(item), `${item.id}: játszható kérdés`);
      assert.ok(vocabIdOf(item.id), `${item.id}: vocab: előtagú azonosító`);
    }
  }

  const manual = ladderTiersFromBank(WORD_LADDER_DE);
  const tiers = mergeTiers(manual, vocabTiers);
  const manualCount = manual.reduce((n, t) => n + t.length, 0);
  // A teszt csak akkor ér valamit, ha a 300 húzás a szóbankos tételekig is elér (a kézi bank kevesebb, mint 300).
  const total = tiers.reduce((n, t) => n + t.length, 0);
  assert.ok(total >= 300, `összesen ${total} tétel`);

  // A terv szerinti 300 húzás, és utána tovább a teljes készletig (a kézi német bank ~480 tétel, így a szóbankos
  // tételek csak a 300. húzás után kerülnének sorra) — a teljes összefésült készletben sincs ismétlés.
  const draws = Math.max(300, total);
  const rng = seededRng(5);
  const seen: SeenItem[] = [];
  const ids = new Set<string>();
  const prompts = new Set<string>();
  let fromVocab = 0;
  for (let i = 0; i < draws; i++) {
    const item = pickUnseen(tiers, i % LEVELS.length, seen, rng);
    assert.ok(item, `${i}. húzás: van tétel`);
    assert.ok(!ids.has(item.id), `${i}. húzás: ismétlődő id ${item.id}`);
    const p = normalizePrompt(item.prompt);
    assert.ok(!prompts.has(p), `${i}. húzás: ismétlődő prompt „${item.prompt}”`);
    ids.add(item.id);
    prompts.add(p);
    seen.push({ id: item.id, prompt: item.prompt });
    if (vocabIdOf(item.id)) fromVocab++;
  }
  assert.ok(manualCount > 0, "a kézi bank tételei is a készletben vannak");
  assert.equal(fromVocab, LEVELS.length * POOL_PER_LEVEL, "mind a 300 szóbankos tétel sorra került, egyszer");
});

test("review #419: két egymást követő futás készlete nem adja vissza az első futásban megkérdezett bejegyzéseket", () => {
  const entries = makeSyntheticBank("fr", [150, 40, 40, 40, 40], 21);
  const history = createSeenHistory(memoryStorage());
  const source = createVocabSource({ lang: "fr", entries, history, rng: seededRng(9) });

  // 1. futás: a lap a készletből húz, és a megjelenített szóbankos tételt markAsked-del naplózza.
  const pool1 = source.buildPool(0, POOL_PER_LEVEL).map((q) => source.toLadderItem(q));
  const asked = new Set<string>();
  const seen: SeenItem[] = [];
  for (let i = 0; i < 20; i++) {
    const item = pickUnseen([pool1, [], [], [], []], 0, seen, seededRng(i + 1));
    assert.ok(item);
    seen.push({ id: item.id, prompt: item.prompt });
    const vocabId = vocabIdOf(item.id)!;
    source.markAsked({ vocabId });
    asked.add(vocabId);
  }
  assert.equal(asked.size, 20);

  // 2. futás („Újra”): a lap a runSeq miatt újraépíti a készletet — a szinten még 130 nem látott bejegyzés van.
  const pool2 = source.buildPool(0, POOL_PER_LEVEL).map((q) => source.toLadderItem(q));
  assert.equal(pool2.length, POOL_PER_LEVEL);
  const repeated = pool2.map((q) => vocabIdOf(q.id)!).filter((id) => asked.has(id));
  assert.deepEqual(repeated, [], "a 2. futás készlete az 1. futásban megkérdezett bejegyzést adta vissza");

  // Ellenpróba: újraépítés NÉLKÜL (a régi, laponként egyszer épített készlet) a megkérdezettek benne maradnának.
  const stale = pool1.map((q) => vocabIdOf(q.id)!).filter((id) => asked.has(id));
  assert.equal(stale.length, 20);
});

test("kézi kérdés helyes válasza (markExternal) után az azonos jelentésű bejegyzés nem kerül a készletbe", () => {
  const entries = makeSyntheticBank("en", [70, 40, 40, 40, 40], 4);
  const source = createVocabSource({ lang: "en", entries, history: createSeenHistory(memoryStorage()), rng: seededRng(2) });
  const target = entries.find((e) => e.level === 0)!;
  source.markExternal(target.term);
  const pool = source.buildPool(0, POOL_PER_LEVEL);
  assert.ok(!pool.some((q) => q.vocabId === target.id), "a kézi kérdésből ismert szó visszajött a szóbankból");
});

test("a szóbankos tétel azonosítójának 2. mezője a bejegyzés azonosítója (a lap markAsked-je erre épül)", () => {
  const entries = makeSyntheticBank("de", [60, 40, 40, 40, 40], 8);
  const source = createVocabSource({ lang: "de", entries, history: createSeenHistory(memoryStorage()), rng: seededRng(1) });
  for (const q of source.buildPool(0, 20)) {
    assert.equal(vocabIdOf(source.toLadderItem(q).id), q.vocabId);
  }
  assert.equal(vocabIdOf("de0-123"), null, "kézi tétel nem szóbankos");
});

test("kis (minta) banknál ugyanaz a bejegyzés csak egy szinten szerepel, és a kézi helyes válasz kiszűri a szóbankost", () => {
  // Mintaméret (nyelvenként 40, szintenként 8): a buildPool minden szintre a teljes bankot adja vissza.
  const entries = makeSyntheticBank("en", [8, 8, 8, 8, 8], 31);
  const source = createVocabSource({ lang: "en", entries, history: createSeenHistory(memoryStorage()), rng: seededRng(4) });
  const pools = LEVELS.map((l) => source.buildPool(l, POOL_PER_LEVEL).map((q) => source.toLadderItem(q)));
  assert.ok(pools.every((p) => p.length > 8), "a kis bank miatt a szintek készletei átfednek (a teszt előfeltétele)");

  const blocked = pools[0]!.find((q) => q.tier === 0)!;
  const manual: LadderItem[][] = LEVELS.map(() => []);
  manual[2] = [{ ...blocked, id: "en2-999", tier: 2, prompt: "Kézi kérdés ugyanarra a szóra" }];
  const merged = mergeTiers(manual, pools);

  const vocabIds = merged.flat().map((q) => vocabIdOf(q.id)).filter((x): x is string => x !== null);
  assert.equal(new Set(vocabIds).size, vocabIds.length, "egy bejegyzés több szinten is szerepel");
  for (const [l, tier] of merged.entries()) {
    for (const q of tier) if (vocabIdOf(q.id)) assert.equal((q as LadderItem).tier, l, `${q.id}: a saját szintjén`);
  }
  assert.ok(!merged.flat().some((q) => q.id === blocked.id), "a kézi bank helyes válaszával egyező szóbankos tétel bent maradt");
  assert.ok(merged[2]!.some((q) => q.id === "en2-999"), "a kézi tétel elöl megmarad");
});

test("review #430: a kézi kérdéssel azonos szó a másik fordítási irányban sem jön a szóbankból", () => {
  const entries = makeSyntheticBank("de", [30, 10, 10, 10, 10], 41);
  const source = createVocabSource({ lang: "de", entries, history: createSeenHistory(memoryStorage()), rng: seededRng(6) });
  const meanings = new Map(entries.map((e) => [e.id, { term: e.term, hu: e.hu }]));
  const pools = LEVELS.map((l) => source.buildPool(l, POOL_PER_LEVEL).map((q) => source.toLadderItem(q)));
  const target = entries.find((e) => e.level === 0)!;
  // A kézi kérdés iránya: magyar → német („… németül” → term). A szóbank ugyanerről a szóról bármelyik irányban kérdezhet.
  const manual: LadderItem[][] = LEVELS.map(() => []);
  manual[0] = [{ id: "de0-901", prompt: `„${target.hu}” németül:`, options: [target.term, "a", "b", "c"], correctIndex: 0, tier: 0, category: "word" }];
  const reverse: LadderItem[][] = LEVELS.map(() => []);
  reverse[0] = [{ id: "de0-902", prompt: `Mit jelent: ${target.term}?`, options: [target.hu, "x", "y", "z"], correctIndex: 0, tier: 0, category: "word" }];
  for (const m of [manual, reverse]) {
    const merged = mergeVocabTiers(m, pools, (id) => meanings.get(id));
    const leaked = merged.flat().filter((q) => vocabIdOf(q.id) === target.id);
    assert.deepEqual(leaked.map((q) => q.id), [], "a kézi kérdés szava a szóbankból is bekerült");
  }
});

test("review #430 a valódi német kézi bankkal: a „der Hund” kézi kérdés után a szóbank „der Hund” bejegyzése egyik irányban sem kerül a készletbe", async () => {
  const { VOCAB_DE } = await import("../client/src/data/vocabBank/vocab-de");
  const hund = VOCAB_DE.find((e) => e.term === "der Hund");
  if (!hund) return; // a minta-bankban nincs ilyen bejegyzés: a szintetikus eset fedi
  const source = createVocabSource({ lang: "de", entries: VOCAB_DE, history: createSeenHistory(memoryStorage()), rng: seededRng(8) });
  const meanings = new Map(VOCAB_DE.map((e) => [e.id, { term: e.term, hu: e.hu }]));
  const pools = LEVELS.map((l) => source.buildPool(l, POOL_PER_LEVEL).map((q) => source.toLadderItem(q)));
  const manual = ladderTiersFromBank(WORD_LADDER_DE);
  assert.ok(manual.flat().some((q) => q.options[q.correctIndex] === "der Hund"), "a kézi bankban van „der Hund” helyes válasz");
  const merged = mergeVocabTiers(manual, pools, (id) => meanings.get(id));
  assert.ok(!merged.flat().some((q) => vocabIdOf(q.id) === hund.id), "a szóbank „der Hund” kérdése bekerült");
});

/**
 * A lap futás-szimulációja: futásonként új készlet (runSeq) a tartós napló pillanatképével (`isSeen`), a futáson belül
 * `pickUnseen` (a `seenRef` futásonként ürül), a megjelenített szóbankos tételre `markAsked`.
 */
function simulateRuns(perLevel: number[], runs: number, perRun: number, seed: number): { asked: string[]; total: number } {
  const entries = makeSyntheticBank("en", perLevel, seed);
  const history = createSeenHistory(memoryStorage());
  const source = createVocabSource({ lang: "en", entries, history, rng: seededRng(seed + 1) });
  const meanings = new Map(entries.map((e) => [e.id, { term: e.term, hu: e.hu }]));
  const asked: string[] = [];
  for (let run = 0; run < runs; run++) {
    const pools = LEVELS.map((l) => source.buildPool(l, POOL_PER_LEVEL).map((q) => source.toLadderItem(q)));
    const snap = history.snapshot("en");
    const tiers = mergeVocabTiers(LEVELS.map(() => [] as LadderItem[]), pools, (id) => meanings.get(id), (id) => snap[id] !== undefined);
    const seen: SeenItem[] = [];
    const rng = seededRng(seed * 100 + run);
    for (let i = 0; i < perRun; i++) {
      const item = pickUnseen(tiers, 0, seen, rng);
      if (!item) break;
      seen.push({ id: item.id, prompt: item.prompt });
      const vocabId = vocabIdOf(item.id)!;
      source.markAsked({ vocabId });
      asked.push(vocabId);
    }
  }
  return { asked, total: entries.length };
}

/** Az első ismétlés indexe a kérdezettek sorában (−1, ha nincs); a bank kimerülésekor a számlálás újraindul. */
function firstRepeatBeforeExhaustion(asked: string[], total: number): number {
  let window = new Set<string>();
  for (const [i, id] of asked.entries()) {
    if (window.has(id)) return i;
    window.add(id);
    if (window.size === total) window = new Set();
  }
  return -1;
}

test("review #430 (A4): kis (8/szint) bankkal egymást követő futásokban nincs ismétlés a bank kimerüléséig", () => {
  const { asked, total } = simulateRuns([8, 8, 8, 8, 8], 6, 8, 51);
  assert.equal(total, 40);
  assert.ok(asked.length >= total, `a szimuláció a kimerülésig ér (${asked.length} kérdés)`);
  assert.equal(firstRepeatBeforeExhaustion(asked, total), -1, "látott bejegyzés jött vissza, miközben volt nem látott");
});

test("review #430 (A4): nagy bankkal 10 futás × 20 kérdés alatt egyetlen ismétlés sincs", () => {
  const { asked } = simulateRuns([120, 120, 120, 120, 120], 10, 20, 61);
  assert.equal(asked.length, 200);
  assert.equal(new Set(asked).size, 200);
});

test("S6/7: a földet érés guggolás-nyújtása 1 → 0,85 → 1,08 → 1 (végrehajtás S6/7. lépés)", () => {
  assert.equal(landSquashY(0), 1);
  assert.ok(Math.abs(landSquashY(0.35) - 0.85) < 1e-9);
  assert.ok(Math.abs(landSquashY(0.7) - 1.08) < 1e-9);
  assert.ok(Math.abs(landSquashY(1) - 1) < 1e-9);
  // Monoton szakaszok: le a guggolásig, fel a nyújtásig, vissza 1-re; a tartományon kívül vágva.
  assert.ok(landSquashY(0.2) < 1 && landSquashY(0.2) > 0.85);
  assert.ok(landSquashY(0.5) > 0.85 && landSquashY(0.5) < 1.08);
  assert.equal(landSquashY(-1), 1);
  assert.ok(Math.abs(landSquashY(2) - 1) < 1e-9);
});
