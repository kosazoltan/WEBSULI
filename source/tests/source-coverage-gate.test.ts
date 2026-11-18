import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GATE_MODES, gateMode } from "../server/studio/gates/config";
import { SOURCE_COVERAGE_THRESHOLDS, SOURCE_KIND_TARGETS, sourceCoverageGate } from "../server/studio/gates/source-coverage-gate";
import { GATE_REGISTRY, registerGate, runRegisteredGates } from "../server/studio/gates/types";
import { visualCoverage } from "../server/studio/coverage";
import { SOURCE_VISUAL_KINDS, type SkippedSourceVisual, type SourceVisual } from "../shared/source-visuals";
import { faithfulBlock, HM_ADMIN_SKIPS, HM_COUNTS, HM_TODAY, hmInventory, hmLessonFull, hmLessonToday, type HmLesson } from "./fixtures/source-coverage-hm";

/* docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, SK1: determinisztikus forrás-fedettségi kapu a vizuális tételekre. Szkript ítél,
   nem modell: ami a forrásban megvan és a leckében nincs, az hiány, nem 100%. A három alapeset elvárása RÖGZÍTETT (a tesztet nem
   igazítjuk a kódhoz); minden mutációt a kapunak a megnevezett okkal kell megfognia. */

const inventory = hmInventory();
const ADMIN = ["a1", "a2", "a3", "a4", "a5", "a6"];
const blocksOf = (lesson: HmLesson) => lesson.sections[0].blocks;
const blockFor = (lesson: HmLesson, id: string) => blocksOf(lesson).find((b) => b.sourceVisualId === id)!;
/** A (c) eset (minden megjelenik, a 6 adminisztratív tétel érvényesen kihagyva) egy módosítással — a mutációk alapja. */
function mutated(change: (lesson: HmLesson) => void, skipped: SkippedSourceVisual[] = HM_ADMIN_SKIPS) {
  const lesson = hmLessonFull(ADMIN);
  change(lesson);
  return sourceCoverageGate(lesson, inventory, skipped);
}
const drop = (id: string) => (lesson: HmLesson) => { lesson.sections[0].blocks = blocksOf(lesson).filter((b) => b.sourceVisualId !== id); };
const problemOf = (result: ReturnType<typeof sourceCoverageGate>, id: string) => result.problems.find((p) => p.startsWith(`${id} (`)) ?? "";

test("a küszöbök és a megfeleltetés rögzített értékei (a kezdőértékek a tervből)", () => {
  assert.deepEqual(SOURCE_COVERAGE_THRESHOLDS, { must: ["table", "process", "decisionTree", "ruleBox"], mustShare: 1, should: ["pictureCard", "exercise", "diagram"], shouldShare: 0.8, fidelity: 0.8, maxSkipShare: 0.3 });
  assert.deepEqual(SOURCE_KIND_TARGETS.table, { animKinds: ["table"], blockKinds: [] });
  assert.deepEqual(SOURCE_KIND_TARGETS.pictureCard, { animKinds: ["pictureCards"], blockKinds: [] });
  assert.deepEqual(SOURCE_KIND_TARGETS.diagram, { animKinds: "any", blockKinds: [] });
  assert.deepEqual(SOURCE_KIND_TARGETS.exercise, { animKinds: ["pictureCards"], blockKinds: ["example", "try", "check"] });
  // Minden számolt fajta szerepel a megfeleltetésben és pontosan egy küszöbcsoportban; a színkód egyikben sem.
  const counted = SOURCE_VISUAL_KINDS.filter((k) => k !== "colorCode");
  assert.deepEqual(Object.keys(SOURCE_KIND_TARGETS).sort(), [...counted].sort());
  assert.deepEqual([...SOURCE_COVERAGE_THRESHOLDS.must, ...SOURCE_COVERAGE_THRESHOLDS.should].sort(), [...counted].sort());
});

