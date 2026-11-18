import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../server/studio/single-run/engine";
import { LessonConversation } from "../server/studio/single-run/conversation";
import { singleRunMapHash, sourceFileRow } from "../server/studio/single-run/live";
import { sourceVisualsEnabled, SOURCE_VISUALS_ENV } from "../server/studio/source-visuals-flag";
import type { SingleRunMap } from "../server/studio/single-run/engine";
import { FINGERPRINT_FILES, FINGERPRINT_TABLE, productionPromptRun, type FingerprintOptions, type FingerprintScenario } from "./helpers/production-prompt-fingerprint";

/* docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, 0. elv (önálló beolvaszthatóság): a forrás vizuális leltára funkciókapcsoló
   mögött áll, alapból KI. KI állapotban a gyártás MINDEN modellnek küldött kérése azonos a kapcsoló előtti főágéval.

   A FŐÁG ÉRTÉKEI (origin/main, 21c81998) — nem ebből a fából számolva, hanem a főág kódján lefuttatott ugyanazon mintafutásból;
   az előállítás lépései a `tests/helpers/production-prompt-fingerprint.ts` fejlécében (git archive origin/main:source … → parancssori mód).
   Ha a főágon a gyártó promptjai SZÁNDÉKOSAN változnak, a három érték ugyanazzal a paranccsal frissítendő. */
const MAIN = {
  source: "aa0647647b45d862b39226078e04538a7c475dc3975f3ba4b6f39316da59887d",
  map: "cecf327e9c72bcda15276ded17c6e030dab2279113a235695a3b3c46166970ee",
  mapHash: "c7d260ebb64bc71781e1243a6fef0870474499fe82ba20cc34fca4daf3d45789",
} as const;

const run = (scenario: FingerprintScenario, extra: Record<string, unknown> = {}, options: FingerprintOptions = {}) => productionPromptRun(engine as never, LessonConversation as never, scenario, extra, options);

/** A teszt idejére a környezeti kapcsoló a megadott értéken (undefined: nincs beállítva), utána visszaáll. */
async function withEnv<T>(value: string | undefined, body: () => Promise<T> | T): Promise<T> {
  const prev = process.env[SOURCE_VISUALS_ENV];
  if (value === undefined) delete process.env[SOURCE_VISUALS_ENV]; else process.env[SOURCE_VISUALS_ENV] = value;
  try { return await body(); }
  finally { if (prev === undefined) delete process.env[SOURCE_VISUALS_ENV]; else process.env[SOURCE_VISUALS_ENV] = prev; }
}

test("a kapcsoló alapértéke KI: csak az `on` érték kapcsol be", () => {
  assert.equal(SOURCE_VISUALS_ENV, "STUDIO_SOURCE_VISUALS");
  assert.equal(sourceVisualsEnabled({} as NodeJS.ProcessEnv), false, "környezeti változó nélkül KI");
  for (const off of ["", "0", "1", "true", "off", "igen", "onn", "enforce"]) assert.equal(sourceVisualsEnabled({ STUDIO_SOURCE_VISUALS: off } as NodeJS.ProcessEnv), false, `„${off}” → KI`);
  for (const on of ["on", "ON", " On "]) assert.equal(sourceVisualsEnabled({ STUDIO_SOURCE_VISUALS: on } as NodeJS.ProcessEnv), true, `„${on}” → BE`);
});

test("KI (környezeti változó nélkül): új forrásból a gyártás MINDEN kérése a főágéval azonos; a kéretlen leltár nem jut a térképbe", async () => {
  const off = await withEnv(undefined, () => run("source"));
  assert.deepEqual([...new Set(off.stations)], ["1", "2", "3", "4", "5", "?", "6"], "a mintafutás minden állomást érint (nem üres egyezés)");
  assert.equal(off.fingerprint, MAIN.source, "a modellnek küldött kérések sokasága a főágéval bájtra azonos");
  // A forgatókönyv 1. állomása KÉRETLENÜL két érvényes tételt ad — KI állapotban egyik sem kerülhet a térképre, a számlálókba, a naplóba.
  assert.deepEqual(off.maps[0].visuals, []);
  for (const file of FINGERPRINT_FILES) assert.equal("visuals" in sourceFileRow(file, off.maps[0] as SingleRunMap), false, "a source_files sorában nincs visuals kulcs");
  assert.deepEqual(Object.keys(off.gates).filter((k) => k.startsWith("visuals")), [], "a telemetriában nincs leltár-számláló");
  assert.equal(off.logs.filter((l) => l.includes("Vizuális leltár")).length, 0);
  assert.ok(!off.prompts.some((p) => p.includes('\\"visuals\\": [...]')), "a leltár szerződése egyetlen kérésben sem szerepel");
  // Bármely nem `on` érték és a befecskendezett `false` ugyanez (a befecskendezés a környezet előtt áll).
  assert.equal((await withEnv("off", () => run("source"))).fingerprint, MAIN.source);
  assert.equal((await withEnv("on", () => run("source", { sourceVisuals: false }))).fingerprint, MAIN.source, "befecskendezett KI a BE környezet ellenére");
});

