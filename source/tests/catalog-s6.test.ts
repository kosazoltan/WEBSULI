import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCatalogPool, catalogVerbatimPaths, conceptMatches, lessonTopicText, planningCatalogBlock, quizKey, stems, topicMatch, unitCatalog,
  unitCatalogBlock, verbatimEligible, PLANNING_LIMITS, UNIT_LIMITS, type CatalogPool, type CatalogRowLike,
} from "../server/catalog/retrieval";
import { catalogS6Enabled, planningContextBlock, poolMatches } from "../server/catalog/s6-context";
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
