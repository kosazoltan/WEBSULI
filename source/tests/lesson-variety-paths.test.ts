import assert from "node:assert/strict";
import test from "node:test";

import { standardFusionFixture, fusionFixture } from "../shared/fixtures/lesson-fusion";
import { openerVarietyPick } from "../shared/lesson-opener";
import { seedFrom } from "../shared/seeded";
import { LESSON_VARIETY_VERSION, carryVarietyMarker, feedbackOpenerKey, feedbackView } from "../shared/lesson-feedback-openers";
import { fixConceptInConversation, type ConceptFixSource } from "../server/studio/single-run/concept-fix";
import { effectiveLessonVariety, lessonVarietyForRun, runWithLessonVariety } from "../server/studio/lesson-variety-flag";
import { bankStaticPrefix } from "../server/studio/experience-builder";
import { LessonConversation, type ModelClient, type Turn } from "../server/studio/single-run/conversation";
import { runSingleLesson, singleRunSystemPrompt, type SingleRunDeps } from "../server/studio/single-run/engine";
import { buildStructuredImprovement } from "../server/studio/structured-improvement";
import { executeWorkflow, workflowPhase } from "../server/workflows/engine";
import { memoryWorkflows } from "./helpers/workflow-store";
import type { PipelineStore, JobPatch } from "../server/studio/pipeline-store";
import type { MapConcept } from "../server/studio/coverage";

// S5a vak kör 1 (L1, L4, L2): a változatossági állapot MINDEN úton egyetlen, a futás elején rögzített döntés; a jelölőt a modell
// soha nem adhatja; KI állapotban minden út a régi kimenetet adja. Vak kör 2 + tulajdonosi döntés (2026-11-22): a modell szövegéhez a kód
// jelölt leckén sem nyúl (a korábbi L2-levágási teszt dokumentált spec-változással kikerült).

const MARK = { version: LESSON_VARIETY_VERSION };
/** A mentett lecke VÁRT jelölője (S5b): verzió + a térképből és évfolyamból számolt nyitásforma — a kódtól függetlenül újraszámolva. */
const markerOf = (lesson: unknown) => {
  const l = lesson as { mapId?: string; classroom?: number };
  assert.equal(typeof l.mapId, "string", "a mentett leckének van térképe");
  return { ...MARK, openingForm: openerVarietyPick(l.classroom!, seedFrom(l.mapId!)).form.id };
};

function withEnv<T>(name: string, value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const before = process.env[name];
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
  return fn().finally(() => { if (before === undefined) delete process.env[name]; else process.env[name] = before; });
}

// --- (A) kapcsoló-szivárgás: a döntés forrása ---

test("A: a futás állapota — új futás: befecskendezett érték, különben a környezet; folytatás: KIZÁRÓLAG a mentett job-állapot", () => {
  const on = { STUDIO_LESSON_VARIETY: "on" } as NodeJS.ProcessEnv;
  const off = {} as NodeJS.ProcessEnv;
  assert.equal(lessonVarietyForRun({}, undefined, on), true);
  assert.equal(lessonVarietyForRun({}, false, on), false);
  assert.equal(lessonVarietyForRun({}, true, off), true);
  // Mező nélküli régi checkpoint → KI, a környezettől függetlenül; a mentett BE állapot KI környezetben is BE marad.
  assert.equal(lessonVarietyForRun({ resume: { output: {} } }, undefined, on), false);
  assert.equal(lessonVarietyForRun({ resume: { output: { lessonVariety: true } } }, undefined, off), true);
  assert.equal(lessonVarietyForRun({ resume: { output: { lessonVariety: "igen" } } }, undefined, on), false);
});

test("A: a rögzített állapot a hatókörön belül minden olvasásnál ugyanaz (await után is), a környezet nem írja felül", async () => {
  await withEnv("STUDIO_LESSON_VARIETY", "on", async () => {
    const offPrefix = await withEnv("STUDIO_LESSON_VARIETY", undefined, async () => bankStaticPrefix());
    await runWithLessonVariety(false, async () => {
      assert.equal(effectiveLessonVariety(), false);
      await new Promise((r) => setTimeout(r, 1));
      assert.equal(effectiveLessonVariety(), false);
      assert.equal(bankStaticPrefix(), offPrefix, "KI hatókörben a bank előtagja bájtra a KI állapotú");
    });
    assert.equal(effectiveLessonVariety(), true, "hatókörön kívül a környezet");
  });
});

test("A (L1): javításnál a jelölő forrása a tárolt lecke — a modell jelölője mindig eldobva", () => {
  const candidate = { title: "T", variety: { version: "hamis" } };
  assert.deepEqual(carryVarietyMarker(candidate, { title: "régi" }), { title: "T" });
  assert.deepEqual(carryVarietyMarker(candidate, { title: "régi", variety: MARK }), { title: "T", variety: MARK });
  assert.deepEqual(carryVarietyMarker({ title: "T" }, { variety: { version: 5 } }), { title: "T" }, "hibás tárolt jelölő → nincs");
  assert.deepEqual(carryVarietyMarker({ title: "T" }, null), { title: "T" });
  assert.equal(carryVarietyMarker(null, { variety: MARK }), null);
});

// --- a javítási út teljes kódútja (L1) ---