test("BE: az 1. állomás kéri a leltárt, és a tételek a térképre kerülnek (ellenpróba: a KI-egyezés nem üres)", async () => {
  for (const on of [await withEnv("on", () => run("source")), await withEnv(undefined, () => run("source", { sourceVisuals: true }))]) {
    assert.notEqual(on.fingerprint, MAIN.source);
    assert.ok(on.prompts.some((p) => p.includes("1. ÁLLOMÁS") && p.includes('\\"visuals\\": [...]')), "az 1. állomás kérése a leltár szerződését tartalmazza");
    assert.deepEqual((on.maps[0].visuals as Array<{ id: string }>).map((v) => v.id), ["v1", "v2"]);
    assert.ok("visuals" in sourceFileRow(FINGERPRINT_FILES[0], on.maps[0] as SingleRunMap));
    assert.equal(on.gates.visualsFound, 2);
    assert.equal(on.gates.visualsMissing, 0);
  }
});

test("KI: a térképen KORÁBBAN mentett leltárral indított gyártás kérései is a főágéval azonosak; BE állapotban a leltár elérhető", async () => {
  const off = await withEnv(undefined, () => run("map"));
  assert.ok(!off.stations.includes("1"), "térképről indítva nincs forrás-állomás");
  assert.equal(off.fingerprint, MAIN.map);
  assert.deepEqual(Object.keys(off.gates).filter((k) => k.startsWith("visuals")), []);
  const on = await withEnv(undefined, () => run("map", { sourceVisuals: true }));
  assert.equal(on.gates.visualsFound, 2);
});

test("a különálló kinyerés tartalmi lenyomata KI állapotban a főágéval azonos; BE állapotban külön térkép", async () => {
  await withEnv(undefined, () => assert.equal(singleRunMapHash(FINGERPRINT_FILES, "Terület"), MAIN.mapHash));
  assert.equal(singleRunMapHash(FINGERPRINT_FILES, "Terület", false), MAIN.mapHash);
  await withEnv("on", () => assert.notEqual(singleRunMapHash(FINGERPRINT_FILES, "Terület"), MAIN.mapHash, "a leltár nélkül kinyert térkép nem jön vissza gyorsítótárból"));
  assert.notEqual(singleRunMapHash(FINGERPRINT_FILES, "Terület", true), MAIN.mapHash);
});

/* S1b + SK1 (a lánc 2. ága): a leltár a tervező / szerző / ábrakészítő / lektor kérésébe és a fedettségi kapuba kerül — KI állapotban
   egyik sem láthatja, a tárolt (régi) leltáras térképből indított gyártásnál sem. A kérések egyezését a fenti főág-lenyomat méri. */
test("KI: a fedettségi kapu nem fut — nincs félrevezető 0 / 0 sor a telemetriában, a fedettség-kimenet a kapcsoló előtti alakú", async () => {
  for (const scenario of ["source", "map"] as const) {
    const off = await withEnv(undefined, () => run(scenario));
    assert.equal("gateResults" in off.telemetry, false, `${scenario}: a telemetriában nincs kapu-eredmény`);
    assert.equal(off.logs.filter((l) => l.includes("Forrás-fedettségi kapu")).length, 0, `${scenario}: nincs kapu-naplósor`);
    assert.ok(off.published, "a futás közzétesz");
    assert.equal("visuals" in (off.published!.coverage as object), false, `${scenario}: a lessons.coverage nem kap visuals kulcsot`);
    assert.ok(!JSON.stringify(off.lesson).includes("sourceVisualId"), `${scenario}: a leckében nincs forrástétel-hivatkozás`);
  }
});

