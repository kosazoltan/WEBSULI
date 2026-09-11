import test from "node:test";
import assert from "node:assert/strict";
import { completeSourceCoverage, applyVerbatimChecks } from "../server/studio/extractor";
import { conceptSchema } from "../shared/knowledge-map-schema";
const files = [{ name: "forras.txt", kind: "text" as const, content: "A magasság merőleges. Egy hektár tízezer négyzetméter." }];
const first = conceptSchema.parse({ id: "c1", term: "Magasság", definition: "Merőleges.", quote: "A magasság merőleges.", sourceRef: { file: files[0].name }, type: "definition", examWeight: "core" });
test("independent source audit adds an omitted concept, preserving the original and checking its quote", async () => {
  let calls = 0;
  const result = await completeSourceCoverage([first], files, async existing => {
    calls++; assert.deepEqual(existing, [first]);
    return { title: "", concepts: [{ ...first, term: "Hektár", quote: "Egy hektár tízezer négyzetméter." }] };
  });
  assert.equal(calls, 1); assert.deepEqual(result[0], first); assert.equal(result.length, 2);
  assert.notEqual(result[1].id, first.id);
  assert.ok(applyVerbatimChecks(result, files[0].content).every(c => c.verbatimOk));
});
test("audit failure cannot silently produce a complete-looking subset", async () => {
  await assert.rejects(completeSourceCoverage([first], files, async () => ({ title: "", concepts: [{}] })));
  await assert.rejects(completeSourceCoverage([first], files, async () => { throw new Error("truncated"); }));
  assert.deepEqual(await completeSourceCoverage([first], files, async () => ({ title: "", concepts: [] })), [first]);
});