const repairSource = { subject: "matematika", classroom: 7, concepts: [{ localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] };

async function repairWith(original: ReturnType<typeof fusionFixture>) {
  const { store } = memoryWorkflows();
  const e = standardFusionFixture().experience!;
  const seen: boolean[] = [];
  let candidateVariety: unknown = "nem futott";
  await executeWorkflow(store, { id: `repair-${Math.random()}`, owner: "owner", mode: "repair" }, async () => {
    await workflowPhase("source"); let calls = 0;
    const result = await buildStructuredImprovement(original, repairSource, async (step) => {
      seen.push(effectiveLessonVariety());
      if (step === "lektor") return { notes: [] };
      // A modell kéretlen jelölőt ad a javított tanításban.
      // V4: BE futásban a bankkérés a KVÍZTÍPUSOK szabályt viszi (a modell típusolt kvízt ad) — lásd bankAnswer.
      return calls++ === 0 ? { ...original, variety: { version: "valtozatossag-1" } } : { methods: e.methods, tasks: e.tasks, quiz: bankAnswer(effectiveLessonVariety() ? "KVÍZTÍPUSOK" : "", { quiz: e.quiz }).quiz, glossary: [] };
    });
    candidateVariety = (result.candidate as { variety?: unknown }).variety;
    await workflowPhase("save"); await workflowPhase("readback");
    return { kind: "candidate", id: "c" };
  });
  return { seen, candidateVariety };
}

test("L1: forrásvizuál BE + változatosság KI, jelöletlen lecke javítása — a modell jelölője nem kerül a jelöltbe, a javítás KI állapotban fut", async () => {
  await withEnv("STUDIO_SOURCE_VISUALS", "on", () => withEnv("STUDIO_LESSON_VARIETY", undefined, async () => {
    const { seen, candidateVariety } = await repairWith(fusionFixture());
    assert.equal(candidateVariety, undefined);
    assert.ok(seen.length && seen.every((v) => v === false), JSON.stringify(seen));
  }));
});

test("L1: a környezet BE, de a tárolt lecke jelöletlen — a javítás a lecke állapotát (KI) viszi végig; jelölt leckénél a tárolt jelölő marad", async () => {
  await withEnv("STUDIO_SOURCE_VISUALS", "on", () => withEnv("STUDIO_LESSON_VARIETY", "on", async () => {
    const plain = await repairWith(fusionFixture());
    assert.equal(plain.candidateVariety, undefined);
    assert.ok(plain.seen.every((v) => v === false), JSON.stringify(plain.seen));
    const marked = await repairWith({ ...fusionFixture(), variety: MARK } as ReturnType<typeof fusionFixture>);
    assert.deepEqual(marked.candidateVariety, MARK);
    assert.ok(marked.seen.every((v) => v === true), JSON.stringify(marked.seen));
  }));
});

// --- az első gyártás és a folytatás teljes kódútja (L4) ---

const fixture = standardFusionFixture();
const concepts: MapConcept[] = [{ localId: "area", examWeight: "core", term: "terület", definition: "A síkidom által lefedett rész nagysága." }];
const TRANSCRIPT = "A téglalap területe az oldalak szorzata. A terület mértékegysége a négyzetcentiméter.";
const outline = { sections: [{ heading: fixture.sections[0].heading, conceptIds: ["area"], plannedBlocks: ["explain", "example", "animate", "recap"], animationSuggestions: [] }], misconceptions: [] };

/**
 * V4: BE állapotban a bankkérés a KVÍZTÍPUSOK szabályt viszi — a valós modell ilyenkor típusolt kvízt ad (≥ 6 kérdésnél ≥ 2 típus). A fixture
 * számos opciójú tételei közül minden második „number” típusú; KI kérésben (nincs szabály) a fixture változatlan.
 */
function bankAnswer(prompt: string, experience: unknown) {
  const packet = structuredClone(experience) as { quiz: Array<Record<string, unknown>> };
  const numeric = (q: Record<string, unknown>) => (q.options as string[]).every(o => /^\d+ cm²$/.test(o));
  if (prompt.includes("KVÍZTÍPUSOK")) packet.quiz = packet.quiz.map((q, i) => ({ ...q, format: i % 2 && numeric(q) ? "number" : "choice" }));
  return packet;
}

function client(opts: { failBank?: boolean; failAuthor?: boolean; modelMarker?: boolean; outline?: unknown; onAuthor?: (request: string) => void } = {}): ModelClient {
  const { experience: _bank, ...teaching } = fixture;
  return {
    model: "claude-opus-5-5",
    async complete(_system, turns: Turn[]) {
      const t = turns.at(-1)!.blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
      const station = /(\d)\. ÁLLOMÁS/.exec(t)?.[1] ?? (/A PROGRAM ELLENŐRZÉSE \((.+?)\)/.exec(t)?.[1] ?? "?");
      let json: unknown;
      if (station === "1") json = { title: "Terület", subject: fixture.subject, classroom: fixture.classroom, transcript: TRANSCRIPT,
        concepts: [{ id: "area", term: "terület", definition: "A síkidom által lefedett rész nagysága.", quote: "A téglalap területe az oldalak szorzata.", type: "concept", examWeight: "core", relatedIds: [] }] };
      else if (station === "2" || station === "tananyagterv") json = opts.outline ?? outline;
      else if (station === "3") { opts.onAuthor?.(t); if (opts.failAuthor) return { text: "nem JSON", model: "claude-opus-5-5", truncated: false, usage: { input: 1, cachedInput: 0, output: 1 } }; json = opts.modelMarker ? { ...teaching, variety: { version: "valtozatossag-1" } } : teaching; }
      else if (station === "4") json = { patches: "nem érvényes ábrafolt" };
      else if (station === "5") { if (opts.failBank) return { text: "nem JSON", model: "claude-opus-5-5", truncated: false, usage: { input: 1, cachedInput: 0, output: 1 } }; json = bankAnswer(t, fixture.experience); }
      else if (station === "6" || station === "lektorálás") json = { solutions: [], notes: [], reviewedAll: true };
      else json = {};
      return { text: JSON.stringify(json), model: "claude-opus-5-5", truncated: false, usage: { input: 1000, cachedInput: 600, output: 100 } };
    },
  };
}

function memory() {
  const steps: JobPatch[] = [];
  const lessons: unknown[] = [];
  let saved: MapConcept[] | null = null;
  const store = {
    async loadMap(id: string) { return id === "m1" ? { meta: { id: "m1", title: "Terület", subject: fixture.subject, classroom: fixture.classroom, sourceText: TRANSCRIPT, visuals: [] }, concepts: saved ?? concepts } : null; },
    async createJob() { return "job1"; },
    async saveStep(_id: string, patch: JobPatch) { steps.push(structuredClone(patch)); },
    async upsertLesson(_lessonId: string | null, _mapId: string, json: unknown) { lessons.push(structuredClone(json)); return "lesson1"; },
    async publishLesson() { return { htmlFileId: "html1", exportedQuizItems: 3 }; },
    async loadJob() { return null; }, async loadBlockerNotes() { return []; }, async saveNotes() {},
  } as unknown as PipelineStore;
  return { store, steps, lessons, saveConcepts: (c: MapConcept[]) => { saved = c; } };
}

function runDeps(c: ModelClient, mem: ReturnType<typeof memory>, extra: Partial<SingleRunDeps> = {}, state?: unknown): SingleRunDeps {
  return {
    conversation: new LessonConversation(singleRunSystemPrompt(), c, null, state ? { state: state as never } : undefined),
    fresh: (system) => new LessonConversation(system, c, null),
    store: mem.store,
    async saveMap(map) { mem.saveConcepts(map.concepts.map((x) => ({ localId: x.id, examWeight: x.examWeight, term: x.term, definition: x.definition, quote: x.quote }))); return "m1"; },
    ...extra,
  };
}

const files = [{ name: "f.txt", kind: "text" as const, content: TRANSCRIPT }];
const lastOutput = (mem: ReturnType<typeof memory>) => mem.steps.at(-1)!.output as Record<string, unknown> & { singleRun: { conversation: unknown } };

test("első gyártás: BE → a mentett leckén a szerver jelölője, a job állapotában lessonVariety; KI → egyik sincs (a modell jelölője is eldobva)", async () => {
  const on = memory();
  await runSingleLesson({ files, ownerId: "u1" }, runDeps(client(), on, { lessonVariety: true }));
  assert.deepEqual((on.lessons.at(-1) as { variety?: unknown }).variety, markerOf(on.lessons.at(-1)));
  assert.equal(lastOutput(on).lessonVariety, true);
  const off = memory();
  await withEnv("STUDIO_LESSON_VARIETY", "on", () => runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ modelMarker: true }), off, { lessonVariety: false, sourceVisuals: true })));
  assert.equal("variety" in (off.lessons.at(-1) as object), false, "KI: a modell jelölője sem kerül a leckére (forrásvizuál BE mellett sem)");
  assert.equal("lessonVariety" in lastOutput(off), false, "KI: a job kimenete a régi alakú");
});

