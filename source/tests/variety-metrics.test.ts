import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  VARIETY_THRESHOLDS, animKindShares, feedbackOpenerShares, measureVariety, patternShares, samePatternProbability, sectionPattern, sectionSkeleton,
  thresholdReport,
} from "../shared/variety-metrics";
import { varietyGate } from "../server/studio/gates/variety-gate";
import { GATE_REGISTRY } from "../server/studio/gates/types";
import { GATE_MODES } from "../server/studio/gates/config";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (15. szakasz; V25–V28).

type B = { kind: string; animKind?: string; sourceVisualId?: string; correctIndex?: number; feedbackPerOption?: string[] };
const blocks = (letters: string, extra: Partial<Record<number, Partial<B>>> = {}): B[] => [...letters].map((l, i) => ({
  kind: { E: "explain", X: "example", A: "animate", C: "check", T: "try", R: "recap" }[l]!,
  ...(l === "A" ? { animKind: "process" } : {}),
  ...extra[i],
}));
const lesson = (...sections: Array<B[] | { heading: string; blocks: B[] }>) => ({
  sections: sections.map((s, i) => (Array.isArray(s) ? { heading: `Fejezet ${i + 1}`, blocks: s } : s)),
});

const L1 = lesson(blocks("EXACR", { 3: { correctIndex: 0, feedbackPerOption: ["Pontosan.", "Jó próba, de előbb szorzunk.", "Jó próba, de ez a tört."] } }), blocks("EXC"));
const L2 = lesson(blocks("EXACR", { 3: { correctIndex: 0, feedbackPerOption: ["Igen.", "Nézzük meg: a gyökér vizet vesz fel."] } }), blocks("EAXTC"));
const L3 = lesson(blocks("EXCR"));
const L4 = lesson(blocks("EXACR"));

test("V25: a mérőszámok a kézzel számolt értéket adják (4 szintetikus lecke)", () => {
  assert.equal(sectionPattern(L2.sections[1]), "EAXTC");
  assert.equal(sectionSkeleton(L2.sections[1]), "EXC");
  assert.equal(sectionSkeleton({ blocks: blocks("EEEXXACR") }), "EXCR");
  const lessons = [L1, L2, L3, L4];
  // 6 fejezet: EXACR ×3, EXC, EAXTC, EXCR → a leggyakoribb 3/6.
  assert.deepEqual(patternShares(lessons)[0], { pattern: "EXACR", share: 0.5 });
  // Különböző leckéből vett fejezetpárok: 15 − 2 (leckén belüli) = 13; ebből azonos: 3 (az EXACR-ok) → 0,231.
  assert.equal(samePatternProbability(lessons), 0.231);
  // Hibás válasz első két szava: „jó próba” ×2, „nézzük meg” ×1 → 0,667.
  assert.deepEqual(feedbackOpenerShares(lessons)[0], { opener: "jó próba", share: 0.667 });
  const m = measureVariety(lessons);
  assert.equal(m.lessons, 4);
  assert.equal(m.sections, 6);
  assert.equal(m.topPatternShare, 0.5);
  assert.equal(m.tryShare, 0.167);
  assert.deepEqual(animKindShares(lesson(blocks("EAAA", { 2: { animKind: "cycle" }, 3: { sourceVisualId: "v1" } }))), { process: 0.5, cycle: 0.5 });
  const report = thresholdReport(m);
  assert.deepEqual(report.map((r) => [r.metric, r.ok]), [["topPatternShare", false], ["samePatternProbability", false], ["topFeedbackOpenerShare", false], ["tryShare", false]]);
  assert.equal(VARIETY_THRESHOLDS.maxKindShare, 0.4);
});

test("V26: a kapu — készleten kívüli váz bukik a fejezet nevével; készletbeli (ábrával, try-jal, nyitóblokkal) átmegy", () => {
  assert.ok(GATE_REGISTRY.variety, "bejegyezve");
  assert.equal(GATE_MODES.variety, "report");
  const bad = varietyGate({ lesson: lesson(blocks("ECEC"), blocks("ECEC"), blocks("ECECR")), visuals: [] });
  assert.equal(bad.ok, false);
  assert.equal(bad.problems.length, 3);
  assert.match(bad.problems[0], /Fejezet 1/u);
  const good = varietyGate({
    lesson: lesson(
      blocks("EEEAXTC"), // nyitóblokkok + megmutatás
      blocks("EXAATCR"), // gyakorló, két ábrával
      { heading: "A leggyakoribb hibák", blocks: blocks("ECEC") }, // különleges fejezet: nem mérjük
      blocks("EXCER"), // kérdésfelvető
    ),
    visuals: [],
  });
  assert.equal(good.ok, true, good.problems.join(" | "));
  assert.equal(good.metrics.skeletonMisses, 0);
});

test("V27: régi bátorító előtag megszámolva (nem bukás); fajta-arány és try-arány jelzés", () => {
  const r = varietyGate({ lesson: L1, visuals: [] });
  // SK2-v2: a mérés az S5a-v2 megjelenítési szabályát használja (`startsWithLegacyOpener`) — a „Pontosan.” is régi előtag, ezért 3.
  assert.equal(r.metrics.legacyOpeners, 3);
  const kinds = ["process", "process", "process", "process", "process", "cycle", "venn", "barChart", "timeline", "map"];
  const many = lesson(blocks("EXCR".replace("X", "X" + "A".repeat(10)), Object.fromEntries(kinds.map((k, i) => [i + 2, { animKind: k }]))));
  const g = varietyGate({ lesson: many, visuals: [] });
  assert.equal(g.metrics.kindShareOver, 1);
  assert.equal(g.metrics.tryShareBelowMin, 1);
  assert.equal(g.ok, true, "a jelzés nem bukás");
});

test("V28: a mérőszkript — táblázat, kis mintánál 0, küszöbsértésnél 1 kilépési kód", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "variety-"));
  const pop = (n: number) => Array.from({ length: n }, (_, i) => ({ published_at: `2026-11-${String(10 + (i % 15)).padStart(2, "0")}`, json: L4 }));
  writeFileSync(path.join(dir, "small.json"), JSON.stringify(pop(2)));
  writeFileSync(path.join(dir, "big.json"), JSON.stringify(pop(12)));
  const script = path.join(process.cwd(), "scripts", "measure", "variety-measure.mts");
  const baseline = path.join(process.cwd(), "scripts", "measure", "fixtures", "variety-baseline.json");
  const run = (file: string) => {
    try { return { code: 0, out: execFileSync(process.execPath, ["--import", "tsx", script, "--population", path.join(dir, file), "--baseline", baseline], { encoding: "utf8" }) }; }
    catch (e) { const err = e as { status: number; stdout: string }; return { code: err.status, out: err.stdout }; }
  };
  const small = run("small.json");
  assert.equal(small.code, 0);
  assert.match(small.out, /kis minta/u);
  const big = run("big.json");
  assert.equal(big.code, 1, big.out);
  assert.match(big.out, /\| leggyakoribb fejezetminta \| 0,616 \| 1 \| < 0,35 \| NEM \|/u);
});
