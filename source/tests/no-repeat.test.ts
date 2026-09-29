import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeTiersByContent,
  ladderTierIndex,
  normalizePrompt,
  pickFreshTask,
  pickUnseen,
  tierSearchOrder,
  type SeenItem,
} from "../client/src/game-engine/no-repeat";
import { createAdaptiveSession } from "../client/src/game-engine/adaptiveSession";
import { startingDifficulty } from "../client/src/game-engine/difficulty";

/**
 * Spec: docs/specs/2026-09-29-jatek-bankok-ismetles.md — futáson belül nincs ismétlés, amíg a készletekben van
 * még nem látott kérdés (sem azonos azonosító, sem azonos prompt).
 */

const item = (id: string, prompt = `kérdés ${id}`) => ({ id, prompt });

/** Determinisztikus álvéletlen (mulberry32) — a szimuláció hibája így visszajátszható. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("normalizePrompt: kisbetű, összevont szóközök, trim", () => {
  assert.equal(normalizePrompt("  „Ház”   ANGOLUL: "), "„ház” angolul:");
});

test("tierSearchOrder: a kért szint, majd távolság szerint, előbb a könnyebb", () => {
  assert.deepEqual(tierSearchOrder(5, 2), [2, 1, 3, 0, 4]);
  assert.deepEqual(tierSearchOrder(3, 0), [0, 1, 2]);
  assert.deepEqual(tierSearchOrder(5, 4), [4, 3, 2, 1, 0]);
  assert.deepEqual(tierSearchOrder(3, 9), [2, 1, 0], "a tartományon kívüli kérés a legközelebbi szintre esik");
});

test("pickUnseen: a kért szintből választ, a látottat kihagyja", () => {
  const tiers = [[item("e1")], [item("m1"), item("m2")], [item("h1")]];
  assert.equal(pickUnseen(tiers, 1, [item("m1")], () => 0)?.id, "m2");
  assert.equal(pickUnseen(tiers, 0, [], () => 0)?.id, "e1");
});

test("pickUnseen: elfogyott szintnél előbb a könnyebb szomszéd, aztán a nehezebb", () => {
  const tiers = [[item("e1")], [item("m1")], [item("h1")]];
  assert.equal(pickUnseen(tiers, 1, [item("m1")], () => 0)?.id, "e1");
  assert.equal(pickUnseen(tiers, 1, [item("m1"), item("e1")], () => 0)?.id, "h1");
});

test("pickUnseen: azonos prompt más azonosítóval is látottnak számít", () => {
  const tiers = [[item("a", "„Ház” angolul:"), item("b", "„HÁZ”  angolul:"), item("c", "„Kutya” angolul:")]];
  assert.equal(pickUnseen(tiers, 0, [item("a", "„Ház” angolul:")], () => 0)?.id, "c");
});

test("pickUnseen: teljes kimerülés után a legrégebben látottat adja", () => {
  const tiers = [[item("e1"), item("e2")], [item("m1")]];
  const seen: SeenItem[] = [item("e2"), item("m1"), item("e1")];
  assert.equal(pickUnseen(tiers, 0, seen, () => 0)?.id, "e2");
  assert.equal(pickUnseen(tiers, 1, seen, () => 0)?.id, "m1", "a kért szint legrégebbije");
});

test("pickUnseen: üres készletek → null; egyetlen nem üres szint → abból fogy", () => {
  assert.equal(pickUnseen([[], [], []], 1, []), null);
  const tiers = [[], [item("m1"), item("m2")], []];
  const first = pickUnseen(tiers, 2, [], () => 0)!;
  const second = pickUnseen(tiers, 2, [first], () => 0)!;
  assert.notEqual(first.id, second.id);
});

test("dedupeTiersByContent: azonos prompt + helyes válasz egyszer marad (az első)", () => {
  const q = (id: string, prompt: string, correct: string) => ({ id, prompt, options: [correct, "x", "y", "z"], correctIndex: 0 });
  const out = dedupeTiersByContent([
    [q("1", "„Ház” angolul:", "house"), q("db:9", "„ház” angolul:", "House")],
    [q("db:10", "„Ház”  angolul:", "house"), q("m1", "„Ház” angolul:", "home")],
  ]);
  assert.deepEqual(out.map((t) => t.map((x) => x.id)), [["1"], ["m1"]]);
});

test("ladderTierIndex: évfolyam → kezdő szint, a sáv eltolja", () => {
  assert.equal(ladderTierIndex(3, startingDifficulty(3)), 0);
  assert.equal(ladderTierIndex(4, startingDifficulty(4)), 0);
  assert.equal(ladderTierIndex(5, startingDifficulty(5)), 1);
  assert.equal(ladderTierIndex(7, startingDifficulty(7)), 2);
  assert.equal(ladderTierIndex(9, startingDifficulty(9)), 3);
  assert.equal(ladderTierIndex(12, startingDifficulty(12)), 4);
  assert.equal(ladderTierIndex(1, startingDifficulty(1)), 0, "3. alatt a legkönnyebb");
  assert.equal(ladderTierIndex(7, startingDifficulty(7) + 0.1), 3, "három jó válasz → eggyel nehezebb");
  assert.equal(ladderTierIndex(7, startingDifficulty(7) - 0.15), 1, "két rossz válasz → eggyel könnyebb");
  assert.equal(ladderTierIndex(12, 1), 4, "a legfelső szint fölé nem megy");
  assert.equal(ladderTierIndex(3, 0.15), 0, "a legalsó alá nem megy");
  assert.equal(ladderTierIndex(9, startingDifficulty(9), 3), 2, "kevesebb szintnél a legfelsőre vágva");
});

test("pickFreshTask: a nem látott tanári tételt választja, ha tanárit kér", () => {
  const teacher = [{ prompt: "A" }, { prompt: "B" }];
  const got = pickFreshTask({ teacher, seenPrompts: ["a"], preferTeacher: true, generate: () => ({ prompt: "G" }), rng: () => 0 });
  assert.equal(got.prompt, "B");
});

test("pickFreshTask: a generátor legfeljebb 30-szor próbál, utána nem látott tanárit ad", () => {
  let calls = 0;
  const got = pickFreshTask({
    teacher: [{ prompt: "T1" }],
    seenPrompts: ["g"],
    preferTeacher: false,
    generate: () => { calls++; return { prompt: "G" }; },
    rng: () => 0,
  });
  assert.equal(calls, 30);
  assert.equal(got.prompt, "T1");
});

test("pickFreshTask: a generátor első nem látott promptját adja", () => {
  const seq = ["G1", "G1", "G2"];
  let i = 0;
  const got = pickFreshTask({ teacher: [], seenPrompts: ["g1"], preferTeacher: false, generate: () => ({ prompt: seq[i++]! }) });
  assert.equal(got.prompt, "G2");
});

test("pickFreshTask: minden látott tanári tétel után a generátorra vált; ha az sem ad újat, az utolsó generáltat adja", () => {
  const got = pickFreshTask({ teacher: [{ prompt: "T" }], seenPrompts: ["t", "g"], preferTeacher: true, generate: () => ({ prompt: "G" }) });
  assert.equal(got.prompt, "G");
});

test("E1 szimuláció: 2000 véletlen futás, sávváltások és rossz válaszok mellett az első N kérdés nem ismétlődik", () => {
  const rng = seeded(20260929);
  for (let run = 0; run < 2000; run++) {
    const tierCount = 1 + Math.floor(rng() * 5);
    let serial = 0;
    const tiers = Array.from({ length: tierCount }, (_, t) =>
      Array.from({ length: Math.floor(rng() * 13) }, () => {
        serial++;
        // Néhány tétel szándékosan azonos promptot kap más azonosítóval (szerver-duplikátum).
        const dupe = serial > 3 && rng() < 0.05;
        return item(`t${t}-${serial}`, dupe ? "kérdés közös" : `kérdés ${t}-${serial}`);
      }),
    );
    const distinct = new Set(tiers.flat().map((q) => normalizePrompt(q.prompt))).size;
    const grade = 1 + Math.floor(rng() * 12);
    const session = createAdaptiveSession(grade);
    const seen: SeenItem[] = [];
    const ids = new Set<string>();
    const prompts = new Set<string>();
    for (let k = 0; k < distinct; k++) {
      const next = pickUnseen(tiers, ladderTierIndex(grade, session.band, tierCount), seen, rng);
      assert.ok(next, `futás ${run}: ${k}. húzásnál nincs tétel`);
      const p = normalizePrompt(next.prompt);
      assert.ok(!ids.has(next.id) && !prompts.has(p), `futás ${run}: ismétlés a(z) ${k + 1}. húzásnál (N=${distinct})`);
      ids.add(next.id);
      prompts.add(p);
      seen.push(next);
      session.answer(rng() < 0.6);
    }
    if (distinct > 0) {
      const after = pickUnseen(tiers, ladderTierIndex(grade, session.band, tierCount), seen, rng);
      assert.ok(after, "kimerülés után is ad tételt (a legrégebbit)");
    }
  }
});