test("L4: KI-ben indult, a bankban megszakadt futás BE környezetben folytatva KI marad (és fordítva)", async () => {
  for (const [startOn, resumeEnv, expectMarked] of [[false, "on", false], [true, undefined, true]] as const) {
    const first = memory();
    await assert.rejects(runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ failBank: true }), first, { lessonVariety: startOn })));
    const saved = lastOutput(first);
    const second = memory();
    await withEnv("STUDIO_LESSON_VARIETY", resumeEnv, () =>
      runSingleLesson({ files: [], mapId: "m1", ownerId: "u1", resume: { jobId: "job1", output: saved } }, runDeps(client(), second, {}, saved.singleRun.conversation)));
    const lesson = second.lessons.at(-1) as { variety?: unknown };
    assert.equal(lesson.variety !== undefined, expectMarked, `indulás ${startOn}, folytatás env=${resumeEnv}`);
  }
});

test("vak kör 2, L2: KI módban a modell jelölője a job egyik mentett leckepéldányába (checkpoint, végső output.lesson) sem kerül", async () => {
  const off = memory();
  await withEnv("STUDIO_LESSON_VARIETY", "on", () => runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ modelMarker: true }), off, { lessonVariety: false, sourceVisuals: true })));
  const withLesson = off.steps.filter((s) => (s.output as { lesson?: unknown } | undefined)?.lesson);
  assert.ok(withLesson.length >= 2, "a szerző utáni checkpoint és a végső kimenet is mentett leckét hordoz");
  for (const s of withLesson) assert.equal("variety" in ((s.output as { lesson: object }).lesson), false, `lépés: ${s.step}`);
  // BE futásban is: a job leckepéldánya a modell jelölőjét nem hordozza (a jelölőt csak a közzétételi mentés írja).
  const on = memory();
  await runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ modelMarker: true }), on, { lessonVariety: true, sourceVisuals: true }));
  for (const s of on.steps.filter((x) => (x.output as { lesson?: unknown } | undefined)?.lesson)) assert.equal("variety" in ((s.output as { lesson: object }).lesson), false, `BE lépés: ${s.step}`);
  assert.deepEqual((on.lessons.at(-1) as { variety?: unknown }).variety, markerOf(on.lessons.at(-1)));
});

// --- a célzott fogalomjavítás (vak kör 2, L3): a tárolt lecke állapota és jelölője ---

const conceptSource: ConceptFixSource = { subject: fixture.subject, classroom: fixture.classroom,
  concepts: [{ id: "c1", localId: "area", term: "terület", definition: "A síkidom által lefedett rész nagysága.", quote: "A téglalap területe az oldalak szorzata.", examWeight: "core" }] };

async function conceptFixWith(original: typeof fixture) {
  const { experience: _bank, ...teaching } = fixture;
  const seen: boolean[] = [];
  const fake: ModelClient = { model: "claude-opus-5-5", async complete(_system, turns) {
    seen.push(effectiveLessonVariety());
    const t = turns.at(-1)!.blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    let json: unknown = {};
    if (/^FOGALOMJAVÍTÁS|A PROGRAM ELLENŐRZÉSE \(fogalomjavítás\)/.test(t)) json = { ...teaching, variety: { version: "valtozatossag-1" } };
    else if (/5\. ÁLLOMÁS/.test(t)) json = bankAnswer(t, fixture.experience);
    else if (/(^|\n)LEKTORÁLÁS|A PROGRAM ELLENŐRZÉSE \(a javítás lektorálása\)/.test(t)) json = { solutions: [], notes: [], reviewedAll: true };
    return { text: JSON.stringify(json), model: "claude-opus-5-5", truncated: false };
  } };
  const result = await fixConceptInConversation({ original, source: conceptSource, conceptId: "area", conversation: new LessonConversation(singleRunSystemPrompt(), fake, null), fresh: (s) => new LessonConversation(s, fake, null), sourceVisuals: true });
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 300));
  return { seen, variety: result.ok ? (result.candidate as { variety?: unknown }).variety : "hiba" };
}

