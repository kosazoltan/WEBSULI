import type { Pool, PoolClient } from "pg";
import { SKILL_METHOD_VERSION, SKILL_RULES, skillForMode, type SkillLesson, type LessonSkill } from "../../shared/lesson-skill";
import type { WorkflowMode } from "../../shared/lesson-workflow";
import type { WorkflowRecord } from "./engine";
import { auditWorkflow, skillSnapshot } from "./learning";

/** Called in the SAME transaction as the terminal snapshot; conflict means already learned. */
export async function saveSkillAudit(client: PoolClient, record: WorkflowRecord) {
  const audit = record.view.skillAudit;
  if (!audit || audit.execution !== record.view.executions) return;
  const inserted = await client.query("INSERT INTO lesson_skill_audits(run_id,execution,audit) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING run_id", [record.view.id, audit.execution, JSON.stringify(audit)]);
  if (!inserted.rowCount) return;
  for (const finding of audit.findings) {
    const state = Object.hasOwn(SKILL_RULES, finding.code) ? "active" : "observed";
    await client.query(`INSERT INTO lesson_skill_lessons(owner_id,skill,method_version,fingerprint,code,step,state,recovered,last_run)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(owner_id,skill,method_version,fingerprint)
      DO UPDATE SET occurrences=lesson_skill_lessons.occurrences+1,recovered=lesson_skill_lessons.recovered+EXCLUDED.recovered,
      last_run=EXCLUDED.last_run,updated_at=now()`, [record.owner, skillForMode(record.view.definition.mode), audit.version,
      finding.fingerprint, finding.code, finding.step, state, audit.outcome === "passed" ? 1 : 0, record.view.id]);
  }
}

export function createSkillStore(getPool: () => Promise<Pool>) {
  const list = async (owner: string, skill: LessonSkill): Promise<SkillLesson[]> => {
    const { rows } = await (await getPool()).query(`SELECT code,step,fingerprint,state,occurrences,recovered,last_run AS "lastRun"
      FROM lesson_skill_lessons WHERE owner_id=$1 AND skill=$2 AND method_version=$3 ORDER BY updated_at DESC,fingerprint`, [owner, skill, SKILL_METHOD_VERSION]);
    return rows;
  };
  return {
    list,
    async load(owner: string, mode: WorkflowMode) {
      // This finite maintained catalogue bounds prompt growth independently of error volume.
      const { rows } = await (await getPool()).query(`SELECT DISTINCT code FROM lesson_skill_lessons
        WHERE owner_id=$1 AND skill=$2 AND method_version=$3 AND state='active'`, [owner, skillForMode(mode), SKILL_METHOD_VERSION]);
      return skillSnapshot(mode, rows.map(row => row.code));
    },
    async disable(owner: string, skill: LessonSkill, fingerprint: string) {
      const result = await (await getPool()).query(`UPDATE lesson_skill_lessons SET state='disabled',updated_at=now()
        WHERE owner_id=$1 AND skill=$2 AND method_version=$3 AND fingerprint=$4`, [owner, skill, SKILL_METHOD_VERSION, fingerprint]);
      return result.rowCount === 1;
    },
    /** No AI calls or domain publication. Row locks fence active workers and concurrent sweepers. */
    async reconcile(limit = 100) {
      const client = await (await getPool()).connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(`SELECT w.id,w.owner_id,w.snapshot FROM lesson_workflow_runs w
          WHERE (w.lease_token IS NULL OR w.lease_until<clock_timestamp())
          AND (w.state IN ('done','ready','error','waiting','interrupted') OR
            (w.state='running' AND (w.lease_until<clock_timestamp() OR (w.lease_until IS NULL AND w.updated_at<now()-interval '90 seconds'))))
          AND NOT EXISTS(SELECT 1 FROM lesson_skill_audits a WHERE a.run_id=w.id AND a.execution=COALESCE((w.snapshot->>'executions')::int,0))
          ORDER BY w.created_at LIMIT $1 FOR UPDATE OF w SKIP LOCKED`, [limit]);
        for (const row of rows) {
          const record: WorkflowRecord = { owner: row.owner_id, checkpoints: {}, view: row.snapshot };
          if (record.view.state === "running") {
            record.view.state = "interrupted";
            record.view.error = "A végrehajtó megszakadt; a befejezés nem igazolt.";
          }
          record.view.executions ??= 0;
          record.view.skillAudit = auditWorkflow(record.view);
          record.view.revision++;
          await client.query("UPDATE lesson_workflow_runs SET snapshot=$2::jsonb,state=$3,revision=revision+1 WHERE id=$1", [row.id, JSON.stringify(record.view), record.view.state]);
          await saveSkillAudit(client, record);
        }
        await client.query("COMMIT");
        return rows.length;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
  };
}
export const skillStore = createSkillStore(async () => (await import("../db")).dbPool);
