import test from "node:test";
import assert from "node:assert/strict";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { LessonConversation, type ModelClient, type Turn } from "../server/studio/single-run/conversation";
import { runSingleLesson, singleRunSystemPrompt, type SingleRunDeps } from "../server/studio/single-run/engine";
import type { JobPatch, PipelineStore } from "../server/studio/pipeline-store";
import type { MapConcept } from "../server/studio/coverage";
import type { CatalogRowLike } from "../server/catalog/retrieval";
import type { MemoryCard } from "../server/memory/subject-memory";

/* docs/specs/2026-10-19-tudasbank-s5-s6-ujrabekotes.md (kanban #1120): a tantárgyi katalógus (S6) és a tantárgyi memória (S5) az
   egyfutásos gyártásban — kapcsolós, alapból KI; kikapcsolva a betöltő nem hívódik és a kérések bájtra azonosak. */

const fixture = standardFusionFixture(); // matematika, 7. évfolyam
type Experience = NonNullable<typeof fixture.experience>;
const concepts: MapConcept[] = [{ localId: "area", examWeight: "core", term: "terület", definition: "A síkidom által lefedett rész nagysága." }];
const TRANSCRIPT = "A téglalap területe az oldalak szorzata. A terület mértékegysége a négyzetcentiméter.";
const outline = { sections: [{ heading: fixture.sections[0].heading, conceptIds: ["area"], plannedBlocks: ["explain", "example", "animate", "recap"], animationSuggestions: [] }], misconceptions: [] };
const CATALOG_ROW: CatalogRowLike = {
  subject: "matematika", grade: 7, topicArea: "geometria", topic: "terület", kind: "section",
  prompt: "A téglalap területe: az oldalak szorzata, mértékegysége a négyzetcentiméter.",
  body: null, options: null, correctIndex: null, accepted: null, provenances: ["p1"], trust: "auto", status: "active", fingerprint: "fp-terulet",
};
/** A bank csak feladat-/kvízmintát kap (a „section” a tervezőé és a szerzőé). */
const CATALOG_TASK: CatalogRowLike = {
  ...CATALOG_ROW, kind: "short_answer", fingerprint: "fp-terulet-feladat",
  prompt: "Mennyi a 3 cm és 4 cm oldalú téglalap területe?", accepted: ["12 négyzetcentiméter"],
};
const now = Date.now();
const MEMORY_CARD: MemoryCard = {
  fingerprint: "f1", subject: "matematika", step: "pedagogue", code: "schema", occurrences: 3, firstSeen: now - 86_400_000, lastSeen: now - 3_600_000,
  status: "open", evidence: ["k1", "k2", "k3"], correctiveSummary: null, correctiveAt: null, correctiveCount: 0, runKeys: ["k1", "k2", "k3"],
};

const text = (turns: Turn[]) => turns.at(-1)!.blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");

/** Forgatókönyves modell; minden hívás rendszerpromptja és utolsó kérése rögzítve. */
function scriptedClient(bank: (experience: Experience) => unknown = (e) => e): ModelClient & { seen: Array<{ system: string; text: string }> } {
  const seen: Array<{ system: string; text: string }> = [];
  const { experience: _bank, ...teaching } = fixture;
  return {
    model: "claude-opus-5-5", seen,
    async complete(system, turns) {
      const t = text(turns);
      seen.push({ system, text: t });
      const station = /(\d)\. ÁLLOMÁS/.exec(t)?.[1] ?? "?";
      let json: unknown;
      if (station === "1") json = { title: "Terület", subject: fixture.subject, classroom: fixture.classroom, transcript: TRANSCRIPT,
        concepts: [{ id: "area", term: "terület", definition: "A síkidom által lefedett rész nagysága.", quote: "A téglalap területe az oldalak szorzata.", type: "concept", examWeight: "core", relatedIds: [] }] };
      else if (station === "2") json = outline;
      else if (station === "3") json = teaching;
      else if (station === "4") json = { patches: "nem érvényes ábrafolt" };
      else if (station === "5") json = bank(structuredClone(fixture.experience!));
      else if (station === "6") json = { solutions: [], notes: [], reviewedAll: true };
      else json = {};
      return { text: JSON.stringify(json), model: "claude-opus-5-5", truncated: false, usage: { input: 1000, cachedInput: 600, output: 100 } };
    },
  };
}