test("vak kör 2, L3: fogalomjavítás — jelöletlen lecke BE környezetben KI állapotban fut, a modell jelölője eldobva; jelölt lecke KI környezetben BE marad", async () => {
  await withEnv("STUDIO_LESSON_VARIETY", "on", async () => {
    const plain = await conceptFixWith(fixture);
    assert.equal(plain.variety, undefined);
    assert.ok(plain.seen.length && plain.seen.every((v) => v === false), JSON.stringify(plain.seen));
  });
  await withEnv("STUDIO_LESSON_VARIETY", undefined, async () => {
    const marked = await conceptFixWith({ ...fixture, variety: MARK } as typeof fixture);
    assert.deepEqual(marked.variety, MARK);
    assert.ok(marked.seen.length && marked.seen.every((v) => v === true), JSON.stringify(marked.seen));
  });
});

// --- (B) a modell szövege érintetlen (tulajdonosi döntés 2026-11-22, „NINCS LEVÁGÁS”) ---

test("NINCS LEVÁGÁS: jelölt leckén a modell visszajelzés-szövege minden esetben bájtra változatlan (kód, képlet, mínusz, nyitással kezdődő szöveg)", () => {
  const key = feedbackOpenerKey("m", "q", ["a", "b"]);
  for (const text of [
    "Jó próba, de index - 1 adja az előző elem indexét.", "Jó próba -index a változó ellentettje, nem maga az értéke.",
    "index - 1 adja az előző elem indexét.", "-index a változó ellentettje.", "Jó próba -3 az eredmény, nem 3.", "Jó próba – 3 az eredmény.",
    "Jó próba, de x = -3 a megoldás.", "Remek, de pH = 7 a semleges oldat.", "Szuper! -5 °C-on fagy meg a sós víz.", "Jó próbálkozás, de a négyzet oldalai egyenlők.",
    "Ügyes gondolat, de i++ előbb növel.", "Helyes: 45.", "Nem helyes. A szorzás előbb jön.", "Igen.", "  szóközzel kezdődik  ", "a kisbetűs próza.",
  ]) for (const right of [true, false]) for (const band of ["kid", "teen", "senior"] as const) {
    assert.equal(feedbackView({ right, text, variety: { marker: MARK, band, key } }).reason, text, `${right}/${band}: ${text}`);
  }
});

test("javítás-artefaktum (Vercel-review #530): a jelölt lecke előnézeti jelöltje megtartja a jelölőt KI forrásábra-kapcsolónál is; a modellé nem megy át", async () => {
  const { sealLessonRepair } = await import("../shared/lesson-repair");
  const hash = "a".repeat(64);
  const base = { kind: "lesson-repair-fusion-1" as const, lessonId: "l1", baseVersion: 1, baselineHash: hash, baselineMaterialHash: hash, sourceHash: hash, reviewNotes: [] };
  const marked = { ...fusionFixture(), variety: MARK };
  for (const sourceVisuals of [false, true]) {
    const sealed = sealLessonRepair(sourceVisuals, { ...base, previousLesson: marked, candidate: { ...fusionFixture(), variety: MARK } });
    assert.deepEqual(sealed.candidate.variety, MARK, `jelölt lecke, sourceVisuals=${sourceVisuals}: az előnézet = az alkalmazott lecke`);
    const unmarked = sealLessonRepair(sourceVisuals, { ...base, previousLesson: fusionFixture(), candidate: { ...fusionFixture(), variety: { version: "modell-kéretlen" } } });
    assert.equal(unmarked.candidate.variety, undefined, `jelöletlen lecke, sourceVisuals=${sourceVisuals}: a modell jelölője eldobva`);
  }
});

test("javítás-artefaktum bekötése: a szerver a lezárt (jelölő-visszaírt) artefaktumot adja vissza", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../server/studio/structured-improvement.ts", import.meta.url), "utf8");
  assert.match(src, /return markRepairCandidate\(parseArtefact\(\)\);/);
});

test("S5b-v2: a javítás megőrzi a tárolt jelölő nyitásformáját; hibás alakú formát nem visz át", () => {
  const stored = { variety: { version: LESSON_VARIETY_VERSION, openingForm: "rejtely" } };
  assert.deepEqual(carryVarietyMarker({ title: "T", variety: { version: "modell", openingForm: "mas" } }, stored), { title: "T", variety: { version: LESSON_VARIETY_VERSION, openingForm: "rejtely" } });
  assert.deepEqual(carryVarietyMarker({ title: "T" }, { variety: { version: LESSON_VARIETY_VERSION, openingForm: "<script>" } }), { title: "T", variety: { version: LESSON_VARIETY_VERSION } });
  assert.deepEqual(carryVarietyMarker({ title: "T" }, { variety: { version: LESSON_VARIETY_VERSION, openingForm: 5 } }), { title: "T", variety: { version: LESSON_VARIETY_VERSION } });
});

test("S5b vak kör 1 L2: évfolyamváltó javításnál a jelölő formája az ÚJ évfolyam kiosztása (ugyanaz, amit a prompt kér); változatlan évfolyamnál a tárolt marad", () => {
  const stored = { mapId: "m1", classroom: 3, variety: { version: LESSON_VARIETY_VERSION, openingForm: openerVarietyPick(3, seedFrom("m1")).form.id } };
  const same = carryVarietyMarker({ title: "T", mapId: "m1", classroom: 3 }, stored) as { variety?: { openingForm?: string } };
  assert.equal(same.variety?.openingForm, stored.variety.openingForm, "változatlan évfolyam: a tárolt forma");
  const moved = carryVarietyMarker({ title: "T", mapId: "m1", classroom: 12 }, stored) as { variety?: { openingForm?: string; version?: string } };
  assert.equal(moved.variety?.openingForm, openerVarietyPick(12, seedFrom("m1")).form.id, "új évfolyam: az új kiosztás");
  assert.equal(moved.variety?.version, LESSON_VARIETY_VERSION);
  // v1 jelölőjű (forma nélküli) tárolt lecke: évfolyamváltásnál sem kap formát — a javítás promptja sem kér rá újat.
  const v1 = { mapId: "m1", classroom: 3, variety: { version: "valtozatossag-1" } };
  assert.deepEqual((carryVarietyMarker({ title: "T", mapId: "m1", classroom: 12 }, v1) as { variety?: unknown }).variety, { version: "valtozatossag-1" });
});

