import assert from "node:assert/strict";
import test from "node:test";

import { mulberry32, seedFrom, seededPick, seededShuffle } from "../shared/seeded";
import { optionOrder } from "../shared/option-order";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (S5a, 5. szakasz 3. pont): a változatosság magja determinisztikus,
// és ugyanaz az algoritmus, mint az opciókeverésé (a kiemelés után a keverés kimenete változatlan).

test("seedFrom: FNV-1a 32 bit, rögzített értékek", () => {
  assert.equal(seedFrom(""), 0x811c9dc5);
  assert.equal(seedFrom("a"), 0xe40c292c);
  assert.equal(seedFrom("foobar"), 0xbf9cf968);
  assert.equal(seedFrom("árvíztűrő"), seedFrom("árvíztűrő"));
  assert.notEqual(seedFrom("map-1"), seedFrom("map-2"));
});

test("mulberry32: azonos magra azonos sorozat, [0, 1) tartományban", () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const x = a();
    assert.equal(x, b());
    assert.ok(x >= 0 && x < 1);
  }
});

test("seededShuffle: permutáció, determinisztikus, a bemenetet nem módosítja", () => {
  const items = ["a", "b", "c", "d", "e", "f", "g"] as const;
  for (const seed of [0, 1, 7, 123456, 0xffffffff]) {
    const out = seededShuffle(items, seed);
    assert.deepEqual([...out].sort(), [...items].sort());
    assert.deepEqual(out, seededShuffle(items, seed));
  }
  assert.deepEqual(items, ["a", "b", "c", "d", "e", "f", "g"]);
  // Különböző magok különböző sorrendet adnak (nem konstans keverés).
  const orders = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => seededShuffle(items, s).join("")));
  assert.ok(orders.size >= 6, `csak ${orders.size} különböző sorrend`);
});

test("seededPick: determinisztikus, üres listán undefined, minden elem elérhető", () => {
  assert.equal(seededPick([], 5), undefined);
  assert.equal(seededPick(["x"], 5), "x");
  const seen = new Set<string>();
  for (let s = 0; s < 200; s++) seen.add(seededPick(["a", "b", "c", "d"], seedFrom(`k${s}`))!);
  assert.equal(seen.size, 4);
  assert.equal(seededPick(["a", "b", "c"], 99), seededPick(["a", "b", "c"], 99));
});

test("az opciókeverés a kiemelés után is a rögzített sorrendet adja", () => {
  // A kiemelés előtti (main d9d1e6c6) kimenet rögzítve: ha a közös mag változna, a mentett válaszok megjelenítése elcsúszna.
  assert.deepEqual(optionOrder("Ki írta az Antigonét?", 4), [2, 1, 0, 3]);
  assert.deepEqual(optionOrder("x".repeat(50), 6), [5, 4, 2, 1, 0, 3]);
  assert.deepEqual(optionOrder("Melyik szám páros?", 3), [2, 0, 1]);
  assert.deepEqual(seededShuffle([0, 1, 2, 3], seedFrom("Ki írta az Antigonét?")), optionOrder("Ki írta az Antigonét?", 4));
});
