import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GATE_MODES, gateMode } from "../server/studio/gates/config";
import { RENDER_KINDS_IN_TARGETS, skipCapOf, SOURCE_COVERAGE_THRESHOLDS, SOURCE_KIND_TARGETS, SOURCE_SKIP_REASONS_BY_KIND, sourceCoverageGate } from "../server/studio/gates/source-coverage-gate";
import { GATE_REGISTRY, registerGate, runRegisteredGates } from "../server/studio/gates/types";
import { visualCoverage } from "../server/studio/coverage";
import { sanitizeSourceVisuals, SOURCE_VISUAL_KINDS, sourceVisualSchema, type SkippedSourceVisual, type SourceVisual } from "../shared/source-visuals";
import { compareCardsAsTable, normalizeVisualText, readDecisionTreeParams, readTableParams, SOURCE_RENDER_KINDS } from "../shared/source-visual-render";
import { faithfulBlock, faithfulBlocks, HM_ADMIN_SKIPS, HM_BASELINE, hmInventory, hmLessonFull, hmLessonToday, type HmLesson } from "./fixtures/source-coverage-hm";

/* docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, SK1 (+ SK1b: a független review F1–F6, F9, F10, F12 leletei): determinisztikus
   forrás-fedettségi kapu a vizuális tételekre. Szkript ítél, nem modell: ami a forrásban megvan és a leckében nincs, az hiány, nem
   100%. A hűség SZERKEZET szerint mér — az ellenőr kijátszó és hamisan buktató bemenetei itt rögzített tesztek. */

const inventory = hmInventory();
const ADMIN = ["a1", "a2", "a3", "a4", "a5", "a6"];
const blocksOf = (lesson: HmLesson) => lesson.sections[0].blocks;
const blockFor = (lesson: HmLesson, id: string) => blocksOf(lesson).find((b) => b.sourceVisualId === id)!;
/** Minden megjelenik, a 6 adminisztratív tétel érvényesen kihagyva — egy módosítással: a mutációk alapja. */
function mutated(change: (lesson: HmLesson) => void, skipped: SkippedSourceVisual[] = HM_ADMIN_SKIPS) {
  const lesson = hmLessonFull(ADMIN);
  change(lesson);
  return sourceCoverageGate(lesson, inventory, skipped);
}
const drop = (id: string) => (lesson: HmLesson) => { lesson.sections[0].blocks = blocksOf(lesson).filter((b) => b.sourceVisualId !== id); };
const problemOf = (result: ReturnType<typeof sourceCoverageGate>, id: string) => result.problems.find((p) => p.startsWith(`${id} (`)) ?? "";

/** Az ellenőr próbáinak alakja: egy tétel, a rá hivatkozó blokkok — az ítélet és a hiány oka. */
const V = (item: Record<string, unknown>): SourceVisual => sourceVisualSchema.parse({ sourceFile: "a.pdf", page: 1, role: "r", conceptIds: [], ...item });
const A = (animKind: string, params: unknown, id: string, caption = "Felirat") => ({ kind: "animate", animKind, params, caption, coversConceptIds: ["c"], sourceVisualId: id });
function probe(visual: SourceVisual, blocks: object[], skipped: SkippedSourceVisual[] = []) {
  const result = sourceCoverageGate({ sections: [{ blocks }] }, [visual], skipped);
  return { shown: result.metrics.shown === 1, why: result.items[0].reason ?? "" };
}
const NBSP = String.fromCharCode(160);

test("a küszöbök, a megfeleltetés és a kihagyási okok rögzített értékei", () => {
  assert.deepEqual(SOURCE_COVERAGE_THRESHOLDS, { must: ["table", "process", "decisionTree", "ruleBox"], mustShare: 1, should: ["pictureCard", "exercise", "diagram"], shouldShare: 0.8, fidelity: 0.8, maxSkipShare: 0.3, minSkips: 1 });
  assert.deepEqual(SOURCE_KIND_TARGETS.table, { animKinds: ["table", "compareCards"], blockKinds: [] });
  assert.deepEqual(SOURCE_KIND_TARGETS.pictureCard, { animKinds: ["pictureCards"], blockKinds: [] });
  assert.deepEqual(SOURCE_KIND_TARGETS.diagram, { animKinds: "any", blockKinds: [] });
  assert.deepEqual(SOURCE_KIND_TARGETS.exercise, { animKinds: ["pictureCards"], blockKinds: ["example", "try", "check"] });
  const counted = SOURCE_VISUAL_KINDS.filter((k) => k !== "colorCode");
  assert.deepEqual(Object.keys(SOURCE_KIND_TARGETS).sort(), [...counted].sort());
  // D1H-2: a `photo` mért, de nem must / should fajta — a kivágás elmaradása (pl. PDF-forrás a D1H-3 előtt) nem bukás.
  assert.deepEqual(SOURCE_KIND_TARGETS.photo, { animKinds: ["sourceImage"], blockKinds: [] });
  assert.deepEqual([...SOURCE_COVERAGE_THRESHOLDS.must, ...SOURCE_COVERAGE_THRESHOLDS.should, "photo"].sort(), [...counted].sort());
  // F5: a megjelenítő-szerződés minden fajtája (a compareCards is) szerepel egy megfeleltetésben.
  assert.deepEqual(SOURCE_RENDER_KINDS, ["table", "ruleBox", "compareCards", "decisionTree", "pictureCards"]);
  assert.deepEqual(RENDER_KINDS_IN_TARGETS, [...SOURCE_RENDER_KINDS]);
  // F4: az ok fajtánként megengedett.
  assert.deepEqual(SOURCE_SKIP_REASONS_BY_KIND, {
    table: ["admin_meta", "duplicate"], process: ["admin_meta", "duplicate"], decisionTree: ["admin_meta", "duplicate"], ruleBox: ["admin_meta", "duplicate"],
    exercise: ["admin_meta", "duplicate", "answer_key"], pictureCard: ["admin_meta", "duplicate", "decorative"], diagram: ["admin_meta", "duplicate", "decorative"],
    photo: ["admin_meta", "duplicate", "decorative"] });
});

test("a fixtúra szintetikus: 38 számolt tétel (+ színkód); az emberi megítélés (6 / 23 / 9) és a kapu mércéje (0) külön szám", () => {
  assert.equal(inventory.filter((v) => v.kind !== "colorCode").length, 38);
  assert.deepEqual(HM_BASELINE, { counted: 38, humanFull: 6, humanPartial: 23, humanAbsent: 9, gateShownToday: 0 });
  assert.equal(HM_BASELINE.humanFull + HM_BASELINE.humanPartial + HM_BASELINE.humanAbsent, HM_BASELINE.counted);
  const count = (kind: SourceVisual["kind"]) => inventory.filter((v) => v.kind === kind).length;
  assert.deepEqual([count("table"), count("decisionTree"), count("pictureCard"), count("ruleBox"), count("exercise"), count("diagram"), count("process"), count("colorCode")], [9, 1, 8, 8, 7, 2, 3, 1]);
});

