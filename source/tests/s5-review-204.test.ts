import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cardFingerprint, distinctRuns, evidenceFromRun, foldEvidence, memoryPromptBlock, memorySnapshot, snapshotPromptBlock, MEMORY_LIMITS,
  type MemoryCard, type MemoryEvidence,
} from "../server/memory/subject-memory";
import { applyEvidence, loadSubjectMemoryCards, recordSubjectMemory, type Query } from "../server/memory/store";
import type { WorkflowView } from "../shared/lesson-workflow";

/** Review #204 (PR #204) — az S5 tantárgyi memória review-leletei. */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 6);
const card = (over: Partial<MemoryCard> = {}): MemoryCard => {
  const base = { subject: "matematika", step: "animator", code: "sample_score", ...over };
  return { fingerprint: cardFingerprint(base.subject, base.step, base.code), occurrences: 3, firstSeen: NOW - 10 * DAY, lastSeen: NOW - DAY, status: "open",
    evidence: [], correctiveSummary: null, correctiveAt: null, correctiveCount: 0, ...base, ...over };
};
const run = (id: string, steps: string[], at = NOW - DAY) => ({
  id, executions: 1, updatedAt: at,
  skillAudit: { version: "v", execution: 1, at, outcome: "stopped", checks: { sequence: false, gate: false, readback: false },
    findings: [{ code: "sample_score", step: steps[0], steps, fingerprint: "x" }] },
}) as unknown as WorkflowView;

/* 1. Egy futás több lépésen: a csoport gyakorisága a KÜLÖNBÖZŐ futások száma. */
test("review #204/1: egy audit több lépésre jelzett kódja egy futásnak számít a promptban", () => {
  const evidence = [...evidenceFromRun(run("r1", ["animator", "bank"]), "matematika"), ...evidenceFromRun(run("r2", ["animator", "bank"]), "matematika")];
  const { cards } = foldEvidence([], new Set(), evidence, NOW);
  assert.equal(cards.length, 2, "a kártyák lépésenként maradnak");
  assert.ok(cards.every((c) => c.occurrences === 2));
  const block = memoryPromptBlock(cards, "matematika", "bank", NOW);
  assert.match(block, /Mintaválasz pontozása \(2 futásban; lépés: animator, bank\)/);
  assert.doesNotMatch(block, /4 futásban/);
  // Egy harmadik futás csak az egyik lépésen: 3 különböző futás.
  const more = foldEvidence(cards, new Set(), evidenceFromRun(run("r3", ["animator"]), "matematika"), NOW).cards;
  const merged = [...cards.filter((c) => !more.some((m) => m.fingerprint === c.fingerprint)), ...more];
  assert.match(memoryPromptBlock(merged, "matematika", "bank", NOW), /\(3 futásban; lépés: animator, bank\)/);
});

test("review #204/1: a rangsor a különböző futásszámot használja, nem az összeget", () => {
  const keys = ["run:a:1", "run:b:1", "run:c:1"];
  const cards = [
    card({ step: "animator", occurrences: 3, evidence: keys }),
    card({ step: "bank", occurrences: 3, evidence: keys }),
    card({ code: "duplicate_question", occurrences: 4, evidence: ["run:d:1", "run:e:1", "run:f:1", "run:g:1"] }),
  ];
  const lines = memoryPromptBlock(cards, "matematika", "bank", NOW).split("\n").slice(1);
  assert.match(lines[0], /\(4 futásban; lépés: animator\)/, "a 4 különböző futás megelőzi a 3-at (régen 6 = 3+3 volt elöl)");
  assert.match(lines[1], /^- Mintaválasz pontozása \(3 futásban; lépés: animator, bank\)/);
});

