import { test } from "node:test";
import assert from "node:assert/strict";

import { buildFeedback, stripAffirmationPrefix } from "../client/src/game-engine/feedback";

/** E24 — éles próba (Szökőár): rossz válasz után a „Semmi baj” cím alatt „Helyes! A helyesírás…” magyarázat állt. */
const quiz = {
  prompt: "Melyik a helyes írásmód?",
  options: ["tegnap", "tegnab", "tegnapp", "tegnáp"],
  correctIndex: 0,
  explanation: "Helyes! A helyesírás szabálya szerint a tegnap szót egy p-vel írjuk.",
};

test("rossz válasznál a „Helyes!” előtag lekerül, és a helyes választ mondja ki a kártya", () => {
  const card = buildFeedback({ quiz, chosenIndex: 1, attempt: 0, ageBand: "kid" });
  assert.equal(card.outcome, "wrong");
  assert.ok(!/^\s*Helyes[!.]/.test(card.why), card.why);
  assert.ok(card.why.startsWith("A helyes válasz: tegnap."), card.why);
  assert.ok(card.why.includes("A helyesírás szabálya szerint"), "a magyarázat érdemi része megmarad");
});

test("lejárt időnél is lekerül az előtag", () => {
  const card = buildFeedback({ quiz, chosenIndex: null, attempt: 0 });
  assert.equal(card.outcome, "timeout");
  assert.ok(!/^\s*Helyes[!.]/.test(card.why), card.why);
});

test("helyes válasznál a magyarázat változatlan marad", () => {
  const card = buildFeedback({ quiz, chosenIndex: 0, attempt: 0 });
  assert.equal(card.outcome, "correct");
  assert.equal(card.why, quiz.explanation);
});

test("a nem dicsérő magyarázatot rossz válasznál sem bántja", () => {
  const plain = { ...quiz, explanation: "A tegnap szót egy p-vel írjuk." };
  assert.equal(buildFeedback({ quiz: plain, chosenIndex: 2, attempt: 0 }).why, plain.explanation);
  const named = { ...quiz, explanation: "Helyes válasz: tegnap, egy p-vel." };
  assert.equal(buildFeedback({ quiz: named, chosenIndex: 2, attempt: 0 }).why, named.explanation);
});

test("stripAffirmationPrefix: többféle nyitószó, nagybetűs maradék, csak-előtag → üres", () => {
  assert.equal(stripAffirmationPrefix("Igen, a víz H2O."), "A víz H2O.");
  assert.equal(stripAffirmationPrefix("Pontos! kilencszer kilenc 81."), "Kilencszer kilenc 81.");
  assert.equal(stripAffirmationPrefix("Helyes!"), "");
  assert.equal(stripAffirmationPrefix("Helyesírás kérdés."), null);
});

test("csak előtagból álló magyarázatnál a tartalék magyarázat jön", () => {
  const card = buildFeedback({ quiz: { ...quiz, explanation: "Helyes!" }, chosenIndex: 1, attempt: 0 });
  assert.ok(card.why.startsWith("A helyes válasz: tegnap"), card.why);
});

/** Review (vercel[bot], feedback.ts:93): a szóközös nyitószavak („Helyes — …”) átcsúsztak, mert a regexből elveszett a `\s` visszaperjele. */
test("minden megerősítő nyitószó-alak lekerül rossz válasznál és időtúllépésnél, a „Helyesírás” érintetlen", () => {
  const openers = ["Helyes — ", "Helyes! ", "Helyes: ", "Helyes. ", "helyes, ", "Helyes – ", "Helyes - ", "Igen — ", "Jól van; "];
  for (const opener of openers) {
    const q = { ...quiz, explanation: `${opener}a tegnap szót egy p-vel írjuk.` };
    for (const chosenIndex of [1, null]) {
      const card = buildFeedback({ quiz: q, chosenIndex, attempt: 0 });
      assert.ok(card.why.startsWith("A helyes válasz: tegnap."), `${JSON.stringify(opener)}/${chosenIndex}: ${card.why}`);
      assert.ok(!/helyes\s*[—–!:.,-]/i.test(card.why.replace("A helyes válasz:", "")), card.why);
    }
  }
  const keep = { ...quiz, explanation: "Helyesírás: a tegnap szót egy p-vel írjuk." };
  assert.equal(buildFeedback({ quiz: keep, chosenIndex: 1, attempt: 0 }).why, keep.explanation);
  assert.equal(stripAffirmationPrefix("Helyesírás: egy p."), null);
});