test("S5b vak kör 1 L2: a javítás promptja csak nyitásformát hordozó (v2) tárolt jelölőnél kér kiosztott formát", async () => {
  const { repairVarietyOption } = await import("../server/studio/structured-improvement");
  assert.deepEqual(repairVarietyOption({ mapId: "m1", variety: { version: LESSON_VARIETY_VERSION, openingForm: "rejtely" } }), { seed: seedFrom("m1") });
  assert.equal(repairVarietyOption({ mapId: "m1", variety: { version: "valtozatossag-1" } }), undefined, "v1: nincs új forma a promptban");
  assert.equal(repairVarietyOption({ mapId: "m1" }), undefined, "jelöletlen lecke");
});

test("review #534 (Codex, Copilot): a jelölő nyitásformája az, amit a szerző TÉNYLEG megkapott — régi (forma nélküli) checkpointból folytatva nem keletkezik utólag forma", async () => {
  // Friss BE futás: a job állapota rögzíti a kiosztott formát, a mentett lecke jelölője ugyanezt hordozza.
  const fresh = memory();
  await runSingleLesson({ files, ownerId: "u1" }, runDeps(client(), fresh, { lessonVariety: true }));
  const assigned = lastOutput(fresh).openingForm;
  assert.equal(typeof assigned, "string", "a job állapota rögzíti a szerzőnek kiosztott formát");
  assert.equal((fresh.lessons.at(-1) as { variety?: { openingForm?: string } }).variety?.openingForm, assigned);
  // Review #534 (Copilot): a builder VISSZAADOTT bankja — a módszerek a kiosztás (a mag) sorrendjében, csomagonként; nem a modell sorrendjében.
  const built = (fresh.lessons.at(-1) as { mapId: string; experience: { methods: Array<{ kind: string; sourceHash?: string }>; bankPlan: { units: Array<{ sectionIndex: number; conceptIds: string[]; sourceHash?: string }>; taskRound: number; quizRound: number } } });
  const { bankUnitQuota } = await import("../shared/lesson-bank-plan");
  built.experience.bankPlan.units.forEach((unit, i) => {
    const quota = bankUnitQuota(built.experience.bankPlan, i, seedFrom(built.mapId)).methodKinds;
    const got = built.experience.methods.filter((m) => m.sourceHash === unit.sourceHash).map((m) => m.kind);
    assert.deepEqual(got.slice(0, quota.length), quota, `${i}. csomag: a módszerek a kiosztott sorrendben`);
  });
  // S5a alatt megkezdett (forma nélküli job-állapotú), a bankban megszakadt BE futás folytatása: a szerző kimarad → nincs forma.
  const first = memory();
  await assert.rejects(runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ failBank: true }), first, { lessonVariety: true })));
  const { openingForm: _dropped, ...legacySaved } = lastOutput(first);
  assert.ok((legacySaved as { lesson?: unknown }).lesson, "a megszakadt futás már hordoz kész tanítást");
  const second = memory();
  await runSingleLesson({ files: [], mapId: "m1", ownerId: "u1", resume: { jobId: "job1", output: legacySaved } }, runDeps(client(), second, {}, legacySaved.singleRun.conversation));
  const resumedLesson = second.lessons.at(-1) as { variety?: { version?: string; openingForm?: string } };
  assert.equal(resumedLesson.variety?.version, LESSON_VARIETY_VERSION, "a futás BE maradt");
  assert.equal("openingForm" in (resumedLesson.variety ?? {}), false, "régi checkpointból átvett tanításhoz nincs utólagos forma");
});

// --- S6a review #536 (Copilot): a V15 motorbeli bekötése VISELKEDÉSI teszttel — a mentett terv és a szerzőnek ténylegesen átadott kérés ---

