import assert from "node:assert/strict";
import test from "node:test";

import { balancedLayouts, choiceSeed, displayOrder, optionOrder, refersToOtherOptions } from "../shared/option-order";

// Spec 2026-11-02-valasz-keveres — a megjelenítési sorrend kevert, determinisztikus, és csak a sorrend változik.

test("optionOrder: minden eredeti index pontosan egyszer szerepel", () => {
  for (const count of [0, 1, 2, 3, 4]) {
    for (const seed of ["a", "Ki írta az Antigonét?", "x".repeat(500)]) {
      assert.deepEqual([...optionOrder(seed, count)].sort(), Array.from({ length: count }, (_, i) => i));
    }
  }
});

test("optionOrder: ugyanaz a seed mindig ugyanaz a sorrend (újratöltés, mentett válasz)", () => {
  const seed = choiceSeed("Hogyan hal meg Haimón?", ["a", "b", "c", "d"]);
  assert.deepEqual(optionOrder(seed, 4), optionOrder(seed, 4));
  assert.notDeepEqual(
    Array.from({ length: 20 }, (_, i) => optionOrder(`k${i}`, 4).join("")),
    Array.from({ length: 20 }, () => "0123"),
    "nem identitás minden seedre",
  );
});

test("optionOrder: egyenletes — 4000 seeden a helyes (0.) válasz pozíció-aránya legfeljebb 5 százalékponttal tér el az 1/n-től", () => {
  for (const count of [2, 3, 4]) {
    const positions = new Array(count).fill(0);
    for (let s = 0; s < 4000; s++) positions[optionOrder(`kérdés ${s}`, count).indexOf(0)]++;
    for (const n of positions) {
      const share = n / 4000;
      assert.ok(Math.abs(share - 1 / count) < 0.05, `${count} opció: ${positions.join("/")}`);
    }
  }
});

test("élő Antigoné-minta torzítása (A:54/B:30/C:12/D:2 + 6×B): a megjelenített helyes pozíció egyik betűn sem haladja meg a 40%-ot", () => {
  const stored = [...Array(54).fill(0), ...Array(36).fill(1), ...Array(12).fill(2), ...Array(2).fill(3)];
  const shown = [0, 0, 0, 0];
  stored.forEach((correctIndex, n) => {
    const options = ["első", "második", "harmadik", "negyedik"].map((o) => `${o} ${n}`);
    shown[displayOrder(choiceSeed(`${n}. kérdés`, options), options).indexOf(correctIndex)]++;
  });
  for (const count of shown) assert.ok(count / stored.length <= 0.4, `megjelenített pozíciók: ${shown.join("/")}`);
});

test("betűvel / „fenti” szóval más opcióra hivatkozó kérdés a tárolt sorrendben marad", () => {
  assert.equal(refersToOtherOptions(["Az A és B is", "Csak C", "x", "y"]), true);
  assert.equal(refersToOtherOptions(["A fenti mindegyik", "b"]), true);
  assert.equal(refersToOtherOptions(["a", "b"], ["Nem: a „C” a jó."]), true);
  assert.deepEqual(displayOrder("seed", ["Az A és B is", "Csak C", "x", "y"]), [0, 1, 2, 3]);
  // A magyar „A” névelő nem hivatkozás.
  assert.equal(refersToOtherOptions(["A cselekmény Argoszban játszódik.", "A kart thébai ifjak alkotják."], ["Nem: a helyszín Thébai."]), false);
});


const choices = (stored: number[]) =>
  stored.map((correctIndex, n) => ({ question: `${n}. kérdés`, options: ["első", "második", "harmadik", "negyedik"].map((o) => `${o} ${n}`), correctIndex }));