test("BE: a tárolt leltár a promptokba és a kapuhoz jut (ellenpróba), a kapu eredménye a telemetriában", async () => {
  const on = await withEnv(undefined, () => run("map", { sourceVisuals: true }));
  assert.notEqual(on.fingerprint, MAIN.map, "a leltár a lejjebb lévő kérésekben megjelenik");
  for (const station of ["2. ÁLLOMÁS", "3. ÁLLOMÁS", "4. ÁLLOMÁS", "6. ÁLLOMÁS"]) assert.ok(on.prompts.some((p) => p.includes(station) && p.includes("A számolás lépései.")), `${station}: a leltár tétele a kérésben`);
  const results = on.telemetry.gateResults as Array<{ gate: string; mode: string; metrics: { total: number } }>;
  assert.deepEqual(results.map((r) => [r.gate, r.mode, r.metrics.total]), [["sourceCoverage", "report", 2]]);
  assert.ok("visuals" in (on.published!.coverage as object));
  // A környezeti kapcsoló ugyanezt adja (nem csak a befecskendezés).
  assert.equal((await withEnv("on", () => run("map"))).fingerprint, on.fingerprint);
});

/* S2a (a lánc 4. ága) — vak ellenőr B1: a séma OLVASÁSRA ismeri a `table` / `ruleBox` / `compareCards` fajtát, de a GYÁRTÁS a modell
   kimenetének határán (szerzői lecke, ábrafolt) csak BE állapotban fogadja el. A főág értékei ugyanabból a parancsból, mint fent. */
const MAIN_NEW_KINDS = {
  prompts: "29b6a6ec545374c7602b88c5cbefb9791c8c4815385923076cb419f21868f50f",
  logs: "ebcebb5eb834d322c70cc929798301519d0383584d4f0107fa26e842fa7eccf8",
  lesson: "e7f5627fc6cb6f8ec50452d662f07550919c3b28e0ee090297bf6a2cbbbe1e4b",
} as const;
const animKindsOf = (lesson: unknown) => (lesson as { sections: Array<{ blocks: Array<{ kind: string; animKind?: string }> }> }).sections.flatMap((s) => s.blocks.filter((b) => b.kind === "animate").map((b) => b.animKind));
const fixRequests = (r: { prompts: string[] }) => r.prompts.filter((p) => p.includes("A PROGRAM ELLENŐRZÉSE (tananyag)"));

test("KI: a modell kéretlen új fajtájú ábrája (szerzői blokk + ábrafolt) pontosan úgy bukik, mint a főágon — kérések, napló, kész lecke", async () => {
  const off = await withEnv(undefined, () => run("newKinds"));
  assert.ok(off.stations.includes("tananyag"), "a szerzői válasz javító fordulót kap (mint a főágon)");
  assert.match(fixRequests(off)[0], /sections\.0\.blocks\.3\.animKind: Invalid enum value\. Expected 'numberLine' \| .* \| 'scene3d', received 'table'/, "a javító üzenet a régi felsorolással nevezi meg a hibát");
  assert.deepEqual([off.fingerprint, off.logsHash, off.lessonHash], [MAIN_NEW_KINDS.prompts, MAIN_NEW_KINDS.logs, MAIN_NEW_KINDS.lesson]);
  assert.ok(!animKindsOf(off.lesson).includes("table"), "sem a blokk, sem a folt táblázata nem jut a leckébe");
  assert.deepEqual(Object.keys(off.gates).filter((k) => k.startsWith("undrawable")), []);
});

test("BE: az érvényes új fajtájú ábra elfogadott modellkimenet — a szerzői blokk és az ábrafolt is a leckébe kerül, javító forduló nélkül", async () => {
  const on = await withEnv(undefined, () => run("newKinds", { sourceVisuals: true }));
  assert.ok(!on.stations.includes("tananyag"), "nincs javító forduló: " + JSON.stringify(on.stations));
  assert.equal(animKindsOf(on.lesson).filter((k) => k === "table").length, 2, JSON.stringify(animKindsOf(on.lesson)));
  assert.notEqual(on.lessonHash, MAIN_NEW_KINDS.lesson);
});

/** A szerző egy bevezető fejezetet is ad, amelynek EGYETLEN blokkja hibás paraméterű (tónus nélküli) szabálydoboz; a javító fordulóra a jó tanítás jön. */
const brokenOnlyVisual = (station: string, fallback: unknown) => {
  if (station !== "3") return undefined;
  const teaching = fallback as { sections: Array<{ heading: string; blocks: unknown[] }> };
  return { ...teaching, sections: [{ ...teaching.sections[0], heading: "A terület szabálya", blocks: [
    { kind: "animate", animKind: "ruleBox", params: { items: ["A terület az oldalak szorzata."] }, caption: "A terület szabálya.", coversConceptIds: ["area"] }] }, ...teaching.sections] };
};

