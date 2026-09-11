import type { WorkflowRecord, WorkflowStore } from "../../server/workflows/engine";
export function memoryWorkflows() {
  const records = new Map<string, WorkflowRecord>();
  const leases = new Map<string, string>();
  const store: WorkflowStore = {
    async create(r) { if (records.has(r.view.id)) return false; records.set(r.view.id, structuredClone(r)); return true; },
    async read(id, owner) { const r = records.get(id); return r?.owner === owner ? structuredClone(r) : null; },
    async claim(id, owner, token) { if (leases.has(id) || records.get(id)?.owner !== owner) return false; leases.set(id, token); return true; },
    async save(r, token) {
      if (leases.get(r.view.id) !== token || records.get(r.view.id)?.view.revision !== r.view.revision) return false;
      const saved = structuredClone(r); saved.view.revision++;
      records.set(r.view.id, saved); return true;
    },
    async heartbeat(id, token) { return leases.get(id) === token; },
    async release(id, token) { if (leases.get(id) === token) leases.delete(id); },
  };
  return { store, records, leases };
}