function memoryStore(loaders: {
  catalog?: () => Promise<CatalogRowLike[]>; memory?: () => Promise<MemoryCard[]>;
  /** A térkép tantárgya (alapból a fixtúráé: „matematika”). */
  subject?: string;
  /** Igaz → a mentés dob (pl. egy másik futó átvette a jobot). */
  failSave?: (patch: JobPatch) => boolean;
} = {}) {
  const steps: JobPatch[] = [];
  const calls = { catalog: 0, memory: 0 };
  const subjects: string[] = [];
  let published = 0;
  const store = {
    async loadMap(id: string) { return id === "m1" ? { meta: { id: "m1", title: "Terület", subject: loaders.subject ?? fixture.subject, classroom: fixture.classroom, sourceText: TRANSCRIPT }, concepts } : null; },
    async createJob() { return "job1"; },
    async saveStep(_id: string, patch: JobPatch) {
      if (loaders.failSave?.(patch)) throw new Error("WorkflowConflict: a job egy másik futóé");
      steps.push(structuredClone(patch));
    },
    async upsertLesson() { return "lesson1"; },
    async publishLesson() { published++; return { htmlFileId: "html1", exportedQuizItems: 3 }; },
    ...(loaders.catalog ? { async loadCatalogRows(subject: string) { calls.catalog++; subjects.push(subject); return loaders.catalog!(); } } : {}),
    ...(loaders.memory ? { async loadSubjectMemory(subject: string) { calls.memory++; subjects.push(subject); return loaders.memory!(); } } : {}),
  } as unknown as PipelineStore;
  return { store, steps, calls, subjects, published: () => published };
}

function deps(client: ModelClient, mem: ReturnType<typeof memoryStore>, logs: string[] = []): SingleRunDeps {
  return {
    conversation: new LessonConversation(singleRunSystemPrompt(), client, null),
    fresh: (system) => new LessonConversation(system, client, null),
    store: mem.store,
    async saveMap() { return "m1"; },
    log: (m) => logs.push(m),
  };
}

