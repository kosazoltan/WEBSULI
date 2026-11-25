import assert from "node:assert/strict";
import test from "node:test";

import { lessonVarietyEnabled } from "../server/studio/lesson-variety-flag";
import {
  LESSON_OPENER_VERSION, PLAYFUL_AUTHOR_RULES, PLAYFUL_QUESTIONING_CONTRACT, lessonOpenerVersion, playfulAuthorRules, playfulQuestioningContract,
} from "../shared/lesson-opener";
import { lessonSchema, modelLessonSchema } from "../shared/lesson-schema";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (5. szakasz 1–2. pont; V1, V2): a változatossági kapcsoló alapból KI, és KI
// állapotban a prompt bájtra a régi.

test("V1: nem éles környezetben a kapcsoló alapból KI; csak az „on” kapcsolja be", () => {
  for (const value of [undefined, "", "off", "1", "true", "yes", "onn"]) assert.equal(lessonVarietyEnabled({ STUDIO_LESSON_VARIETY: value } as NodeJS.ProcessEnv), false, String(value));
  for (const value of ["on", " ON ", "On"]) assert.equal(lessonVarietyEnabled({ STUDIO_LESSON_VARIETY: value } as NodeJS.ProcessEnv), true, value);
  assert.equal(lessonVarietyEnabled({} as NodeJS.ProcessEnv), false);
});

// Tulajdonosi döntés 2026-11-24 (docs/specs/2026-11-24-valtozatossag-alapbol-be.md): élesben azonnal minden új leckére.
test("V0: élesben (NODE_ENV=production) beállítás nélkül BE; az explicit „off” vészfék, az „on” mindig BE", () => {
  const prod = (v?: string) => lessonVarietyEnabled({ NODE_ENV: "production", STUDIO_LESSON_VARIETY: v } as NodeJS.ProcessEnv);
  for (const value of [undefined, "", "1", "true", "onn"]) assert.equal(prod(value), true, String(value));
  for (const value of ["off", " OFF ", "Off"]) assert.equal(prod(value), false, value);
  assert.equal(prod("on"), true);
  for (const nodeEnv of ["development", "test", "", undefined]) assert.equal(lessonVarietyEnabled({ NODE_ENV: nodeEnv } as NodeJS.ProcessEnv), false, String(nodeEnv));
});

test("V1: KI állapotban a szerző- és a bankszabály bájtra a régi konstans, a verzió nyitomese-1", () => {
  assert.equal(playfulAuthorRules(false), PLAYFUL_AUTHOR_RULES);
  assert.equal(playfulQuestioningContract(false), PLAYFUL_QUESTIONING_CONTRACT);
  assert.equal(lessonOpenerVersion(false), LESSON_OPENER_VERSION);
  assert.equal(LESSON_OPENER_VERSION, "nyitomese-1");
  assert.match(PLAYFUL_QUESTIONING_CONTRACT, /Jó próba/u);
});

test("V2: BE állapotban nincs „Jó próba” mintamondat és bátorító-előírás; a verzió nyitomese-3 (S5b, dokumentált spec-változás: terv 11. szakasz 5. pont); a többi szabály megmarad", () => {
  for (const text of [playfulAuthorRules(true), playfulQuestioningContract(true)]) {
    assert.doesNotMatch(text, /Jó próba/u);
    assert.doesNotMatch(text, /bátorító (nyitás|első mondat)|első mondat bátorító/u);
    assert.match(text, /Bátorító vagy megerősítő nyitást NE írj — azt a program adja\./u);
    assert.match(text, /nyitomese-3/u);
    assert.doesNotMatch(text, /nyitomese-1/u);
  }
  assert.equal(lessonOpenerVersion(true), "nyitomese-3");
  // A visszajelzésen kívüli sorok változatlanok (csak a visszajelzés-sor, a verzió és — S5b — a módszer-sor „Peti” példája cserélődik).
  const otherLines = (t: string) => t.split("\n").slice(1).filter((l) => !/Visszajelzés|feedbackPerOption|^- Módszerek:/u.test(l));
  assert.deepEqual(otherLines(playfulQuestioningContract(true)), otherLines(PLAYFUL_QUESTIONING_CONTRACT));
  assert.deepEqual(otherLines(playfulAuthorRules(true)), otherLines(PLAYFUL_AUTHOR_RULES));
});

test("a lecke jelölője: a tárolt leckében engedékenyen olvasva; a bővítés előtti (KI) modell-sémából elhagyva", () => {
  const lesson = standardFusionFixture();
  const marked = lessonSchema.parse({ ...lesson, variety: { version: "valtozatossag-1" } });
  assert.deepEqual(marked.variety, { version: "valtozatossag-1" });
  // Hibás alak → elhagyva, a lecke olvasható marad.
  assert.equal(lessonSchema.parse({ ...lesson, variety: { version: 5 } }).variety, undefined);
  assert.equal(lessonSchema.parse({ ...lesson, variety: "x" }).variety, undefined);
  // KI (a forrásvizuál-kapcsoló alapértéke): a főághoz híven elhagyva. BE: a teljes olvasási séma (azonosság-őr a
  // source-visuals-flag tesztben) — ott a mentés határa (`withVarietyMarker`, upsertLesson) írja felül vagy törli.
  const parsed = modelLessonSchema(false).safeParse({ ...lesson, variety: { version: "valtozatossag-1" } });
  assert.ok(parsed.success);
  assert.equal((parsed.data as { variety?: unknown }).variety, undefined);
  assert.equal(modelLessonSchema(true), lessonSchema);
});
