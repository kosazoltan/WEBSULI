import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCatalogPool, catalogVerbatimPaths, conceptMatches, lessonTopicText, planningCatalogBlock, quizKey, stems, topicMatch, unitCatalog,
  unitCatalogBlock, verbatimEligible, PLANNING_LIMITS, UNIT_LIMITS, type CatalogPool, type CatalogRowLike,
} from "../server/catalog/retrieval";
import { catalogQueryOf, catalogS6Enabled, planningContextBlock, poolMatches } from "../server/catalog/s6-context";
import { allReplacedProbability, replayLessonStats } from "../scripts/catalog/ab-replay-model";
import { lektorLessonView } from "../server/studio/lektor-view";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { runPipelineStep, PIPELINE_PROMPT_VERSION, type JobPatch, type JobView, type MapMeta, type PipelineStore } from "../server/studio/step-runner";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { MapConcept } from "../server/studio/coverage";
import type { IAIProvider } from "../server/ai/AIProvider";

/* Spec 2026-10-06-s6-katalogus-bekotes: lekérés, szó szerinti/minta szabály, bankonkénti elszigetelés, prompt-bekötés, kapcsoló. */

let fp = 0;
const row = (over: Partial<CatalogRowLike> = {}): CatalogRowLike => ({
  subject: "matematika", grade: 5, topicArea: "Számtan, műveletek", topic: "Műveleti sorrend: zárójel, szorzás-osztás", kind: "quiz",
  prompt: "Mit végzünk el először a műveleti sorrend szerint, ha nincs zárójel?", body: null,
  options: ["a szorzást és az osztást", "az összeadást", "a kivonást"], correctIndex: 0, accepted: null,
  provenances: ["legacy_html:a"], trust: "parent_verified", status: "active", fingerprint: `f${String(fp++).padStart(4, "0")}`, ...over,
});
const concepts = [{ localId: "sorrend", term: "műveleti sorrend", definition: "Először a szorzást és az osztást végezzük el." }];
const query = { subject: "matematika", grade: 5, topic: "Műveleti sorrend tanulása", concepts };

test("tövesítés és téma-egyezés: determinisztikus, töltelékszó nélkül", () => {
  assert.deepEqual([...stems("A műveleti sorrend és a zárójel")].sort(), ["művele", "sorren", "zárójel"].map((s) => s.slice(0, 6)).sort());
  assert.equal(topicMatch("Műveleti sorrend tanulása", "Számtan, műveletek / Műveleti sorrend: zárójel"), true);
  assert.equal(topicMatch("Az ókori Egyiptom", "Középkori magyar történelem / Honfoglalás"), false);
  assert.equal(conceptMatches(concepts[0], "Mit végzünk el először a műveleti sorrend szerint?"), true);
  assert.equal(conceptMatches(concepts[0], "Hány lába van a póknak?"), false);
  assert.match(lessonTopicText("6. évfolyam feladatlap", [{ localId: "x", term: "törtek szorzása" }]), /törtek szorzása/);
});

test("pool: csak a lecke saját bankjának aktív tételei — más tantárgy, flagged, review, rejected és kizárt soha", () => {
  const good = row();
  const pool = buildCatalogPool([
    good,
    row({ subject: "fizika", fingerprint: "cross-bank" }),
    row({ status: "flagged", fingerprint: "flagged" }),
    row({ status: "review", fingerprint: "review" }),
    row({ status: "rejected", fingerprint: "rejected" }),
    row({ fingerprint: "008d483b4c978586" }), // SAMPLE_EXCLUSIONS
    row({ prompt: "Mit vegzunk el eloszor a muveleti sorrend szerint?", options: ["szorzast", "osszeadast", "kivonast"], fingerprint: "unaccented" }),
    row({ excluded: true, provenances: ["lesson:self"], fingerprint: "leak" } as Partial<CatalogRowLike>),
  ], { ...query, excludeProvenances: new Set(["lesson:self"]) });
  assert.deepEqual(pool.items.map((i) => i.fingerprint), [good.fingerprint]);
  assert.equal(pool.subject, "matematika");
});

