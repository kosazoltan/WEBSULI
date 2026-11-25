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

test("V9 / V1: lépcsőcsoportonként 4–7 forma, 2–3 mondatos leírással, kódszótári címkével", () => {
  for (const group of GROUPS) {
    const forms = OPENING_FORMS[group];
    assert.ok(forms.length >= 4 && forms.length <= 7, `${group}: ${forms.length}`);
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

test("V8/V9 bekötés: a szerzői prompt csak BE változatossági kapcsolónál kapja a kiosztott formát; KI-nél a mag hatástalan", async () => {
  const { buildAuthorPrompt } = await import("../server/studio/step-io");
  const map = { title: "T", subject: "matek", classroom: 6, concepts: [{ localId: "c1", examWeight: "core" as const, term: "terület" }] };
  const sections = [{ heading: "H", conceptIds: ["c1"], plannedBlocks: ["explain" as const], animationSuggestions: [] as string[] }];
  const keys = ["STUDIO_LESSON_OPENER", "STUDIO_LESSON_VARIETY"] as const;
  const saved = keys.map((k) => process.env[k]);
  try {
    process.env.STUDIO_LESSON_OPENER = "on";
    delete process.env.STUDIO_LESSON_VARIETY;
    const off = buildAuthorPrompt(sections, map, [], undefined, undefined, { seed: 7 });
    assert.equal(off, buildAuthorPrompt(sections, map, []));
    assert.match(off, /PONTOSAN 5 mondat/u);
    process.env.STUDIO_LESSON_VARIETY = "on";
    const on = buildAuthorPrompt(sections, map, [], undefined, undefined, { seed: 7 });
    assert.ok(on.includes(`A hős neve: ${openerVarietyPick(6, 7).hero}.`));
    assert.doesNotMatch(on, /PONTOSAN 5|Jó próba/u);
  } finally {
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
  }
});

test("S5b vak kör 1 L1: a kiosztott nyitásforma fejléce akkor is a nyitóblokké, ha a Célkártya és a nyitás közé ábra került", () => {
  const goal = { kind: "explain" as const, depth: "core" as const, readAloud: false, text: "**Mit tanulunk ma?** A törtet.\n\n**Mi lehet nehéz?** A nevező.\n\n**Miért?** Mert új.\n\n**Így sikerül!** Rajzolj.", coversConceptIds: ["c1"] };
  const opening = { kind: "explain" as const, depth: "core" as const, readAloud: false, text: "Lili egy furcsa tortaszeletet talált.", coversConceptIds: ["c1"] };
  const figure = { kind: "animate" as const, animKind: "process" as const, params: { steps: ["a", "b"] }, caption: "ábra", coversConceptIds: ["c1"] };
  const teach = { kind: "explain" as const, depth: "core" as const, readAloud: false, text: "A tört a rész és az egész viszonya.", coversConceptIds: ["c1"] };
  const plain = [goal, opening, teach] as never[];
  const withFigure = [goal, figure, opening, teach] as never[];
  assert.equal(blockLabel(plain, 1, 0, "kid", 3, false, "rejtely"), OPENING_FORM_LABEL.rejtely);
  assert.equal(blockLabel(withFigure, 2, 0, "kid", 3, false, "rejtely"), OPENING_FORM_LABEL.rejtely, "ábra után is a nyitóblokk kapja a forma címkéjét");
  assert.notEqual(blockLabel(withFigure, 3, 0, "kid", 3, false, "rejtely"), OPENING_FORM_LABEL.rejtely, "a tanító blokk nem nyitás");
  // Jelöletlen (régi) lecke: a régi, pozíciós szabály — közbeillesztett ábra után NEM „Mese”.
  assert.equal(blockLabel(plain, 1, 0, "kid", 3, false), "Mese");
  assert.notEqual(blockLabel(withFigure, 2, 0, "kid", 3, false), "Mese");
});

test("S5b vak kör 1 L3: BE állapotban a lépcsősor nem írja elő a régi kötött meseformát és az 5. mondatot — a formát és a hosszt csak az új szerződés adja", () => {
  for (const classroom of [2, 3, 4, 6, 9]) {
    const on = lessonOpenerContract(classroom, { variety: { seed: 7 } });
    assert.equal(on.includes("az 5. mondat"), false, `${classroom}. évfolyam: nincs „5. mondat”`);
    assert.equal(/Mese: [^.]*;/u.test(on.split("\n")[1] ?? ""), false, `${classroom}. évfolyam: a lépcsősor nem ad meseformát`);
    assert.ok(on.includes("Nyitásforma (a program osztotta ki, kötelező)"));
    assert.ok(on.includes("Célkártya-címkék:") && on.includes("Hangnem:") && on.includes("Tanulság:"), "a korosztály, címkék, hangnem, tanulság megmarad");
    // KI: bájtra a régi (a meseformával).
    assert.ok(lessonOpenerContract(classroom).includes("Mese: "));
  }
});

test("review #534 (Copilot): hibás alakú openingForm (nem szöveg) nem töri el a megjelenítést — a régi címke marad", () => {
  const goal = { kind: "explain" as const, depth: "core" as const, readAloud: false, text: "**Mit tanulunk ma?** A törtet.\n\n**Mi lehet nehéz?** A nevező.\n\n**Miért?** Mert új.\n\n**Így sikerül!** Rajzolj.", coversConceptIds: ["c1"] };
  const opening = { kind: "explain" as const, depth: "core" as const, readAloud: false, text: "Lili tortát talált.", coversConceptIds: ["c1"] };
  for (const bad of [{ toString: null }, 5, ["rejtely"], null]) {
    assert.doesNotThrow(() => blockLabel([goal, opening] as never[], 1, 0, "kid", 3, false, bad as never));
    assert.equal(blockLabel([goal, opening] as never[], 1, 0, "kid", 3, false, bad as never), "Mese");
  }
});

test("review #534 (Copilot): a lektor a szerzőnek TÉNYLEG kiosztott nyitásformát kapja (azonosító + leírás), nem csak a formák listáját", () => {
  const pick = openerVarietyPick(6, 7);
  const withForm = lessonOpenerLektorChecklist(true, pick.form);
  assert.ok(withForm.includes(OPENING_FORM_LABEL[pick.form.id]) && withForm.includes(pick.form.description), "a kiosztott forma címkéje és leírása");
  assert.equal(withForm.includes("mese, rejtély, jóslás"), false, "nem a teljes formalista");
  // Forma nélkül (régi checkpoint / v1 javítás): nem állít kiosztást; KI: bájtra a régi.
  assert.equal(lessonOpenerLektorChecklist(true).includes("a kiosztott formát követi-e"), false);
  assert.equal(lessonOpenerLektorChecklist(false), LESSON_OPENER_LEKTOR_CHECKLIST);
  assert.equal(lessonOpenerLektorChecklist(false, pick.form), LESSON_OPENER_LEKTOR_CHECKLIST);
});

test("S5b 3. vak kör L8: a mentett formaazonosító az évfolyam korcsoportjának leírását adja vissza (azonos azonosító több csoportban)", async () => {
  const { OPENING_FORMS, openingFormById, openingFormGroup } = await import("../shared/lesson-opener");
  const { adoptStoredOpeningForm, runOpeningForm, runWithLessonVariety } = await import("../server/studio/lesson-variety-flag");
  let shared = 0;
  for (const classroom of [1, 3, 5, 7, 9, 12]) {
    for (const form of OPENING_FORMS[openingFormGroup(classroom)]) {
      assert.equal(openingFormById(form.id, classroom), form, `${classroom}. osztály, ${form.id}`);
      if (openingFormById(form.id) !== form) shared++;
      runWithLessonVariety(true, () => {
        adoptStoredOpeningForm({ classroom, variety: { version: "valtozatossag-2", openingForm: form.id } });
        assert.equal(runOpeningForm(), form, `javítás: ${classroom}. osztály, ${form.id}`);
      });
    }
  }
  assert.ok(shared > 0, "van több csoportban is szereplő azonosító — a teszt valódi esetet mér");
  assert.equal(openingFormById("nincs-ilyen", 5), undefined);
});