test("BE: a hibás paraméterű új fajtájú blokk kiesik, és ha emiatt kapu bukik, a javító üzenet ELSŐ sora a kiesés oka — számlálva, naplózva", async () => {
  const on = await withEnv(undefined, () => run("source", { sourceVisuals: true }, { reply: brokenOnlyVisual }));
  const fix = fixRequests(on);
  assert.equal(fix.length, 1, "pontosan egy javító forduló");
  const body = JSON.parse(fix[0])[1][0] as string;
  const lines = body.split("\n");
  assert.match(lines[1], /^- A program KIVETTE a\(z\) sections\[0\]\.blocks\[0\] ábrablokkot \(animKind: ruleBox\), mert a paraméterei hibásak: .*tone/, body);
  assert.ok(lines.length > 3 && !/KIVETTE/.test(lines[2]), "a kiesés oka mellett a kapu saját hibája is ott van: " + body);
  assert.deepEqual([on.gates.undrawableVisualsDropped, on.gates.undrawableVisualsExplained], [1, 1]);
  assert.equal(on.logs.filter((l) => l.includes("Kirajzolhatatlan ábrablokk kivéve: sections[0].blocks[0] (ruleBox)")).length, 1);
  assert.equal(on.logs.filter((l) => l.includes("A javító üzenet megnevezi a kivett ábrablokkot")).length, 1);
  assert.ok(on.published, "a javított leckével a futás közzétesz");
  assert.ok(!animKindsOf(on.lesson).includes("ruleBox"));
  // KI állapotban ugyanez a kimenet a régi sémahibával bukik — kiesés, számláló és „KIVETTE” sor nélkül.
  const off = await withEnv(undefined, () => run("source", {}, { reply: brokenOnlyVisual }));
  assert.match(fixRequests(off)[0], /sections\.0\.blocks\.0\.animKind: Invalid enum value/);
  assert.ok(!fixRequests(off)[0].includes("KIVETTE"));
  assert.deepEqual(Object.keys(off.gates).filter((k) => k.startsWith("undrawable")), []);
});

test("az ábrafolt határa a motoron KÍVÜLI hívóknál is a kapcsolót követi (alapérték: a környezet); a régi fajták útja változatlan", async () => {
  const { applyVisualPatch } = await import("../server/studio/visual-patch");
  const { standardFusionFixture } = await import("../shared/fixtures/lesson-fusion");
  const { experience: _bank, ...teaching } = standardFusionFixture();
  const lesson = teaching as Parameters<typeof applyVisualPatch>[0];
  const visual = (animKind: string, params: unknown) => ({ sections: [{ index: 0, visuals: [{ after: 0, animKind, params, caption: "A terület mértékegysége a négyzetcentiméter.", coversConceptIds: ["area"] }] }] });
  const table = visual("table", FINGERPRINT_TABLE);
  const off = await withEnv(undefined, () => applyVisualPatch(lesson, table)!);
  assert.deepEqual([off.added, off.rejected.length], [0, 1]);
  assert.match(off.rejected[0], /^1\. fejezet 1\. ábra: animKind Invalid enum value\. Expected 'numberLine' \| .* \| 'scene3d', received 'table'$/, "a bővítés előtti hibaüzenet, betűre");
  assert.equal(off.lesson.sections[0].blocks.length, lesson.sections[0].blocks.length, "a lecke változatlan");
  assert.equal((await withEnv("on", () => applyVisualPatch(lesson, table)!)).added, 1, "BE környezetben elfogadott");
  assert.equal((await withEnv("on", () => applyVisualPatch(lesson, table, [], { sourceVisualKinds: false })!)).added, 0, "a befecskendezett érték a környezet előtt áll");
  assert.equal((await withEnv(undefined, () => applyVisualPatch(lesson, table, [], { sourceVisualKinds: true })!)).added, 1);
  // A régi fajta KI állapotban is ugyanúgy megy át.
  assert.equal((await withEnv(undefined, () => applyVisualPatch(lesson, visual("process", { steps: ["Mérd meg az oldalakat.", "Szorozd össze őket."] }))!)).added, 1);
});