test("szó szerinti szabály: parent_verified + azonos évfolyam + téma + tiszta ellenőrzés; minden más csak minta vagy kizárt", () => {
  assert.equal(verbatimEligible(row(), 5, true), true);
  assert.equal(verbatimEligible(row({ trust: "pipeline_verified" }), 5, true), false, "gépi tétel csak minta");
  assert.equal(verbatimEligible(row({ grade: 6 }), 5, true), false, "más évfolyam csak minta");
  assert.equal(verbatimEligible(row(), 5, false), false, "téma nélkül nem szó szerinti");
  assert.equal(verbatimEligible(row({ options: ["igen", "nem"] }), 5, true), false, "2 opció nem fér a fúziós kvízbe");
  assert.equal(verbatimEligible(row({ correctIndex: 7 }), 5, true), false, "hibás kulcs");
  assert.equal(verbatimEligible(row({ prompt: "Melyik igaz?", options: ["2 + 2 = 5", "3", "1"], correctIndex: 0 }), 5, true), false, "hamis egyenlőség a kulcsban (determinisztikus ellenőrző)");
  assert.equal(verbatimEligible(row({ options: ["szorzás", "Szorzás ", "osztás"] }), 5, true), false, "ismétlődő opció");
  assert.equal(verbatimEligible(row({ kind: "short_answer", options: null, correctIndex: null, accepted: ["szorzás"] }), 5, true), false, "rövid válasz csak minta");
  const pool = buildCatalogPool([row({ fingerprint: "v" }), row({ trust: "pipeline_verified", fingerprint: "p" }), row({ grade: 4, fingerprint: "g4" }), row({ grade: 8, fingerprint: "g8" })], query);
  const byFp = new Map(pool.items.map((i) => [i.fingerprint, i.verbatim]));
  assert.deepEqual(Object.fromEntries(byFp), { v: true, p: false, g4: false }, "±1 évfolyam minta, ±3 kimarad");
});

test("egység-katalógus: korlát (≤ min(6, quizTarget/2)), egyediség a leckén belül, a minta nem szó szerinti", () => {
  const rows = Array.from({ length: 12 }, (_, n) => row({ fingerprint: `v${n}`, prompt: `Műveleti sorrend ${n}. kérdés: mit végzünk el először?` }));
  rows.push(row({ fingerprint: "s1", trust: "pipeline_verified" }));
  const pool = buildCatalogPool(rows, query);
  const used = new Set<string>();
  const first = unitCatalog(pool, concepts, { quizTarget: 8, used });
  assert.equal(first.verbatim.length, 4);
  assert.equal(first.samples.length, 1);
  assert.ok(first.verbatim.every((i) => i.conceptId === "sorrend"));
  const second = unitCatalog(pool, concepts, { quizTarget: 100, used });
  assert.equal(second.verbatim.length, UNIT_LIMITS.verbatimMax);
  assert.equal(new Set([...first.verbatim, ...second.verbatim].map((i) => i.fingerprint)).size, 4 + UNIT_LIMITS.verbatimMax, "nincs ismétlés");
  assert.equal(unitCatalog(pool, [{ localId: "x", term: "fotoszintézis" }], { quizTarget: 8, used: new Set() }).verbatim.length, 0, "fogalom-egyezés nélkül nincs");
  const block = unitCatalogBlock(first);
  assert.match(block, /SZÓ SZERINT 1\. \(fogalom: sorrend\)/);
  assert.match(block, /MINTA 1\./);
  assert.ok(block.length <= UNIT_LIMITS.chars);
  assert.equal(unitCatalogBlock({ verbatim: [], samples: [] }), "");
});

test("tervezői blokk: legfeljebb 8 minta és 4 000 karakter; üres poolnál üres", () => {
  const pool = buildCatalogPool(Array.from({ length: 30 }, (_, n) => row({ fingerprint: `x${n}`, prompt: `Műveleti sorrend ${n}: ${"hosszú szöveg ".repeat(25)}?` })), query);
  const block = planningCatalogBlock(pool);
  assert.ok(block.length <= PLANNING_LIMITS.chars);
  assert.ok((block.match(/^\d+\. /gm) ?? []).length <= PLANNING_LIMITS.samples);
  assert.equal(planningCatalogBlock(undefined), "");
  assert.equal(planningCatalogBlock({ ...pool, items: [] }), "");
});