test("balancedLayouts: minden elrendezés permutáció, a helyes válasz pozíció-darabszáma legfeljebb 1-gyel tér el (mért 6×B + A minta)", () => {
  for (const stored of [[1, 1, 0, 1, 1, 1, 1], [...Array(54).fill(0), ...Array(30).fill(1), ...Array(12).fill(2), ...Array(2).fill(3)]]) {
    const qs = choices(stored);
    const layouts = balancedLayouts(qs);
    const shown = [0, 0, 0, 0];
    for (const q of qs) {
      const order = layouts.get(choiceSeed(q.question, q.options))!;
      assert.deepEqual([...order].sort(), [0, 1, 2, 3]);
      shown[order.indexOf(q.correctIndex)]++;
    }
    assert.ok(Math.max(...shown) - Math.min(...shown) <= 1, `megjelenített pozíciók: ${shown.join("/")}`);
  }
});

test("balancedLayouts: determinisztikus, és a célpozíciók sorrendje nem ciklikus A, B, C, D", () => {
  const qs = choices(Array(12).fill(0));
  const positions = (m: Map<string, number[]>) => qs.map((q) => m.get(choiceSeed(q.question, q.options))!.indexOf(0)).join("");
  assert.equal(positions(balancedLayouts(qs)), positions(balancedLayouts(qs)));
  // Review #375: semmilyen 4-es ciklus (eltolt kezdettel sem) nem ismétlődik végig.
  const p = positions(balancedLayouts(qs));
  assert.ok([...p].some((c, i) => i + 4 < p.length && c !== p[i + 4]), `periodikus: ${p}`);
});

test("balancedLayouts: hivatkozó, érvénytelen és egyopciós kérdés elrendezése (tárolt / kevert / egyetlen)", () => {
  const layouts = balancedLayouts([
    { question: "h", options: ["Az A és B is", "Csak C", "x", "y"], correctIndex: 0 },
    { question: "e", options: ["a", "b"], correctIndex: 5 },
    { question: "o", options: ["egyetlen"], correctIndex: 0 },
  ]);
  assert.deepEqual(layouts.get(choiceSeed("h", ["Az A és B is", "Csak C", "x", "y"])), [0, 1, 2, 3]);
  assert.deepEqual([...layouts.get(choiceSeed("e", ["a", "b"]))!].sort(), [0, 1]);
  assert.deepEqual(layouts.get(choiceSeed("o", ["egyetlen"])), [0]);
});

test("gyakorlókör (review #375): ha csak a rejtett visszajelzés hivatkozik betűre, a szerver fixedOrder-t küld, correctIndex nélkül", async () => {
  const { viewOf } = await import("../server/rewards/lesson-attempts");
  const question = (id: string, feedbackPerOption: string[]) => ({ id, questionId: "x", questionVersion: "1", prompt: "p", options: ["a", "b", "c", "d"], correctIndex: 0, feedbackPerOption, coversConceptIds: [] });
  const row = {
    id: "r", userId: "u", lessonId: "l", bankVersion: "v", status: "active", startedAt: new Date(0), finishedAt: null, result: null, hints: [], answers: {},
    questions: [question("q0", ["Helyes.", "Nem: az A válasz a helyes.", "Nem.", "Nem."]), question("q1", ["Helyes.", "Nem.", "Nem.", "Nem."])],
  } as unknown as Parameters<typeof viewOf>[0];
  const view = viewOf(row);
  assert.equal(view.questions[0].fixedOrder, true);
  assert.equal(view.questions[1].fixedOrder, false);
  for (const q of view.questions) assert.ok(!("correctIndex" in q) && !("feedbackPerOption" in q), "a helyes válasz nem szivárog ki");
  // A reprodukció: a `q0` seed kevert sorrendet adna, ezért kell a szerver jelzője.
  assert.notDeepEqual(displayOrder("q0", ["a", "b", "c", "d"]), [0, 1, 2, 3]);
});

test("balancedLayouts (review #375): a tárolt sorrendű kérdés helyes pozíciója beszámít, az érvénytelen nem", () => {
  const eligible = choices([0, 0, 0]).map((q, n) => ({ ...q, question: `mozgatható ${n}` }));
  const fixed = { question: "rögzített", options: ["Az A és B is", "Csak C", "x", "y"], correctIndex: 0 };
  const invalid = { question: "érvénytelen", options: ["a", "b", "c", "d"], correctIndex: 9 };
  const layouts = balancedLayouts([fixed, invalid, ...eligible]);
  const targets = eligible.map((q) => layouts.get(choiceSeed(q.question, q.options))!.indexOf(0)).sort();
  // A rögzített kérdés az „A” helyet foglalja; a három mozgatható ezért pontosan a B, C, D helyre kerül.
  assert.deepEqual(targets, [1, 2, 3]);
});

