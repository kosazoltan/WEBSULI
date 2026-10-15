import test from "node:test";
import assert from "node:assert/strict";
import { inflectedForms, spellingVariants, synonymsOf } from "../shared/hu-lexicon";
import { autofixBankPacket } from "../server/studio/tools/bank-packet-autofix";
import { evaluateOpenAnswer } from "../shared/lesson-experience-score";
import type { OpenTask } from "../shared/lesson-experience";

/* Tételgyár T4′ (tulajdonosi döntés D2). Mért (job 416ad01d): a tanítás „ásványianyag-” és „termőre” alakját a rubrika nem fogadta el;
   ellenpélda: a „testére” alak a „testéről” helyett is átment. */

test("írásmód: a többszavas kifejezés egybeírt változata", () => {
  assert.ok(spellingVariants("ásványi anyag").includes("asvanyianyag"));
  assert.deepEqual(spellingVariants("termő"), []);
});

test("a tanítás közös tövű alakja: igen a „termőre”, nem a „termés”, nem az ellentétes irányrag", () => {
  assert.deepEqual(inflectedForms("termőjére", "A virágpor a termőre kerül."), ["termőre"], "az eredeti, ékezetes alak");
  assert.deepEqual(inflectedForms("termő", "A termés beérik."), []);
  assert.deepEqual(inflectedForms("testéről", "A virágpor a rovar testére tapad."), [], "a -ről ↔ -re irány nem cserélhető");
  assert.deepEqual(inflectedForms("anyag", "nem anyag"), [], "rövid szó / tagadás nem kerül be");
});

test("rokon értelmű: csak a kézzel ellenőrzött teljes csoporttag; az „eső” nem „csapadék”", () => {
  assert.deepEqual(synonymsOf("tilos"), ["nem szabad"]);
  assert.deepEqual(synonymsOf("eső"), []);
});

const task = (required: string[][], sample: string): OpenTask => ({
  id: "t1", sectionIndex: 0, coversConceptIds: ["c1"], q: "Mit tartalmaz?", required, bonus: [], minWords: 3, needsSentence: false, sample, mode: "written",
});

test("autofix: a 416-os két valós eset megoldva — a tanítás szóalakjával írt helyes válasz „ok”", () => {
  const teachingText = "A gyümölcs ásványianyag-tartalma magas. A virágpor a rovar testéről a termőre kerül.";
  const packet = { methods: [], quiz: [], tasks: [task([["ásványi anyag"]], "Sok ásványi anyag van benne."), task([["termőjére"]], "A virágpor a bibe termőjére kerül.")] };
  packet.tasks[1].id = "t2";
  const fixed = autofixBankPacket(packet, { sectionIndex: 0, allowedConceptIds: ["c1"], teachingText }).packet as { tasks: OpenTask[] };
  assert.equal(evaluateOpenAnswer("Sok ásványianyag van benne.", fixed.tasks[0]).state, "ok");
  assert.equal(evaluateOpenAnswer("A virágpor a termőre kerül.", fixed.tasks[1]).state, "ok");
  assert.equal(evaluateOpenAnswer("A virágpor a termésre kerül.", fixed.tasks[1]).state === "ok", false, "a „termés” nem fogadható el");
});

test("autofix: csak hozzáad — a meglévő csoporttag és a minWords változatlan; tanítás nélkül nincs tanítás-alak", () => {
  const packet = { methods: [], quiz: [], tasks: [task([["termőjére"]], "A virágpor a termőjére kerül.")] };
  const fixed = autofixBankPacket(packet, { sectionIndex: 0, allowedConceptIds: ["c1"] }).packet as { tasks: OpenTask[] };
  assert.deepEqual(fixed.tasks[0].required, [["termőjére"]]);
  assert.equal(fixed.tasks[0].minWords, 3);
});

test("review #228 (P1): valódi toldalékolás — a „tanítvány” nem a „tanítás” alakja; a „termőjére” → „termőre” igen", () => {
  assert.deepEqual(inflectedForms("tanítás", "A tanítvány figyel."), []);
  assert.deepEqual(inflectedForms("tanítás", "A tanítást a tanár végzi."), ["tanítást"]);
  assert.deepEqual(inflectedForms("termőjére", "A virágpor a termőre kerül."), ["termőre"]);
  assert.deepEqual(inflectedForms("magasság", "A háromszög magassága 4 cm."), ["magassága"]);
});

test("review #228 (P1): a tanításszöveg csak explain/example blokkból — a check blokk hibás opciója nem forrás", async () => {
  const { teachingTextOf } = await import("../server/studio/experience-builder");
  const text = teachingTextOf({ blocks: [
    { kind: "explain", text: "A virágpor a termőre kerül." },
    { kind: "example", problem: "Hová kerül?", steps: ["A bibére."], answer: "A termőre." },
    { kind: "check", question: "Hová?", options: ["termésre", "termőre"], feedback: "termésre nem" },
  ] });
  assert.match(text, /termőre/);
  assert.doesNotMatch(text, /termésre|Hová\?/);
});

test("review #228 (P2): a gyorsítótárból jövő csomag is megkapja a bővítést, modellhívás nélkül", async () => {
  const { buildLessonExperience } = await import("../server/studio/experience-builder");
  const { standardFusionFixture } = await import("../shared/fixtures/lesson-fusion");
  const lesson = standardFusionFixture(); lesson.mapId = "m1";
  const concepts = [{ localId: "area", term: "Terület", definition: "A szorzat fele", quote: "T = a · m / 2", examWeight: "core" as const }];
  let checkpoint: import("../server/studio/experience-builder").ExperienceCheckpoint | undefined;
  await buildLessonExperience({ ...lesson, experience: undefined }, concepts, { call: async () => standardFusionFixture().experience!, save: async (cp) => { checkpoint = structuredClone(cp); } });
  assert.ok(checkpoint);
  const stripped = structuredClone(checkpoint!);
  let removed = 0;
  for (const part of Object.values(stripped.parts) as Array<{ tasks?: Array<{ required: string[][] }> }>) {
    for (const t of part.tasks ?? []) t.required = t.required.map((g) => { const keep = g.filter((x) => !/^magasság(a|ot)$/.test(x)); removed += g.length - keep.length; return keep; });
  }
  assert.ok(removed > 0, "a fixture-ben volt automatikusan hozzáadott alak");
  const rebuilt = await buildLessonExperience({ ...lesson, experience: undefined }, concepts, { checkpoint: stripped, call: async () => { throw new Error("modellhívás a gyorsítótár helyett"); } });
  assert.ok(rebuilt.tasks.some((t) => t.required.some((g) => g.includes("magassága"))), "a bővítés a mentett csomagra is lefutott");
});