test("minden tétel hűen megjelenik → a kapu átmegy, 38/38", () => {
  const result = sourceCoverageGate(hmLessonFull(), inventory, []);
  assert.deepEqual([result.gate, result.ok, result.problems, result.missingIds], ["sourceCoverage", true, [], []]);
  assert.deepEqual(result.metrics, { total: 38, skipped: 0, shown: 38, missing: 0, mustTotal: 21, mustShown: 21, shouldTotal: 17, shouldShown: 17, invalidSkips: 0, coveragePct: 100 });
  assert.ok(result.items.every((i) => i.state === "shown"));
});

test("ALAPVONAL (F9): a mai éles lecke alakja a kapun 0/38 — hivatkozás és új megjelenítők nélkül semmi nem „megjelent”", () => {
  const today = hmLessonToday();
  const result = sourceCoverageGate(today, inventory, []);
  assert.equal(result.ok, false);
  assert.deepEqual([result.metrics.total, result.metrics.shown, result.metrics.missing, result.metrics.coveragePct], [38, HM_BASELINE.gateShownToday, 38, 0]);
  assert.deepEqual([...result.missingIds].sort(), inventory.filter((v) => v.kind !== "colorCode").map((v) => v.id).sort(), "a hiánylista teljes");
  assert.ok(result.items.every((i) => i.state === "missing" && i.reason === "nincs rá hivatkozó blokk (sourceVisualId)"));
  // A mai alakban a mai sémán kívüli blokkfajta nincs, és egyetlen blokk sem hivatkozik forrástételre.
  const blocks = today.sections.flatMap((s) => s.blocks);
  assert.ok(blocks.every((b) => !("sourceVisualId" in b)));
  assert.deepEqual([...new Set(blocks.map((b) => (b.kind === "animate" ? `animate/${b.animKind}` : b.kind)))].sort(), ["animate/illustration", "animate/process", "example", "explain"]);
  // A forrás szavai OTT VANNAK a leckében (a régi, csak fogalmat számoló mérce 100%-ot mutatott) — a kapu mégsem fogadja el.
  assert.ok(JSON.stringify(today).includes("darab 2-1") && JSON.stringify(today).includes("szabálypont 1-a"));
  assert.deepEqual(visualCoverage(today, inventory), { total: 38, shown: 0, missingIds: result.missingIds });
  // Ellenpróba: a mai blokkokra utólag ráírt hivatkozás sem pótol — a lineáris „fa” és a rajzolt párok rossz fajta.
  const tagged = hmLessonToday();
  tagged.sections[0].blocks.find((b) => b.animKind === "process")!.sourceVisualId = "d1";
  tagged.sections[0].blocks.find((b) => b.animKind === "illustration")!.sourceVisualId = "t1";
  const stillMissing = sourceCoverageGate(tagged, inventory, []);
  assert.equal(stillMissing.metrics.shown, 0);
  assert.match(problemOf(stillMissing, "d1"), /fajtája \(animate\/process\) nem illik a tételhez \(decisionTree → animate\/decisionTree\)/);
  assert.match(problemOf(stillMissing, "t1"), /fajtája \(animate\/illustration\) nem illik a tételhez \(table → animate\/table \| animate\/compareCards\)/);
});

test("a 6 adminisztratív / kulcs-tétel érvényes okkal kihagyva, a többi megjelenik → a kapu átmegy", () => {
  const result = sourceCoverageGate(hmLessonFull(ADMIN), inventory, HM_ADMIN_SKIPS);
  assert.deepEqual([result.ok, result.problems, result.missingIds], [true, [], []]);
  assert.deepEqual([result.metrics.total, result.metrics.skipped, result.metrics.shown, result.metrics.invalidSkips, result.metrics.coveragePct], [38, 6, 32, 0, 100]);
  assert.deepEqual(result.items.filter((i) => i.state === "skipped").map((i) => i.id), ADMIN);
  const unmarked = sourceCoverageGate(hmLessonFull(ADMIN), inventory, []);
  assert.deepEqual([unmarked.ok, unmarked.missingIds], [false, ADMIN], "kihagyás-jelölés nélkül ugyanez bukik");
});

test("F1 — kijátszás: a forrás szövege a blokk BÁRMELY szövegében (felirat, rejtett paraméter, más cella) nem megjelenés", () => {
  const numTable = V({ id: "n1", kind: "table", data: { headers: ["x", "y"], rows: [["1", "2"], ["3", "4"], ["5", "6"], ["7", "8"]] } });
  // 1a: számtábla ↔ ÜRES tábla, a számok a feliratban.
  assert.deepEqual(probe(numTable, [A("table", { headers: [], rows: [] }, "n1", "Az 1234 és az 5678 xy")]), { shown: false, why: "a tartalom hűsége 0% (0/10 egység), a minimum 80%" });
  // 1b: névelő-tábla ↔ egyetlen mondat a feliratban.
  const wordTable = V({ id: "w1", kind: "table", data: { headers: ["a", "an"], rows: [["apple", "an"], ["a", "is"], ["egg", "an"], ["a", "on"]] } });
  assert.equal(probe(wordTable, [A("table", { rows: [] }, "w1", "An apple is on an egg.")]).shown, false);
  // 1c: igen / nem tábla ↔ a cellák ömlesztve a feliratban, tábla nélkül.
  const yesNo = V({ id: "y1", kind: "table", data: { headers: ["szó", "megszámlálható?"], rows: [["alma", "igen"], ["víz", "nem"], ["rizs", "nem"], ["tojás", "igen"]] } });
  assert.equal(probe(yesNo, [A("table", {}, "y1", "szó megszámlálható? alma víz rizs tojás igen nem")]).shown, false);
  // 2a: üres tábla, a cellák egy nem megjelenő `note` paraméterben; 2b: `animate/table`, de a params egy SVG-szöveg.
  const t1 = inventory.find((v) => v.id === "t1")! as Extract<SourceVisual, { kind: "table" }>;
  assert.equal(probe(t1, [A("table", { headers: [], rows: [], note: JSON.stringify(t1.data) }, "t1")]).shown, false);
  assert.equal(probe(t1, [A("table", { svg: `<svg>${[...t1.data.headers, ...t1.data.rows.flat()].join(" ")}</svg>` }, "t1")]).shown, false);
  // 2c: a cellák más oszlopban (minden sor megfordítva) — és akkor is, ha csak EGY sor két cellája cserél helyet a 80% alá visz.
  const reversed = { headers: [...t1.data.headers].reverse(), rows: [...t1.data.rows].reverse().map((r) => [...r].reverse()) };
  assert.deepEqual(probe(t1, [A("table", reversed, "t1")]), { shown: false, why: "a tartalom hűsége 0% (0/10 egység), a minimum 80%" });
  const twoSwapped = { headers: t1.data.headers, rows: t1.data.rows.map((r, i) => (i < 2 ? [...r].reverse() : r)) };
  assert.match(probe(t1, [A("table", twoSwapped, "t1")]).why, /a tartalom hűsége 60% \(6\/10 egység\)/);
  // Ellenpróba: a sorok sorrendje nem számít (a sor a legjobban egyező sorral áll párba), a helyes tábla megjelent.
  assert.equal(probe(t1, [A("table", { headers: t1.data.headers, rows: [...t1.data.rows].reverse() }, "t1")]).shown, true);
  assert.equal(probe(numTable, [A("table", numTable.kind === "table" ? numTable.data : {}, "n1")]).shown, true, "az egykarakteres cellák egész cellaként egyeznek");
  // 2d: a folyamat lépései fordított sorrendben; a lépések a feliratban; lépés egy másik lépés részeként.
  const proc = V({ id: "p1", kind: "process", data: { steps: ["Olvasd el.", "Húzd alá.", "Írd le."] } });
  assert.deepEqual(probe(proc, [A("process", { steps: ["Írd le.", "Húzd alá.", "Olvasd el."] }, "p1")]), { shown: false, why: "a tartalom hűsége 33% (1/3 egység), a minimum 80%" });
  assert.equal(probe(proc, [A("process", { steps: ["Valami más.", "Megint más."] }, "p1", "Olvasd el. Húzd alá. Írd le.")]).shown, false);
  assert.equal(probe(proc, [A("process", { steps: ["Olvasd el. Húzd alá. Írd le.", "Kész."] }, "p1")]).shown, false, "egész lépés egyezik, nem részszöveg");
  assert.equal(probe(proc, [A("process", { steps: ["Olvasd el.", "Közbevetett lépés.", "Húzd alá.", "Írd le."] }, "p1")]).shown, true, "a sorrend megmaradt");
  // Szabálydoboz: a pontok a pontokban — a feliratba ömlesztve nem megjelenés; a cím a címben (vagy a feliratban).
  const rule = V({ id: "r1", kind: "ruleBox", data: { tone: "rule", heading: "Szabály", items: ["Első pont.", "Második pont.", "Harmadik pont."] } });
  assert.equal(probe(rule, [A("ruleBox", { tone: "rule", items: [] }, "r1", "Szabály: Első pont. Második pont. Harmadik pont.")]).shown, false);
});

