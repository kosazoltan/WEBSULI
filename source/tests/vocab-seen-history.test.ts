import assert from "node:assert/strict";
import test from "node:test";
import { VOCAB_SEEN_KEY, createSeenHistory } from "../client/src/game-engine/vocab/seenHistory";
import { createVocabSource } from "../client/src/game-engine/vocab/vocabSource";
import { vocabLevelForGrade } from "../client/src/game-engine/vocab/level";
import { startingDifficulty } from "../client/src/game-engine/difficulty";
import type { VocabEntry, VocabLevel } from "../client/src/data/vocabBank/types";
import { makeSyntheticBank, memoryStorage, seededRng } from "./support/vocab-fixture";

/** Terv 4.4, A4–A6; végrehajtás S1/6., 8. lépés. */

/** Determinisztikus óra: minden hívás +1 ms (a „legrégebben látott” sorrend így mérhető). */
function tickClock(start = 1_700_000_000_000): () => number {
  let t = start;
  return () => t++;
}

test("A4: 10 egymás utáni futás ugyanazon a tárolón, futásonként 20 next(0) → 200 különböző bejegyzés", () => {
  const bank = makeSyntheticBank("en", [500, 500, 500, 500, 500], 1);
  const storage = memoryStorage();
  const ids: string[] = [];
  for (let run = 0; run < 10; run++) {
    // Új futás: új napló- és forrás-példány, csak a tároló közös (mint egy újratöltött lap).
    const source = createVocabSource({ lang: "en", entries: bank, history: createSeenHistory(storage, tickClock(run * 1000)), rng: seededRng(run + 1) });
    for (let i = 0; i < 20; i++) {
      const q = source.next(0);
      assert.ok(q);
      assert.equal(q.level, 0, "a kért szintből jön, amíg el nem fogy");
      ids.push(q.vocabId);
    }
  }
  assert.equal(ids.length, 200);
  assert.equal(new Set(ids).size, 200);
});

test("A4 kimerülés: 2000 futásos szimuláció — az első <banknyi> húzás ismétlés nélkül, utána mindig a legrégebben látott", () => {
  const rng = seededRng(424242);
  for (let sim = 0; sim < 2000; sim++) {
    const sizes = Array.from({ length: 5 }, () => 1 + Math.floor(rng() * 60));
    const bank = makeSyntheticBank("en", sizes, sim);
    const total = bank.length;
    const storage = memoryStorage();
    const clock = tickClock();
    const history = createSeenHistory(storage, clock);
    const source = createVocabSource({ lang: "en", entries: bank, history, rng: seededRng(sim) });
    const drawn: string[] = [];
    // A banknyi húzás + 5 további (a kimerülés utáni viselkedés mérése), véletlen szintkérésekkel.
    for (let i = 0; i < total + 5; i++) {
      const level = Math.floor(rng() * 5) as VocabLevel;
      let expectedOldest: string | undefined;
      if (i >= total) {
        // Kimerült nyelv: a legkisebb lastSeen időbélyegű bejegyzés jön.
        expectedOldest = bank.map(e => ({ id: e.id, t: history.lastSeen("en", e.id)! })).sort((a, b) => a.t - b.t)[0]!.id;
      }
      const q = source.next(level);
      assert.ok(q, `sim ${sim}, húzás ${i}: null`);
      if (i < total) assert.ok(!drawn.includes(q.vocabId), `sim ${sim}: ismétlés a ${i}. húzásnál (bank ${total})`);
      else assert.equal(q.vocabId, expectedOldest, `sim ${sim}: nem a legrégebben látott jött`);
      drawn.push(q.vocabId);
    }
    assert.equal(new Set(drawn.slice(0, total)).size, total);
  }
});

test("szint kimerülése → szomszéd szint, előbb a könnyebb (tierSearchOrder)", () => {
  const bank = makeSyntheticBank("en", [5, 5, 3, 5, 5], 6);
  const source = createVocabSource({ lang: "en", entries: bank, history: createSeenHistory(memoryStorage(), tickClock()), rng: seededRng(1) });
  const levels = Array.from({ length: 13 }, () => source.next(2)!.level);
  // 3× L2, majd 5× L1 (könnyebb szomszéd), majd 5× L3.
  assert.deepEqual(levels, [2, 2, 2, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3]);
});

test("téma: előbb a témába illő nem látott, ha elfogyott, téma nélkül", () => {
  const bank = makeSyntheticBank("en", [48, 0, 0, 0, 0], 2);
  const source = createVocabSource({ lang: "en", entries: bank, history: createSeenHistory(memoryStorage(), tickClock()), rng: seededRng(2) });
  const family = bank.filter(e => e.topic === "family").length; // 48 / 24 téma = 2
  const topics = Array.from({ length: family + 1 }, () => source.next(0, { topic: "family" })!.topic);
  assert.deepEqual(topics.slice(0, family), Array(family).fill("family"));
  assert.notEqual(topics[family], "family");
});

