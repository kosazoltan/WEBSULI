import type { PoolClient } from "pg";
import { subjectKeyOf } from "../../shared/subject-key";
import type { WorkflowView } from "../../shared/lesson-workflow";
import { logger } from "../lib/logger";
import { evidenceFromLektorNotes, evidenceFromRun, foldEvidence, type MemoryCard, type MemoryEvidence, type MemoryStatus } from "./subject-memory";

/**
 * Spec 2026-10-06-s5-tantargyi-memoria: a tantárgyi memória DB-rétege. A számolás a tiszta `foldEvidence`-ben van; itt csak
 * betöltés, sorosítás (advisory lock) és írás. Az élő hook és a backfill UGYANEZT az `applyEvidence`-t hívja.
 */
export type Query = <R = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<R[]>;

type CardRow = {
  fingerprint: string; subject: string; step: string; code: string; occurrences: number; first_seen: Date | string; last_seen: Date | string;
  status: MemoryStatus; evidence: string[] | null; corrective_summary: string | null; corrective_at: Date | string | null; corrective_count: number;
};
const ms = (v: Date | string | null) => (v === null ? null : new Date(v).getTime());
export const cardFromRow = (r: CardRow): MemoryCard => ({
  fingerprint: r.fingerprint, subject: r.subject, step: r.step, code: r.code, occurrences: Number(r.occurrences), firstSeen: ms(r.first_seen)!,
  lastSeen: ms(r.last_seen)!, status: r.status, evidence: Array.isArray(r.evidence) ? r.evidence : [], correctiveSummary: r.corrective_summary,
  correctiveAt: ms(r.corrective_at), correctiveCount: Number(r.corrective_count),
});
const CARD_COLUMNS = "fingerprint,subject,step,code,occurrences,first_seen,last_seen,status,evidence,corrective_summary,corrective_at,corrective_count";

/** Bizonyítékok rögzítése egy tranzakcióban (a hívóé). Idempotens: a már rögzített (kártya, kulcs) pár nem számol újra. */
export async function applyEvidence(query: Query, evidence: readonly MemoryEvidence[], now = Date.now()): Promise<{ newEvents: number; cards: number }> {
  if (!evidence.length) return { newEvents: 0, cards: 0 };
  await query("SELECT pg_advisory_xact_lock(hashtext('subject_memory'))");
  const { cards: probe } = foldEvidence([], new Set(), evidence, now);
  const fps = probe.map((c) => c.fingerprint);
  const existing = (await query<CardRow>(`SELECT ${CARD_COLUMNS} FROM subject_memory_cards WHERE fingerprint = ANY($1)`, [fps])).map(cardFromRow);
  // Az új kulcsok ÉS a kártyákon tárolt kulcsok eseményei: az előbbi a dedupot, az utóbbi ideje a „legújabb ≤ 10” listát adja (review #204).
  const keys = [...new Set([...evidence.map((e) => e.key), ...existing.flatMap((c) => c.evidence)])];
  const seen = new Map((await query<{ card_fingerprint: string; evidence_key: string; seen_at?: Date | string | null }>(
    "SELECT card_fingerprint, evidence_key, seen_at FROM subject_memory_events WHERE card_fingerprint = ANY($1) AND evidence_key = ANY($2)", [fps, keys],
  )).map((r) => [`${r.card_fingerprint}|${r.evidence_key}`, r.seen_at == null ? Number.NaN : new Date(r.seen_at).getTime()] as const));
  const { cards, events } = foldEvidence(existing, seen, evidence, now);
  for (const c of cards) {
    await query(`INSERT INTO subject_memory_cards (${CARD_COLUMNS},updated_at)
      VALUES ($1,$2,$3,$4,$5,to_timestamp($6::bigint/1000.0),to_timestamp($7::bigint/1000.0),$8,$9::jsonb,$10,to_timestamp($11::bigint/1000.0),$12,now())
      ON CONFLICT (fingerprint) DO UPDATE SET occurrences=EXCLUDED.occurrences, first_seen=EXCLUDED.first_seen, last_seen=EXCLUDED.last_seen,
        status=EXCLUDED.status, evidence=EXCLUDED.evidence, corrective_summary=EXCLUDED.corrective_summary, corrective_at=EXCLUDED.corrective_at,
        corrective_count=EXCLUDED.corrective_count, updated_at=now()`,
    [c.fingerprint, c.subject, c.step, c.code, c.occurrences, c.firstSeen, c.lastSeen, c.status, JSON.stringify(c.evidence), c.correctiveSummary, c.correctiveAt, c.correctiveCount]);
  }
  for (const e of events) {
    await query("INSERT INTO subject_memory_events (card_fingerprint, evidence_key, seen_at) VALUES ($1,$2,to_timestamp($3::bigint/1000.0)) ON CONFLICT DO NOTHING", [e.fingerprint, e.key, e.at]);
  }
  return { newEvents: events.length, cards: cards.length };
}