test("F1 — a szabálydoboz címe is egység: 4-ből 3 (75%) hiány, a címmel együtt megjelent", () => {
  const rule = V({ id: "r1", kind: "ruleBox", data: { tone: "rule", heading: "Szabály", items: ["Első pont.", "Második pont.", "Harmadik pont."] } });
  const items = ["Első pont.", "Második pont.", "Harmadik pont."];
  assert.match(probe(rule, [A("ruleBox", { tone: "rule", heading: "Más cím", items }, "r1")]).why, /a tartalom hűsége 75% \(3\/4 egység\)/);
  assert.equal(probe(rule, [A("ruleBox", { tone: "rule", heading: "Szabály", items }, "r1")]).shown, true);
  assert.equal(probe(rule, [A("ruleBox", { tone: "rule", items }, "r1", "Szabály")]).shown, true, "a cím a blokk feliratában is megjelenhet");
});

test("F2 — normalizálás: idézőjel, gondolatjel, hárompont, mondatvégi írásjel, szóköz, kis- / nagybetű nem buktat; az ékezet számít", () => {
  // 3a: tipográfiai ↔ egyenes idézőjel, nagykötőjel ↔ kötőjel, hárompont ↔ három pont.
  const rule = V({ id: "r1", kind: "ruleBox", data: { tone: "rule", items: ["A „how many” után többes szám áll.", "A „how much” után egyes szám áll – mindig!", "Figyelj: a pénz (money) megszámlálhatatlan…"] } });
  assert.equal(probe(rule, [A("ruleBox", { items: ['A "how many" után többes szám áll.', 'A "how much" után egyes szám áll - mindig!', "Figyelj: a pénz (money) megszámlálhatatlan..."] }, "r1")]).shown, true);
  // 3b: mondatvégi írásjel nélkül; 3c: kis- / nagybetű, sortörés, nem törő szóköz.
  const proc = V({ id: "p1", kind: "process", data: { steps: ["Olvasd el.", "Húzd alá.", "Írd le."] } });
  assert.equal(probe(proc, [A("process", { steps: ["Olvasd el", "Húzd alá", "Írd le"] }, "p1")]).shown, true);
  assert.equal(probe(proc, [A("process", { steps: ["OLVASD\nEL.", `húzd${NBSP}alá!`, "Írd   le."] }, "p1")]).shown, true);
  // Az ékezet NEM hajtogatható: az ékezet nélküli lépés más szöveg (a 3-ból 1 egyezik).
  assert.match(probe(proc, [A("process", { steps: ["Olvasd el.", "Huzd ala.", "Ird le."] }, "p1")]).why, /a tartalom hűsége 33% \(1\/3 egység\)/);
  assert.notEqual(normalizeVisualText("kor"), normalizeVisualText("kór"));
  assert.equal(normalizeVisualText(" A „How  Many” – mindig…  "), 'a "how many"-mindig');
  assert.equal(normalizeVisualText('A "how many" - mindig...'), 'a "how many"-mindig');
  assert.equal(normalizeVisualText("„Igen!”"), "igen");
  assert.equal(normalizeVisualText("e" + String.fromCharCode(769) + "g"), "ég", "NFC: az összetett és az előre összeállított betű egyezik");
  assert.equal(normalizeVisualText("?"), "?", "a csak írásjelből álló szöveg nem üresedik ki");
  assert.notEqual(normalizeVisualText("1."), normalizeVisualText("2."));
});

test("F2 — az U1 szerint csonkolt cella nem buktat: a csonkolt forrás a megjelenített cella elejével egyezik", () => {
  const ctx = { fileNames: ["a.pdf"], conceptIds: new Set<string>() };
  const long = "h".repeat(140);
  const one = sanitizeSourceVisuals([{ id: "c1", kind: "table", page: 1, role: "r", data: { headers: ["a", "b"], rows: [[long, "x"], ["y", "z"]] } }], ctx).visuals;
  // 3e: a lecke a csonkolt cellát „...”-tal írja; a teljes eredeti cellával; a „…” jel nélkül.
  for (const cell of [`${long.slice(0, 99)}...`, long, long.slice(0, 99)]) assert.equal(probe(one[0], [A("table", { headers: ["a", "b"], rows: [[cell, "x"], ["y", "z"]] }, "c1")]).shown, true, cell.slice(-5));
  // 3f: négy hosszú cella, a lecke mindenhol elhagyja a „…” jelet.
  const [wide] = sanitizeSourceVisuals([{ id: "c2", kind: "table", page: 1, role: "r", data: { headers: ["Szabály", "Példa"], rows: [["A".repeat(130), "B".repeat(130)], ["C".repeat(130), "D".repeat(130)]] } }], ctx).visuals as Array<Extract<SourceVisual, { kind: "table" }>>;
  assert.equal(probe(wide, [A("table", { headers: ["Szabály", "Példa"], rows: wide.data.rows.map((r) => r.map((c) => c.replace("…", ""))) }, "c2")]).shown, true);
  // Mutáció: a csonkolt cella helyén MÁS szöveg (más kezdet) továbbra is hiány; a rövid, nem csonkolt cellánál nincs előtag-egyezés.
  assert.match(probe(wide, [A("table", { headers: ["Szabály", "Példa"], rows: [["X".repeat(130), "Y".repeat(130)], ["Z".repeat(130), "W".repeat(130)]] }, "c2")]).why, /a tartalom hűsége 33% \(2\/6 egység\)/);
  const short = V({ id: "s1", kind: "table", data: { headers: ["a"], rows: [["alma…"]] } });
  assert.equal(probe(short, [A("table", { headers: ["a"], rows: [["almafa"]] }, "s1")]).shown, false);
});

