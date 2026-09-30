import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLessonExperience, salvagePacket } from "../server/studio/experience-builder";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { MapConcept } from "../server/studio/coverage";

/** Spec 2026-09-30-nem-elakado-kozzetetel (3. szelet): a mentő kísérlet után is hibás bankcsomag megmentése. */

type P = { methods: Array<{ id: string }>; tasks: Array<{ id: string; bad?: boolean }>; quiz: Array<{ id: string }> };
const packet = (): P => ({
  methods: [{ id: "m1" }, { id: "m2" }],
  tasks: Array.from({ length: 6 }, (_, i) => ({ id: `t${i + 1}`, bad: i === 0 || i === 5 })),
  quiz: Array.from({ length: 6 }, (_, i) => ({ id: `q${i + 1}` })),
});
const validate = (p: P) => p.tasks.filter((t) => t.bad).map((t) => `${t.id}: a mintaválasz nem teljes pont.`);

test("a névvel megjelölt hibás tételek kikerülnek; szóhatár: t1 nem viszi a t10-et", () => {
  const input = packet();
  input.tasks.push({ id: "t10" });
  const out = salvagePacket(input, validate);
  assert.ok(out);
  assert.deepEqual(out.removed.sort(), ["t1", "t6"]);
  assert.deepEqual(out.packet.tasks.map((t) => t.id), ["t2", "t3", "t4", "t5", "t10"]);
  assert.equal(input.tasks.length, 7, "az eredeti csomag érintetlen");
});

test("nincs mentés: névtelen hiba, túl sok kivétel, vagy kivétel után is marad hiba", () => {
  assert.equal(salvagePacket(packet(), () => ["Hiányzó módszer: gate"]), null);
  const allBad = packet(); allBad.tasks.forEach((t) => { t.bad = true; });
  assert.equal(salvagePacket(allBad, validate), null, "a 20%-os kereten felül nem ment");
  assert.equal(salvagePacket(packet(), (p) => [...validate(p), "tasks: Array must contain at least 6 element(s)"]), null);
  assert.equal(salvagePacket({ ...packet(), tasks: [{ id: "t1" }] }, () => []), null, "hibátlan csomagnál nincs mit menteni");
});

test("valódi csomagépítés: a minden kísérletben hibás mintájú feladat kikerül, a lecke banka elkészül", async () => {
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const concepts = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];
  const fixes: string[] = [];
  let calls = 0;
  const experience = await buildLessonExperience({ ...lesson, experience: undefined }, concepts, {
    call: async () => {
      calls++;
      const e = structuredClone(standardFusionFixture().experience!);
      e.tasks.push({ ...e.tasks[0], id: "bad-task", q: `${e.tasks[0].q} (hibás)`, sample: "x" });
      return e;
    },
    onToolFix: (tool, list) => { if (tool === "bank-salvage") fixes.push(...list); },
  });
  assert.equal(calls, 4, "három kísérlet + mentőkör, utána mentés (nem bukás)");
  assert.equal(experience.tasks.some((t) => t.q.endsWith("(hibás)")), false, "a hibás feladat nem jut a gyerekhez");
  assert.match(fixes.join(" "), /1 hibás tétel kivéve/);
});
