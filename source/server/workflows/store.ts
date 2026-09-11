import type { Pool } from "pg";
import type { WorkflowRecord, WorkflowStore } from "./engine";

/** Lazy pool: importing the engine or running unit tests never connects to production. */
export function createWorkflowStore(getPool: () => Promise<Pool>): WorkflowStore & { list(owner: string): Promise<WorkflowRecord[]>; related(id: string, owner: string): Promise<string | null>; exists(id: string): Promise<boolean> } {
  return {
    async related(id, owner) {
      const { rows } = await (await getPool()).query("SELECT id FROM lesson_workflow_runs WHERE owner_id=$1 AND snapshot->>'resourceId'=$2 ORDER BY created_at DESC LIMIT 1", [owner, id]);
      return rows[0]?.id ?? null;
    },
    async exists(id) {
      const { rows } = await (await getPool()).query("SELECT id FROM lesson_workflow_runs WHERE id=$1 OR snapshot->>'resourceId'=$1 LIMIT 1", [id]);
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
      const result = await pool.query("UPDATE lesson_workflow_runs SET snapshot=$4::jsonb,checkpoints=$5::jsonb,state=$6,revision=revision+1,updated_at=now() WHERE id=$1 AND owner_id=$2 AND lease_token=$3 AND revision=$7 AND lease_until>now()", [view.id, record.owner, token, JSON.stringify(view), JSON.stringify(record.checkpoints), view.state, record.view.revision]);
      return result.rowCount === 1;
    },
    async heartbeat(id, token) {
      const pool = await getPool();
      const result = await pool.query("UPDATE lesson_workflow_runs SET lease_until=now()+interval '90 seconds' WHERE id=$1 AND lease_token=$2 AND lease_until>now()", [id, token]);
      return result.rowCount === 1;
    },
    async release(id, token) {
      await (await getPool()).query("UPDATE lesson_workflow_runs SET lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2", [id, token]);
    },
    async list(owner) {
      const pool = await getPool();
      const { rows } = await pool.query("SELECT owner_id,snapshot,lease_until FROM lesson_workflow_runs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50", [owner]);
      return rows.map(row => {
        const view = row.snapshot;
        if (view.state === "running" && (row.lease_until ? new Date(row.lease_until).getTime() < Date.now() : view.updatedAt < Date.now() - 90_000)) {
          view.state = "interrupted"; view.error = "A végrehajtó kapcsolata megszakadt. A mentett részeredmények megmaradtak.";
        }
        return { owner: row.owner_id, view, checkpoints: {} };
      });
    },
  };
}
export const workflowStore = createWorkflowStore(async () => (await import("../db")).dbPool);
