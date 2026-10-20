import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLessonExperience, isReversedDirectionKeyFailure } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { MapConcept } from "../server/studio/coverage";
import type { AnswerKeyCases } from "../shared/answer-key-tests";
import type { OpenTask } from "../shared/lesson-experience";

/* Spec 2026-10-20-eroforras-s3b-forditott-irany — mért: az animator „unknown” hibáinak zöme fordított irányú válaszkulcs-bukás. */

const lesson = () => { const l = standardFusionFixture(); l.mapId = "m1"; return { ...l, experience: undefined }; };
const concepts = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];
const withExtra = () => {
  const e = structuredClone(standardFusionFixture().experience!);
  e.tasks.push({ ...e.tasks[0], id: "extra-task", q: `${e.tasks[0].q} (tartalék)` });
  return e;
};
const failing: AnswerKeyCases = {
  correct: ["teljesen más szavakkal írt válasz", "megint egészen más mondat", "harmadik eltérő felelet"],
  wrong: [{ kind: "temaidegen", text: "x" }, { kind: "tevhit", text: "y" }],
};
// A minta maga a „hibás” eset: a rubrika teljes pontot ad rá → a megadott fajtájú hibás válasz is teljes pont.
const keysFor = (kind: "forditott" | "tevhit") => async (tasks: OpenTask[]) => new Map(tasks.filter((t) => t.q.endsWith("(tartalék)"))
  .map((t) => [t.id, { ...failing, wrong: [{ kind, text: t.sample }, { kind: "temaidegen", text: "x" }] } as AnswerKeyCases] as const));

test("isReversedDirectionKeyFailure: csak a fordított irányú válaszkulcs-bukás", () => {
  assert.equal(isReversedDirectionKeyFailure("t1: válaszkulcs-teszt: a hibás (fordított irány) válasz „x” teljes pontot kap — a rubrika túl megengedő"), true);
  assert.equal(isReversedDirectionKeyFailure("t1: válaszkulcs-teszt: a hibás (tévhit) válasz „x” teljes pontot kap — a rubrika túl megengedő"), false);
});

test("csak fordított irányú bukás a tartalék feladaton → 1 hívás, a feladat azonnal kikerül (nincs hiábavaló javítókör)", async () => {
  let calls = 0;
  const fixes: string[] = [];
  const experience = await buildLessonExperience(lesson(), concepts, {
    call: async () => { calls++; return withExtra(); },
    answerKeys: keysFor("forditott"),
    onToolFix: (tool, list) => { if (tool === "bank-stuck") fixes.push(...list); },
  });
  assert.equal(calls, 1);
  assert.equal(experience.tasks.some((t) => t.q.endsWith("(tartalék)")), false);
  assert.match(fixes.join(" "), /fordított irány — azonnali kivétel 1 tesztbukott feladat/);
});

test("tévhit fajtájú bukás → a régi javítókör marad (több hívás)", async () => {
  let calls = 0;
  await buildLessonExperience(lesson(), concepts, { call: async () => { calls++; return withExtra(); }, answerKeys: keysFor("tevhit") });
  assert.ok(calls > 1, `hívás: ${calls}`);
});