test("szó szerinti egyezés: a kulcs a kérdés, az opciók halmaza és a helyes opció; a visszajelzés nem számít", () => {
  const r = row({ fingerprint: "k" });
  const pool = buildCatalogPool([r], query);
  const lesson = { experience: { quiz: [
    { question: r.prompt, options: [...r.options!].reverse(), correctIndex: 2, feedbackPerOption: ["x", "y", "z"] },
    { question: r.prompt, options: r.options!, correctIndex: 1, feedbackPerOption: [] },
    { question: `${r.prompt} (átírva)`, options: r.options!, correctIndex: 0, feedbackPerOption: [] },
  ] } };
  assert.deepEqual([...catalogVerbatimPaths(lesson, pool)], ["experience.quiz[0]"]);
  assert.equal(quizKey(" Mit  végzünk? ", ["A", "b"], 0), quizKey("mit végzünk?", ["B", "a"], 1));
  assert.equal(catalogVerbatimPaths(lesson, undefined).size, 0);
});

test("kapcsoló: csak STUDIO_CATALOG_S6=1; a pool-egyezés tantárgy/évfolyam/téma szerint", () => {
  assert.equal(catalogS6Enabled({}), false);
  assert.equal(catalogS6Enabled({ STUDIO_CATALOG_S6: "true" }), false);
  assert.equal(catalogS6Enabled({ STUDIO_CATALOG_S6: "1" }), true);
  const map = { meta: { title: "Műveleti sorrend tanulása", subject: "Matematika", classroom: 5 }, concepts };
  const pool = buildCatalogPool([row()], { ...query, topic: lessonTopicText(map.meta.title, concepts) });
  assert.equal(poolMatches(pool, map), true);
  assert.equal(poolMatches(pool, { ...map, meta: { ...map.meta, classroom: 6 } }), false);
  assert.equal(planningContextBlock({ ...map, meta: { ...map.meta, subject: "magyar nyelv és irodalom" } }, undefined), "", "kétértelmű tantárgy: se skill, se katalógus");
  assert.match(planningContextBlock(map, pool), /TANTÁRGY-SKILL: matematika[\s\S]*TANTÁRGYI KATALÓGUS — MINTÁK/);
});

test("lektor: a KATALÓGUS-TÉTELEK sor csak nem üres halmaznál; üresen a nézet bájtra változatlan", () => {
  const lesson = standardFusionFixture();
  const plain = lektorLessonView(lesson, { verifiedPaths: new Set() });
  assert.equal(lektorLessonView(lesson, { verifiedPaths: new Set(), catalogPaths: new Set() }), plain);
  assert.match(lektorLessonView(lesson, { catalogPaths: new Set(["experience.quiz[3]"]) }), /KATALÓGUS-TÉTELEK \(.*IGAZOLT FORRÁS.*\): experience\.quiz\[3\]/);
});

test("banképítő: katalógus nélkül és illeszkedő tétel nélküli pool mellett a rendszerprompt bájtra azonos; illeszkedővel benne a blokk", async () => {
  const fusionConcepts = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];
  const run = async (catalog?: CatalogPool) => {
    const systems: string[] = [];
    const lesson = standardFusionFixture(); lesson.mapId = "m1";
    await buildLessonExperience({ ...lesson, experience: undefined }, fusionConcepts, { ...(catalog ? { catalog } : {}), call: async (system) => { systems.push(system); return standardFusionFixture().experience!; } });
    return systems;
  };
  const base = await run();
  const areaQuery = { subject: "matematika", grade: standardFusionFixture().classroom, topic: "háromszög területe", concepts: fusionConcepts };
  const empty = buildCatalogPool([row({ topicArea: "Halmazok", topic: "Halmazok", prompt: "Mi a halmaz?" })], areaQuery);
  assert.deepEqual(await run(empty), base, "nem illeszkedő pool: változatlan prompt");
  const matching = buildCatalogPool([row({ grade: areaQuery.grade, topicArea: "Geometria", topic: "A háromszög területe", prompt: "Hogyan számoljuk ki a háromszög területét?", options: ["alap · magasság : 2", "alap + magasság", "alap · alap"], fingerprint: "tri" })], areaQuery);
  assert.equal(matching.items[0]?.verbatim, true);
  const withCatalog = await run(matching);
  assert.match(withCatalog[0], /TANTÁRGYI KATALÓGUS[\s\S]*SZÓ SZERINT 1\. \(fogalom: area\) Hogyan számoljuk ki a háromszög területét\?/);
  assert.equal(withCatalog.filter((s) => s.includes("SZÓ SZERINT")).length, 1, "a tétel csak egy egységbe kerül");
});

