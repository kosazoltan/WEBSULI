import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  cardFingerprint, codeEntry, evidenceFromLektorNotes, evidenceFromRun, foldEvidence, isMemorySnapshot, memoryPromptBlock, memorySnapshot,
  snapshotPromptBlock, statusAt, subjectMemoryEnabled, MEMORY_LIMITS, type MemoryCard, type MemoryEvidence,
} from "../server/memory/subject-memory";
import { applyEvidence, cardFromRow, recordSubjectMemory, type Query } from "../server/memory/store";
import { buildLessonExperience } from "../server/studio/experience-builder";
import { runPipelineStep, type JobPatch, type JobView, type MapMeta, type PipelineStore } from "../server/studio/step-runner";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { MapConcept } from "../server/studio/coverage";
import type { IAIProvider } from "../server/ai/AIProvider";
import type { WorkflowView } from "../shared/lesson-workflow";

/* Spec 2026-10-06-s5-tantargyi-memoria: kártya-képzés, dedup/idempotencia, lecsengés, prompt-korlát, kapcsoló, tantárgy-elszigetelés. */

const DAY = 86_400_000;
// Hamis, futásidőben összerakott titok-minta (a commit-őr ne lássa valódi kulcsnak).
const FAKE_SECRET = ["api", "_key=", "sk", "-", "x".repeat(20)].join("");
const NOW = Date.UTC(2026, 9, 6);
const ev = (over: Partial<MemoryEvidence> = {}): MemoryEvidence => ({ subject: "matematika", step: "animator", code: "sample_score", key: "run:a:1", at: NOW - DAY, ...over });
const card = (over: Partial<MemoryCard> = {}): MemoryCard => {
  const base = { subject: "matematika", step: "animator", code: "sample_score", ...over };
  return { fingerprint: cardFingerprint(base.subject, base.step, base.code), occurrences: 3, firstSeen: NOW - 10 * DAY, lastSeen: NOW - DAY, status: "open",
    evidence: [], correctiveSummary: null, correctiveAt: null, correctiveCount: 0, ...base, ...over };
};

test("migráció 0024: additív és idempotens (minden CREATE IF NOT EXISTS), a két tábla", () => {
  const sql = readFileSync(new URL("../migrations/0024_subject_memory.sql", import.meta.url), "utf8");
  const creates = sql.match(/CREATE (TABLE|INDEX|UNIQUE INDEX)[^\n]*/g) ?? [];
  assert.equal(creates.length, 3);
  for (const c of creates) assert.match(c, /IF NOT EXISTS/);
  assert.match(sql, /subject_memory_cards/);
  assert.match(sql, /PRIMARY KEY \(card_fingerprint, evidence_key\)/);
  assert.doesNotMatch(sql, /^\s*(DROP|ALTER|DELETE|UPDATE)\b/m, "nincs romboló utasítás");
});

test("kapcsoló: csak STUDIO_SUBJECT_MEMORY=1", () => {
  assert.equal(subjectMemoryEnabled({}), false);
  assert.equal(subjectMemoryEnabled({ STUDIO_SUBJECT_MEMORY: "true" }), false);
  assert.equal(subjectMemoryEnabled({ STUDIO_SUBJECT_MEMORY: "1" }), true);
});