test("F3 — több hivatkozó blokk tartalma összeadódik; ugyanaz a forrásrész nem számít kétszer", () => {
  // 3d: a forrás 6 tételes feladata 6 külön `check` blokkban.
  const exercise = V({ id: "x1", kind: "exercise", data: { instruction: "Válaszd ki a helyes kérdőszót!", items: Array.from({ length: 6 }, (_, i) => `${i + 1}. mondat: ___ alma van?`) } }) as Extract<SourceVisual, { kind: "exercise" }>;
  const check = (i: number) => ({ kind: "check", question: `Válaszd ki a helyes kérdőszót! ${exercise.data.items[i]}`, options: ["How many", "How much"], correctIndex: 0, feedbackPerOption: ["jó", "nem"], coversConceptIds: ["c"], sourceVisualId: "x1" });
  assert.equal(probe(exercise, [0, 1, 2, 3, 4, 5].map(check)).shown, true, "együtt 7/7");
  assert.match(probe(exercise, [0, 1, 2, 3].map(check)).why, /a tartalom hűsége 71% \(5\/7 egység\)/, "4 blokk: utasítás + 4 tétel");
  // Ugyanaz a tétel hatszor: nem lesz belőle hat megjelent tétel.
  assert.match(probe(exercise, [0, 0, 0, 0, 0, 0].map(check)).why, /a tartalom hűsége 29% \(2\/7 egység\)/);
  // Szóhatár: a „1. mondat” nem egyezik a „11. mondat” belsejében.
  const eleventh = { ...check(0), question: "Válaszd ki a helyes kérdőszót! 11. mondat: ___ alma van?" };
  assert.match(probe(exercise, [eleventh, ...[1, 2, 3, 4, 5].map(check)]).why, /^$/, "6/7 = 86% még megjelent");
  assert.match(probe(exercise, [eleventh]).why, /a tartalom hűsége 14% \(1\/7 egység\)/);
  // Táblázat két táblablokkban (a megjelenítő sorkorlátja miatt): a sorok összeadódnak; ugyanaz a sor kétszer nem pótol másikat.
  const t1 = inventory.find((v) => v.id === "t1")! as Extract<SourceVisual, { kind: "table" }>;
  const part = (rows: string[][]) => A("table", { headers: t1.data.headers, rows }, "t1");
  assert.equal(probe(t1, [part(t1.data.rows.slice(0, 2)), part(t1.data.rows.slice(2))]).shown, true);
  assert.match(probe(t1, [part(t1.data.rows.slice(0, 2)), part(t1.data.rows.slice(0, 2))]).why, /a tartalom hűsége 60% \(6\/10 egység\)/);
  // Folyamat két blokkban, sorrendben; a rossz fajtájú hivatkozó blokk mellett a jó megjelenít.
  const proc = V({ id: "p1", kind: "process", data: { steps: ["Olvasd el.", "Húzd alá.", "Írd le.", "Ellenőrizd."] } });
  assert.equal(probe(proc, [A("process", { steps: ["Olvasd el.", "Húzd alá."] }, "p1"), A("process", { steps: ["Írd le.", "Ellenőrizd."] }, "p1")]).shown, true);
  assert.equal(probe(proc, [A("process", { steps: ["Írd le.", "Ellenőrizd."] }, "p1"), A("process", { steps: ["Olvasd el.", "Húzd alá."] }, "p1")]).shown, false, "a blokkok sorrendje is sorrend");
  assert.equal(probe(t1, [{ ...part(t1.data.rows), animKind: "process" }, part(t1.data.rows)]).shown, true);
});

test("mutációk a teljes leckén: hiányzó táblázat, hiányzó folyamat, átnevezett tétel, rossz fajta, csonka tartalom, a fa szerkezete", () => {
  const noRef = mutated((l) => { delete blockFor(l, "t3").sourceVisualId; });
  assert.deepEqual([noRef.ok, noRef.missingIds], [false, ["t3"]]);
  assert.match(problemOf(noRef, "t3"), /^t3 \(table\): nincs rá hivatkozó blokk \(sourceVisualId\)$/);
  assert.deepEqual(mutated(drop("t7")).missingIds, ["t7"]);
  const noProcess = mutated(drop("s2"));
  assert.deepEqual([noProcess.ok, noProcess.missingIds], [false, ["s2"]]);
  for (const renamed of ["t4x", "T4", "t4 ", "t40"]) {
    const result = mutated((l) => { blockFor(l, "t4").sourceVisualId = renamed; });
    assert.deepEqual([result.ok, result.missingIds], [false, ["t4"]], renamed);
  }
  const wrongKind = mutated((l) => { const b = blockFor(l, "t5"); b.animKind = "process"; b.params = { steps: (b.params as { rows: string[][] }).rows.flat() }; });
  assert.match(problemOf(wrongKind, "t5"), /fajtája \(animate\/process\) nem illik a tételhez \(table → animate\/table \| animate\/compareCards\)/);
  const half = mutated((l) => { const p = blockFor(l, "t6").params as { rows: string[][] }; p.rows = p.rows.slice(0, 2); });
  assert.match(problemOf(half, "t6"), /a tartalom hűsége 60% \(6\/10 egység\), a minimum 80%/);
  const edge = mutated((l) => { const p = blockFor(l, "t8").params as { rows: string[][] }; p.rows = p.rows.slice(0, 3); });
  assert.deepEqual([edge.ok, edge.missingIds], [true, []], "8/10 = 80% még megjelent");
  // Döntési fa: egy levéllel kevesebb (a szöveg egy csomópontba ömlesztve); átírt ágfelirat; más alakú (`children`) paraméter.
  type Tree = { root: { text: string; branches: Array<{ label: string; node: { text: string; branches?: Array<{ label: string; node: { text: string } }> } }> } };
  const fewerLeaves = mutated((l) => { const inner = (blockFor(l, "d1").params as Tree).root.branches[0].node; inner.text = `${inner.text} — igen: kérdőszó: darabra; nem: előbb tedd többes számba`; delete inner.branches; });
  assert.equal(fewerLeaves.ok, false);
  assert.match(problemOf(fewerLeaves, "d1"), /a tartalom hűsége 44% \(4\/9 egység\), a minimum 80% — a döntési fa levelei: 2 a leckében, 3 a forrásban/);
  const relabeled = mutated((l) => { (blockFor(l, "d1").params as Tree).root.branches[0].label = "talán"; });
  assert.match(problemOf(relabeled, "d1"), /a tartalom hűsége 33% \(3\/9 egység\)/, "az átírt ág alatt minden hiányzik");
  const asChildren = (n: { text: string; branches?: Array<{ label: string; node: unknown }> }): unknown => ({ text: n.text, children: (n.branches ?? []).map((b) => ({ label: b.label, ...(asChildren(b.node as never) as object) })) });
  const otherShape = mutated((l) => { const b = blockFor(l, "d1"); b.params = { root: asChildren((b.params as Tree).root) }; });
  assert.match(problemOf(otherShape, "d1"), /a döntési fa levelei: 1 a leckében, 3 a forrásban/, "F5: a szerződés a root.branches[].node alak");
  // Ellenpróba: az ágak sorrendje nem számít.
  const reordered = mutated((l) => { (blockFor(l, "d1").params as Tree).root.branches.reverse(); });
  assert.equal(reordered.ok, true);
  // Extra levél (a leckében több ág) nem hiba; a levélszám-szabály csak a kevesebbet bünteti.
  const extra = mutated((l) => { (blockFor(l, "d1").params as Tree).root.branches.push({ label: "nem tudom", node: { text: "kérdezd meg" } }); });
  assert.equal(extra.ok, true);
});