test("S6a V15 a motorban: BE — a mentett terv és a szerzői kérés a kiosztott (típushoz illő) blokksort hordozza; KI, jóváhagyott terv és folytatás — az eredeti sorok", async () => {
  const { applySectionShapes, SECTION_SHAPES } = await import("../shared/lesson-section-shapes");
  const typed = { ...outline, sections: outline.sections.map((sec) => ({ ...sec, sectionKind: "procedure" })) };
  const original = outline.sections[0].plannedBlocks;
  const plannedOf = (mem: ReturnType<typeof memory>) => (lastOutput(mem).outline as { sections: Array<{ plannedBlocks: string[]; sectionKind?: unknown }> }).sections[0];
  const quoted = (blocks: readonly string[]) => JSON.stringify(blocks);

  // BE, friss futás: a program kiosztása megy a job állapotába ÉS a szerzőnek.
  let request = "";
  const on = memory();
  await runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ outline: typed, onAuthor: (text) => { request = text; } }), on, { lessonVariety: true }));
  const expected = applySectionShapes(typed, seedFrom("m1")).sections[0].plannedBlocks;
  assert.notDeepEqual(expected, original, "a próba valódi átírást mér");
  // S6b (dokumentált spec-változás): a kiosztott sor a `planSections` kimenete — a típushoz illő minta + a try-minimum beszúrása.
  const { planSections } = await import("../shared/lesson-section-shapes");
  const plannedShape = planSections(["procedure"], seedFrom("m1"))[0];
  assert.ok(SECTION_SHAPES.some((shape) => shape.id === plannedShape.shape && shape.fits.includes("procedure")), "a kiosztott minta a típushoz illik");
  assert.deepEqual(expected, plannedShape.blocks);
  // S6b: a kiosztott try-fajta is eljut a szerzőhöz (a beszélgetésben csak a modell eredeti terve áll) és a mentett tervbe.
  assert.ok(plannedShape.tryKind, "egyfejezetes leckénél a try-minimum miatt van try");
  assert.ok(request.includes(`tryKind: "${plannedShape.tryKind}"`), "a szerzői kérés közli a try fajtáját");
  assert.equal((plannedOf(on) as { tryKind?: string }).tryKind, plannedShape.tryKind);
  assert.deepEqual(plannedOf(on).plannedBlocks, expected, "a mentett terv a kiosztott sor");
  assert.equal("sectionKind" in plannedOf(on), false, "a sectionKind nem megy tovább");
  assert.ok(request.includes(quoted(expected)), "a szerző a kiosztott sort kapja");
  assert.ok(request.includes("TANÍTÁSI TÖRZSÉNEK") && request.includes("nyitóblokkokat"), "L8: a sor a tanítás törzse, a nyitóblokkok előtte állnak");
  assert.equal(lastOutput(on).sectionShapes, true, "L7: a terv eredete a job állapotában");
  assert.equal(request.includes(quoted(original)), false, "a szerző nem a modell eredeti sorát kapja");

  // KI: a modell terve változatlanul megy tovább (csak a kéretlen sectionKind esik ki).
  request = "";
  const off = memory();
  await runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ outline: typed, onAuthor: (text) => { request = text; } }), off, { lessonVariety: false }));
  assert.deepEqual(plannedOf(off).plannedBlocks, original);
  assert.equal("sectionKind" in plannedOf(off), false);
  assert.ok(request.length > 0 && !request.includes("VÉGLEGES BLOKKSORA"), "KI: a szerzői kérésben nincs kiosztás (a terv a beszélgetésben a modell eredeti terve)");

  // BE + a tulajdonos jóváhagyott terve: változatlan.
  request = "";
  const approved = memory();
  await runSingleLesson({ files, ownerId: "u1", approvedOutline: outline }, runDeps(client({ onAuthor: (text) => { request = text; } }), approved, { lessonVariety: true }));
  assert.deepEqual(plannedOf(approved).plannedBlocks, original, "jóváhagyott terv: változatlan");
  assert.equal("sectionShapes" in lastOutput(approved), false, "L7: jóváhagyott tervnél nincs kiosztás-jelző");
  // 3. vak kör (L7): a jóváhagyott tervből indult BE futás a terv mentése UTÁN, a szerző válasza ELŐTT megszakad; a folytatás bemenetében
  // már nincs approvedOutline — a szerzői kérés ekkor sem hivatkozhat kiosztásra.
  const { lesson: _l, experience: _e, experienceCheckpoint: _c, ...beforeAuthor } = lastOutput(approved) as Record<string, unknown>;
  request = "";
  const resumedApproved = memory();
  await runSingleLesson({ files: [], mapId: "m1", ownerId: "u1", resume: { jobId: "job1", output: beforeAuthor } }, runDeps(client({ onAuthor: (text) => { request = text; } }), resumedApproved, {}, (beforeAuthor as { singleRun?: { conversation?: unknown } }).singleRun?.conversation));
  assert.ok(request.length > 0 && !request.includes("VÉGLEGES BLOKKSORA"), "jóváhagyott terv folytatása: a szerzői kérésben nincs kiosztás");
  assert.deepEqual(plannedOf(resumedApproved).plannedBlocks, original);
  assert.ok(request.length > 0 && !request.includes("VÉGLEGES BLOKKSORA"), "jóváhagyott terv: a szerzői kérésben nincs kiosztás");

  // BE folytatás a terv után megszakadt futásból: a mentett (már kiosztott) terv nem íródik át újra.
  const first = memory();
  await assert.rejects(runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ outline: typed, failBank: true }), first, { lessonVariety: true })));
  const saved = lastOutput(first);
  assert.deepEqual((saved.outline as { sections: Array<{ plannedBlocks: string[] }> }).sections[0].plannedBlocks, expected);
  const second = memory();
  await runSingleLesson({ files: [], mapId: "m1", ownerId: "u1", resume: { jobId: "job1", output: saved } }, runDeps(client(), second, {}, saved.singleRun.conversation));
  assert.deepEqual(plannedOf(second).plannedBlocks, expected, "folytatás: a mentett terv sorai változatlanok");
});

// --- S6b 1. vak kör (L1; egyben az S6a 4. körének L9 jegye): a szerző ELŐTT megszakadt modellterves BE futás folytatása ---

test("S6b L1: a szerző előtt megszakadt BE futás folytatása — a mentett terv és a szerzői kérés megőrzi a kiosztott blokksort ÉS a try fajtáját", async () => {
  const typed = { ...outline, sections: outline.sections.map((sec) => ({ ...sec, sectionKind: "procedure" })) };
  type Planned = { plannedBlocks: string[]; tryKind?: string; sectionKind?: unknown };
  const plannedOf = (out: Record<string, unknown>) => (out.outline as { sections: Planned[] }).sections[0];
  const first = memory();
  await assert.rejects(runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ outline: typed, failAuthor: true }), first, { lessonVariety: true })));
  const saved = lastOutput(first);
  assert.equal((saved as { lesson?: unknown }).lesson, undefined, "a megszakadás a szerző válasza ELŐTT történt");
  assert.equal(saved.sectionShapes, true);
  const assigned = plannedOf(saved);
  assert.ok(assigned.tryKind, "a mentett terv hordozza a kiosztott try-fajtát");

  let request = "";
  const second = memory();
  await runSingleLesson({ files: [], mapId: "m1", ownerId: "u1", resume: { jobId: "job1", output: saved } }, runDeps(client({ onAuthor: (text) => { request = text; } }), second, {}, saved.singleRun.conversation));
  const after = plannedOf(lastOutput(second));
  assert.deepEqual(after.plannedBlocks, assigned.plannedBlocks, "folytatás: a blokksor változatlan");
  assert.equal(after.tryKind, assigned.tryKind, "folytatás: a try fajtája megmarad a mentett tervben");
  assert.ok(request.includes(JSON.stringify(assigned.plannedBlocks)), "folytatás: a szerző megkapja a kiosztott sort");
  assert.ok(request.includes(`tryKind: "${assigned.tryKind}"`), "folytatás: a szerző megkapja a try fajtáját");
  assert.equal(lastOutput(second).sectionShapes, true);
});

