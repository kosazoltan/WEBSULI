import type { Pool } from "pg";
import type { WorkflowRecord, WorkflowStore } from "./engine";
import { createSkillStore, saveSkillAudit } from "./learning-store";

/** Lazy pool: importing the engine or running unit tests never connects to production. */
export function createWorkflowStore(getPool: () => Promise<Pool>): WorkflowStore & { list(owner: string): Promise<WorkflowRecord[]>; related(id: string, owner: string): Promise<string | null>; exists(id: string): Promise<boolean>; stop(id: string, owner: string, message: string): Promise<boolean> } {
  return {
    loadSkill: createSkillStore(getPool).load,
    async related(id, owner) {
      const { rows } = await (await getPool()).query("SELECT id FROM lesson_workflow_runs WHERE owner_id=$1 AND resource_id=$2 ORDER BY created_at DESC LIMIT 1", [owner, id]);
      return rows[0]?.id ?? null;
    },
    async exists(id) {
      const { rows } = await (await getPool()).query("SELECT id FROM lesson_workflow_runs WHERE id=$1 OR resource_id=$1 LIMIT 1", [id]);
      return rows.length > 0;
    },
    async create(record) {
      const pool = await getPool();
      const result = await pool.query("INSERT INTO lesson_workflow_runs(id,owner_id,state,snapshot,checkpoints) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) ON CONFLICT DO NOTHING", [record.view.id, record.owner, record.view.state, JSON.stringify(record.view), JSON.stringify(record.checkpoints)]);
      return result.rowCount === 1;
    },
    async read(id, owner) {
      const pool = await getPool();
      const { rows } = await pool.query("SELECT owner_id,snapshot,checkpoints,lease_until FROM lesson_workflow_runs WHERE id=$1 AND owner_id=$2", [id, owner]);
      if (!rows[0]) return null;
      const record: WorkflowRecord = { owner: rows[0].owner_id, view: rows[0].snapshot, checkpoints: rows[0].checkpoints };
      if (record.view.state === "running" && (rows[0].lease_until ? new Date(rows[0].lease_until).getTime() < Date.now() : record.view.updatedAt < Date.now() - 90_000)) {
        record.view.state = "interrupted";
        record.view.error = "A végrehajtó kapcsolata megszakadt. A mentett részeredmények megmaradtak.";
      }
      return record;
    },
    async claim(id, owner, token) {
      const pool = await getPool();
      const result = await pool.query("UPDATE lesson_workflow_runs SET lease_token=$3,lease_until=now()+interval '90 seconds' WHERE id=$1 AND owner_id=$2 AND (lease_token IS NULL OR lease_until<now()) AND state NOT IN ('done','ready')", [id, owner, token]);
      return result.rowCount === 1;
    },
    async save(record, token) {
      const pool = await getPool();
      const view = { ...record.view, revision: record.view.revision + 1 };
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query("UPDATE lesson_workflow_runs SET snapshot=$4::jsonb,checkpoints=$5::jsonb,state=$6,revision=revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND lease_token=$3 AND revision=$7 AND lease_until>clock_timestamp()", [view.id, record.owner, token, JSON.stringify(view), JSON.stringify(record.checkpoints), view.state, record.view.revision]);
        if (result.rowCount === 1) await saveSkillAudit(client, record);
        await client.query("COMMIT");
        return result.rowCount === 1;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
    async heartbeat(id, token) {
      const pool = await getPool();
      const result = await pool.query("UPDATE lesson_workflow_runs SET lease_until=now()+interval '90 seconds' WHERE id=$1 AND lease_token=$2 AND lease_until>now()", [id, token]);
      return result.rowCount === 1;
    },
    /**
     * Spec 2026-10-22-elmaradt-feladatok (S3): a futó / várakozó futás leállítása — bármelyik példányon fut. A bérlet törlődik és a revízió
     * lép, így a motor szívverése és következő mentése elbukik (a motor nem ír vissza); a futás állapota „hiba” a megadott üzenettel.
     * A hozzá tartozó okosítás-sor (azonos azonosító) is lezárul. Visszaad: történt-e leállítás.
     */
    async stop(id, owner, message) {
      const pool = await getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query(`UPDATE lesson_workflow_runs SET lease_token=NULL, lease_until=NULL, state='error', revision=revision+1, updated_at=now(),
          snapshot = jsonb_set(jsonb_set(jsonb_set(snapshot, '{state}', '"error"'::jsonb), '{error}', to_jsonb($3::text)), '{revision}', to_jsonb(revision+1))
          WHERE id=$1 AND owner_id=$2 AND state IN ('running','waiting')`, [id, owner, message]);
        // Review #366: a már „pending” (alkalmazásra váró, nem alkalmazott) jelölt is lezárul — a leállított futás jelöltje nem alkalmazható.
        if (result.rowCount === 1) await client.query("UPDATE improved_html_files SET status='error', improvement_notes=$2 WHERE id=$1 AND status IN ('processing','pending')", [id, message]);
        await client.query("COMMIT");
        return result.rowCount === 1;
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
    async release(id, token) {
      await (await getPool()).query("UPDATE lesson_workflow_runs SET lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2", [id, token]);
    },
    async list(owner) {
      const pool = await getPool();
      // Spec 2026-10-19-eroforras-s2a + review #325: a lista a lépésnaplót már az SQL-ben elhagyja (Neon-kimenő forgalom); a teljes
      // futást az egyes futás végpontja adja.
      const { rows } = await pool.query("SELECT owner_id,snapshot - 'visits' - 'history' - 'skill' - 'skillFindings' - 'resumeEdges' AS snapshot,lease_until FROM lesson_workflow_runs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50", [owner]);
      return rows.map(row => {
        const view = { ...row.snapshot, visits: [] };
        if (view.state === "running" && (row.lease_until ? new Date(row.lease_until).getTime() < Date.now() : view.updatedAt < Date.now() - 90_000)) {
          view.state = "interrupted"; view.error = "A végrehajtó kapcsolata megszakadt. A mentett részeredmények megmaradtak.";
        }
        return { owner: row.owner_id, view, checkpoints: {} };
      });
    },
  };
}
export const workflowStore = createWorkflowStore(async () => (await import("../db")).dbPool);
