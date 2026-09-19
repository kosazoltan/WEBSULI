import test from "node:test";
import assert from "node:assert/strict";
import { buildPedagoguePrompt, outlineSchema, OUTLINE_MAX_SECTIONS } from "../server/studio/step-io";
import type { MapConcept } from "../server/studio/coverage";

/* Spec 2026-09-19 §5 — the planner prompt is fenced (no hallucination, no wasted rounds) and the schema enforces it. */

const MAP: MapConcept[] = [
  { localId: "c1", term: "Szorzás", definition: "Ismételt összeadás.", quote: "A szorzás ismételt összeadás.", examWeight: "core" } as MapConcept,
  { localId: "c2", term: "Zárójel", definition: "Elsőbbséget ad.", quote: "A zárójelben lévő műveletet végezzük el először.", examWeight: "supporting" } as MapConcept,
];

const section = (i: number, heading = `Fejezet ${i}`) => ({ heading, conceptIds: ["c1"], plannedBlocks: ["explain", "check"], animationSuggestions: [] });

test("a pedagógus prompt kimondja a tilalmakat és a JSON-alakot", () => {
  const prompt = buildPedagoguePrompt({ title: "T", subject: "matematika", classroom: 5, concepts: MAP });
  assert.match(prompt, /TILALMAK/);
  assert.match(prompt, /Kizárólag a lenti térképen szereplő fogalom-azonosítókat/);
  assert.match(prompt, new RegExp(`Legfeljebb ${OUTLINE_MAX_SECTIONS} fejezet`));
  assert.match(prompt, /fejezetcímek egyediek/);
  assert.match(prompt, /nem találod ki, nem egészíted ki és nem „javítod”/);
  assert.match(prompt, /Semmi próza/);
  assert.match(prompt, /explain → example lépésekkel → check/);
  assert.match(prompt, /"sections": \[\{ "heading": string, "conceptIds": string\[\], "plannedBlocks": string\[\], "animationSuggestions": string\[\] \}\]/);
  assert.match(prompt, /CÉL-TANANYAG MINTA/, "a cél-minta megmarad");
});

test("outlineSchema: 13 fejezet elutasítva, 12 elfogadva", () => {
  const twelve = { sections: Array.from({ length: 12 }, (_, i) => section(i)), misconceptions: [] };
  assert.equal(outlineSchema.safeParse(twelve).success, true);
  const thirteen = { sections: Array.from({ length: 13 }, (_, i) => section(i)), misconceptions: [] };
  const parsed = outlineSchema.safeParse(thirteen);
  assert.equal(parsed.success, false);
  assert.match(JSON.stringify(parsed.success ? null : parsed.error.issues), /Legfeljebb 12 fejezet/);
});

test("outlineSchema: ismétlődő fejezetcím (kis-nagybetű, szóköz eltéréssel is) elutasítva", () => {
  const parsed = outlineSchema.safeParse({ sections: [section(0, "Szorzás"), section(1, "  szorzás ")], misconceptions: [] });
  assert.equal(parsed.success, false);
  assert.match(JSON.stringify(parsed.success ? null : parsed.error.issues), /nem ismétlődhetnek/);
});