test("S6b L1: jóváhagyott tervnél, friss modelltervnél és KI állapotban a kéretlen tryKind továbbra is kiesik", async () => {
  const { applySectionShapes } = await import("../shared/lesson-section-shapes");
  const stray = { sections: [{ heading: "A", plannedBlocks: ["explain", "try", "check"], tryKind: "match", sectionKind: "procedure" }] };
  assert.deepEqual(applySectionShapes(stray, undefined), { sections: [{ heading: "A", plannedBlocks: ["explain", "try", "check"] }] }, "KI / jóváhagyott: mindkét mező kiesik");
  assert.deepEqual(applySectionShapes(stray, undefined, true), { sections: [{ heading: "A", plannedBlocks: ["explain", "try", "check"], tryKind: "match" }] }, "mentett kiosztás: a tryKind marad, a sectionKind kiesik");
  const kept = { sections: [{ heading: "A", plannedBlocks: ["explain"], tryKind: "match" }] };
  assert.equal(applySectionShapes(kept, undefined, true), kept, "nincs mit tisztítani: ugyanaz az objektum");
});

// --- S6c-1 1. vak kör (L5): a VÉGLEGES mentés méri az ábrafajtákat — a done job telemetriája és jelzése a publikált leckéhez illik ---

test("S6c-1 L5: BE futás végén a mentett telemetria (visualKinds) és a fajta-jelzés a publikált leckéből számol; KI futásban nincs ilyen", async () => {
  const { visualKindCounts, kindShareProblems } = await import("../shared/visual-kind-plan");
  const on = memory();
  await runSingleLesson({ files, ownerId: "u1" }, runDeps(client(), on, { lessonVariety: true }));
  const done = on.steps.at(-1)!;
  assert.equal(done.step, "done");
  const out = done.output as { telemetry?: { gates?: { visualKinds?: Record<string, number> } }; qualityNotes?: Array<{ reason?: string; note?: string }> };
  const published = on.lessons.at(-1) as Parameters<typeof visualKindCounts>[0];
  assert.deepEqual(out.telemetry?.gates?.visualKinds, visualKindCounts(published), "a telemetria a publikált lecke ábráit számolja");
  const kindNotes = (out.qualityNotes ?? []).filter((n) => n.reason === "visual_kind_share").map((n) => n.note);
  assert.deepEqual(kindNotes, kindShareProblems(published), "a jelzés a publikált leckére szól");
  const off = memory();
  await runSingleLesson({ files, ownerId: "u1" }, runDeps(client(), off, { lessonVariety: false }));
  const offOut = off.steps.at(-1)!.output as { telemetry?: { gates?: Record<string, unknown> }; qualityNotes?: Array<{ reason?: string }> };
  assert.equal("visualKinds" in (offOut.telemetry?.gates ?? {}), false, "KI: nincs új telemetria-mező");
  assert.equal((offOut.qualityNotes ?? []).some((n) => n.reason === "visual_kind_share"), false);
});

test("V1 sorozatszabály a teljes kódúton: az előző lecke azonos kiosztása → következő forma / téma / összefoglaló; a szerző és a jelölő ezt kapja; hibás előzmény-lekérés nem állít meg", async () => {
  const { pickVarietyAxes } = await import("../shared/lesson-variety-axes");
  const seed = seedFrom("m1");
  const base = { form: openerVarietyPick(fixture.classroom, seed).form.id, ...pickVarietyAxes(seed, 1) };
  const requests: string[] = [];
  const mem = memory();
  (mem.store as { loadPreviousSeriesVariety?: unknown }).loadPreviousSeriesVariety = async (subject: string, classroom: number, exclude: string) => {
    assert.equal(subject, fixture.subject); assert.equal(classroom, fixture.classroom); assert.equal(exclude, "m1");
    return { openingForm: base.form, exampleTheme: base.exampleTheme.id, recapForm: base.recapForm.id };
  };
  await runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ onAuthor: (r) => requests.push(r) }), mem, { lessonVariety: true }));
  const out = lastOutput(mem);
  assert.notEqual(out.openingForm, base.form);
  assert.notEqual(out.exampleTheme, base.exampleTheme.id);
  assert.notEqual(out.recapForm, base.recapForm.id);
  assert.ok(Array.isArray(out.lengthBands));
  assert.ok(requests.some((r) => r.includes("PÉLDÁK TÉMAKÖRE") && r.includes("ÖSSZEFOGLALÓ FORMÁJA")), "a szerző megkapja a tengelyeket");
  assert.equal((mem.lessons.at(-1) as { variety?: { openingForm?: string } }).variety?.openingForm, out.openingForm, "a jelölő a ténylegesen kiosztott formát hordozza");
  const failing = memory();
  (failing.store as { loadPreviousSeriesVariety?: unknown }).loadPreviousSeriesVariety = async () => { throw new Error("adatbázis nem elérhető"); };
  await runSingleLesson({ files, ownerId: "u1" }, runDeps(client(), failing, { lessonVariety: true }));
  assert.equal(lastOutput(failing).openingForm, base.form, "hibás előzménynél a mag dönt");
});

// --- Review #611 ---