test("balancedLayouts (review #375): opciószámonként külön mérleg — 3 és 4 opciós kérdések vegyesen", () => {
  const three = Array.from({ length: 6 }, (_, n) => ({ question: `h${n}`, options: ["x", "y", "z"].map((o) => `${o}${n}`), correctIndex: 0 }));
  const four = choices(Array(8).fill(1));
  const mixed = three.flatMap((q, n) => [q, four[n]]).concat(four.slice(6));
  const layouts = balancedLayouts(mixed);
  for (const [group, n] of [[three, 3], [four, 4]] as const) {
    const shown = new Array(n).fill(0);
    for (const q of group) shown[layouts.get(choiceSeed(q.question, q.options))!.indexOf(q.correctIndex)]++;
    assert.ok(Math.max(...shown) - Math.min(...shown) <= 1, `${n} opció: ${shown.join("/")}`);
  }
});

test("balancedLayouts (review #375): az ismételt azonos kérdés ugyanazt az elrendezést kapja, de mindkétszer beszámít", () => {
  const [a, b, c] = choices([0, 0, 0]);
  const layouts = balancedLayouts([a, a, b, c]);
  const at = (q: typeof a) => layouts.get(choiceSeed(q.question, q.options))!.indexOf(0);
  // Az „a” kétszer foglalja ugyanazt a helyet; b és c így két MÁSIK, egymástól is különböző helyre kerül.
  assert.equal(new Set([at(a), at(b), at(c)]).size, 3);
});

test("refersToOtherOptions (review #375): E betű (5 opciós ellenőrző) és sorszámos hivatkozás", () => {
  assert.equal(refersToOtherOptions(["a", "b"], ["Nem: az E válasz a helyes."]), true);
  assert.equal(refersToOtherOptions(["a", "b"], ["Nem: a második lehetőség a jó."]), true);
  assert.equal(refersToOtherOptions(["Csak az első opció igaz", "b"]), true);
  assert.equal(refersToOtherOptions(["Az első világháború", "A második király"], ["Nem: Thébaiban játszódik."]), false);
});

test("refersToOtherOptions (review #375): a közönséges „a válasz” és a mondatkezdő „A válasz” nem hivatkozás, a betűjel igen", () => {
  for (const text of ["Ez a válasz téves, mert a szorzatot osztani kell.", "A válasz helyes, mert Thébaiban játszódik.", "Nem: a válasz túl általános."]) {
    assert.equal(refersToOtherOptions(["x", "y"], [text]), false, text);
  }
  for (const text of ["Nem: az A válasz a helyes.", "Nem: a B válasz a helyes.", "Az E opció a jó.", "B válasz a helyes.", "Lásd (C)", "Az A és B is igaz"]) {
    assert.equal(refersToOtherOptions(["x", "y"], [text]), true, text);
  }
});

test("balancedLayouts (review #375): a megjelenítési sorrend négyes csoportjai nem kikövetkeztethetők (nem mindig A–D permutáció)", () => {
  const qs = choices(Array(100).fill(0));
  const layouts = balancedLayouts(qs);
  const at = qs.map((q) => layouts.get(choiceSeed(q.question, q.options))!.indexOf(0));
  const shown = [0, 0, 0, 0];
  at.forEach((p) => shown[p]++);
  assert.ok(Math.max(...shown) - Math.min(...shown) <= 1, `kiegyensúlyozott: ${shown.join("/")}`);
  const blocks = Array.from({ length: 25 }, (_, b) => at.slice(b * 4, b * 4 + 4));
  const permutations = blocks.filter((block) => new Set(block).size === 4).length;
  // Soronkénti (prefix) kiegyensúlyozásnál mind a 25 blokk permutáció lenne; véletlen kiosztásnál ~9%.
  assert.ok(permutations < 12, `${permutations}/25 négyes blokk teljes permutáció`);
});
