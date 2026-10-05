import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-10-05-s9-prompt-javito-orkesztrator (bankcsomag, terv-ellenőrzés 6. és 9.): az orkesztrátor CSAK a meglévő 3. és 4.
   kísérlet előtt szól (nem új kísérlet), a javított rendszerprompt csak ennek a fejezetnek a következő kísérleteit kapja. */

const malformed = () => {
  const e = structuredClone(standardFusionFixture().experience!);
  (e.tasks[1] as unknown as { sample: unknown }).sample = 12;
  return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
};

test("bank: a 3. kísérlet előtt orkesztrátor, a javított prompt a 3. kísérletnél; a kísérletszám és a sorrend változatlan", async () => {
  const lesson = standardFusionFixture();
  const good = standardFusionFixture().experience!;
  const systems: string[] = [];
  const orchestrated: Array<{ attempt: number; errors: string }> = [];
  const result = await buildLessonExperience(lesson, [{ localId: "area", examWeight: "core" }], {
    call: async (system, _prompt, attempt) => {
      systems.push(system);
      return attempt < 2 ? malformed() : { methods: good.methods, tasks: good.tasks, quiz: good.quiz, glossary: [] };
    },
    orchestrate: async ({ attempt, system, errors }) => {
      orchestrated.push({ attempt, errors });
      return { system: `${system}\n=== ORKESZTRÁTOR JAVÍTÓ UTASÍTÁS (v1) ===\nA sample mindig szöveg.\n=== JAVÍTÓ UTASÍTÁS VÉGE ===`, diagnosis: "a sample szám volt" };
    },
  });
  assert.equal(systems.length, 3, "két bukott + egy sikeres kísérlet — nincs új kísérlet");
  assert.deepEqual(orchestrated.map((o) => o.attempt), [2], "csak a 3. kísérlet előtt");
  assert.match(orchestrated[0].errors, /sample/);
  assert.doesNotMatch(systems[0], /ORKESZTRÁTOR/);
  assert.doesNotMatch(systems[1], /ORKESZTRÁTOR/);
  assert.match(systems[2], /ORKESZTRÁTOR JAVÍTÓ UTASÍTÁS/);
  assert.equal(result.tasks.length, good.tasks.length);
});

test("bank: ha az orkesztrátor nem ad javítást (null), a ciklus a régi módon, változatlan prompttal megy tovább", async () => {
  const lesson = standardFusionFixture();
  const good = standardFusionFixture().experience!;
  const systems: string[] = [];
  await buildLessonExperience(lesson, [{ localId: "area", examWeight: "core" }], {
    call: async (system, _prompt, attempt) => { systems.push(system); return attempt < 2 ? malformed() : { methods: good.methods, tasks: good.tasks, quiz: good.quiz, glossary: [] }; },
    orchestrate: async () => null,
  });
  assert.equal(new Set(systems).size, 1, "a prompt nem változott");
});