test("bizonyíték: workflow-lelet minden lépésre, orkesztrátor ok → összefoglaló (titok redaktálva); tantárgy nélkül semmi", () => {
  const view = {
    id: "r1", executions: 2, updatedAt: NOW,
    skillAudit: { version: "v", execution: 2, at: NOW - DAY, outcome: "stopped", checks: { sequence: false, gate: false, readback: false },
      findings: [{ code: "sample_score", step: "animator", steps: ["animator", "gate"], fingerprint: "x" }] },
    failures: [
      { at: NOW - 2 * DAY, step: "bank", point: "gate:1:q", kind: "gate", reasons: ["titkos hibaszöveg"], orchestrated: { rootCause: `A modell nem cserélte a mezőt; ${FAKE_SECRET}`, outcome: "ok" } },
      { at: NOW - DAY, step: "author", point: "a", kind: "weird", reasons: [], orchestrated: { rootCause: "x", outcome: "failed" } },
    ],
  } as unknown as WorkflowView;
  assert.deepEqual(evidenceFromRun(view, null), []);
  const list = evidenceFromRun(view, "matematika");
  assert.deepEqual(list.map((e) => `${e.code}@${e.step}|${e.key}`), ["sample_score@animator|run:r1:2", "sample_score@gate|run:r1:2", "fail_gate@bank|run:r1:2", "fail_other@author|run:r1:2"]);
  const ok = list.find((e) => e.code === "fail_gate")!;
  assert.match(ok.summary!, /nem cserélte/);
  assert.ok(!ok.summary!.includes(FAKE_SECRET.split("=")[1]), "titok redaktálva");
  assert.equal(list.find((e) => e.code === "fail_other")!.summary, undefined, "failed kimenet nem ad összefoglalót");
  assert.ok(list.every((e) => !JSON.stringify(e).includes("titkos hibaszöveg")), "hibaszöveg nem kerül a bizonyítékba");
});

test("bizonyíték: lektor — csak blokkoló, kód a fajta szerint, lépés a helyből, egy job = egy kulcs", () => {
  const notes = [
    { kind: "source_conflict", subkind: "contradicts_source", severity: "blocker", blockPath: "experience.quiz[3]", createdAt: NOW - DAY },
    { kind: "source_conflict", subkind: "not_in_map", severity: "blocker", blockPath: "2.1", createdAt: NOW - DAY },
    { kind: "coverage_gap", subkind: "core", severity: "blocker", blockPath: null, createdAt: NOW - DAY },
    { kind: "language", subkind: null, severity: "warn", blockPath: "1.0", createdAt: NOW - DAY },
  ];
  const list = evidenceFromLektorNotes("j1", notes, "tortenelem");
  assert.deepEqual(list.map((e) => `${e.code}@${e.step}`), ["lektor_source_conflict@bank", "lektor_not_in_map@author", "lektor_coverage_gap@author"]);
  assert.ok(list.every((e) => e.key === "job:j1" && e.subject === "tortenelem"));
  assert.deepEqual(evidenceFromLektorNotes("j1", notes, null), []);
});

test("fold: dedup-kulcs (tantárgy+lépés+kód), egy bizonyíték egyszer számol, két különböző → open; idempotens újrafuttatás", () => {
  const evidence = [ev(), ev(), ev({ at: NOW - 3 * DAY }), ev({ key: "job:j9", at: NOW - 2 * DAY }), ev({ subject: "tortenelem" })];
  const first = foldEvidence([], new Set(), evidence, NOW);
  assert.equal(first.cards.length, 2, "két tantárgy = két kártya");
  const math = first.cards.find((c) => c.subject === "matematika")!;
  assert.equal(math.occurrences, 2);
  assert.equal(math.status, "open");
  assert.equal(math.firstSeen, NOW - 2 * DAY);
  assert.equal(math.lastSeen, NOW - DAY);
  assert.deepEqual([...math.evidence].sort(), ["job:j9", "run:a:1"]);
  assert.equal(first.cards.find((c) => c.subject === "tortenelem")!.status, "watch");
  assert.equal(first.events.length, 3);
  // Ugyanaz újra a rögzített eseményekkel: semmi sem változik.
  const seen = new Set(first.events.map((e) => `${e.fingerprint}|${e.key}`));
  const again = foldEvidence(first.cards, seen, evidence, NOW);
  assert.equal(again.events.length, 0);
  assert.equal(again.cards.length, 0);
  // Új futás: +1.
  const third = foldEvidence(first.cards, seen, [ev({ key: "run:b:1", at: NOW })], NOW);
  assert.equal(third.cards[0].occurrences, 3);
  assert.equal(third.cards[0].lastSeen, NOW);
});