test("A5: két játék ugyanazon a tárolón — az egyikben látott bejegyzést a másik nem adja", () => {
  const bank = makeSyntheticBank("de", [40, 40, 40, 40, 40], 3);
  const storage = memoryStorage();
  const gameA = createVocabSource({ lang: "de", entries: bank, history: createSeenHistory(storage, tickClock()), rng: seededRng(10) });
  const gameB = createVocabSource({ lang: "de", entries: bank, history: createSeenHistory(storage, tickClock(2e12)), rng: seededRng(10) });
  const seenA = new Set<string>();
  for (let i = 0; i < 20; i++) seenA.add(gameA.next(1)!.vocabId);
  for (let i = 0; i < 20; i++) {
    const id = gameB.next(1)!.vocabId;
    assert.ok(!seenA.has(id), `B ismételte A-t: ${id}`);
  }
  // Felváltva is: a két példány minden olvasáskor a tárolóból dolgozik.
  const all = new Set(seenA);
  for (let i = 0; i < 10; i++) {
    for (const g of [gameA, gameB]) {
      const id = g.next(1)!.vocabId;
      assert.ok(!all.has(id), `ismétlés felváltva: ${id}`);
      all.add(id);
    }
  }
});

test("A6: getItem / setItem kivételt dob → next kivétel nélkül működik és futáson belül nem ismétel", () => {
  const bank = makeSyntheticBank("en", [30, 30, 30, 30, 30], 4);
  for (const storage of [memoryStorage({ failGet: true }), memoryStorage({ failSet: true }), memoryStorage({ failGet: true, failSet: true }), null]) {
    const source = createVocabSource({ lang: "en", entries: bank, history: createSeenHistory(storage, tickClock()), rng: seededRng(5) });
    const ids = new Set<string>();
    for (let i = 0; i < 150; i++) {
      const q = source.next(Math.floor(i / 30) as VocabLevel);
      assert.ok(q);
      ids.add(q.vocabId);
    }
    assert.equal(ids.size, 150, "futáson belül nincs ismétlés");
  }
});

test("A6: sérült JSON („{nem json”) és rossz alak → üres naplóval indul, majd ép JSON-t ír", () => {
  const bank = makeSyntheticBank("en", [10, 10, 10, 10, 10], 5);
  for (const initial of ["{nem json", "[]", JSON.stringify({ v: 2, langs: {} }), JSON.stringify({ v: 1, langs: { en: { "en0-family-001": "tegnap" } } })]) {
    const storage = memoryStorage({ initial });
    const history = createSeenHistory(storage, tickClock());
    assert.equal(history.size("en"), 0, `üres napló: ${initial}`);
    const source = createVocabSource({ lang: "en", entries: bank, history, rng: seededRng(1) });
    assert.ok(source.next(0));
    const stored = JSON.parse(storage.data.get(VOCAB_SEEN_KEY)!);
    assert.equal(stored.v, 1);
    assert.equal(Object.keys(stored.langs.en).length, 1);
  }
});

test("A6: a localStorage hibája után a napló memóriában folytatódik, a korábbi jelölések megmaradnak", () => {
  let failSet = false;
  const base = memoryStorage();
  const storage = {
    getItem: (k: string) => base.getItem(k),
    setItem: (k: string, v: string) => {
      if (failSet) throw new Error("QuotaExceededError");
      base.setItem(k, v);
    },
  };
  const history = createSeenHistory(storage, tickClock());
  history.mark("en", "en0-family-001");
  failSet = true;
  history.mark("en", "en0-family-002");
  assert.equal(history.has("en", "en0-family-001"), true);
  assert.equal(history.has("en", "en0-family-002"), true);
  assert.equal(history.size("en"), 2);
});

test("cap: 30 bejegyzéses banknál a napló mérete ≤ 30, a legrégebbiek törlődnek", () => {
  const bank = makeSyntheticBank("fr", [6, 6, 6, 6, 6], 6);
  const storage = memoryStorage();
  const history = createSeenHistory(storage, tickClock());
  const source = createVocabSource({ lang: "fr", entries: bank, history, rng: seededRng(6) });
  for (let i = 0; i < 100; i++) {
    source.next((i % 5) as VocabLevel);
    if (i % 7 === 0) source.markExternal(`kézi válasz ${i}`);
    assert.ok(history.size("fr") <= 30, `napló mérete ${history.size("fr")}`);
  }
  const stored = JSON.parse(storage.data.get(VOCAB_SEEN_KEY)!);
  assert.ok(Object.keys(stored.langs.fr).length <= 30);
  // A már tárolt, nagyobb naplót a setCap azonnal visszavágja.
  const h2 = createSeenHistory(storage, tickClock(9e12));
  for (let i = 0; i < 40; i++) h2.mark("fr", `fr0-family-${String(100 + i)}`);
  h2.setCap("fr", 10);
  assert.equal(h2.size("fr"), 10);
  assert.equal(h2.has("fr", "fr0-family-139"), true, "a legújabb megmarad");
});

