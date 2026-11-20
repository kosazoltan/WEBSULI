import assert from "node:assert/strict";
import test from "node:test";

import {
  HERO_NAMES, LESSON_OPENER_LEKTOR_CHECKLIST, OPENING_FORMS, OPENING_FORM_LABEL, lessonOpenerContract, lessonOpenerLektorChecklist, openerVarietyPick,
  playfulAuthorRules, playfulQuestioningContract,
} from "../shared/lesson-opener";
import { blockLabel } from "../shared/lesson-block-label";
import { seedFrom } from "../shared/seeded";
import type { Block } from "../shared/lesson-schema";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (11. szakasz; V8, V9, V11): a nyitás formája és a hős neve a kódból, a magból.

const GROUPS = ["young", "middle", "older"] as const;
const GROUP_CLASSROOMS = { young: [1, 2, 3, 4], middle: [5, 6, 7, 8, 0], older: [9, 10, 11, 12] } as const;

test("V9: lépcsőcsoportonként 3–4 forma, 2–3 mondatos leírással, kódszótári címkével", () => {
  for (const group of GROUPS) {
    const forms = OPENING_FORMS[group];
    assert.ok(forms.length >= 3 && forms.length <= 4, `${group}: ${forms.length}`);
    assert.equal(new Set(forms.map((f) => f.id)).size, forms.length);
    for (const f of forms) {
      const sentences = f.description.split(/(?<=[.!?])\s+/u).filter(Boolean).length;
      assert.ok(sentences >= 2 && sentences <= 3, `${group}/${f.id}: ${sentences} mondat`);
      assert.ok(OPENING_FORM_LABEL[f.id], `${f.id}: nincs címke`);
    }
  }
});

test("V9: ≥ 40 egyedi hősnév, a mért három leggyakoribb nélkül", () => {
  assert.ok(HERO_NAMES.length >= 40, `${HERO_NAMES.length}`);
  assert.equal(new Set(HERO_NAMES).size, HERO_NAMES.length);
  for (const banned of ["Bence", "Dóra", "Dóri", "Peti"]) assert.ok(!HERO_NAMES.includes(banned), banned);
});

test("V9: a kiosztás determinisztikus; 100 magon csoportonként ≥ 3 forma és ≥ 25 név", () => {
  for (const group of GROUPS) {
    const forms = new Set<string>(), names = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const classroom = GROUP_CLASSROOMS[group][i % GROUP_CLASSROOMS[group].length];
      const seed = seedFrom(`map-${group}-${i}`);
      const pick = openerVarietyPick(classroom, seed);
      assert.deepEqual(pick, openerVarietyPick(classroom, seed));
      assert.ok(OPENING_FORMS[group].some((f) => f.id === pick.form.id), `${group}: idegen forma ${pick.form.id}`);
      forms.add(pick.form.id); names.add(pick.hero);
    }
    assert.ok(forms.size >= 3, `${group}: ${forms.size} forma`);
    assert.ok(names.size >= 25, `${group}: ${names.size} név`);
  }
});

test("V8: mag nélkül a nyitószerződés bájtra a régi; V9: maggal kiosztott forma, név, 3–6 mondat, nyitomese-3", () => {
  for (const classroom of [1, 3, 5, 7, 9, 11, 0]) {
    const plain = lessonOpenerContract(classroom);
    assert.equal(lessonOpenerContract(classroom, { variety: undefined }), plain);
    assert.match(plain, /PONTOSAN 5 mondat/u);
    const seed = seedFrom(`m${classroom}`);
    const varied = lessonOpenerContract(classroom, { variety: { seed } });
    const pick = openerVarietyPick(classroom, seed);
    assert.doesNotMatch(varied, /PONTOSAN 5/u);
    assert.match(varied, /3–6 mondat/u);
    assert.ok(varied.includes(`A hős neve: ${pick.hero}.`), "hősnév");
    assert.ok(varied.includes(pick.form.description), "forma leírása");
    assert.match(varied, /nyitomese-3/u);
    // A Célkártya-sorok változatlanok.
    const goal = (t: string) => t.split("\n").filter((l) => l.startsWith("- CÉLKÁRTYA") || l.startsWith("- Az első bekezdés"));
    assert.deepEqual(goal(varied), goal(plain));
  }
  // A javító kör szövege (1. fejezet nincs benne) maggal is a régi, csak a verzió más.
  assert.match(lessonOpenerContract(5, { section0InScope: false, variety: { seed: 1 } }), /nyitomese-3/u);
});

test("V9: BE állapotban nincs „Peti” példamondat; a verzió nyitomese-3; a lektor 3–6 mondatot mér", () => {
  assert.doesNotMatch(playfulQuestioningContract(true), /Peti/u);
  assert.match(playfulQuestioningContract(false), /Peti/u);
  assert.match(playfulQuestioningContract(true), /megnevezett szereplő téves állítása/u);
  for (const t of [playfulQuestioningContract(true), playfulAuthorRules(true)]) assert.match(t, /nyitomese-3/u);
  assert.equal(lessonOpenerLektorChecklist(false), LESSON_OPENER_LEKTOR_CHECKLIST);
  assert.doesNotMatch(lessonOpenerLektorChecklist(true), /pontosan 5 mondat/u);
  assert.match(lessonOpenerLektorChecklist(true), /3–6 mondat/u);
});

test("V11: a nyitóblokk fejléce a kiosztott formából; forma nélkül a régi címke", () => {
  const goal = "**Mit tanulunk ma?** A tört részeit.\n\n**Mi lehet nehéz?** A számláló.\n\n**Miért?** Mert hasonlít.\n\n**Így sikerül!** Rajzolunk.";
  const blocks = [
    { kind: "explain", text: goal, depth: "core", readAloud: true, coversConceptIds: ["a"] },
    { kind: "explain", text: "Ábel egy reggel észrevette, hogy eltűnt a tortaszelet.", depth: "core", readAloud: true, coversConceptIds: ["a"] },
  ] as Block[];
  assert.equal(blockLabel(blocks, 1, 0, "kid", 3), "Mese");
  assert.equal(blockLabel(blocks, 1, 0, "kid", 3, false, undefined), "Mese");
  for (const group of GROUPS) for (const f of OPENING_FORMS[group]) assert.equal(blockLabel(blocks, 1, 0, "kid", 3, false, f.id), OPENING_FORM_LABEL[f.id]);
  // Ismeretlen forma (újabb programverzió) → a régi címke.
  assert.equal(blockLabel(blocks, 1, 0, "kid", 3, false, "ismeretlen"), "Mese");
});