async function withEnv<T>(env: Record<string, string | undefined>, run: () => Promise<T>): Promise<T> {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return await run(); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

const OFF = { STUDIO_CATALOG_S6: undefined, STUDIO_SUBJECT_MEMORY: undefined };
const run = (client: ReturnType<typeof scriptedClient>, mem: ReturnType<typeof memoryStore>, logs?: string[]) =>
  runSingleLesson({ files: [{ name: "forras.txt", kind: "text", content: TRANSCRIPT }], ownerId: "u1" }, deps(client, mem, logs));
// A lektor kérése a forrás-blokkal kezdődik, ezért nem elég a kezdet: az állomás fejléce bárhol a kérésben.
const stationText = (client: ReturnType<typeof scriptedClient>, n: string) => client.seen.find((c) => new RegExp(`(^|\\n)${n}\\. ÁLLOMÁS`).test(c.text))?.text ?? "";

test("kikapcsolva: a betöltők nem hívódnak, a 2. és 3. állomás kérése bájtra azonos a betöltők nélküli futáséval", async () => {
  await withEnv(OFF, async () => {
    const reference = scriptedClient();
    await run(reference, memoryStore());
    const client = scriptedClient();
    const mem = memoryStore({ catalog: async () => [CATALOG_ROW], memory: async () => [MEMORY_CARD] });
    const result = await run(client, mem);
    assert.equal(result.htmlFileId, "html1");
    assert.deepEqual(mem.calls, { catalog: 0, memory: 0 });
    for (const n of ["2", "3"]) assert.equal(stationText(client, n), stationText(reference, n), `${n}. állomás`);
    assert.ok(stationText(client, "2").length > 0 && stationText(client, "3").length > 0);
    assert.ok(mem.steps.every((s) => !(s.output && ("catalog" in s.output || "subjectMemory" in s.output))));
  });
});

test("S6 bekapcsolva: a tervező és a szerző a katalógus-mintákat kapja, a pool egyszer töltődik és a jobra mentődik, a bank is kapja", async () => {
  await withEnv({ STUDIO_CATALOG_S6: "1", STUDIO_SUBJECT_MEMORY: undefined }, async () => {
    const client = scriptedClient();
    const mem = memoryStore({ catalog: async () => [CATALOG_ROW, CATALOG_TASK] });
    const result = await run(client, mem);
    assert.equal(result.htmlFileId, "html1");
    for (const n of ["2", "3"]) assert.match(stationText(client, n), /TANTÁRGYI KATALÓGUS — MINTÁK \(matematika, 7\. évf\./, `${n}. állomás`);
    assert.equal(mem.calls.catalog, 1, "jobonként egyszer");
    assert.deepEqual(mem.subjects, ["matematika"], "a betöltő a térkép normalizált tantárgyát kapja (review #311)");
    assert.ok(mem.steps.some((s) => (s.output as { catalog?: { items: unknown[] } } | undefined)?.catalog?.items.length === 2), "a pool a jobon");
    const bank = client.seen.filter((c) => /5\. ÁLLOMÁS/.test(c.text));
    assert.ok(bank.length >= 1 && bank.every((c) => c.text.includes("Mennyi a 3 cm és 4 cm oldalú téglalap területe?")), "a bankcsomag kérése (freshBankCall: a csomag „system”-je a kérésben) a katalógus-mintát kapja");
  });
});

test("S5 bekapcsolva: a tervező és a szerző a tantárgyi memória blokkját kapja, a pillanatkép a jobra mentődik", async () => {
  await withEnv({ STUDIO_CATALOG_S6: undefined, STUDIO_SUBJECT_MEMORY: "1" }, async () => {
    const client = scriptedClient();
    const mem = memoryStore({ memory: async () => [MEMORY_CARD] });
    await run(client, mem);
    for (const n of ["2", "3"]) assert.match(stationText(client, n), /TANTÁRGYI MEMÓRIA \(matematika\)/, `${n}. állomás`);
    assert.doesNotMatch(stationText(client, "2"), /TANTÁRGYI KATALÓGUS/, "az S6 ki van kapcsolva");
    assert.equal(mem.calls.memory, 1);
    assert.deepEqual(mem.subjects, ["matematika"], "a betöltő a térkép normalizált tantárgyát kapja (review #311)");
    assert.ok(mem.steps.some((s) => (s.output as { subjectMemory?: { cards: unknown[] } } | undefined)?.subjectMemory?.cards.length === 1));
    const bank = client.seen.filter((c) => /5\. ÁLLOMÁS/.test(c.text));
    assert.ok(bank.length >= 1 && bank.every((c) => `${c.system}\n${c.text}`.includes("TANTÁRGYI MEMÓRIA (matematika)")), "a bank a bank-szerep blokkját kapja");
  });
});

test("betöltési hiba: a gyártás a funkció nélkül közzétesz, a hiba naplózva", async () => {
  await withEnv({ STUDIO_CATALOG_S6: "1", STUDIO_SUBJECT_MEMORY: "1" }, async () => {
    const client = scriptedClient();
    const logs: string[] = [];
    const mem = memoryStore({ catalog: async () => { throw new Error("db le"); }, memory: async () => { throw new Error("db le"); } });
    const result = await run(client, mem, logs);
    assert.equal(result.htmlFileId, "html1");
    assert.equal(mem.published(), 1);
    assert.deepEqual(mem.calls, { catalog: 1, memory: 1 }, "review #311: a sikertelen betöltést a későbbi állomás nem próbálja újra");
    assert.ok(logs.some((l) => /katalógus-lekérés elmaradt: db le/.test(l)));
    assert.ok(logs.some((l) => /tantárgyi memória betöltése elmaradt: db le/.test(l)));
    assert.doesNotMatch(stationText(client, "2"), /TANTÁRGYI (KATALÓGUS|MEMÓRIA)/);
  });
});

test("review #311: a beragadt betöltés határidő után fail-open (a gyártás nélküle közzétesz)", async () => {
  await withEnv({ STUDIO_CATALOG_S6: "1", STUDIO_SUBJECT_MEMORY: "1", STUDIO_KNOWLEDGE_TIMEOUT_MS: "50" }, async () => {
    const client = scriptedClient();
    const logs: string[] = [];
    const never = () => new Promise<never>(() => undefined);
    const mem = memoryStore({ catalog: never, memory: never });
    const result = await run(client, mem, logs);
    assert.equal(result.htmlFileId, "html1");
    assert.ok(logs.some((l) => /katalógus-lekérés elmaradt: katalógus: a lekérdezés 50 ms alatt nem fejeződött be/.test(l)));
    assert.ok(logs.some((l) => /memória betöltése elmaradt: tantárgyi memória: a lekérdezés 50 ms alatt/.test(l)));
  });
});

test("review #311: a jobra mentés hibája (pl. WorkflowConflict) nem nyelődik el — a futás megáll, nem megy tovább a modellhez", async () => {
  await withEnv({ STUDIO_CATALOG_S6: "1", STUDIO_SUBJECT_MEMORY: undefined }, async () => {
    const client = scriptedClient();
    const mem = memoryStore({ catalog: async () => [CATALOG_ROW], failSave: (patch) => Boolean(patch.output && "catalog" in patch.output) });
    await assert.rejects(run(client, mem), /WorkflowConflict/);
    assert.equal(stationText(client, "2"), "", "a tervező nem kapott kérést");
    assert.equal(mem.published(), 0);
  });
});

test("review #311: bekapcsolt funkció, de ismeretlen tantárgy vagy hiányzó betöltő → naplózott kihagyás", async () => {
  await withEnv({ STUDIO_CATALOG_S6: "1", STUDIO_SUBJECT_MEMORY: "1" }, async () => {
    const unknown: string[] = [];
    await run(scriptedClient(), memoryStore({ subject: "Ismeretlen tárgy", catalog: async () => [CATALOG_ROW], memory: async () => [MEMORY_CARD] }), unknown);
    assert.ok(unknown.some((l) => /Katalógus kihagyva: a tantárgy \(„Ismeretlen tárgy”\) nem azonosítható/.test(l)));
    assert.ok(unknown.some((l) => /Tantárgyi memória kihagyva: a tantárgy \(„Ismeretlen tárgy”\) nem azonosítható/.test(l)));
    const noLoader: string[] = [];
    await run(scriptedClient(), memoryStore(), noLoader);
    assert.ok(noLoader.some((l) => /Katalógus kihagyva: az adattárnak nincs katalógus-betöltője/.test(l)));
    assert.ok(noLoader.some((l) => /Tantárgyi memória kihagyva: az adattárnak nincs memória-betöltője/.test(l)));
  });
});

test("review #311: a szó szerint átvett, szülő által ellenőrzött katalógus-kvíz a lektornak igazolt forrásként jelölve", async () => {
  const QUIZ: CatalogRowLike = {
    ...CATALOG_ROW, kind: "quiz", trust: "parent_verified", fingerprint: "fq1", provenances: ["szulo:1"],
    prompt: "Mennyi a 3 cm és 4 cm oldalú téglalap területe?", options: ["12 négyzetcentiméter", "7 négyzetcentiméter", "14 négyzetcentiméter"], correctIndex: 0,
  };
  const withCatalogQuiz = (e: Experience) => {
    const quiz = e.quiz.map((q, i) => (i === 0 ? { ...q, question: QUIZ.prompt, options: [...QUIZ.options!], correctIndex: 0 } : q));
    return { ...e, quiz };
  };
  await withEnv({ STUDIO_CATALOG_S6: "1", STUDIO_SUBJECT_MEMORY: undefined }, async () => {
    const client = scriptedClient(withCatalogQuiz);
    const result = await run(client, memoryStore({ catalog: async () => [QUIZ] }));
    assert.equal(result.htmlFileId, "html1");
    assert.match(stationText(client, "6"), /KATALÓGUS-TÉTELEK \(a lecke tantárgyi bankjából szó szerint átvett/);
  });
  await withEnv(OFF, async () => {
    const client = scriptedClient(withCatalogQuiz);
    await run(client, memoryStore({ catalog: async () => [QUIZ] }));
    assert.doesNotMatch(stationText(client, "6"), /KATALÓGUS-TÉTELEK/, "kikapcsolva nincs jelölés");
  });
});
