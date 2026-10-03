import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { arithmeticSourceCorrections, correctionNotes, correctionPromptLines, mergeCorrections, normalizeSignedParens, sourceArithmeticClaim, type SourceCorrection } from "../server/studio/source-corrections";
import { buildBankVerifierPrompt, verifierContext } from "../server/studio/bank-verifier";
import { buildAuthorPrompt, buildLektorPrompt, buildPedagoguePrompt } from "../server/studio/step-io";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-10-03-forras-aritmetika-helyesbites — mért eset: map 6701ee87 (lefotózott munkalap, 7 hamis egyenlőség). */
const LIVE_MAP = [
  ["c1", "9-(+6)", "9-(+6)=+3 ✓"], ["c2", "9-(-6)", "9-(-6)=+3"], ["c3", "-8-6", "-8-6=-14 ✓"], ["c4", "-8-(+6)", "-8-(+6)=-2"],
  ["c5", "-8-(-6)", "-8-(-6)=-14"], ["c6", "-2-8", "-2-8=-+6"], ["c7", "-2-(-8)", "-2-(-8)=+10"], ["c8", "-2-(+8)", "-2-(+8)=+6"],
  ["c9", "5+(+8)", "5+(+8)=+13"], ["c10", "-5+(-8)", "-5+(-8)=-13 ✓"], ["c11", "-5-(+8)", "-5-(+8)=+3 ✓"], ["c12", "-5-(-8)", "-5-(-8)=+3"],
  ["c13", "Számegyenes jelölései", "-5   -2   0   1   3"],
] as const;
const concepts = LIVE_MAP.map(([localId, term, quote]) => ({ localId, term, quote, definition: `A forrás szerint ${term} eredménye a sor szerint.`, examWeight: "core" as const }));

test("EARS 1: az élő térkép 13 idézetéből pontosan a 7 hamis sor kap helyesbítést, a kiszámolt értékkel", () => {
  const fixes = arithmeticSourceCorrections(concepts);
  assert.deepEqual(fixes.map((f) => f.localId), ["c2", "c4", "c5", "c6", "c7", "c8", "c11"]);
  const expected: Record<string, string> = { c2: "15", c4: "-14", c5: "-2", c6: "-10", c7: "6", c8: "-10", c11: "-13" };
  for (const f of fixes) {
    assert.equal(f.basis, "arithmetic");
    assert.match(f.definition!, new RegExp(`^A helyes eredmény: .+ = ${expected[f.localId]}\\. A forrás átirata „`), f.localId);
    assert.ok(f.definition!.includes("hamis"), "a definíció megnevezi, hogy a forrás sora hamis");
    assert.equal(f.term, undefined, "a term (a kifejezés) és a quote változatlan");
    assert.equal(f.from.definition, `A forrás szerint ${LIVE_MAP.find(([id]) => id === f.localId)![1]} eredménye a sor szerint.`);
  }
});

test("edge: előjeles zárójel, vezető plusz az eredményen, pipa, olvashatatlan eredmény, lánc, nem előjeles zárójel", () => {
  assert.equal(normalizeSignedParens("9-(-6)"), "9+ 6");
  assert.equal(normalizeSignedParens("(−5)-(+8)"), "-5- 8");
  assert.equal(sourceArithmeticClaim("-5-(+8)=+3 ✓")?.expected, -13, "a pipa nem bizonyíték");
  assert.equal(sourceArithmeticClaim("-5-(-8)=+3"), null, "helyes sor: nincs állítás");
  assert.deepEqual(sourceArithmeticClaim("-2-8=-+6"), { expression: "-2-8", written: "-+6", expected: -10 }, "olvashatatlan eredmény → kiszámolt érték");
  assert.equal(sourceArithmeticClaim("40 – 18 + 4 = 22 + 4 = 26"), null, "helyes lánc");
  assert.equal(sourceArithmeticClaim("40 – 18 + 4 = 22 + 4 = 27")?.expected, 26, "a lánc utolsó tagja hamis");
  assert.equal(sourceArithmeticClaim("(500 + 480) : 2 = 490"), null, "nem előjeles zárójel: nem állítunk semmit");
  assert.equal(sourceArithmeticClaim("A kódex = kézzel írt könyv"), null, "szöveges sor nem egyenlőség");
  assert.equal(sourceArithmeticClaim("-5   -2   0   1   3"), null);
  assert.equal(sourceArithmeticClaim(null), null);
});