/**
 * Élő hook (a tanulási hurok `saveSkillAudit`-ja után, UGYANABBAN a tranzakcióban): a futás tantárgyát a studio-jobból veszi,
 * a futás leleteit, orkesztrátor-kimeneteit és a job lektori blokkoló jegyzeteit rögzíti. MINDEN lekérdezés (a tábla-előellenőrzés is,
 * review #204) mentési pontban fut: hiba vagy hiányzó tábla (régi DB) esetén a hurok tranzakciója változatlanul folytatódik (fail-open).
 */
export async function recordSubjectMemory(client: Pick<PoolClient, "query">, record: { view: WorkflowView }): Promise<void> {
  // A studio-futás azonosítója a job-azonosító, vagy a job a `resourceId`-ben van (sweepStudioJobs ugyanígy köti össze).
  const jobId = record.view.resourceId ?? record.view.id;
  if (!jobId) return;
  const query: Query = async (sql, params) => (await client.query(sql, params as unknown[] | undefined)).rows;
  const warn = (error: unknown) => logger.warn(`[MEMÓRIA] A tantárgyi memória rögzítése kimaradt (${record.view.id}): ${error instanceof Error ? error.message : String(error)}`);
  try {
    await client.query("SAVEPOINT subject_memory");
  } catch (error) {
    warn(error); // a hívó tranzakciója már hibás — nincs mit elszigetelni, de nem dobunk
    return;
  }
  try {
    const [{ tbl } = { tbl: null }] = await query<{ tbl: string | null }>("SELECT to_regclass('public.subject_memory_cards')::text AS tbl");
    if (!tbl) {
      await client.query("RELEASE SAVEPOINT subject_memory");
      return;
    }
    const [job] = await query<{ subject: string }>("SELECT m.subject FROM studio_jobs j JOIN knowledge_maps m ON m.id = j.map_id WHERE j.id = $1", [jobId]);
    const subject = subjectKeyOf(job?.subject);
    if (subject) {
      const notes = await query<{ kind: string; subkind: string | null; severity: string; block_path: string | null; created_at: Date }>(
        "SELECT kind, subkind, severity, block_path, created_at FROM lektor_notes WHERE job_id = $1 AND severity = 'blocker'", [jobId]);
      await applyEvidence(query, [
        ...evidenceFromRun(record.view, subject),
        ...evidenceFromLektorNotes(jobId, notes.map((n) => ({ kind: n.kind, subkind: n.subkind, severity: n.severity, blockPath: n.block_path, createdAt: new Date(n.created_at).getTime() })), subject),
      ]);
    }
    await client.query("RELEASE SAVEPOINT subject_memory");
  } catch (error) {
    warn(error);
    try {
      await client.query("ROLLBACK TO SAVEPOINT subject_memory");
      await client.query("RELEASE SAVEPOINT subject_memory");
    } catch (rollbackError) {
      warn(rollbackError);
    }
  }
}

/**
 * A tantárgy tárolt `open` kártyái (a prompt-pillanatkép újraszámolja a lecsengést). Csak `subject = $1` — más bankból soha.
 * Minden kártya megkapja az összes esemény-kulcsát (`runKeys`), hogy a kódonkénti csoport a KÜLÖNBÖZŐ futásokat számolja (review #204).
 */
export async function loadSubjectMemoryCards(query: Query, subject: string): Promise<MemoryCard[]> {
  const cards = (await query<CardRow>(`SELECT ${CARD_COLUMNS} FROM subject_memory_cards WHERE subject = $1 AND status = 'open'
    ORDER BY occurrences DESC, last_seen DESC, fingerprint LIMIT 200`, [subject])).map(cardFromRow);
  if (!cards.length) return cards;
  const keys = new Map<string, string[]>();
  for (const r of await query<{ card_fingerprint: string; evidence_key: string }>(
    "SELECT card_fingerprint, evidence_key FROM subject_memory_events WHERE card_fingerprint = ANY($1) ORDER BY seen_at, evidence_key", [cards.map((c) => c.fingerprint)])) {
    keys.set(r.card_fingerprint, [...(keys.get(r.card_fingerprint) ?? []), r.evidence_key]);
  }
  return cards.map((c) => ({ ...c, runKeys: keys.get(c.fingerprint) ?? c.evidence }));
}
