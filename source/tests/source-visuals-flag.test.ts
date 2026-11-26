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
   Ha a főágon a gyártó promptjai SZÁNDÉKOSAN változnak, a három érték ugyanazzal a paranccsal frissítendő.
   Utolsó szándékos változás: TANANYAG-GYAKORLATI P3 (gyakorlatiassági szabály a szerző / tervező / bankcsomag promptjában) — csak a
   kérés-lenyomatok változtak; a kérések száma, a napló-, lecke- és séma-lenyomatok a főágéval azonosak. */
const MAIN = {
  source: "6fb2eea202d70f06a195ce42c94b62fad96d9e2620ab3fbf362772753cccd8df",
  map: "fa02fba3cd9328010a898295475b5bcbf617bc9bef13384a767a8e528fbe9e10",
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
  prompts: "6ac1a3ef44bb458c1e079f9985207bccdd0f6fed49d0a0e0e3f6ee7925b5f890",
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

/* Teljes tartalmú vak ellenőr (2026-11-18) — B1, J1, J2: KI állapotban a MODELL KIMENETÉT a bővítés előtti séma méri (`modelLessonSchema(false)`):
   a kéretlen `sourceVisualId` mező levágódik, az új ábrafajta és a többi sémahiba a főág sorrendjében és szövegével megy javító fordulóra.
   A főág értékei ugyanabból a parancsból (origin/main dc76ba52), mint fent. A lecke lenyomata a közzétételre mentett TELJES lecke-JSON-é:
   benne a tanítás, a fejezet-lenyomatból képzett gyakorlóbank és annak minden feladat- / módszer-azonosítója. */
const MAIN_STRAY = {
  strayId: { prompts: "dfee940740d7e79e497de0677ce0a2ec800cacc87c2d30e682f725bc18556433", logs: "8255249f175e6fb3a69e98ff5577900c55c4f4c00158ed7822b596373569ffc2", lesson: "165b66ef44cb0f8d3c237870b8f62637b298afb3376e12c54048e36dc3acf9f0" },
  strayIdMap: { prompts: "fd654c8670fa60c3f4b9b181fc895369fb246f3bb240ae3badddbf6522d50225", logs: "8255249f175e6fb3a69e98ff5577900c55c4f4c00158ed7822b596373569ffc2", lesson: "28f1df554e27f5a7bcef51287b5f7d3acba5a3ed32877418cd47088141bb8eb4" },
  mixed: { prompts: "804c329e944c8bb3ee545a075c6f330cb19456988632467706dd8107275fe1ca", logs: "7156009ab60960a0a4b4f1025d6986f94410cc3d60428e9ff74a288aba063123", lesson: "e7f5627fc6cb6f8ec50452d662f07550919c3b28e0ee090297bf6a2cbbbe1e4b" },
  schema: { stray: "9d6a4544e9f399b5aa82a85744ef3402cd8e99f57520723d0f5340660780e22f", mixed: "323283f910e7e7c81c7f0ba29a3d8f6111efde5d622ac73cf42a6e1c03efd78e" },
} as const;

test("KI (B1): a modell kéretlen `sourceVisualId` mezője (szerzői blokkon ÉS ábrafolton) levágódik — kérések, napló, bank-azonosítók, kész lecke a főágéval azonos", async () => {
  for (const scenario of ["strayId", "strayIdMap"] as const) {
    const off = await withEnv(undefined, () => run(scenario));
    assert.deepEqual({ prompts: off.fingerprint, logs: off.logsHash, lesson: off.lessonHash }, MAIN_STRAY[scenario], `${scenario}: a főág értékei`);
    assert.ok(!JSON.stringify(off.lesson).includes("sourceVisualId"), `${scenario}: a mentett leckében nincs forrástétel-hivatkozás`);
    assert.ok(!off.prompts.some((p) => p.includes("sourceVisualId")), `${scenario}: egyetlen kérésben sincs (a 4. és a 6. állomás a levágott leckét kapja)`);
    assert.ok(animKindsOf(off.lesson).filter((k) => k === "process").length >= 2, `${scenario}: a régi fajtájú folt ábrája bekerült (csak a mezője maradt le)`);
    assert.ok(Array.isArray((off.lesson as { experience?: { tasks?: unknown[] } }).experience?.tasks), "a lenyomat a gyakorlóbankot is tartalmazza");
    // Ellenpróba: BE állapotban a mező megmarad — a KI-egyezés tehát a levágáson múlik.
    const on = await withEnv(undefined, () => run(scenario, { sourceVisuals: true }));
    assert.ok(JSON.stringify(on.lesson).includes('"sourceVisualId":"v1"') && JSON.stringify(on.lesson).includes('"sourceVisualId":"v2"'), `${scenario}: BE állapotban a blokk és a folt mezője megmarad`);
    assert.notEqual(on.lessonHash, MAIN_STRAY[scenario].lesson);
  }
});

test("KI (J1): új fajtájú blokk ÉS más sémahiba együtt — a javító üzenet tartalma és sorrendje bájtra a főágé", async () => {
  const off = await withEnv(undefined, () => run("mixed"));
  assert.deepEqual({ prompts: off.fingerprint, logs: off.logsHash, lesson: off.lessonHash }, MAIN_STRAY.mixed);
  const body = JSON.parse(fixRequests(off)[0])[1][0] as string;
  const lines = body.split("\n").filter((l) => l.startsWith("- "));
  assert.match(lines[0], /^- sections\.0\.blocks\.0\.animKind: Invalid enum value/, "az új fajta hibája a blokk HELYÉN áll (elöl), nem a lista végén");
  assert.match(lines[1], /^- sections\.0\.blocks\.2\.answer: /, body);
  assert.equal(lines.length, 2);
});

test("KI (J2): a modellkimenet sémája a főág sémájával azonos eredményt ad — levágott mezők, hibák tartalma és sorrendje (szerző, fogalomjavítás, leckejavítás)", async () => {
  const { lessonSchema, modelLessonSchema, modelBlockSchema } = await import("../shared/lesson-schema");
  const { modelLessonRepairSchema, lessonRepairSchema } = await import("../shared/lesson-repair");
  const { modelSchemaProbe } = await import("./helpers/production-prompt-fingerprint");
  assert.deepEqual(modelSchemaProbe(modelLessonSchema(false)), MAIN_STRAY.schema, "KI: a főág `lessonSchema`-jának eredménye ugyanerre a két ellenséges leckére");
  const full = modelSchemaProbe(modelLessonSchema(true));
  assert.notEqual(full.stray, MAIN_STRAY.schema.stray, "BE: a mező megmarad");
  assert.notEqual(full.mixed, MAIN_STRAY.schema.mixed, "BE: az új fajta nem sémahiba");
  assert.equal(modelLessonSchema(true), lessonSchema, "BE állapotban a teljes séma");
  assert.equal(modelLessonRepairSchema(true), lessonRepairSchema);
  // Blokk-szint (az ábrafolt blokkja): KI állapotban a mező levágva, az új fajta elutasítva; a régi fajta mindkét állapotban érvényes.
  const animate = (animKind: string, extra: object = {}) => ({ kind: "animate", animKind, params: { steps: ["egy", "kettő"] }, caption: "Felirat.", coversConceptIds: ["area"], ...extra });
  assert.equal("sourceVisualId" in (modelBlockSchema(false).parse(animate("process", { sourceVisualId: "v1" })) as object), false);
  assert.equal((modelBlockSchema(true).parse(animate("process", { sourceVisualId: "v1" })) as { sourceVisualId?: string }).sourceVisualId, "v1");
  assert.equal(modelBlockSchema(false).safeParse(animate("table")).success, false);
  assert.equal(modelBlockSchema(true).safeParse(animate("table")).success, true);
  // A bekötés: a fogalomjavítás és a leckejavítás modellkimenet-határa a kapcsolós sémát használja (nem a teljeset).
  const { readFileSync } = await import("node:fs");
  const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(src("../server/studio/single-run/concept-fix.ts"), /const parsed = modelLessonSchema\(input\.sourceVisuals \?\? sourceVisualsEnabled\(\)\)\.safeParse\(json\);/);
  const improvement = src("../server/studio/structured-improvement.ts");
  assert.match(improvement, /const drawn = drawableCandidate\(modelLessonSchema\(sourceVisualsEnabled\(\)\)\.parse\(previous\), /, "a jelölt a kapcsolós sémán, majd a kirajzolhatóság szűrőjén megy át");
  assert.match(improvement, /return modelLessonRepairSchema\(sourceVisualsEnabled\(\)\)\.parse\(\{/);
  assert.match(improvement, /const storedCoverage = visualsOn \? withVisualCoverage\(/, "KI állapotban a tárolt fedettség változatlan, többlet lekérdezés nélkül");
  assert.match(src("../server/studio/single-run/engine.ts"), /const strict = modelLessonSchema\(visualsOn\)\.safeParse\(/);
});

/* Automatikus kódáttekintő (P2, #515): a javítás `previousLesson` mezője a TÁROLT lecke pillanatképe, nem modellkimenet — a teljes
   olvasási séma olvassa, kapcsolótól függetlenül; csak a `candidate` (a modell jelöltje) megy a kapcsolófüggő sémán. */
test("leckejavítás: a BE állapotban mentett (új fajtájú ábrás) lecke pillanatképe KI állapotban sem buktatja el a javítást; a jelölt határa marad", async () => {
  const { lessonSchema } = await import("../shared/lesson-schema");
  const { modelLessonRepairSchema } = await import("../shared/lesson-repair");
  const { standardFusionFixture } = await import("../shared/fixtures/lesson-fusion");
  const plain = lessonSchema.parse({ ...standardFusionFixture(), mapId: "m1", sourceOnly: true });
  const table = { kind: "animate", animKind: "table", params: FINGERPRINT_TABLE, caption: "A terület mértékegysége a négyzetcentiméter.", coversConceptIds: ["area"], sourceVisualId: "v1" };
  const stored = lessonSchema.parse({ ...plain, sections: plain.sections.map((s, i) => (i ? s : { ...s, blocks: [...s.blocks.slice(0, -1), table, ...s.blocks.slice(-1)] })) });
  const hash = "a".repeat(64);
  const repair = (previousLesson: unknown, candidate: unknown) => ({ kind: "lesson-repair-fusion-1", lessonId: "l1", baseVersion: 1, baselineHash: hash, baselineMaterialHash: hash, sourceHash: hash, previousLesson, candidate, reviewNotes: [] });
  // A lelet: BE-kori tárolt lecke + KI állapot + érvényes (régi fajtákból álló) jelölt → a javítás sémája átmegy, a pillanatkép ÉP marad.
  const ok = modelLessonRepairSchema(false).safeParse(repair(stored, plain));
  assert.equal(ok.success, true, ok.success ? "" : JSON.stringify(ok.error.issues.slice(0, 3)));
  const kept = (ok as { data: { previousLesson: { sections: Array<{ blocks: Array<Record<string, unknown>> }> } } }).data.previousLesson.sections[0].blocks.find((b) => b.animKind === "table");
  assert.deepEqual([kept?.animKind, kept?.sourceVisualId], ["table", "v1"], "a tárolt lecke új fajtájú blokkja és hivatkozása változatlanul a pillanatképben");
  // A jelölt (modellkimenet) határa KI állapotban változatlanul a bővítés előtti séma; BE állapotban elfogadott.
  const bad = modelLessonRepairSchema(false).safeParse(repair(plain, stored));
  assert.equal(bad.success, false);
  assert.match(bad.success ? "" : bad.error.issues.map((i) => i.path.join(".")).join(" "), /^candidate\.sections\.0\.blocks\.\d+\.animKind$/, "csak a jelölt új fajtája a hiba");
  assert.equal(modelLessonRepairSchema(true).safeParse(repair(stored, stored)).success, true);
});

test("KI = főág a tárolt leckére: régi leckealakokon a teljes olvasási séma kimenete (mezősorrend, alapértékek) a főág sémájáéval azonos", async () => {
  const { lessonSchema, modelLessonSchema } = await import("../shared/lesson-schema");
  const { storedLessonProbe } = await import("./helpers/production-prompt-fingerprint");
  // A főág (origin/main dc76ba52) `lessonSchema`-jának eredménye ugyanezekre az alakokra — a helper parancssori módjából („tárolt […]” sorok).
  const MAIN_STORED = {
    "teljes lecke bankkal": "f6ce94dfd3f74ff36e2a775c5c00affd68e60e0385d57af27bc2fa132f019dc8",
    "csak tanítás": "2be26b12f415790b6952192a4e475be707c9a43eb2bc4015f71b8ec4d32d22d3",
    "minden régi blokkfajta": "bd8a38113e0aa90e08afca5ba68b140e96576b812d9b0a3d74959cbe980d96a5",
    "alapértékek nélkül, kevert kulcssorrenddel": "793e96c623a33e6498da9d56283a836e3d8255a9c82ae9f74f9fce0b5718649f",
    "ismeretlen kulcsokkal": "793e96c623a33e6498da9d56283a836e3d8255a9c82ae9f74f9fce0b5718649f",
  };
  assert.deepEqual(storedLessonProbe(lessonSchema), MAIN_STORED, "a pillanatkép olvasása (teljes séma) régi leckén = a főág");
  assert.deepEqual(storedLessonProbe(modelLessonSchema(false)), MAIN_STORED, "régi leckén a két séma ugyanazt adja — a javítás eredménye KI állapotban a főágé");
});