test("a fixtúra a mért minta számait hordozza: 38 számolt tétel (+ színkód); ma 6 teljes, 23 részben, 9 sehogy", () => {
  assert.equal(inventory.filter((v) => v.kind !== "colorCode").length, 38);
  assert.deepEqual(HM_COUNTS, { counted: 38, shownToday: 6, partialToday: 23, absentToday: 9 });
  assert.deepEqual([HM_TODAY.shown.length, HM_TODAY.partial.length, HM_TODAY.absent.length], [6, 23, 9]);
  assert.deepEqual([...HM_TODAY.shown, ...HM_TODAY.partial, ...HM_TODAY.absent].sort(), inventory.filter((v) => v.kind !== "colorCode").map((v) => v.id).sort());
  const count = (kind: SourceVisual["kind"]) => inventory.filter((v) => v.kind === kind).length;
  assert.deepEqual([count("table"), count("decisionTree"), count("pictureCard"), count("ruleBox"), count("exercise"), count("diagram"), count("process"), count("colorCode")], [9, 1, 8, 8, 7, 2, 3, 1]);
});

test("(a) minden tétel hűen megjelenik → a kapu átmegy, 38/38", () => {
  const result = sourceCoverageGate(hmLessonFull(), inventory, []);
  assert.deepEqual([result.gate, result.ok, result.problems, result.missingIds], ["sourceCoverage", true, [], []]);
  assert.deepEqual(result.metrics, { total: 38, skipped: 0, shown: 38, missing: 0, mustTotal: 21, mustShown: 21, shouldTotal: 17, shouldShown: 17, invalidSkips: 0, coveragePct: 100 });
  assert.ok(result.items.every((i) => i.state === "shown"));
});

test("(b) ALAPVONAL: a mai éles lecke alakja NEM 100% — 6/38, a kapu bukik, a hiánylista teljes", () => {
  const today = hmLessonToday();
  const result = sourceCoverageGate(today, inventory, []);
  assert.equal(result.ok, false);
  assert.deepEqual([result.metrics.total, result.metrics.shown, result.metrics.missing, result.metrics.coveragePct], [38, 6, 32, 16]);
  assert.notEqual(result.metrics.coveragePct, 100);
  assert.deepEqual(result.items.filter((i) => i.state === "shown").map((i) => i.id).sort(), [...HM_TODAY.shown].sort());
  assert.deepEqual([...result.missingIds].sort(), [...HM_TODAY.partial, ...HM_TODAY.absent].sort(), "a 23 részben és a 9 sehogy megjelent tétel mind hiány");
  // 0 táblázat táblaként, a fa lineárisan, 0 kártya — megnevezett okkal.
  assert.deepEqual([result.metrics.mustTotal, result.metrics.mustShown, result.metrics.shouldTotal, result.metrics.shouldShown], [21, 3, 17, 3]);
  assert.match(problemOf(result, "t1"), /a hivatkozó blokk fajtája \(animate\/illustration\) nem illik a tételhez \(table → animate\/table\)/);
  assert.match(problemOf(result, "t2"), /nincs rá hivatkozó blokk/);
  assert.match(problemOf(result, "d1"), /fajtája \(animate\/process\) nem illik a tételhez \(decisionTree → animate\/decisionTree\)/);
  assert.match(problemOf(result, "e3"), /a tartalom hűsége 60% \(3\/5 szöveg\), a minimum 80%/);
  assert.match(problemOf(result, "g2"), /a tartalom hűsége 13% \(1\/8 szöveg\)/);
  // A puszta hivatkozást számoló fedettség (S1b) sem 100%: 10 hivatkozott tétel a 38-ból.
  assert.deepEqual([visualCoverage(today, inventory).total, visualCoverage(today, inventory).shown], [38, 10]);
  // Ellenpróba: a régi, csak fogalmat számoló mérce itt 100%-ot mutatott — a kapu a szövegként feloldott táblázatot sem fogadja el.
  assert.ok(JSON.stringify(today).includes("darab 2-1"), "a 2. táblázat szava ott van a folyó szövegben, mégis hiány");
});

test("(c) a 6 adminisztratív / kulcs-tétel érvényes okkal kihagyva, a többi megjelenik → a kapu átmegy", () => {
  const result = sourceCoverageGate(hmLessonFull(ADMIN), inventory, HM_ADMIN_SKIPS);
  assert.deepEqual([result.ok, result.problems, result.missingIds], [true, [], []]);
  assert.deepEqual([result.metrics.total, result.metrics.skipped, result.metrics.shown, result.metrics.invalidSkips, result.metrics.coveragePct], [38, 6, 32, 0, 100]);
  assert.deepEqual(result.items.filter((i) => i.state === "skipped").map((i) => i.id), ADMIN);
  // Ellenpróba: ugyanez a lecke kihagyás-jelölés NÉLKÜL bukik (a 3 adminisztratív doboz `must` fajta).
  const unmarked = sourceCoverageGate(hmLessonFull(ADMIN), inventory, []);
  assert.equal(unmarked.ok, false);
  assert.deepEqual(unmarked.missingIds, ADMIN);
});

