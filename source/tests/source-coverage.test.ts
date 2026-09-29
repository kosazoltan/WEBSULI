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

/* Spec 2026-09-29-forrasonkenti-fedettseg: a rövid füzetlapot a hosszú webes szöveg ne szorítsa ki. */
const twoFiles = [
  { name: "web.txt", kind: "text" as const, content: "Mezopotámia görög eredetű neve folyóközt jelent. Az Istár kapu Babilon egyik városkapuja volt." },
  { name: "fuzet.jpg", kind: "text" as const, content: "Társadalom: élén papkirályok, előkelők: papok és katonák, parasztok és kézművesek." },
];
const webConcept = conceptSchema.parse({ id: "folyokoz", term: "Mezopotámia", definition: "Folyóköz.", quote: "Mezopotámia görög eredetű neve folyóközt jelent.", sourceRef: { file: "web.txt" }, type: "definition", examWeight: "core" });
const notebookConcept = { id: "tarsadalom", term: "társadalom", definition: "Élén papkirályok.", quote: "Társadalom: élén papkirályok", sourceRef: { file: "fuzet.jpg" }, type: "definition", examWeight: "core" };

test("E1+E2 fogalom nélküli forrásfájlra célzott pótlás fut, és a fogalma bekerül; fedett fájlra nem", async () => {
  const perFileCalls: string[] = [];
  const result = await completeSourceCoverage([webConcept], twoFiles, async () => ({ title: "", concepts: [] }), async (file, existing) => {
    perFileCalls.push(file.name);
    assert.deepEqual(existing.map((c) => c.id), ["folyokoz"], "a meglévő fogalmakat duplikáció-szűrésre megkapja");
    return { title: "", concepts: [notebookConcept] };
  });
  assert.deepEqual(perFileCalls, ["fuzet.jpg"]);
  assert.deepEqual(result.map((c) => c.sourceRef.file), ["web.txt", "fuzet.jpg"]);
});

test("E3 a célzott pótlás csak a saját fájljára hivatkozhat", async () => {
  await assert.rejects(completeSourceCoverage([webConcept], twoFiles, async () => ({ title: "", concepts: [] }), async () => ({ title: "", concepts: [{ ...notebookConcept, sourceRef: { file: "web.txt" } }] })));
});

test("a célzott pótlás üres eredménye nem állítja meg a futást", async () => {
  const result = await completeSourceCoverage([webConcept], twoFiles, async () => ({ title: "", concepts: [] }), async () => ({ title: "", concepts: [] }));
  assert.deepEqual(result, [webConcept]);
});
