import assert from "node:assert/strict";
import test from "node:test";

import { makeRng, materialSubject, materialToQuestions, pickQuestion } from "../client/src/lib/tornado/questions";

/**
 * J7b — kanban #84: a `material-quizzes` tétel a szervertől a forrás-lecke VALÓDI tantárgyát kapja (`subject`), a Tornado
 * ezt használja; a cím-heurisztika csak tantárgy nélküli (régi szerver / ismeretlen) tételnél marad. A J7a 22 valós
 * cím-témája és a 15 téma / kérdés eset (`T/tornado-math4.test.ts`) a tantárggyal helyesen sorolódik.
 */

/** A J7a valós cím-témái (review #482): a címből nem lehet tantárgyat kitalálni. */
const TITLE_TOPICS = [
  "Present Simple", "Irregular verbs", "Colours", "My family", "latin", "orosz", "deutsch", "spanish",
  "A francia forradalom", "Német egység", "Angol polgári forradalom", "Spanyolország földrajza", "Olaszország",
  "Angola", "Valószínűség – francia kártya", "nature", "hungarian", "Természetismeret", "Magyar nyelvtan",
  "Szorzás", "Törtek", "Past Simple (English)",
];

/** A J7a téma / kérdés esetei (topic, prompt). */
const TOPIC_CASES: Array<[string, string]> = [
  ["math", "Mennyi 6 × 7?"], ["Matek – törtek", "Mennyi 1/2 + 1/4?"], ["matematika", "Mennyi 2 + 2?"],
  ["english", "Weather magyarul:"], ["Angol nyelv", "Weather magyarul:"], ["", "Tempête magyarul:"],
  ["math", "Mi a 7 ellentéte: 7 vagy -7?"], ["math", "Hogy mondod magyarul: 3 × 4 = ?"], ["", "Mi a 7 ellentéte: 7 vagy -7?"],
  ["Valószínűség – francia kártya", "Mennyi az esély?"], ["A francia forradalom", "Mikor volt?"], ["Angola", "Hol van?"],
  ["Present Simple", "went magyarul:"], ["nature", "Mi a víz?"], ["hungarian", "Melyik főnév?"],
];

test("a szerver tantárgya dönt: angol / matek biztos, minden más tantárgy bizonytalan — a téma és a kérdés szövegétől függetlenül", () => {
  const all = [...TITLE_TOPICS.map((t, i): [string, string] => [t, `Kérdés ${i}?`]), ...TOPIC_CASES];
  assert.equal(all.length, 37);
  for (const [topic, prompt] of all) {
    assert.deepEqual(materialSubject(topic, prompt, "english"), { subject: "english", certain: true }, `${topic} | english`);
    assert.deepEqual(materialSubject(topic, prompt, "angol nyelv"), { subject: "english", certain: true }, `${topic} | angol nyelv`);
    assert.deepEqual(materialSubject(topic, prompt, "math"), { subject: "math", certain: true }, `${topic} | math`);
    for (const other of ["nature", "hungarian", "történelem", "német nyelv"]) {
      assert.deepEqual(materialSubject(topic, prompt, other), { subject: "math", certain: false }, `${topic} | ${other}`);
    }
  }
});

test("tantárgy nélkül (régi szerver, ismeretlen tantárgy) a konzervatív cím-heurisztika marad, a két review-lelettel szigorítva", () => {
  for (const missing of [undefined, null, "", "  "]) {
    assert.deepEqual(materialSubject("math", "Mennyi 6 × 7?", missing), { subject: "math", certain: true });
    assert.deepEqual(materialSubject("Angol nyelv", "Weather magyarul:", missing), { subject: "english", certain: true });
    assert.deepEqual(materialSubject("Matek – törtek", "Mennyi 1/2 + 1/4?", missing), { subject: "math", certain: true });
    // Review: üres téma + „Hund magyarul:” → nem biztos angol; „matek: angol számnevek” → nem biztos matek.
    assert.deepEqual(materialSubject("", "Hund magyarul:", missing), { subject: "math", certain: false });
    assert.deepEqual(materialSubject("matek: angol számnevek", "Hogy mondod angolul: 7?", missing), { subject: "math", certain: false });
    for (const t of TITLE_TOPICS) assert.equal(materialSubject(t, "Kérdés?", missing).certain, false, t);
  }
});

const row = (id: string, topic: string | null, subject?: string) => ({
  id,
  prompt: `${id} kérdése?`,
  options: ["a", "b", "c", "d"],
  correctIndex: 1,
  topic,
  ...(subject ? { subject } : {}),
});

test("a címmel exportált, de valódi matek / angol lecke a tantárggyal visszakerül a „csak matek” / „csak angol” módba", () => {
  const material = materialToQuestions(
    [row("szorzas", "Szorzás", "math"), row("present", "Present Simple", "english"), row("forradalom", "A francia forradalom", "történelem"), row("regi", "Törtek")],
    5,
  );
  assert.deepEqual(material.map((q) => [q.id, q.subject, q.certain]), [
    ["szorzas", "math", true],
    ["present", "english", true],
    ["forradalom", "math", false],
    ["regi", "math", false],
  ]);
  // Az első húzás a nem látott tananyag a saját tantárgyú módban; a bizonytalan soha.
  const math = pickQuestion({ level: 70, school: 5, mode: "math", material, rng: makeRng(1) });
  assert.equal(math.id, "szorzas");
  const english = pickQuestion({ level: 70, school: 5, mode: "english", material, rng: makeRng(1) });
  assert.equal(english.id, "present");
  for (let seed = 1; seed <= 40; seed++) {
    for (const mode of ["math", "english"] as const) {
      const q = pickQuestion({ level: 70, school: 5, mode, material, rng: makeRng(seed), recent: ["szorzas", "present"] });
      assert.ok(q.id !== "forradalom" && q.id !== "regi", `${mode}: bizonytalan tantárgyú tananyag jött`);
    }
  }
});
