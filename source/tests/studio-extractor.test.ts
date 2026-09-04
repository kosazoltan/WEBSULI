import assert from "node:assert/strict";
import test from "node:test";

import {
  computeInputHash,
  extractKnowledgeMap,
  applyVerbatimChecks,
  canApprove,
  type ExtractorDeps,
  type RawExtraction,
} from "../server/studio/extractor";

/**
 * LS-1 — extraction is expensive, so it must be idempotent, and it must never
 * launder an unquotable claim into an approved map.
 *
 * These tests inject a fake model: no network, no cost, and the assertions are
 * about our logic rather than about what an LLM happens to reply today.
 */

const FILES = [
  { name: "bio7.pdf", kind: "pdf" as const, content: "A fotoszintézis a kloroplasztiszban zajlik." },
  { name: "jegyzet.txt", kind: "text" as const, content: "A termelő szervezetek maguk állítják elő a tápanyagot." },
];

const SCOPE = { subject: "biológia", classroom: 7, unit: "Növényi anyagcsere" };

test("computeInputHash is stable for identical input", () => {
  assert.equal(computeInputHash(FILES, SCOPE), computeInputHash(FILES, SCOPE));
});

test("computeInputHash ignores the order files were uploaded in", () => {
  // Dragging the same two files in the other order is the same job, not a new bill.
  assert.equal(
    computeInputHash(FILES, SCOPE),
    computeInputHash([...FILES].reverse(), SCOPE),
  );
});

test("computeInputHash changes when the content changes", () => {
  const edited = [{ ...FILES[0], content: FILES[0].content + " Új mondat." }, FILES[1]];
  assert.notEqual(computeInputHash(FILES, SCOPE), computeInputHash(edited, SCOPE));
});

test("computeInputHash changes when the scope changes", () => {
  // Same book, different classroom = a different map; the wording must differ.
  assert.notEqual(
    computeInputHash(FILES, SCOPE),
    computeInputHash(FILES, { ...SCOPE, classroom: 8 }),
  );
});

function fakeDeps(overrides: Partial<ExtractorDeps> = {}): ExtractorDeps & { calls: number } {
  const state = {
    calls: 0,
    findByHash: async () => null,
    save: async (map: unknown) => map,
    runModel: async (): Promise<RawExtraction> => {
      state.calls += 1;
      return {
        title: "Fotoszintézis",
        concepts: [
          {
            id: "c1",
            term: "fotoszintézis",
            definition: "Fényből szerves anyag.",
            quote: "A fotoszintézis a kloroplasztiszban zajlik.",
            sourceRef: { file: "bio7.pdf", page: 1 },
            type: "definition",
            examWeight: "core",
            relatedIds: [],
          },
        ],
      };
    },
    ...overrides,
  };
  return state as ExtractorDeps & { calls: number };
}

test("extractKnowledgeMap calls the model when no cached map exists", async () => {
  const deps = fakeDeps();
  const result = await extractKnowledgeMap({ files: FILES, scope: SCOPE }, deps);
  assert.equal(deps.calls, 1);
  assert.equal(result.cached, false);
  assert.equal(result.map.concepts?.length, 1);
});

test("extractKnowledgeMap returns the cached map WITHOUT calling the model", async () => {
  // The expensive vision call must not fire twice for the same upload.
  const cached = { id: "km-1", title: "Fotoszintézis", concepts: [] };
  const deps = fakeDeps({ findByHash: async () => cached });
  const result = await extractKnowledgeMap({ files: FILES, scope: SCOPE }, deps);
  assert.equal(deps.calls, 0, "cache hit must not call the model");
  assert.equal(result.cached, true);
  assert.equal(result.map.id, "km-1");
});

test("extractKnowledgeMap stamps the map with the input hash it was built from", async () => {
  const deps = fakeDeps();
  const result = await extractKnowledgeMap({ files: FILES, scope: SCOPE }, deps);
  assert.equal(result.map.inputHash, computeInputHash(FILES, SCOPE));
});

test("extractKnowledgeMap drops a malformed concept but keeps the rest of the run", async () => {
  // A 40-concept extraction must not be lost because the model emitted one bad item;
  // equally, the bad item must not reach the map. Reverse-mutation (2026-09-04) showed
  // the suite stayed green without this case, so it earns its place.
  const deps = fakeDeps({
    runModel: async (): Promise<RawExtraction> => ({
      title: "Vegyes",
      concepts: [
        {
          id: "good",
          term: "fotoszintézis",
          definition: "Fényből szerves anyag.",
          quote: "A fotoszintézis a kloroplasztiszban zajlik.",
          sourceRef: { file: "bio7.pdf", page: 1 },
          type: "definition",
          examWeight: "core",
          relatedIds: [],
        },
        // No quote at all: unquotable, therefore not a concept (D1).
        { id: "bad", term: "x", definition: "y", sourceRef: { file: "bio7.pdf" }, type: "fact", examWeight: "extra" },
        // Unknown vocabulary for examWeight.
        { id: "bad2", term: "x", definition: "y", quote: "z", sourceRef: { file: "b.pdf" }, type: "fact", examWeight: "nagyon-fontos" },
      ],
    }),
  });

  const result = await extractKnowledgeMap({ files: FILES, scope: SCOPE }, deps);
  const ids = (result.map.concepts ?? []).map((c) => c.id);
  assert.deepEqual(ids, ["good"], "only the schema-valid concept survives");
});

test("applyVerbatimChecks marks an invented quote as not verbatim (D1)", () => {
  const sourceText = FILES.map((f) => f.content).join("\n");
  const checked = applyVerbatimChecks(
    [
      { id: "ok", quote: "A fotoszintézis a kloroplasztiszban zajlik.", examWeight: "core" },
      { id: "bad", quote: "A fotoszintézis a Holdon zajlik.", examWeight: "core" },
    ],
    sourceText,
  );
  assert.equal(checked.find((c) => c.id === "ok")?.verbatimOk, true);
  assert.equal(checked.find((c) => c.id === "bad")?.verbatimOk, false);
});

test("canApprove refuses while any core concept is not verbatim", () => {
  const r = canApprove([
    { id: "a", examWeight: "core", verbatimOk: false, reviewState: "kept" },
  ]);
  assert.equal(r.ok, false);
  assert.match(r.reason!, /forrás/i);
});

test("canApprove refuses while any concept is still pending review", () => {
  const r = canApprove([
    { id: "a", examWeight: "core", verbatimOk: true, reviewState: "pending" },
  ]);
  assert.equal(r.ok, false);
});

test("canApprove allows a map whose core concepts are quoted and reviewed", () => {
  const r = canApprove([
    { id: "a", examWeight: "core", verbatimOk: true, reviewState: "kept" },
    { id: "b", examWeight: "supporting", verbatimOk: true, reviewState: "edited" },
    // A rejected concept is a decision, not an obstacle.
    { id: "c", examWeight: "extra", verbatimOk: false, reviewState: "rejected" },
  ]);
  assert.equal(r.ok, true);
});

test("canApprove refuses an empty map", () => {
  assert.equal(canApprove([]).ok, false);
});