test("review #204/1: 10 feletti futásszám pontos a betöltött esemény-kulcsokkal, és a pillanatkép is ezt viszi", () => {
  const a = Array.from({ length: 15 }, (_, i) => `run:x${i}:1`);
  const b = [...a.slice(3), "run:y1:1", "run:y2:1"]; // 12 közös + 2 saját → unió 17
  const cards = [card({ step: "animator", occurrences: 15, evidence: a.slice(-10), runKeys: a }), card({ step: "bank", occurrences: 14, evidence: b.slice(-10), runKeys: b })];
  assert.equal(distinctRuns(cards), 17);
  assert.match(memoryPromptBlock(cards, "matematika", "bank", NOW), /\(17 futásban;/);
  const snap = memorySnapshot(cards, "matematika", NOW);
  assert.equal(snap.runs?.["bank|sample_score"], 17);
  assert.ok(snap.cards.every((c) => c.runKeys === undefined), "a teljes kulcslista nem kerül a tárolt pillanatképbe");
  assert.match(snapshotPromptBlock(snap, "bank"), /\(17 futásban;/);
  // runKeys nélkül alsó becslés, de sosem összeg: max(15, |unió a ≤ 10 kulcson|).
  assert.equal(distinctRuns(cards.map(({ runKeys: _k, ...c }) => c)), 15);
});

test("review #204/1: a betöltő minden kártyához hozzáadja az összes esemény-kulcsát", async () => {
  const fp = cardFingerprint("matematika", "animator", "sample_score");
  const sqls: string[] = [];
  const query: Query = async <R,>(sql: string): Promise<R[]> => {
    sqls.push(sql);
    if (sql.includes("FROM subject_memory_cards")) {
      return [{ fingerprint: fp, subject: "matematika", step: "animator", code: "sample_score", occurrences: 12, first_seen: new Date(NOW - 9 * DAY), last_seen: new Date(NOW),
        status: "open", evidence: ["run:k2:1"], corrective_summary: null, corrective_at: null, corrective_count: 0 }] as R[];
    }
    if (sql.includes("FROM subject_memory_events")) return Array.from({ length: 12 }, (_, i) => ({ card_fingerprint: fp, evidence_key: `run:k${i}:1` })) as R[];
    throw new Error("váratlan SQL");
  };
  const [loaded] = await loadSubjectMemoryCards(query, "matematika");
  assert.equal(loaded.runKeys?.length, 12);
  assert.match(sqls[1], /card_fingerprint = ANY\(\$1\)/);
  assert.deepEqual(await loadSubjectMemoryCards(async () => [], "fizika"), [], "üres tantárgy: nincs esemény-lekérés");
});

/* 2. Az élő hook a tábla-előellenőrzést is mentési pontban futtatja (fail-open). */
function hookClient(opts: { tbl?: string | null; failOn?: string; subject?: string | null }) {
  const calls: string[] = [];
  const client = { query: async (sql: string) => {
    calls.push(sql.split(/\s+/).slice(0, 3).join(" "));
    if (opts.failOn && sql.includes(opts.failOn)) throw new Error("átmeneti DB-hiba");
    if (sql.includes("to_regclass")) return { rows: [{ tbl: opts.tbl ?? null }] };
    if (sql.includes("FROM studio_jobs")) return { rows: opts.subject ? [{ subject: opts.subject }] : [] };
    return { rows: [] };
  } } as never;
  return { client, calls };
}
const VIEW = { id: "j1", skillAudit: { execution: 1, at: NOW, findings: [{ code: "schema", step: "author", fingerprint: "f" }] } } as unknown as WorkflowView;

test("review #204/2: a tábla-előellenőrzés hibája nem jut ki és nem rontja a hívó tranzakcióját", async () => {
  const { client, calls } = hookClient({ failOn: "to_regclass" });
  await assert.doesNotReject(recordSubjectMemory(client, { view: VIEW }));
  assert.deepEqual(calls, ["SAVEPOINT subject_memory", "SELECT to_regclass('public.subject_memory_cards')::text AS", "ROLLBACK TO SAVEPOINT", "RELEASE SAVEPOINT subject_memory"]);
});

test("review #204/2: hiányzó tábla → a mentési pont felszabadul, nincs más lekérdezés", async () => {
  const { client, calls } = hookClient({ tbl: null });
  await recordSubjectMemory(client, { view: VIEW });
  assert.deepEqual(calls, ["SAVEPOINT subject_memory", "SELECT to_regclass('public.subject_memory_cards')::text AS", "RELEASE SAVEPOINT subject_memory"]);
});

test("review #204/2: már hibás hívó-tranzakció (a SAVEPOINT is dob) → nem dob tovább; a visszagörgetés hibája sem", async () => {
  const savepoint = hookClient({ failOn: "SAVEPOINT subject_memory" });
  await assert.doesNotReject(recordSubjectMemory(savepoint.client, { view: VIEW }));
  assert.deepEqual(savepoint.calls, ["SAVEPOINT subject_memory"]);
  // A job-lekérdezés ÉS a visszagörgetés is hibázik: a hook akkor sem dob.
  const calls: string[] = [];
  const broken = { query: async (sql: string) => {
    calls.push(sql.split(/\s+/).slice(0, 3).join(" "));
    if (sql.includes("to_regclass")) return { rows: [{ tbl: "subject_memory_cards" }] };
    if (sql.includes("FROM studio_jobs") || sql.startsWith("ROLLBACK")) throw new Error("db le");
    return { rows: [] };
  } } as never;
  await assert.doesNotReject(recordSubjectMemory(broken, { view: VIEW }));
  assert.equal(calls.at(-1), "ROLLBACK TO SAVEPOINT");
});

/* 3. Az evidence a legújabb ≤ 10 kulcs a `seen_at` szerint (élő + késői backfill átfedés). */
const ev = (key: string, at: number): MemoryEvidence => ({ subject: "matematika", step: "animator", code: "sample_score", key, at });

test("review #204/3: egy kötegen belül a legújabb 10 kulcs marad, nem a kulcs szerinti utolsó 10", () => {
  // A kulcsnév-sorrend ellentétes az idővel: z* a legrégebbi.
  const evidence = Array.from({ length: 12 }, (_, i) => ev(`run:${String.fromCharCode(122 - i)}:1`, NOW - (12 - i) * DAY));
  const [c] = foldEvidence([], new Set(), evidence, NOW).cards;
  assert.equal(c.occurrences, 12);
  assert.equal(c.evidence.length, MEMORY_LIMITS.evidenceRefs);
  assert.deepEqual(c.evidence, evidence.slice(2).map((e) => e.key), "idő szerint növekvő, a két legrégebbi kiesik");
});

test("review #204/3: késői backfill régi kulcsa nem szorítja ki az újabb élő kulcsokat; újabb kulcs a legrégebbit", () => {
  const live = Array.from({ length: 10 }, (_, i) => ev(`run:l${i}:1`, NOW - (10 - i) * DAY));
  const first = foldEvidence([], new Set(), live, NOW).cards[0];
  const seenAt = new Map(live.map((e) => [`${first.fingerprint}|${e.key}`, e.at]));
  const late = foldEvidence([first], seenAt, [ev("run:old:1", NOW - 40 * DAY)], NOW).cards[0];
  assert.equal(late.occurrences, 11);
  assert.deepEqual(late.evidence, first.evidence, "a régi bizonyíték számol, de a lista a 10 legújabb marad");
  const newer = foldEvidence([first], seenAt, [ev("run:new:1", NOW)], NOW).cards[0];
  assert.deepEqual(newer.evidence, [...live.slice(1).map((e) => e.key), "run:new:1"]);
});

test("review #204/3: applyEvidence a tárolt kulcsok seen_at idejét is betölti", async () => {
  const fp = cardFingerprint("matematika", "animator", "sample_score");
  const live = Array.from({ length: 10 }, (_, i) => ev(`run:l${i}:1`, NOW - (10 - i) * DAY));
  const stored = foldEvidence([], new Set(), live, NOW).cards[0];
  const writes: unknown[][] = [];
  let eventParams: unknown[] = [];
  const query: Query = async <R,>(sql: string, params: unknown[] = []): Promise<R[]> => {
    if (sql.includes("pg_advisory_xact_lock")) return [];
    if (sql.startsWith("SELECT") && sql.includes("FROM subject_memory_cards")) {
      return [{ fingerprint: fp, subject: "matematika", step: "animator", code: "sample_score", occurrences: 10, first_seen: new Date(stored.firstSeen),
        last_seen: new Date(stored.lastSeen), status: "open", evidence: stored.evidence, corrective_summary: null, corrective_at: null, corrective_count: 0 }] as R[];
    }
    if (sql.includes("FROM subject_memory_events")) {
      eventParams = params;
      return live.map((e) => ({ card_fingerprint: fp, evidence_key: e.key, seen_at: new Date(e.at) })) as R[];
    }
    if (sql.startsWith("INSERT INTO subject_memory_cards")) { writes.push(params); return []; }
    if (sql.startsWith("INSERT INTO subject_memory_events")) return [];
    throw new Error(`váratlan SQL: ${sql.slice(0, 60)}`);
  };
  assert.deepEqual(await applyEvidence(query, [ev("run:old:1", NOW - 40 * DAY)], NOW), { newEvents: 1, cards: 1 });
  assert.ok((eventParams[1] as string[]).includes("run:l0:1"), "a tárolt kulcsok idejét is lekéri");
  assert.deepEqual(JSON.parse(writes[0][8] as string), stored.evidence, "a késői, régi kulcs nem kerül az evidence-be");
  assert.equal(writes[0][4], 11);
});