test("fold: sikeres javítás → összefoglaló és darab; a későbbi felülírja", () => {
  const r = foldEvidence([], new Set(), [ev({ code: "fail_gate", step: "bank", summary: "régi ok", at: NOW - 5 * DAY }), ev({ code: "fail_gate", step: "bank", key: "run:b:1", summary: "új ok", at: NOW - DAY })], NOW);
  assert.equal(r.cards[0].correctiveCount, 2);
  assert.equal(r.cards[0].correctiveSummary, "új ok");
});

test("lecsengés: 45 napnál régebbi utolsó előfordulás → closed; új bizonyíték újranyitja", () => {
  const old = card({ lastSeen: NOW - (MEMORY_LIMITS.decayDays + 1) * DAY });
  assert.equal(statusAt(old, NOW), "closed");
  assert.equal(statusAt(card({ occurrences: 1 }), NOW), "watch");
  const reopened = foldEvidence([old], new Set(), [ev({ key: "run:z:1", at: NOW })], NOW);
  assert.equal(reopened.cards[0].status, "open");
});

test("prompt: csak a tantárgy nyitott kártyái, szerepre szűrve, előfordulás szerint, ≤ 6 sor és ≤ 1 500 jel; összefoglaló soha", () => {
  const cards = [
    card({ code: "sample_score", occurrences: 9, correctiveSummary: "TITKOS-ÖSSZEFOGLALÓ" }),
    card({ code: "duplicate_question", occurrences: 7 }),
    card({ code: "bank_cardinality", occurrences: 5 }),
    card({ code: "oral_written", occurrences: 4 }),
    card({ code: "repair_scope", occurrences: 3 }),
    card({ code: "lektor_source_conflict", step: "bank", occurrences: 3 }),
    card({ code: "fail_bank_packet", step: "bank", occurrences: 2 }),
    card({ code: "coverage", step: "knowledge", occurrences: 20 }),
    card({ code: "unknown", occurrences: 30 }),
    card({ code: "infrastructure", occurrences: 30 }),
    card({ code: "schema", occurrences: 1, status: "watch" }),
    card({ code: "source_fidelity", occurrences: 50, lastSeen: NOW - 60 * DAY }),
    card({ subject: "tortenelem", code: "sample_score", occurrences: 99 }),
  ];
  const bank = memoryPromptBlock(cards, "matematika", "bank", NOW);
  const lines = bank.split("\n").slice(1);
  assert.match(bank, /^TANTÁRGYI MEMÓRIA \(matematika\)/);
  assert.ok(lines.length >= 4 && lines.length <= MEMORY_LIMITS.promptCards, `sorok: ${lines.length}`);
  assert.ok(bank.length <= MEMORY_LIMITS.promptChars);
  assert.match(lines[0], /^- Mintaválasz pontozása \(9 futásban; lépés: animator\)/);
  assert.doesNotMatch(bank, /TITKOS-ÖSSZEFOGLALÓ|99 futásban|Tanítás és fogalomfedettség|Forráshűség|Válaszséma/);
  const author = memoryPromptBlock(cards, "matematika", "author", NOW);
  assert.match(author, /Tanítás és fogalomfedettség \(20 futásban; lépés: knowledge\)/);
  assert.doesNotMatch(author, /Mintaválasz/);
  assert.equal(memoryPromptBlock(cards, "fizika", "bank", NOW), "", "más tantárgy: üres");
  assert.equal(codeEntry("unknown", "animator"), null);
  assert.equal(codeEntry("fail_provider", "bank"), null);
});

test("pillanatkép: tantárgyra szűr, csak open, időbélyeggel; a blokk a pillanatkép idejével számol", () => {
  const snap = memorySnapshot([card(), card({ subject: "tortenelem" }), card({ code: "schema", occurrences: 1 })], "matematika", NOW);
  assert.deepEqual(snap.cards.map((c) => c.code), ["sample_score"]);
  assert.equal(isMemorySnapshot(snap, "matematika"), true);
  assert.equal(isMemorySnapshot(snap, "tortenelem"), false);
  assert.equal(snapshotPromptBlock(snap, "bank"), memoryPromptBlock(snap.cards, "matematika", "bank", NOW));
  assert.equal(snapshotPromptBlock(undefined, "bank"), "");
});