/* A lépés-futtató bekötése: hamis tárral, modellhívás nélkül (a hamis szolgáltató csak rögzíti a rendszerpromptot). */
const MAP_META: MapMeta = { id: "m1", title: "Műveleti sorrend tanulása", subject: "Matematika", classroom: 5 };
const MAP_CONCEPTS: MapConcept[] = [{ localId: "sorrend", term: "műveleti sorrend", definition: "Először a szorzást és az osztást végezzük el.", examWeight: "core" }];

function fakeStore(withLoader: boolean) {
  const jobs = new Map<string, JobView>();
  const loads: string[] = [];
  const store: PipelineStore = {
    loadJob: async (id) => jobs.get(id) ?? null,
    loadMap: async () => ({ meta: MAP_META, concepts: MAP_CONCEPTS }),
    loadBlockerNotes: async () => [],
    saveStep: async (id, patch: JobPatch) => { Object.assign(jobs.get(id)!, patch); },
    saveNotes: async () => undefined,
    upsertLesson: async () => "lesson-1",
    publishLesson: async () => { throw new Error("nem fut"); },
    createJob: async () => "job-1",
    ...(withLoader ? { loadCatalogRows: async (subject: string) => { loads.push(subject); return [row({ fingerprint: "m1" }), row({ subject: "fizika", fingerprint: "cross" }), row({ status: "flagged", fingerprint: "fl" })]; } } : {}),
  };
  jobs.set("job-1", { id: "job-1", lessonId: null, mapId: "m1", step: "pedagogue", status: "pending", round: 0, inputHash: "", output: { visual: { world: "jungle" } }, error: null });
  return { store, jobs, loads };
}
async function pedagogueSystem(withLoader: boolean) {
  const { store, jobs, loads } = fakeStore(withLoader);
  const systems: string[] = [];
  const providerFactory = (model: string) => ({ name: "stub", model, isAvailable: async () => true,
    chat: async (messages: Array<{ content: string }>) => { systems.push(messages[0]?.content ?? ""); return { content: "{}", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }; } } as unknown as IAIProvider);
  await runPipelineStep("job-1", { store, providerFactory, keyConfigured: () => true, promptLookup: async (_n, fallback) => fallback });
  return { system: systems[0] ?? "", job: jobs.get("job-1")!, loads };
}

test("lépés-futtató: kikapcsolt kapcsolónál nincs lekérés és a tervezői prompt bájtra azonos a betöltő nélkülivel", async () => {
  const saved = process.env.STUDIO_CATALOG_S6;
  delete process.env.STUDIO_CATALOG_S6;
  try {
    const off = await pedagogueSystem(true);
    const none = await pedagogueSystem(false);
    assert.ok(off.system.length > 0, `PIPELINE ${PIPELINE_PROMPT_VERSION}: a tervező hívása megtörtént`);
    assert.equal(off.system, none.system);
    assert.deepEqual(off.loads, []);
    assert.doesNotMatch(off.system, /TANTÁRGY-SKILL|TANTÁRGYI KATALÓGUS/);
    assert.equal(off.job.output?.catalog, undefined);
  } finally { if (saved === undefined) delete process.env.STUDIO_CATALOG_S6; else process.env.STUDIO_CATALOG_S6 = saved; }
});