test("F4 — kihagyás: a keret max(1, ⌊30%⌋); az ok fajtánként megengedett; érvénytelen ok = hiány", () => {
  // A keret kis leltárnál is legalább 1 (az ellenőr 4a / 4b esete: 2, illetve 3 tétel + jogos adminisztratív kihagyás).
  assert.deepEqual([0, 1, 2, 3, 4, 6, 7, 10, 38].map(skipCapOf), [0, 1, 1, 1, 1, 1, 2, 3, 11]);
  const proc = V({ id: "p1", kind: "process", data: { steps: ["Olvasd el.", "Húzd alá."] } });
  const admin = V({ id: "a1", kind: "ruleBox", data: { tone: "tip", items: ["Név: ____ Osztály: ____"] } });
  const key = V({ id: "k1", kind: "exercise", data: { instruction: "Megoldások", items: [], answerKey: ["1. b", "2. a"] } });
  const procBlock = A("process", { steps: ["Olvasd el.", "Húzd alá."] }, "p1");
  const two = sourceCoverageGate({ sections: [{ blocks: [procBlock] }] }, [proc, admin], [{ id: "a1", reason: "admin_meta" }]);
  assert.deepEqual([two.ok, two.metrics.skipped, two.metrics.invalidSkips], [true, 1, 0]);
  // Kétoldalas feladatlap: 2 tétel + megoldókulcs → a kulcs kihagyható; a második kihagyás már a kereten kívül van.
  const three = sourceCoverageGate({ sections: [{ blocks: [procBlock] }] }, [proc, admin, key], [{ id: "k1", reason: "answer_key" }, { id: "a1", reason: "admin_meta" }]);
  assert.deepEqual([three.ok, three.metrics.skipped, three.missingIds], [false, 1, ["a1"]]);
  assert.match(problemOf(three, "a1"), /érvénytelen kihagyás: a kihagyások meghaladják a keretet \(legfeljebb 1 a\(z\) 3 tételből — a tételek 30%-a, de legalább 1\)/);
  // Az ok fajtánként: decorative nem adható táblázatra / folyamatra / döntési fára / szabálydobozra; answer_key csak feladatnál.
  const bare = (id: string) => inventory.map((v) => (v.id === id ? { ...v, conceptIds: [] } : v));
  const skipOne = (id: string, reason: string, extra: Partial<SkippedSourceVisual> = {}) => {
    const lesson = hmLessonFull(ADMIN); drop(id)(lesson);
    return sourceCoverageGate(lesson, bare(id), [...HM_ADMIN_SKIPS, { id, reason, ...extra }]);
  };
  for (const id of ["t9", "s1", "d1", "r1"]) {
    const result = skipOne(id, "decorative");
    assert.equal(result.ok, false, id);
    assert.match(problemOf(result, id), /érvénytelen kihagyás \(decorative\): decorative ok (table|process|decisionTree|ruleBox) tételnél nem adható \(megengedett: admin_meta \| duplicate\)/);
  }
  assert.match(problemOf(skipOne("r2", "answer_key"), "r2"), /answer_key ok ruleBox tételnél nem adható/);
  assert.match(problemOf(skipOne("t2", "answer_key"), "t2"), /answer_key ok table tételnél nem adható/);
  // Megengedett párok (fogalom-hivatkozás nélküli tételen): admin_meta bármelyiknél; decorative ábránál és képes kártyánál; answer_key feladatnál.
  for (const [id, reason] of [["t9", "admin_meta"], ["s1", "admin_meta"], ["d1", "admin_meta"], ["g1", "decorative"], ["p1", "decorative"], ["e1", "answer_key"], ["e1", "admin_meta"]] as const) {
    const result = skipOne(id, reason);
    assert.deepEqual([result.ok, result.metrics.skipped, result.metrics.invalidSkips], [true, 7, 0], `${id} / ${reason}`);
  }
  // Tanított fogalmú tétel csak duplicate okkal; a duplicate megnevezett, megjelent párral érvényes.
  const taught = mutated(drop("t1"), [...HM_ADMIN_SKIPS, { id: "t1", reason: "admin_meta" }]);
  assert.match(problemOf(taught, "t1"), /érvénytelen kihagyás \(admin_meta\): tanított fogalomra hivatkozó tétel csak duplicate okkal hagyható ki/);
  for (const of of ["nincs-ilyen", "t2", undefined]) {
    const result = mutated(drop("t2"), [...HM_ADMIN_SKIPS, { id: "t2", reason: "duplicate", ...(of ? { duplicateOf: of } : {}) }]);
    assert.match(problemOf(result, "t2"), /a duplicateOf nem egy másik, létező tételre mutat/, String(of));
  }
  const pairMissing = mutated((l) => { drop("t2")(l); drop("t3")(l); }, [...HM_ADMIN_SKIPS, { id: "t2", reason: "duplicate", duplicateOf: "t3" }]);
  assert.match(problemOf(pairMissing, "t2"), /a duplicateOf tétel \(t3\) nem jelent meg/);
  const validDup = mutated(drop("t2"), [...HM_ADMIN_SKIPS, { id: "t2", reason: "duplicate", duplicateOf: "t3" }]);
  assert.deepEqual([validDup.ok, validDup.metrics.skipped], [true, 7]);
  // 16 kihagyás a 38-ból: a keret (11) fölötti rész a lista végéről érvénytelen; pontosan 11 még érvényes.
  const many = [...HM_ADMIN_SKIPS, ...["t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "r2", "r3"].map((id) => ({ id, reason: "duplicate", duplicateOf: id.startsWith("t") ? "t1" : "r1" }))];
  const overCap = mutated((l) => { for (const s of many.slice(6)) drop(s.id)(l); }, many);
  assert.deepEqual([overCap.ok, overCap.metrics.skipped, overCap.missingIds], [false, 11, ["t7", "t8", "t9", "r2", "r3"]]);
  const atCap = mutated((l) => { for (const s of many.slice(6, 11)) drop(s.id)(l); }, many.slice(0, 11));
  assert.deepEqual([atCap.ok, atCap.metrics.skipped], [true, 11]);
  // Ismeretlen ok, ok nélküli kihagyás, nem létező / nem számolt tétel.
  assert.match(problemOf(mutated(drop("r1"), [...HM_ADMIN_SKIPS, { id: "r1", reason: "nem fért bele" }]), "r1"), /érvénytelen kihagyás \(nem fért bele\): az ok nem a zárt listából való/);
  assert.match(problemOf(mutated(drop("r1"), [...HM_ADMIN_SKIPS, { id: "r1" } as never]), "r1"), /érvénytelen kihagyás \(ok nélkül\)/);
  const ghost = mutated(() => undefined, [...HM_ADMIN_SKIPS, { id: "nincs", reason: "admin_meta" }, { id: "szin", reason: "decorative" }]);
  assert.deepEqual([ghost.ok, ghost.metrics.invalidSkips, ghost.metrics.skipped], [true, 2, 6]);
});

test("F5 / F6 — a megjelenítők szerződése: összehasonlító kártya, üres ábra, kép nélküli képes tétel", () => {
  // compareCards: a kártya egy oszlop (cím = fejléc, sorok = az oszlop cellái) — táblázat és páros doboz megjelenítésére is.
  const t1 = inventory.find((v) => v.id === "t1")! as Extract<SourceVisual, { kind: "table" }>;
  const cards = { cards: t1.data.headers.map((title, c) => ({ title, tone: "a", lines: t1.data.rows.map((r) => r[c]) })) };
  assert.equal(probe(t1, [A("compareCards", cards, "t1")]).shown, true);
  assert.deepEqual(compareCardsAsTable({ cards: [{ title: "A", lines: ["1", "2"] }, { title: "B", lines: ["3"] }] }), { headers: ["A", "B"], rows: [["1", "3"], ["2", ""]] });
  assert.equal(probe(t1, [A("compareCards", { cards: [...cards.cards].reverse() }, "t1")]).shown, false, "felcserélt kártyák = felcserélt oszlopok");
  const pair = inventory.find((v) => v.id === "g1")!;
  assert.equal(probe(pair, faithfulBlocks(pair)).shown, true);
  // A szerződés olvasói a szerződésen kívüli kulcsot nem olvassák, és hibás alakra sem dobnak.
  assert.deepEqual(readTableParams({ headers: ["a", 5], rows: [["x"], "nem sor"], note: "rejtett" }), { headers: ["a", ""], rows: [["x"], []] });
  assert.deepEqual(readTableParams(null), { headers: [], rows: [] });
  assert.equal(readDecisionTreeParams({ root: "nem fa" }), null);
  assert.deepEqual(readDecisionTreeParams({ root: { text: "k", branches: [{ label: "igen", node: { text: "l" } }, { label: "rossz" }], children: [1] } }), { root: { text: "k", branches: [{ label: "igen", node: { text: "l" } }] } });
  // 2e: rész nélküli ábra ↔ üres `animate` blokk NEM megjelenés; kirajzolható tartalommal igen.
  const bare = V({ id: "g0", kind: "diagram", data: { description: "A víz körforgása.", parts: [] } });
  assert.deepEqual(probe(bare, [A("numberLine", {}, "g0")]), { shown: false, why: "a hivatkozó ábra blokkja üres (nincs kirajzolható tartalma)" });
  assert.equal(probe(bare, [A("jovoFajta", {}, "g0")]).shown, false);
  assert.equal(probe(bare, [A("numberLine", { from: 0, to: 10 }, "g0")]).shown, true);
  assert.equal(probe(bare, [A("cycle", { phases: [] }, "g0")]).shown, false, "érvénytelen paraméterű ábra nem kirajzolható");
  // Részes ábra bármely ábrafajtával: a részek a kirajzolt szövegben (nem rejtett paraméterben).
  const parts = V({ id: "g5", kind: "diagram", data: { description: "Tölcsér.", parts: [{ label: "felső rész", meaning: "minden főnév" }, { label: "alsó rész", meaning: "a megszámlálható" }] } });
  assert.equal(probe(parts, [A("process", { steps: ["felső rész: minden főnév", "alsó rész: a megszámlálható"] }, "g5")]).shown, true);
  assert.match(probe(parts, [A("process", { steps: ["egy", "kettő"], note: "felső rész minden főnév alsó rész a megszámlálható" }, "g5")]).why, /a tartalom hűsége 0% \(0\/4 egység\)/);
  // 2f: képes feladat ↔ csak szöveges blokk: a képek hiányoznak. Képes kártyákkal együtt megjelent.
  const pictured = V({ id: "x0", kind: "exercise", data: { instruction: "Kérdezz!", items: [], pictures: ["alma", "víz", "rizs"] } });
  const textOnly = { kind: "check", question: "Kérdezz! Mi ez?", options: ["a", "b"], correctIndex: 0, feedbackPerOption: ["x", "y"], coversConceptIds: ["c"], sourceVisualId: "x0" };
  assert.deepEqual(probe(pictured, [textOnly]), { shown: false, why: "a tartalom hűsége 25% (1/4 egység), a minimum 80% — a feladat 3 képéből 0 jelenik meg" });
  const withPictures = A("pictureCards", { cards: ["alma", "víz", "rizs"].map((label) => ({ label, svg: "<svg/>" })) }, "x0");
  assert.equal(probe(pictured, [textOnly, withPictures]).shown, true);
  assert.match(probe(pictured, [textOnly, A("pictureCards", { cards: [{ label: "alma", svg: "<svg/>" }, { label: "víz", svg: "" }, { label: "rizs" }] }, "x0")]).why, /a feladat 3 képéből 1 jelenik meg/);
  // 2g: képes kártya kép (svg) nélkül, csak felirattal — nem képes kártya.
  const card = V({ id: "k1", kind: "pictureCard", data: { cards: [{ label: "apple", depicts: "piros alma" }, { label: "milk", depicts: "pohár tej" }] } });
  assert.deepEqual(probe(card, [A("pictureCards", { cards: [{ label: "apple" }, { label: "milk" }] }, "k1")]), { shown: false, why: "a tartalom hűsége 0% (0/2 egység), a minimum 80% — 2 kártya kép (svg) nélkül" });
  assert.equal(probe(card, [A("pictureCards", { cards: [{ label: "Apple", svg: "<svg/>" }, { label: "milk", svg: "<svg/>" }] }, "k1")]).shown, true);
  assert.equal(probe(card, [A("pictureCards", { cards: [{ label: "apple milk", svg: "<svg/>" }] }, "k1")]).shown, false, "kártyánként egy felirat, nem ömlesztve");
});

test("a megfeleltetés: feladat example / try / check blokként; a rejtett vagy nem megjelenő mező nem számít", () => {
  const exercise = V({ id: "e1", kind: "exercise", data: { instruction: "Egészítsd ki a kérdést!", items: [1, 2, 3, 4].map((i) => `feladattétel ${i}`) } });
  const texts = { instruction: "Egészítsd ki a kérdést!", items: [1, 2, 3, 4].map((i) => `feladattétel ${i}`) };
  for (const block of [
    { kind: "example", problem: texts.instruction, steps: texts.items, answer: "kész" },
    { kind: "try", tryKind: "match", spec: texts },
    { kind: "check", question: texts.instruction, options: texts.items, correctIndex: 0, feedbackPerOption: texts.items },
  ]) assert.equal(probe(exercise, [{ ...block, sourceVisualId: "e1" }]).shown, true, String(block.kind));
  for (const block of [{ kind: "explain", text: JSON.stringify(texts) }, { kind: "recap", bullets: texts.items }, { kind: "animate", animKind: "barChart", params: texts, caption: texts.instruction }]) {
    assert.match(probe(exercise, [{ ...block, sourceVisualId: "e1" }]).why, /nem illik a tételhez \(exercise → animate\/pictureCards \| example \| try \| check\)/, JSON.stringify(block.kind));
  }
  // A `check` blokk nem megjelenő kulcsa (pl. egy kitalált `note`) nem megjelenés.
  assert.equal(probe(exercise, [{ kind: "check", question: "Más kérdés", options: ["a", "b"], correctIndex: 0, feedbackPerOption: ["x", "y"], note: JSON.stringify(texts), sourceVisualId: "e1" }]).shown, false);
});

test("a „legalább 80%” csoport: 14 tételből 2 hiányozhat, 3 már bukás; a színkód nem számít; leltár nélkül 0 / 0", () => {
  const two = mutated((l) => { drop("p1")(l); drop("e2")(l); });
  assert.deepEqual([two.ok, two.problems, two.missingIds, two.metrics.shouldTotal, two.metrics.shouldShown, two.metrics.coveragePct], [true, [], ["p1", "e2"], 14, 12, 94]);
  const three = mutated((l) => { drop("p1")(l); drop("e2")(l); drop("g1")(l); });
  assert.equal(three.ok, false);
  assert.match(three.problems[0], /11\/14 jelent meg, a minimum 80% \(legfeljebb 2 hiányozhat\)/);
  assert.deepEqual(three.missingIds, ["p1", "e2", "g1"]);
  const onlyColor = sourceCoverageGate({ sections: [] }, inventory.filter((v) => v.kind === "colorCode"), []);
  assert.deepEqual([onlyColor.ok, onlyColor.metrics.total, onlyColor.missingIds], [true, 0, []]);
  const none = sourceCoverageGate(hmLessonFull(), [], []);
  assert.deepEqual([none.ok, none.metrics.total, none.metrics.coveragePct, none.problems], [true, 0, 100, []]);
  // Két azonos szövegű tétel: az egyikre hivatkozó blokk a másikat nem fedi.
  const dup = (id: string) => V({ id, kind: "ruleBox", data: { tone: "rule", items: ["Közös szabály."] } });
  assert.deepEqual(sourceCoverageGate({ sections: [{ blocks: [A("ruleBox", { items: ["Közös szabály."] }, "u1")] }] }, [dup("u1"), dup("u2")], []).missingIds, ["u2"]);
});

test("F12 — hibás alakú lecke, blokk, tétel, kihagyás: a kapu NEM dob, a mérhetetlen tétel hiány", () => {
  const t1 = inventory.find((v) => v.id === "t1")!;
  const hostile = { sections: [null, { blocks: [null, "szöveg", 7, { sourceVisualId: 5 }, { sourceVisualId: "t1" }, { kind: "animate", animKind: "table", sourceVisualId: "t1", params: null }] }, { blocks: "nem tömb" }] };
  assert.deepEqual(sourceCoverageGate(hostile as never, [t1], [null, "x", { id: 3 }, { id: "t1" }] as never).missingIds, ["t1"]);
  assert.deepEqual(sourceCoverageGate(null as never, [t1], null as never).missingIds, ["t1"]);
  // Az ellenőr négy esete: dobó `reason`, prototípus nélküli blokk + Symbol ok, `data: null` tétel, ismeretlen fajta `conceptIds` nélkül.
  const cases: Array<[unknown, unknown[], unknown[]]> = [
    [{ sections: [{ blocks: [{ sourceVisualId: "t1", kind: "animate", animKind: "table", params: { toString: null, a: { b: [1, null, undefined, Symbol.iterator] } } }] }] }, [t1], [{ id: "t1", reason: { toString() { throw new Error("x"); } } }]],
    [{ sections: [{ blocks: [Object.create(null, { sourceVisualId: { value: "t1", enumerable: true }, kind: { value: "animate", enumerable: true } })] }] }, [t1], [{ id: "t1", reason: Symbol("s") }]],
    [{ sections: [{ blocks: [{ sourceVisualId: "t1", kind: "animate", animKind: "table", params: {} }] }] }, [{ id: "t1", kind: "table", data: null, conceptIds: [] }], []],
    [{ sections: [{ blocks: [{ sourceVisualId: "t1", kind: "animate", animKind: "x" }] }] }, [{ id: "t1", kind: "ismeretlen", conceptIds: undefined, data: {} }], [{ id: "t1", reason: "duplicate" }]],
  ];
  for (const [i, [lesson, visuals, skipped]] of cases.entries()) {
    const result = sourceCoverageGate(lesson as never, visuals as never, skipped as never);
    assert.deepEqual([result.ok, result.missingIds], [false, ["t1"]], `${i}. eset`);
  }
  assert.match(sourceCoverageGate(cases[2][0] as never, cases[2][1] as never, []).items[0].reason!, /alakja hibás \(nem mérhető\)/);
  assert.deepEqual(sourceCoverageGate({ sections: [] }, [null, 5, { kind: "table" }] as never, []).metrics.total, 0, "azonosító nélküli tétel nem számolt");
});

test("determinisztikus: ugyanarra a bemenetre bájtra ugyanaz a kimenet; a bemenet nem módosul", () => {
  const lesson = hmLessonFull(["t3", "p2"]);
  const before = JSON.stringify([lesson, inventory, HM_ADMIN_SKIPS]);
  const a = JSON.stringify(sourceCoverageGate(lesson, inventory, HM_ADMIN_SKIPS));
  assert.equal(JSON.stringify(sourceCoverageGate(lesson, inventory, HM_ADMIN_SKIPS)), a);
  assert.equal(JSON.stringify([lesson, inventory, HM_ADMIN_SKIPS]), before);
  assert.equal(faithfulBlock(inventory[0]).sourceVisualId, "t1");
});

test("üzemmód és bejegyzés: a kapu `report` módban marad; a jegyzék név szerint futtat", () => {
  assert.deepEqual(GATE_MODES, { sourceCoverage: "report" }, "az `enforce`-ot az S3b utolsó lépése kapcsolja be");
  assert.equal(gateMode("sourceCoverage"), "report");
  assert.equal(gateMode("sourceCoverage", { sourceCoverage: "enforce" }), "enforce");
  assert.equal(gateMode("sourceCoverage", { sourceCoverage: "off" }), "off");
  assert.equal(gateMode("sourceCoverage", { sourceCoverage: "szigorú" as never }), "report", "érvénytelen felülírásnál az alapérték marad");
  assert.deepEqual(Object.keys(GATE_REGISTRY), ["sourceCoverage"]);
  const [result] = runRegisteredGates({ lesson: hmLessonToday(), visuals: inventory });
  assert.deepEqual([result.gate, result.ok, result.metrics.shown], ["sourceCoverage", false, 0]);
  assert.throws(() => registerGate("sourceCoverage", () => ({ gate: "x", ok: true, problems: [], metrics: {} })), /már be van jegyezve/);
});

test("parancssori futtató (F10): bukásnál 1, hibás / olvashatatlan bemenetnél 2 a kilépési kód — soha nem „zöld”", () => {
  const dir = mkdtempSync(join(tmpdir(), "websuli-gates-"));
  try {
    const write = (name: string, data: unknown) => { const path = join(dir, name); writeFileSync(path, JSON.stringify(data)); return path; };
    const map = write("map.json", { sourceFiles: [{ name: "minta.pdf", kind: "pdf", visuals: inventory }] });
    const today = write("today.json", hmLessonToday());
    const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "scripts/gates/run-gates.mts", ...args], { encoding: "utf8", timeout: 120_000 });
    const failing = run("--lesson", today, "--map", map);
    assert.equal(failing.status, 1, failing.stderr);
    const out = JSON.parse(failing.stdout) as { ok: boolean; visuals: number; results: Array<{ gate: string; ok: boolean; metrics: Record<string, number>; missingIds: string[] }> };
    assert.deepEqual([out.ok, out.visuals, out.results[0].gate, out.results[0].metrics.shown, out.results[0].missingIds.length], [false, 39, "sourceCoverage", 0, 38]);
    const passing = run("--lesson", write("job.json", { lesson: hmLessonFull(ADMIN), outline: { skippedVisuals: HM_ADMIN_SKIPS } }), "--map", write("visuals.json", { visuals: inventory }));
    assert.equal(passing.status, 0, passing.stderr + passing.stdout);
    assert.equal((JSON.parse(passing.stdout) as { ok: boolean }).ok, true);
    // Leltár nélküli (de felismert alakú) térkép: érvényes 0 / 0.
    assert.equal(run("--lesson", today, "--map", write("empty.json", { visuals: [] })).status, 0);
    assert.equal(run("--lesson", today, "--map", write("empty-files.json", { sourceFiles: [{ name: "a.txt", kind: "text" }] })).status, 0);
    // F10: ismeretlen térképalak és (akár egyetlen) érvénytelen tétel → 2, „ok: true” kimenet nélkül.
    for (const [name, data, why] of [["bogus.json", { foo: 1 }, /ismeretlen térképalak/], ["text.json", "szöveg", /ismeretlen térképalak/],
      ["invalid.json", { visuals: [{ id: "x" }] }, /1 érvénytelen tétel/], ["mixed.json", { visuals: [inventory[0], { id: "x" }] }, /1 érvénytelen tétel/],
      ["invalid-files.json", { sourceFiles: [{ name: "a.pdf", kind: "pdf", visuals: [{ id: "x" }] }] }, /1 érvénytelen tétel/]] as const) {
      const bad = run("--lesson", today, "--map", write(name, data));
      assert.equal(bad.status, 2, `${name}: ${bad.stdout}`);
      assert.match(bad.stderr, why, name);
      assert.ok(!bad.stdout.includes('"ok": true'), name);
    }
    const usage = run("--lesson", today);
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /Hiányzó --lesson vagy --map/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("mutációs ellenpróbák élesítése: rövid szöveg, döntő csonkolás, írásjel az idézőjel után, ismétlődő sor", () => {
  // Rövid szöveg (1–2 karakter, puszta szám) szabad szövegű megjelenítőben is csak EGÉSZ mezőként egyezik — véletlen előfordulás nem.
  const tiny = V({ id: "x2", kind: "exercise", data: { instruction: "a", items: ["7", "an", "12"] } });
  const noisy = { kind: "check", question: "Ez a 7 alma és an egg, 12 darab", options: ["igen", "nem"], correctIndex: 0, feedbackPerOption: ["jó", "nem"], coversConceptIds: ["c"], sourceVisualId: "x2" };
  assert.deepEqual(probe(tiny, [noisy]), { shown: false, why: "a tartalom hűsége 0% (0/4 egység), a minimum 80%" });
  assert.equal(probe(tiny, [{ ...noisy, question: "a", options: ["7", "an", "12"], feedbackPerOption: ["x", "y", "z"] }]).shown, true, "egész mezőként megjelent");
  // Csonkolt cella, ahol az előtag-egyezés DÖNT: egyetlen (csonkolt) cellájú tábla ↔ a lecke a teljes eredeti cellát írja.
  const long = "k".repeat(140);
  const [clipped] = sanitizeSourceVisuals([{ id: "c3", kind: "table", page: 1, role: "r", data: { headers: [""], rows: [[long]] } }, { id: "c4", kind: "table", page: 1, role: "r", data: { headers: ["h"], rows: [[long]] } }],
    { fileNames: ["a.pdf"], conceptIds: new Set<string>() }).visuals.slice(-1);
  assert.equal(probe(clipped, [A("table", { headers: ["h"], rows: [[long]] }, "c4")]).shown, true);
  assert.match(probe(clipped, [A("table", { headers: ["h"], rows: [[`más ${long}`]] }, "c4")]).why, /a tartalom hűsége 50% \(1\/2 egység\)/, "nem az elején egyezik");
  // Mondatvégi írásjel a záró idézőjel UTÁN és ELŐTT is lekerül.
  assert.equal(normalizeVisualText("„Igen”!"), "igen");
  assert.equal(normalizeVisualText("„Igen!”"), "igen");
  assert.equal(normalizeVisualText("Kész..."), "kész");
  // Ismétlődő forrássor: egy megjelenített sor csak EGY forrássort fed (nem használható többször).
  const repeated = V({ id: "t0", kind: "table", data: { headers: ["szó"], rows: [["alma"], ["alma"], ["alma"], ["alma"], ["alma"]] } });
  assert.match(probe(repeated, [A("table", { headers: ["szó"], rows: [["alma"]] }, "t0")]).why, /a tartalom hűsége 33% \(2\/6 egység\)/);
  assert.equal(probe(repeated, [A("table", { headers: ["szó"], rows: Array.from({ length: 5 }, () => ["alma"]) }, "t0")]).shown, true);
});
