import test from "node:test";
import assert from "node:assert/strict";
import { decisionStoryParamsSchema } from "../shared/decision-story";
import { blockSchema } from "../shared/lesson-schema";
import { withLessonTypography } from "../shared/lesson-typography";
const story = { title: "Ellenőrizd a példát", start: "start", nodes: [
  { id: "start", text: "Elég csak behelyettesíteni?", choices: [
    { label: "Igen", feedback: "Az adatok összhangját is vizsgálni kell.", next: "check" },
    { label: "Ellenőrzöm", feedback: "Vizsgáld meg a magasságot!", next: "done" },
  ] },
  { id: "check", text: "Állj meg az ellenőrzéshez!", choices: [], conclusion: "A számolás nem bizonyítja a létezést." },
  { id: "done", text: "Megvizsgáltad az adatokat.", choices: [], conclusion: "A magasság nem lehet nagyobb az érintett oldalaknál." },
] };
test("decision story accepts complete branching and rejects cycles, dangling, unreachable and empty endings", () => {
  assert.ok(decisionStoryParamsSchema.safeParse(story).success);
  for (const mutate of [
    (s: typeof story) => { s.nodes[0].choices[0].next = "start"; },
    (s: typeof story) => { s.nodes[0].choices[0].next = "missing"; },
    (s: typeof story) => { s.nodes[0].choices[0].next = "done"; },
    (s: typeof story) => { s.nodes[1].conclusion = ""; },
    (s: typeof story) => { s.nodes[0].choices.pop(); },
  ]) { const copy = structuredClone(story); mutate(copy); assert.equal(decisionStoryParamsSchema.safeParse(copy).success, false); }
  assert.ok(blockSchema.safeParse({ kind: "animate", animKind: "decisionStory", params: story, caption: "Szemléltetés", coversConceptIds: ["c1"] }).success);
});
test("HTML adapter adds only one shared runtime when explicitly requested, preserving author scripts and Unicode", () => {
  const html = '<head></head><body>Árvíztűrő<script>const original=1;</script><div data-lesson-interaction="triangleArea"></div></body>';
  const result = withLessonTypography(html, 4, "Matek", "https://websuli.vip");
  assert.match(result, /src="https:\/\/websuli.vip\/lesson-interactions\.js\?v=2"/);
  assert.ok(result.includes('Árvíztűrő<script>const original=1;</script>'));
  assert.equal((withLessonTypography(result).match(/id="websuli-interactions"/g) ?? []).length, 1);
  assert.ok(!withLessonTypography('<p>Árvíztűrő</p>').includes('lesson-interactions.js'));
});