test("lépés-futtató: bekapcsolva a tervező a saját bank skilljét és mintáit kapja; más bank és jelölt tétel nincs a poolban", async () => {
  const saved = process.env.STUDIO_CATALOG_S6;
  process.env.STUDIO_CATALOG_S6 = "1";
  try {
    const on = await pedagogueSystem(true);
    assert.deepEqual(on.loads, ["matematika"], "csak a lecke saját bankja");
    assert.match(on.system, /TANTÁRGY-SKILL: matematika/);
    assert.match(on.system, /TANTÁRGYI KATALÓGUS — MINTÁK \(matematika, 5\. évf\./);
    const pool = on.job.output?.catalog as CatalogPool;
    assert.deepEqual(pool.items.map((i) => i.fingerprint), ["m1"]);
  } finally { if (saved === undefined) delete process.env.STUDIO_CATALOG_S6; else process.env.STUDIO_CATALOG_S6 = saved; }
});

/* Review #202 */

test("review #202: a pool a fajtánkénti korlát után is globális pontszám-sorrendű — a jobb nem-kvíz minta nem szorul ki", () => {
  // Gyengébb (más évfolyam, gépi) kvízek és egy erősebb (azonos évfolyam, szülő-ellenőrzött) rövid válasz.
  const rows = Array.from({ length: 5 }, (_, n) => row({ fingerprint: `q${n}`, grade: 6, trust: "pipeline_verified", prompt: `Műveleti sorrend ${n}. kérdés: mit végzünk el először?` }));
  rows.push(row({ fingerprint: "sa", kind: "short_answer", options: null, correctIndex: null, accepted: ["a szorzást"] }));
  const pool = buildCatalogPool(rows, query);
  const scores = pool.items.map((i) => i.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), "csökkenő pontszám");
  assert.equal(pool.items[0].fingerprint, "sa");
  const unit = unitCatalog(pool, concepts, { quizTarget: 8, used: new Set() });
  assert.equal(unit.samples.length, UNIT_LIMITS.samples);
  assert.ok(unit.samples.some((i) => i.fingerprint === "sa"), "a legjobb minta bekerül");
});

test("review #202: a karakterkorlát a KIVÁLASZTÁSBAN érvényesül — ami kiválasztott (és used), az mind a blokkban van", () => {
  const long = (n: number) => `Műveleti sorrend ${n}. kérdés: mit végzünk el először? ${"hosszú szöveg ".repeat(26)}`.slice(0, 399);
  const rows = Array.from({ length: 12 }, (_, n) => row({ fingerprint: `L${String(n).padStart(2, "0")}`, prompt: long(n), options: [`a szorzást ${"x".repeat(180)}`, `az összeadást ${"y".repeat(180)}`, `a kivonást ${"z".repeat(180)}`] }));
  rows.push(...Array.from({ length: 6 }, (_, n) => row({ fingerprint: `S${n}`, trust: "pipeline_verified", prompt: long(100 + n) })));
  const pool = buildCatalogPool(rows, query);
  const used = new Set<string>();
  const unit = unitCatalog(pool, concepts, { quizTarget: 100, used });
  const block = unitCatalogBlock(unit);
  assert.ok(block.length <= UNIT_LIMITS.chars, `blokk ${block.length} ≤ ${UNIT_LIMITS.chars}`);
  const selected = [...unit.verbatim, ...unit.samples];
  assert.ok(selected.length > 0);
  assert.ok(unit.verbatim.length < UNIT_LIMITS.verbatimMax, "a korlát valóban szűkít (különben a teszt nem mér)");
  for (const i of selected) assert.ok(block.includes(i.prompt), `a kiválasztott ${i.fingerprint} a blokkban van`);
  assert.deepEqual([...used].sort(), selected.map((i) => i.fingerprint).sort(), "used = a ténylegesen beszúrt tételek");
  // A kimaradt tétel a következő egységben még elérhető.
  assert.ok(unitCatalog(pool, concepts, { quizTarget: 100, used }).verbatim.length > 0);
});