test("mutációk — megjelenés: hiányzó táblázat, hiányzó folyamat, átnevezett tétel, rossz fajta, csonka tartalom, kevesebb levél", () => {
  // 1. Egy táblázat hivatkozás nélkül (a blokk megvan, a sourceVisualId hiányzik).
  const noRef = mutated((l) => { delete blockFor(l, "t3").sourceVisualId; });
  assert.deepEqual([noRef.ok, noRef.missingIds], [false, ["t3"]]);
  assert.match(problemOf(noRef, "t3"), /^t3 \(table\): nincs rá hivatkozó blokk \(sourceVisualId\)$/);
  // 2. Hiányzó táblázat és hiányzó folyamat (a blokk sincs meg).
  assert.deepEqual(mutated(drop("t7")).missingIds, ["t7"]);
  const noProcess = mutated(drop("s2"));
  assert.deepEqual([noProcess.ok, noProcess.missingIds], [false, ["s2"]]);
  assert.match(problemOf(noProcess, "s2"), /^s2 \(process\): nincs rá hivatkozó blokk/);
  // 3. Átnevezett tétel: a blokk más azonosítóra hivatkozik.
  for (const renamed of ["t4x", "T4", "t4 ", "t40"]) {
    const result = mutated((l) => { blockFor(l, "t4").sourceVisualId = renamed; });
    assert.deepEqual([result.ok, result.missingIds], [false, ["t4"]], renamed);
  }
  // 4. Táblázat `process` blokként.
  const wrongKind = mutated((l) => { const b = blockFor(l, "t5"); b.animKind = "process"; b.params = { steps: (b.params as { rows: string[][] }).rows.flat() }; });
  assert.equal(wrongKind.ok, false);
  assert.match(problemOf(wrongKind, "t5"), /fajtája \(animate\/process\) nem illik a tételhez \(table → animate\/table\)/);
  // 5. Táblázat a sorok 50%-ával.
  const half = mutated((l) => { const p = blockFor(l, "t6").params as { rows: string[][] }; p.rows = p.rows.slice(0, 2); });
  assert.equal(half.ok, false);
  assert.match(problemOf(half, "t6"), /a tartalom hűsége 60% \(6\/10 szöveg\), a minimum 80%/);
  // 6. Döntési fa egy levéllel kevesebb (a szöveg megvan, az elágazás nincs).
  const fewerLeaves = mutated((l) => {
    const root = (blockFor(l, "d1").params as { root: { text: string; branches: Array<{ label: string; node: { text: string; branches?: unknown[] } }> } }).root;
    const inner = root.branches[0].node;
    inner.text = `${inner.text} — igen: kérdőszó: darabra; nem: előbb tedd többes számba`;
    delete inner.branches;
  });
  assert.equal(fewerLeaves.ok, false);
  assert.match(problemOf(fewerLeaves, "d1"), /a döntési fa levelei: 2 a leckében, 3 a forrásban/);
  // 7. Ellenpróbák (nem bukhat): a hűség határán (10-ből 8 szöveg) a táblázat megjelent; ékezet, kisbetű és szóköz nem számít.
  const edge = mutated((l) => { const p = blockFor(l, "t8").params as { rows: string[][] }; p.rows = p.rows.slice(0, 3); });
  assert.deepEqual([edge.ok, edge.missingIds], [true, []], "8/10 = 80% még megjelent");
  const folded = mutated((l) => { const b = blockFor(l, "s1"); b.params = { steps: ["LEPES  1-1", "Lépés\n1-2", "lépés 1-3"] }; });
  assert.equal(folded.ok, true);
});