/* DB-réteg hamis lekérdezővel (memóriában tartott táblák). */
function fakeDb() {
  const cards = new Map<string, Record<string, unknown>>();
  const events = new Set<string>();
  const log: string[] = [];
  const query: Query = async <R,>(sql: string, params: unknown[] = []): Promise<R[]> => {
    log.push(sql.trim().split(/\s+/).slice(0, 3).join(" "));
    if (sql.includes("pg_advisory_xact_lock")) return [];
    if (sql.startsWith("SELECT") && sql.includes("FROM subject_memory_cards")) return [...cards.values()].filter((c) => (params[0] as string[]).includes(c.fingerprint as string)) as R[];
    if (sql.startsWith("SELECT card_fingerprint")) {
      return [...events].map((e) => e.split("|")).filter(([fp, key]) => (params[0] as string[]).includes(fp) && (params[1] as string[]).includes(key))
        .map(([card_fingerprint, evidence_key]) => ({ card_fingerprint, evidence_key })) as R[];
    }
    if (sql.startsWith("INSERT INTO subject_memory_cards")) {
      const [fingerprint, subject, step, code, occurrences, first, last, status, evidence, corrective_summary, correctiveAt, corrective_count] = params;
      cards.set(fingerprint as string, { fingerprint, subject, step, code, occurrences, first_seen: new Date(first as number), last_seen: new Date(last as number), status,
        evidence: JSON.parse(evidence as string), corrective_summary, corrective_at: correctiveAt === null ? null : new Date(correctiveAt as number), corrective_count });
      return [];
    }
    if (sql.startsWith("INSERT INTO subject_memory_events")) { events.add(`${params[0]}|${params[1]}`); return []; }
    throw new Error(`váratlan SQL: ${sql.slice(0, 60)}`);
  };
  return { cards, events, query, log };
}

test("applyEvidence: upsert-számok, idempotens újrafuttatás (backfill + élő átfedés), sorosító zár", async () => {
  const db = fakeDb();
  const evidence = [ev(), ev({ key: "job:j1" }), ev({ code: "duplicate_question" })];
  assert.deepEqual(await applyEvidence(db.query, evidence, NOW), { newEvents: 3, cards: 2 });
  assert.equal(db.log[0], "SELECT pg_advisory_xact_lock(hashtext('subject_memory'))");
  assert.deepEqual(await applyEvidence(db.query, evidence, NOW), { newEvents: 0, cards: 0 }, "ugyanaz újra: semmi");
  const stored = cardFromRow(db.cards.get(cardFingerprint("matematika", "animator", "sample_score")) as never);
  assert.equal(stored.occurrences, 2);
  assert.equal(stored.status, "open");
  assert.deepEqual(await applyEvidence(db.query, [], NOW), { newEvents: 0, cards: 0 });
});

test("élő hook: hiányzó tábla → nincs írás; ismeretlen tantárgy → nincs kártya; hiba → mentési pont visszagörgetve, nem dob", async () => {
  const calls: string[] = [];
  const client = (tbl: string | null, subject: string | null, fail = false) => ({ query: async (sql: string) => {
    calls.push(sql.split(/\s+/).slice(0, 2).join(" "));
    if (sql.includes("to_regclass")) return { rows: [{ tbl }] };
    if (sql.includes("FROM studio_jobs")) { if (fail) throw new Error("db le"); return { rows: subject ? [{ subject }] : [] }; }
    return { rows: [] };
  } }) as never;
  const view = { id: "j1", skillAudit: { execution: 1, at: NOW, findings: [{ code: "schema", step: "author", fingerprint: "f" }] } } as unknown as WorkflowView;
  await recordSubjectMemory(client(null, "Matematika"), { view });
  // Spec-pontosítás (review #204): az előellenőrzés is mentési pontban fut, hiányzó táblánál a pont felszabadul.
  assert.deepEqual(calls, ["SAVEPOINT subject_memory", "SELECT to_regclass('public.subject_memory_cards')::text", "RELEASE SAVEPOINT"]);
  calls.length = 0;
  await recordSubjectMemory(client("subject_memory_cards", "magyar nyelv és irodalom"), { view });
  assert.ok(!calls.some((c) => c.startsWith("INSERT")), "kétértelmű tantárgy: nincs írás");
  assert.ok(calls.includes("RELEASE SAVEPOINT"));
  calls.length = 0;
  await recordSubjectMemory(client("subject_memory_cards", null, true), { view });
  assert.ok(calls.includes("ROLLBACK TO"));
});