test("review #202: visszajátszás — visszatevés nélküli (hipergeometrikus) kör-valószínűség, ugyanazon tétel több jegyzete egy esemény", () => {
  assert.equal(allReplacedProbability(0, 0, 5), 1);
  assert.equal(allReplacedProbability(1, 2, 4), 0.5);
  assert.equal(allReplacedProbability(2, 2, 4), (2 / 4) * (1 / 3), "C(2,0)/C(4,2) = 1/6, nem (1/2)² = 1/4");
  assert.equal(allReplacedProbability(3, 2, 4), 0, "több hibás tétel, mint kiváltható");
  assert.equal(allReplacedProbability(2, 9, 4), 1, "V > Q → minden tétel kiváltva");
  const groups = new Map([["0|a", { verbatim: 2, quizzes: 4 }], ["1|b", { verbatim: 1, quizzes: 1 }]]);
  // 1. kör: két különböző tétel ugyanabban a csoportban (az egyik két jegyzettel); 2. kör: egy tétel kétszer; 3. kör: nyílt feladat + feloldatlan.
  const stats = replayLessonStats([
    { round: 0, item: "quiz[0]", group: "0|a" }, { round: 0, item: "quiz[1]", group: "0|a" }, { round: 0, item: "quiz[1]", group: "0|a" },
    { round: 1, item: "quiz[5]", group: "1|b" }, { round: 1, item: "quiz[5]", group: "1|b" },
    { round: 2, item: "tasks[0]" }, { round: 2 },
  ], groups);
  assert.equal(stats.notes, 7);
  assert.equal(stats.quizNotes, 5);
  assert.equal(stats.unresolvedNotes, 1);
  assert.equal(stats.rounds, 3);
  assert.ok(Math.abs(stats.roundsWithCatalog - ((1 - 1 / 6) + 0 + 1)) < 1e-9, `kör: ${stats.roundsWithCatalog}`);
  assert.ok(Math.abs(stats.notesWithCatalog - (3 * 0.5 + 0 + 2)) < 1e-9, `jegyzet: ${stats.notesWithCatalog}`);
  assert.equal(stats.roundsOptimistic, 1, "legjobb esetben csak a nyílt feladatos kör marad");
  assert.equal(stats.notesOptimistic, 2, "csoportonként a min(V, Q) legtöbb jegyzetű tétel");
  assert.equal(stats.notesQuizCeiling, 2);
  assert.equal(stats.roundsQuizCeiling, 1);
});

test("review #202: lépés-futtató — a szó szerinti katalógus-kvíz hash-e a helyi cleared-be kerül, a bank-ellenőr kihagyja; a csomag többi tétele ellenőrzött", async () => {
  const saved = process.env.STUDIO_CATALOG_S6;
  process.env.STUDIO_CATALOG_S6 = "1";
  try {
    const lesson = standardFusionFixture();
    const q0 = lesson.experience!.quiz[0];
    const catalogQuery = catalogQueryOf({ meta: MAP_META, concepts: MAP_CONCEPTS })!;
    const pool: CatalogPool = { version: 1, subject: catalogQuery.subject, grade: catalogQuery.grade, topic: catalogQuery.topic, items: [{
      fingerprint: "cat-q0", grade: catalogQuery.grade, topic: "Geometria / háromszög", kind: "quiz", trust: "parent_verified",
      prompt: q0.question, options: [...q0.options].reverse(), correctIndex: q0.options.length - 1 - q0.correctIndex, verbatim: true, score: 9,
    }] };
    const { store, jobs } = fakeStore(false);
    jobs.set("job-1", { id: "job-1", lessonId: null, mapId: "m1", step: "lektor", status: "pending", round: 0, inputHash: "", output: { lesson, catalog: pool }, error: null });
    const verifierSystems: string[] = [];
    let release!: () => void;
    const verifierCalled = new Promise<void>((r) => { release = r; });
    const providerFactory = (model: string) => ({ name: "stub", model, isAvailable: async () => true,
      chat: async (messages: Array<{ content: string }>) => {
        const system = messages[0]?.content ?? "";
        if (system.includes("TÁMOGATÓ SKILL: bank-verifier")) {
          verifierSystems.push(system); release();
          return { content: JSON.stringify({ errors: [], choices: [], verified: [] }), usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
        }
        await Promise.race([verifierCalled, new Promise((r) => setTimeout(r, 2_000))]);
        return { content: "{}", usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
      } } as unknown as IAIProvider);
    await runPipelineStep("job-1", { store, providerFactory, keyConfigured: () => true, promptLookup: async (_n, fallback) => fallback });
    assert.ok(verifierSystems.length > 0, "a bank-ellenőr lefutott");
    const all = verifierSystems.join("\n");
    assert.doesNotMatch(all, /"path":"experience\.quiz\[0\]"/, "a szó szerinti katalógus-kvíz nem kerül újraellenőrzésre");
    assert.match(all, /"path":"experience\.quiz\[1\]"/, "ugyanannak a csomagnak a többi kvíze ellenőrzött");
    assert.match(all, /"path":"experience\.tasks\[0\]"/, "a nyílt feladat is ellenőrzött");
  } finally { if (saved === undefined) delete process.env.STUDIO_CATALOG_S6; else process.env.STUDIO_CATALOG_S6 = saved; }
});
