import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLessonExperience, trimAnswerKeyFailures } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { MapConcept } from "../server/studio/coverage";
import type { AnswerKeyCases } from "../shared/answer-key-tests";
import type { OpenTask } from "../shared/lesson-experience";

/* Tételgyár T2.1 (docs/specs/2026-10-15-tetelgyar-t2-valaszkulcs-tesztek-vegrehajtas.md, E1–E3): a bekötés a bankgyártásba. */

const failing: AnswerKeyCases = {
  correct: ["teljesen más szavakkal írt válasz", "megint egészen más mondat", "harmadik eltérő felelet"],
  wrong: [{ kind: "temaidegen", text: "x" }, { kind: "tevhit", text: "y" }],
};
const lesson = () => { const l = standardFusionFixture(); l.mapId = "m1"; return { ...l, experience: undefined }; };
const concepts = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];
const withExtra = () => {
  const e = structuredClone(standardFusionFixture().experience!);
  e.tasks.push({ ...e.tasks[0], id: "extra-task", q: `${e.tasks[0].q} (tartalék)` });
  return e;
};

test("E1: a tesztbukott feladat javítókört indít (konkrét esettel), az utolsó kísérletnél a tartalék terhére kikerül", async () => {
  const prompts: string[] = [];
  const fixes: string[] = [];
  let keyCalls = 0;
  const experience = await buildLessonExperience(lesson(), concepts, {
    call: async (_s, user) => { prompts.push(user); return withExtra(); },
    answerKeys: async (tasks: OpenTask[]) => {
      keyCalls++;
      return new Map(tasks.filter((t) => t.q.endsWith("(tartalék)")).map((t) => [t.id, failing] as const));
    },
    onToolFix: (tool, list) => { if (tool === "answer-key-tests") fixes.push(...list); },
  });
  assert.equal(prompts.length, 4, "három kísérlet + mentőkör");
  assert.match(prompts[1], /válaszkulcs-teszt: a helyes válasz „teljesen más szavakkal írt válasz” nem kap teljes pontot/);
  assert.ok(keyCalls >= 1);
  assert.equal(experience.tasks.some((t) => t.q.endsWith("(tartalék)")), false, "a bukott feladat nem jut a gyerekhez");
  assert.match(fixes.join(" "), /1 tesztbukott feladat kivéve a tartalék terhére/);
});

test("E3: a tesztíró üres eredménye (hiba / nincs kulcs) nem állítja meg és nem lassítja a csomagot", async () => {
  let calls = 0;
  const experience = await buildLessonExperience(lesson(), concepts, {
    call: async () => { calls++; return withExtra(); },
    answerKeys: async () => new Map(),
  });
  assert.equal(calls, 1);
  assert.ok(experience.tasks.some((t) => t.q.endsWith("(tartalék)")));
});

test("a padló védett: a tartalékon felüli bukott feladat figyelmeztetéssel bent marad (a T2 nem ront)", () => {
  const packet = { tasks: [{ id: "a" }, { id: "b" }, { id: "c" }] };
  const issues = ["a: válaszkulcs-teszt: x", "b: válaszkulcs-teszt: y", "b: válaszkulcs-teszt: z", "ismeretlen: válaszkulcs-teszt: w"];
  const out = trimAnswerKeyFailures(packet, issues, 2);
  assert.deepEqual(out.removed, ["b"], "a több bukott esetű előbb");
  assert.deepEqual(out.kept, ["a"]);
  assert.deepEqual(out.packet.tasks.map((t) => t.id), ["a", "c"]);
  assert.equal(packet.tasks.length, 3, "az eredeti csomag érintetlen");
});