/* Prompt-bekötés: banképítő és lépés-futtató (modellhívás nélkül). */
test("banképítő: memória nélkül a rendszerprompt bájtra azonos; memóriával a blokk benne van", async () => {
  const fusionConcepts = [{ localId: "area", term: "háromszög területe", examWeight: "core" } as MapConcept];
  const run = async (memory?: string) => {
    const systems: string[] = [];
    const lesson = standardFusionFixture(); lesson.mapId = "m1";
    await buildLessonExperience({ ...lesson, experience: undefined }, fusionConcepts, { ...(memory !== undefined ? { memory } : {}), call: async (system) => { systems.push(system); return standardFusionFixture().experience!; } });
    return systems;
  };
  const base = await run();
  assert.deepEqual(await run(""), base, "üres blokk: változatlan");
  const block = memoryPromptBlock([card()], "matematika", "bank", NOW);
  const withMemory = await run(block);
  assert.ok(withMemory[0].includes(block));
  assert.notEqual(withMemory[0], base[0]);
});

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
    ...(withLoader ? { loadSubjectMemory: async (subject: string) => {
      loads.push(subject);
      // A betöltő hibásan más tantárgyat is visszaad — a pillanatkép (kettős őr) eldobja.
      return [card({ code: "coverage", step: "knowledge", lastSeen: Date.now() - DAY }), card({ subject: "tortenelem", code: "teaching_depth", step: "author", lastSeen: Date.now() - DAY })];
    } } : {}),
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
const withEnv = async <T,>(value: string | undefined, fn: () => Promise<T>) => {
  const saved = process.env.STUDIO_SUBJECT_MEMORY;
  if (value === undefined) delete process.env.STUDIO_SUBJECT_MEMORY; else process.env.STUDIO_SUBJECT_MEMORY = value;
  try { return await fn(); } finally { if (saved === undefined) delete process.env.STUDIO_SUBJECT_MEMORY; else process.env.STUDIO_SUBJECT_MEMORY = saved; }
};

test("lépés-futtató: kikapcsolva nincs lekérés, nincs pillanatkép, a tervezői prompt bájtra azonos a betöltő nélkülivel", async () => {
  await withEnv(undefined, async () => {
    const off = await pedagogueSystem(true);
    const none = await pedagogueSystem(false);
    assert.ok(off.system.length > 0);
    assert.equal(off.system, none.system);
    assert.deepEqual(off.loads, []);
    assert.doesNotMatch(off.system, /TANTÁRGYI MEMÓRIA/);
    assert.equal(off.job.output?.subjectMemory, undefined);
  });
});

test("lépés-futtató: bekapcsolva a tervező a saját tantárgy nyitott kártyáit kapja; más tantárgy kártyája nem szivárog", async () => {
  await withEnv("1", async () => {
    const on = await pedagogueSystem(true);
    assert.deepEqual(on.loads, ["matematika"]);
    assert.match(on.system, /TANTÁRGYI MEMÓRIA \(matematika\)[\s\S]*Tanítás és fogalomfedettség \(3 futásban; lépés: knowledge\)/);
    assert.doesNotMatch(on.system, /Tanítási mélység/);
    const snap = on.job.output?.subjectMemory as { subject: string; cards: MemoryCard[] };
    assert.equal(snap.subject, "matematika");
    assert.ok(snap.cards.every((c) => c.subject === "matematika"));
  });
});