test("idempotens és a determinisztikus nyer a modell-javaslattal szemben", () => {
  const first = arithmeticSourceCorrections(concepts);
  const applied = concepts.map((c) => { const f = first.find((x) => x.localId === c.localId); return f ? { ...c, definition: f.definition! } : c; });
  assert.deepEqual(arithmeticSourceCorrections(applied), [], "a már helyesbített térképen nincs új audit");
  const model: SourceCorrection[] = [{ localId: "c2", basis: "transcription", reason: "x", definition: "más", from: { definition: "" } }, { localId: "c13", basis: "owner", reason: "y", term: "Számegyenes", from: { term: "Számegyenes jelölései" } }];
  const merged = mergeCorrections(first, model);
  assert.equal(merged.filter((c) => c.localId === "c2").length, 1);
  assert.equal(merged.find((c) => c.localId === "c2")!.basis, "arithmetic");
  assert.ok(merged.some((c) => c.localId === "c13" && c.basis === "owner"));
});

test("EARS 2: a tervező/szerző/lektor prompt-sorok és a bank-ellenőr prompt tartalmazza a helyesbítést", () => {
  const fixes = arithmeticSourceCorrections(concepts);
  const lines = correctionPromptLines(fixes).join("\n");
  assert.match(lines, /c2 \[hamis egyenlőség a forrásban\]: helyesbítés \(számolás\)/);
  assert.match(lines, /TILOS eredményként tanítani/);
  const map = { title: "Negatív számok kivonása", subject: "Matematika", classroom: 5, concepts: concepts.map((c) => ({ ...c, definition: fixes.find((f) => f.localId === c.localId)?.definition ?? c.definition })) };
  const owner = { corrections: fixes };
  for (const prompt of [buildPedagoguePrompt(map, undefined, owner), buildLektorPrompt(standardFusionFixture(), map, [], owner)]) {
    assert.ok(prompt.includes("hamis egyenlőség a forrásban"), "a szerep megkapja a helyesbítést");
    assert.ok(prompt.includes("9-(-6) = 15"));
  }
  assert.ok(buildAuthorPrompt(map.concepts.map((c) => ({ heading: c.term, conceptIds: [c.localId], plannedBlocks: ["explain"] })) as never, map as never, [], undefined, owner).includes("9-(-6) = 15"));
  // bank-ellenőr: az idézet mellett a helyesbítés a mérce
  const notes = correctionNotes(fixes);
  const vconcepts = map.concepts.map((c) => ({ localId: c.localId, term: c.term, quote: c.quote, ...(notes.has(c.localId) ? { correction: notes.get(c.localId) } : {}) }));
  const lesson = { title: "T", classroom: 5, sections: [{ heading: "H", blocks: [] }] } as never;
  const chunk = { sectionIndex: 0, items: [{ path: "experience.quiz[0]", conceptIds: ["c2", "c1"], hash: "h", view: {} }] } as never;
  const prompt = buildBankVerifierPrompt(chunk, undefined, lesson, vconcepts);
  assert.match(prompt, /c2 \(9-\(-6\)\): „9-\(-6\)=\+3”\n {2}⚠ HELYESBÍTVE .*hamis egyenlőség a forrásban — A helyes eredmény: 9-\(-6\) = 15/);
  assert.ok(!/c1 \(9-\(\+6\)\): „9-\(\+6\)=\+3 ✓”\n {2}⚠/.test(prompt), "a helyes sor nem kap jelölést");
  assert.match(prompt, /a HELYESBÍTVE jelölt sornál a helyesbítés/);
  // a „cleared”-kulcs a helyesbítéstől is függ
  const plain = map.concepts.map((c) => ({ localId: c.localId, quote: c.quote }));
  assert.notEqual(verifierContext(lesson, undefined, vconcepts, "v")(0), verifierContext(lesson, undefined, plain, "v")(0));
});

test("forrás-ellenőrzés: a lecke-indítás kérés és fotó nélkül is lefuttatja az aritmetikai helyesbítést; a javítási út is", () => {
  const routes = readFileSync(new URL("../server/studio/lesson-pipeline-routes.ts", import.meta.url), "utf8");
  const fn = routes.slice(routes.indexOf("export async function correctMapFromOwner("));
  assert.ok(!/^\s*if \(!instruction && !transcript\) return \[\];/m.test(fn.slice(0, 400)), "nincs korai visszatérés az aritmetikai kör előtt");
  assert.ok(fn.includes("arithmeticSourceCorrections(concepts)") && fn.includes("mergeCorrections(arithmetic, result.corrections)"));
  assert.ok(routes.includes('const corrections = await correctMapFromOwner(req.params.mapId, undefined, false);'), "a térképről (újra)indított lecke is helyesbített");
  const improve = readFileSync(new URL("../server/studio/structured-improvement.ts", import.meta.url), "utf8");
  assert.ok(improve.includes("mergeCorrections(arithmeticSourceCorrections(source.concepts), proposal.corrections)"));
  const runner = readFileSync(new URL("../server/studio/step-runner.ts", import.meta.url), "utf8");
  assert.equal((runner.match(/verifierConceptsOf\(map, job\)/g) ?? []).length, 3, "bank-ellenőr indítás + két cleared-kontextus");
});