test("markExternal: a kézi kérdés helyes válasza (term vagy hu) kizárja a bejegyzést", () => {
  // Az azonosítók 9xx-esek, hogy ne ütközzenek a szintetikus bank „en0-animals-001”-ével.
  const entries: VocabEntry[] = [
    { id: "en0-animals-901", term: "dog", hu: "kutya", kind: "word", level: 0, topic: "animals", pos: "noun", example: "The dog barks loudly.", exampleHu: "A kutya hangosan ugat." },
    { id: "en0-animals-902", term: "cat", hu: "macska", kind: "word", level: 0, topic: "animals", pos: "noun", example: "The cat sleeps a lot.", exampleHu: "A macska sokat alszik." },
    ...makeSyntheticBank("en", [30, 0, 0, 0, 0], 7),
  ];
  const history = createSeenHistory(memoryStorage(), tickClock());
  const source = createVocabSource({ lang: "en", entries, history, rng: seededRng(7) });
  source.markExternal("  Dog ");
  source.markExternal("MACSKA");
  assert.equal(history.hasExternal("en", "dog"), true);
  // 30 szintetikus nem látott bejegyzés van L0-n: mind előbb jön, mint a kézi válasszal ismert kettő.
  const ids = Array.from({ length: 30 }, () => source.next(0)!.vocabId);
  assert.equal(new Set(ids).size, 30);
  assert.ok(!ids.includes("en0-animals-901"), "a „dog” bejegyzés kimarad");
  assert.ok(!ids.includes("en0-animals-902"), "a „macska” jelentésű bejegyzés kimarad");
});

test("buildPool: nem naplóz, nem ad kétszer ugyanazt, a tartós napló szerint nem látottakat veszi előre; markAsked naplóz", () => {
  const bank = makeSyntheticBank("de", [20, 20, 20, 20, 20], 8);
  const storage = memoryStorage();
  const history = createSeenHistory(storage, tickClock());
  const source = createVocabSource({ lang: "de", entries: bank, history, rng: seededRng(8) });
  const pool = source.buildPool(1, 15);
  assert.equal(pool.length, 15);
  assert.equal(new Set(pool.map(q => q.vocabId)).size, 15);
  assert.ok(pool.every(q => q.level === 1));
  assert.equal(history.size("de"), 0, "a buildPool nem naplóz");
  for (const q of pool.slice(0, 12)) source.markAsked(q);
  assert.equal(history.size("de"), 12);
  // Következő futás (a Szólétra újraépíti a készletet): a már feltett 12 nem jön elöl.
  const next = createVocabSource({ lang: "de", entries: bank, history: createSeenHistory(storage, tickClock(5e12)), rng: seededRng(9) });
  const pool2 = next.buildPool(1, 8);
  const asked = new Set(pool.slice(0, 12).map(q => q.vocabId));
  assert.equal(pool2.length, 8);
  assert.ok(pool2.every(q => !asked.has(q.vocabId)), "látott tétel a készlet elején");
  assert.ok(pool2.every(q => q.level === 1), "L1-ben még 8 nem látott van");
  // Nagyobb kérés, mint a nem látott: a szomszéd szint nem látottai jönnek, a látottak csak a végén.
  const pool3 = next.buildPool(1, 30);
  assert.equal(pool3.length, 30);
  assert.ok(pool3.every(q => !asked.has(q.vocabId)));
  assert.deepEqual([...new Set(pool3.slice(0, 8).map(q => q.level))], [1]);
});

test("toLadderItem: category word/phrase, tier = level", () => {
  const bank = makeSyntheticBank("fr", [12, 12, 12, 12, 12], 9);
  const source = createVocabSource({ lang: "fr", entries: bank, history: createSeenHistory(null), rng: seededRng(1) });
  for (const q of source.buildPool(3, 12)) {
    const item = source.toLadderItem(q);
    assert.equal(item.tier, q.level);
    assert.equal(item.category, q.kind === "phrase" ? "phrase" : "word");
    assert.equal(item.prompt, q.prompt);
    assert.deepEqual(item.options, q.options);
    assert.equal(item.correctIndex, q.correctIndex);
  }
});

test("vocabLevelForGrade(3|5|7|9|12, startingDifficulty(g)) → 0/1/2/3/4 (ladderTierIndex, no-repeat.ts)", () => {
  // ladderBaseTier: ≤4 → 0, ≤6 → 1, ≤8 → 2, ≤10 → 3, különben 4; a kezdő sávnál az eltolás 0.
  assert.deepEqual([3, 5, 7, 9, 12].map(g => vocabLevelForGrade(g, startingDifficulty(g))), [0, 1, 2, 3, 4]);
  // Ismeretlen évfolyam → 4. évfolyam (A1).
  assert.equal(vocabLevelForGrade(null, startingDifficulty(4)), 0);
  // Egy nehezítés (+0,15) egy szinttel feljebb visz.
  assert.equal(vocabLevelForGrade(7, startingDifficulty(7) + 0.15), 3);
});