test("mutációk — kihagyás: zárt oklista, tanított fogalom, nem létező pár, 30% fölötti arány, decorative táblázatra", () => {
  const withSkip = (extra: SkippedSourceVisual[], change: (l: HmLesson) => void = () => undefined) => mutated(change, [...HM_ADMIN_SKIPS, ...extra]);
  // 1. Tanított fogalmú táblázat admin_meta okkal kihagyva.
  const taught = withSkip([{ id: "t1", reason: "admin_meta" }], drop("t1"));
  assert.deepEqual([taught.ok, taught.missingIds], [false, ["t1"]]);
  assert.match(problemOf(taught, "t1"), /érvénytelen kihagyás \(admin_meta\): tanított fogalomra hivatkozó tétel csak duplicate okkal hagyható ki/);
  // 2. duplicate nem létező párral, önmagára mutató és meg nem jelent párral.
  for (const [of, why] of [["nincs-ilyen", /a duplicateOf nem egy másik, létező tételre mutat/], ["t2", /a duplicateOf nem egy másik, létező tételre mutat/], [undefined, /a duplicateOf nem egy másik, létező tételre mutat/]] as const) {
    const result = withSkip([{ id: "t2", reason: "duplicate", ...(of ? { duplicateOf: of } : {}) }], drop("t2"));
    assert.equal(result.ok, false, String(of));
    assert.match(problemOf(result, "t2"), why);
  }
  const pairMissing = withSkip([{ id: "t2", reason: "duplicate", duplicateOf: "t3" }], (l) => { drop("t2")(l); drop("t3")(l); });
  assert.match(problemOf(pairMissing, "t2"), /a duplicateOf tétel \(t3\) nem jelent meg/);
  // Ellenpróba: érvényes ismétlés (a pár megjelent) → átmegy.
  const validDup = withSkip([{ id: "t2", reason: "duplicate", duplicateOf: "t3" }], drop("t2"));
  assert.deepEqual([validDup.ok, validDup.metrics.skipped], [true, 7]);
  // 3. A kihagyások 40%-a (16 a 38-ból): a 30%-os keret (11) fölötti rész a lista végéről érvénytelen.
  const many = [...HM_ADMIN_SKIPS, ...["t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "r2", "r3"].map((id) => ({ id, reason: "duplicate", duplicateOf: id.startsWith("t") ? "t1" : "r1" }))];
  assert.equal(many.length, 16);
  const overCap = mutated((l) => { for (const s of many.slice(6)) drop(s.id)(l); }, many);
  assert.equal(overCap.ok, false);
  assert.deepEqual([overCap.metrics.skipped, overCap.missingIds], [11, ["t7", "t8", "t9", "r2", "r3"]]);
  assert.match(problemOf(overCap, "t7"), /a kihagyások meghaladják a tételek 30%-át \(legfeljebb 11 a\(z\) 38 tételből\)/);
  // Ellenpróba: pontosan 11 kihagyás még érvényes.
  const atCap = mutated((l) => { for (const s of many.slice(6, 11)) drop(s.id)(l); }, many.slice(0, 11));
  assert.deepEqual([atCap.ok, atCap.metrics.skipped], [true, 11]);
  // 4. decorative ok táblázatra (fogalom-hivatkozás nélküli táblázatnál is érvénytelen) és fogalmas képes kártyára.
  const bareTable = inventory.map((v) => (v.id === "t9" ? { ...v, conceptIds: [] } : v));
  const decorTable = sourceCoverageGate((() => { const l = hmLessonFull(ADMIN); drop("t9")(l); return l; })(), bareTable, [...HM_ADMIN_SKIPS, { id: "t9", reason: "decorative" }]);
  assert.equal(decorTable.ok, false);
  assert.match(problemOf(decorTable, "t9"), /érvénytelen kihagyás \(decorative\): decorative ok csak diagram \/ pictureCard tételnél adható \(ez table\)/);
  const decorCard = withSkip([{ id: "p1", reason: "decorative" }], (l) => { drop("p1")(l); drop("p2")(l); drop("p3")(l); });
  assert.equal(decorCard.ok, false, "a fogalmas kártya nem díszítő — a 3 hiányzó kártya a megengedett 2 fölött van");
  assert.equal(decorCard.metrics.invalidSkips, 1);
  // 5. Ismeretlen ok és nem létező tétel kihagyása.
  const unknownReason = withSkip([{ id: "r1", reason: "nem fért bele" }], drop("r1"));
  assert.match(problemOf(unknownReason, "r1"), /érvénytelen kihagyás \(nem fért bele\): az ok nem a zárt listából való/);
  const ghost = withSkip([{ id: "nincs", reason: "admin_meta" }, { id: "szin", reason: "decorative" }]);
  assert.deepEqual([ghost.ok, ghost.metrics.invalidSkips, ghost.metrics.skipped], [true, 2, 6], "a nem létező / nem számolt tétel kihagyása nem ront és nem javít");
});

test("a „legalább 80%” csoport: 14 tételből 2 hiányozhat, 3 már bukás; a színkód nem számít; leltár nélkül 0 / 0", () => {
  const two = mutated((l) => { drop("p1")(l); drop("e2")(l); });
  assert.deepEqual([two.ok, two.problems, two.missingIds, two.metrics.shouldTotal, two.metrics.shouldShown], [true, [], ["p1", "e2"], 14, 12]);
  assert.equal(two.metrics.coveragePct, 94, "a megengedett hiány mellett sem 100%");
  const three = mutated((l) => { drop("p1")(l); drop("e2")(l); drop("g1")(l); });
  assert.equal(three.ok, false);
  assert.match(three.problems[0], /11\/14 jelent meg, a minimum 80% \(legfeljebb 2 hiányozhat\)/);
  assert.deepEqual(three.missingIds, ["p1", "e2", "g1"]);
  // A színkód sem a számlálóban, sem a hiányban nincs; csak színkódból álló leltár → 0 / 0, átmegy.
  const onlyColor = sourceCoverageGate({ sections: [] }, inventory.filter((v) => v.kind === "colorCode"), []);
  assert.deepEqual([onlyColor.ok, onlyColor.metrics.total, onlyColor.missingIds], [true, 0, []]);
  const none = sourceCoverageGate(hmLessonFull(), [], []);
  assert.deepEqual([none.ok, none.metrics.total, none.metrics.coveragePct, none.problems], [true, 0, 100, []]);
  assert.deepEqual(sourceCoverageGate(hmLessonFull()).metrics.total, 0, "alapértékekkel is");
});

test("a megfeleltetés: feladat example / try / check / pictureCards blokként; ábra bármely animate fajtával; hibás alakú bemenet nem dob", () => {
  const exercise = inventory.find((v) => v.id === "e1")!;
  const diagram = inventory.find((v) => v.id === "g1")!;
  const only = (visual: SourceVisual, block: Record<string, unknown>) => sourceCoverageGate({ sections: [{ blocks: [block] }] }, [visual], []);
  const texts = { instruction: "Nézd meg a 1. képet, és kérdezz!", items: [1, 2, 3, 4].map((i) => `feladattétel 1-${i}`) };
  for (const block of [
    { kind: "example", problem: texts.instruction, steps: texts.items, answer: "kész" },
    { kind: "try", tryKind: "match", spec: texts },
    { kind: "check", question: texts.instruction, options: texts.items, correctIndex: 0, feedbackPerOption: texts.items },
    { kind: "animate", animKind: "pictureCards", params: { cards: texts.items.map((label) => ({ label })) }, caption: texts.instruction },
  ]) assert.equal(only(exercise, { ...block, sourceVisualId: "e1" }).metrics.shown, 1, String(block.kind));
  // Mutáció: a feladat `explain` vagy `recap` blokként, illetve más ábrafajtával NEM megjelenés.
  for (const block of [{ kind: "explain", text: JSON.stringify(texts) }, { kind: "recap", bullets: texts.items }, { kind: "animate", animKind: "barChart", params: texts, caption: texts.instruction }]) {
    assert.equal(only(exercise, { ...block, sourceVisualId: "e1" }).metrics.shown, 0, JSON.stringify(block.kind));
  }
  for (const animKind of ["illustration", "labeledShape", "cycle", "jovoFajta"]) {
    assert.equal(only(diagram, { ...faithfulBlock(diagram), animKind }).metrics.shown, 1, animKind);
  }
  // Több hivatkozó blokk közül a legjobb dönt: egy rossz fajtájú mellett a jó megjelenít.
  const table = inventory.find((v) => v.id === "t1")!;
  const both = sourceCoverageGate({ sections: [{ blocks: [{ ...faithfulBlock(table), animKind: "process" }] }, { blocks: [faithfulBlock(table)] }] }, [table], []);
  assert.equal(both.ok, true);
  // Hibás alakú lecke, blokk, kihagyás: nincs kivétel, a tétel hiányzik.
  const hostile = { sections: [null, { blocks: [null, "szöveg", 7, { sourceVisualId: 5 }, { sourceVisualId: "t1" }, { kind: "animate", animKind: "table", sourceVisualId: "t1", params: null }] }, { blocks: "nem tömb" }] };
  const safe = sourceCoverageGate(hostile as never, [table], [null, "x", { id: 3 }, { id: "t1" }] as never);
  assert.deepEqual([safe.ok, safe.missingIds], [false, ["t1"]]);
  assert.deepEqual(sourceCoverageGate(null as never, [table], null as never).missingIds, ["t1"]);
});

test("determinisztikus: ugyanarra a bemenetre bájtra ugyanaz a kimenet; a bemenet nem módosul", () => {
  const lesson = hmLessonToday();
  const before = JSON.stringify([lesson, inventory, HM_ADMIN_SKIPS]);
  const a = JSON.stringify(sourceCoverageGate(lesson, inventory, HM_ADMIN_SKIPS));
  assert.equal(JSON.stringify(sourceCoverageGate(lesson, inventory, HM_ADMIN_SKIPS)), a);
  assert.equal(JSON.stringify([lesson, inventory, HM_ADMIN_SKIPS]), before);
});

test("üzemmód és bejegyzés: a kapu `report` módban érkezik; a jegyzék név szerint futtat", () => {
  assert.deepEqual(GATE_MODES, { sourceCoverage: "report" }, "az `enforce`-ot az S3b utolsó lépése kapcsolja be");
  assert.equal(gateMode("sourceCoverage"), "report");
  assert.equal(gateMode("sourceCoverage", { sourceCoverage: "enforce" }), "enforce");
  assert.equal(gateMode("sourceCoverage", { sourceCoverage: "off" }), "off");
  assert.equal(gateMode("sourceCoverage", { sourceCoverage: "szigorú" as never }), "report", "érvénytelen felülírásnál az alapérték marad");
  assert.deepEqual(Object.keys(GATE_REGISTRY), ["sourceCoverage"]);
  const [result] = runRegisteredGates({ lesson: hmLessonToday(), visuals: inventory });
  assert.deepEqual([result.gate, result.ok, result.metrics.shown], ["sourceCoverage", false, 6]);
  assert.throws(() => registerGate("sourceCoverage", () => ({ gate: "x", ok: true, problems: [], metrics: {} })), /már be van jegyezve/);
});

test("parancssori futtató: fájlokon futtatja a bejegyzett kapukat; bukásnál nem nulla a kilépési kód", () => {
  const dir = mkdtempSync(join(tmpdir(), "websuli-gates-"));
  try {
    const write = (name: string, data: unknown) => { const path = join(dir, name); writeFileSync(path, JSON.stringify(data)); return path; };
    const map = write("map.json", { sourceFiles: [{ name: "minta.pdf", kind: "pdf", visuals: inventory }] });
    const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/gates/run-gates.mts", ...args], { encoding: "utf8", timeout: 120_000 });
    // A mai alak bukik (kilépési kód 1), a kimenet gépi JSON a hiányzó azonosítókkal.
    const failing = run("--lesson", write("today.json", hmLessonToday()), "--map", map);
    assert.equal(failing.status, 1, failing.stderr);
    const out = JSON.parse(failing.stdout) as { ok: boolean; visuals: number; results: Array<{ gate: string; ok: boolean; metrics: Record<string, number>; missingIds: string[] }> };
    assert.deepEqual([out.ok, out.visuals, out.results[0].gate, out.results[0].metrics.shown, out.results[0].missingIds.length], [false, 39, "sourceCoverage", 6, 32]);
    // Job-kimenet alak ({ lesson, outline.skippedVisuals }) + { visuals } térkép: a (c) eset átmegy (kilépési kód 0).
    const passing = run("--lesson", write("job.json", { lesson: hmLessonFull(ADMIN), outline: { skippedVisuals: HM_ADMIN_SKIPS } }), "--map", write("visuals.json", { visuals: inventory }));
    assert.equal(passing.status, 0, passing.stderr + passing.stdout);
    assert.equal((JSON.parse(passing.stdout) as { ok: boolean }).ok, true);
    // Hiányzó paraméter: kilépési kód 2, használati üzenet.
    const usage = run("--lesson", join(dir, "today.json"));
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /Hiányzó --lesson vagy --map/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