test("review #611 (Codex, Vercel, Copilot): BE nyitásnál a szerző a sorozatszabállyal ELTOLT nyitásformát kapja (ugyanazt, mint a lektor és a jelölő)", async () => {
  const { OPENING_FORM_LABEL } = await import("../shared/lesson-opener");
  const seed = seedFrom("m1");
  const baseForm = openerVarietyPick(fixture.classroom, seed).form.id;
  const requests: string[] = [];
  const mem = memory();
  (mem.store as { loadPreviousSeriesVariety?: unknown }).loadPreviousSeriesVariety = async () => ({ openingForm: baseForm });
  await withEnv("STUDIO_LESSON_OPENER", "on", () => runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ onAuthor: (r) => requests.push(r) }), mem, { lessonVariety: true })));
  const out = lastOutput(mem);
  assert.notEqual(out.openingForm, baseForm, "a sorozatszabály léptetett");
  const label = (OPENING_FORM_LABEL as Record<string, string>)[String(out.openingForm)];
  const baseLabel = (OPENING_FORM_LABEL as Record<string, string>)[baseForm];
  const req = requests.find((r) => r.includes("Nyitásforma (a program osztotta ki, kötelező)")) ?? "";
  assert.ok(req.includes(`Nyitásforma (a program osztotta ki, kötelező): ${label} `), `a szerzői kérés a kiosztott formát (${label}) írja elő`);
  assert.equal(req.includes(`Nyitásforma (a program osztotta ki, kötelező): ${baseLabel} `), false, "az eredeti (magbeli) forma nem marad az előírásban");
});

test("review #611 (Codex, Copilot): a blokkváz-só korlátos, determinisztikus kereséssel ELTÉRŐ vázat választ; ha nincs eltérő, a 0. marad", async () => {
  const { seriesShapeSalt } = await import("../server/studio/single-run/engine");
  const sigs: Record<number, string> = { 0: "A", 1: "A", 2: "A", 3: "B" };
  assert.equal(seriesShapeSalt((salt) => sigs[salt] ?? "A", "A"), 3, "az első eltérő vázú só");
  assert.equal(seriesShapeSalt((salt) => sigs[salt] ?? "A", "B"), 0, "eltérő előzménynél nincs újramagozás");
  assert.equal(seriesShapeSalt(() => "A", "A"), 0, "ha a korláton belül nincs eltérő, marad a 0. (naplózva)");
  assert.equal(seriesShapeSalt(() => "A", undefined), 0);
});

test("review #611 (Codex, Vercel, Copilot): a szerzői állomáson megszakadt futás folytatása a MENTETT tengelyeket tölti vissza; nincs új előzmény-lekérés", async () => {
  const first = memory();
  await assert.rejects(runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ failAuthor: true }), first, { lessonVariety: true })));
  const saved = lastOutput(first);
  assert.equal((saved as { lesson?: unknown }).lesson, undefined, "a megszakadás a szerző válasza ELŐTT történt");
  assert.equal(typeof saved.openingForm, "string");
  let calls = 0;
  const second = memory();
  (second.store as { loadPreviousSeriesVariety?: unknown }).loadPreviousSeriesVariety = async () => {
    calls += 1;
    return { openingForm: saved.openingForm, exampleTheme: saved.exampleTheme, recapForm: saved.recapForm };
  };
  await runSingleLesson({ files: [], mapId: "m1", ownerId: "u1", resume: { jobId: "job1", output: saved } }, runDeps(client(), second, {}, saved.singleRun.conversation));
  const after = lastOutput(second);
  assert.equal(calls, 0, "folytatásnál nincs új előzmény-lekérés");
  assert.equal(after.openingForm, saved.openingForm);
  assert.equal(after.exampleTheme, saved.exampleTheme);
  assert.equal(after.recapForm, saved.recapForm);
  assert.deepEqual(after.lengthBands, saved.lengthBands);
});
// --- Review #612 ---

test("review #612 (Codex, Vercel, Copilot): ≥ 4 fejezetes, program által kiosztott tervben a kártya HELYE a végleges blokksorban van (nem első fejezet), a szerző ugyanezt kapja; egyfejezetes leckénél nincs kártyakérés", async () => {
  const base = outline.sections[0];
  // A terjedelmi keret (kb. 3 fogalom / fejezet) miatt 4 fejezethez 12 fogalom kell.
  const ids = Array.from({ length: 12 }, (_, i) => (i ? `c${i}` : "area"));
  const four = { ...outline, sections: [0, 1, 2, 3].map((i) => ({ ...base, heading: `${base.heading} ${i + 1}`, conceptIds: ids.slice(i * 3, i * 3 + 3), sectionKind: "description" })) };
  const requests: string[] = [];
  const inner = client({ outline: four, failAuthor: true, onAuthor: (r) => requests.push(r) });
  const wide: ModelClient = { model: inner.model, async complete(system, turns) {
    const r = await inner.complete(system, turns);
    const t = turns.at(-1)!.blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    if (/1\. ÁLLOMÁS/.test(t)) {
      const j = JSON.parse(r.text) as { concepts: Array<Record<string, unknown>> };
      j.concepts = ids.map((id, i) => ({ ...j.concepts[0], id, term: i ? `${j.concepts[0].term} ${i}` : j.concepts[0].term }));
      return { ...r, text: JSON.stringify(j) };
    }
    return r;
  } };
  const mem = memory();
  await assert.rejects(runSingleLesson({ files, ownerId: "u1" }, runDeps(wide, mem, { lessonVariety: true })));
  const saved = lastOutput(mem);
  const card = String(saved.cardForm);
  const secs = (saved.outline as { sections: Array<{ tryKind?: string; plannedBlocks: string[] }> }).sections;
  assert.equal(secs.length, 4);
  const at = secs.findIndex((s) => s.tryKind === card);
  assert.ok(at >= 1, `a kártya (${card}) egy nem első fejezet kiosztott try-helye: ${JSON.stringify(secs)}`);
  assert.ok(secs[at].plannedBlocks.includes("try"), "a kártyának van try-helye a sorban");
  assert.ok(requests.length > 0 && requests[0].includes(`tryKind: "${card}"`), "a szerzői kérés végleges blokksora a kártyát hordozza");
  assert.ok(requests[0].includes("- KÁRTYA:"), "≥ 4 fejezetnél a kártya-szerződés is ott van");

  const one: string[] = [];
  await runSingleLesson({ files, ownerId: "u1" }, runDeps(client({ onAuthor: (r) => one.push(r) }), memory(), { lessonVariety: true }));
  assert.ok(one.length > 0 && !one.some((r) => r.includes("- KÁRTYA:")), "egyfejezetes leckénél (a kapu sem méri) nincs kártyakérés");
});
