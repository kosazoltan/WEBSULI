import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { assertWorkflowStep, workflowDefinition, WORKFLOW_VERSION, type WorkflowMode, type WorkflowView } from "../../shared/lesson-workflow";
import { skillRuleText, type SkillCode, type SkillSnapshot } from "../../shared/lesson-skill";
import { auditWorkflow, findingsFromError, knownFinding, mergeFindings } from "./learning";
import { runtimePrompt } from "../../shared/runtime-knowledge";

export type WorkflowRecord = { view: WorkflowView; owner: string; checkpoints: Record<string, unknown> };
export interface WorkflowStore {
  create(record: WorkflowRecord): Promise<boolean>;
  read(id: string, owner: string): Promise<WorkflowRecord | null>;
  claim(id: string, owner: string, token: string): Promise<boolean>;
  save(record: WorkflowRecord, token: string): Promise<boolean>;
  heartbeat(id: string, token: string): Promise<boolean>;
  release(id: string, token: string): Promise<void>;
  loadSkill?(owner: string, mode: WorkflowMode): Promise<SkillSnapshot>;
}
type Context = { record: WorkflowRecord; store: WorkflowStore; token: string; lostLease: boolean; continuation: boolean };
const context = new AsyncLocalStorage<Context>();
const preparationSkill = new AsyncLocalStorage<{ snapshot: SkillSnapshot; mode: WorkflowMode }>();
/** Manual source preparation shares one pinned prompt without inventing a full lesson run. */
export function withPreparationSkill<T>(snapshot: SkillSnapshot, work: () => Promise<T>): Promise<T> {
  return preparationSkill.run({ snapshot: structuredClone(snapshot), mode: "upload" }, work);
}
export class WorkflowConflict extends Error {}
export class WorkflowWaiting extends Error {
  constructor(message: string, readonly stepCompleted = false) { super(message); }
}
export const workflowMode = () => context.getStore()?.record.view.definition.mode;
export const workflowSkillVersion = () => context.getStore()?.record.view.skill?.version ?? preparationSkill.getStore()?.snapshot.version;
export const workflowSkillPrompt = () => {
  const view = context.getStore()?.record.view;
  const preparation = preparationSkill.getStore();
  const snapshot = view?.skill ?? preparation?.snapshot;
  const mode = view?.definition.mode ?? preparation?.mode;
  return snapshot && mode ? runtimePrompt(snapshot, mode) + skillRuleText(snapshot) : "";
};
/** Record even a recoverable validation failure, before asking the model to repair it. */
export async function workflowFinding(code: SkillCode) {
  const ctx = context.getStore();
  if (!ctx) return;
  ctx.record.view.skillFindings = mergeFindings(ctx.record.view.skillFindings ?? [], [knownFinding(code, ctx.record.view.visits.at(-1)?.step ?? "start")]);
  await persist(ctx);
}
export async function workflowValidationFailure(error: unknown) {
  const ctx = context.getStore();
  if (!ctx) return;
  ctx.record.view.skillFindings = mergeFindings(ctx.record.view.skillFindings ?? [], findingsFromError(error, ctx.record.view.visits.at(-1)?.step ?? "start"));
  await persist(ctx);
}
/** Call before domain writes and immediately before returning from their transaction.
 * The row lock prevents takeover until commit; the final wall-clock check rejects an expired writer.
 * No workflowPhase/persist call may occur between these fences (it uses another connection).
 */
export async function workflowFence(tx: { execute(query: SQL): Promise<{ rows: unknown[] }> }) {
  const ctx = context.getStore();
  if (!ctx) return;
  if (ctx.lostLease) throw new WorkflowConflict("A futás végrehajtási engedélye elveszett; nincs közzététel.");
  const result = await tx.execute(sql`SELECT id FROM lesson_workflow_runs WHERE id=${ctx.record.view.id}
    AND owner_id=${ctx.record.owner} AND lease_token=${ctx.token} AND revision=${ctx.record.view.revision}
    AND lease_until>clock_timestamp() FOR UPDATE`);
  if (result.rows.length !== 1) throw new WorkflowConflict("Elavult vagy lejárt végrehajtó nem menthet tananyagot.");
}
const hash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
export function savedWorkflowResult<T>(record: WorkflowRecord, name: string, input: unknown): T | undefined {
  if (record.view.definition.version !== WORKFLOW_VERSION) return undefined;
  return structuredClone(record.checkpoints[hash([WORKFLOW_VERSION, name, input])]) as T | undefined;
}
export function redactWorkflowError(error: unknown): string {
  return (error instanceof Error ? error.message : "A művelet hibával megállt.")
    .replace(/https?:\/\/\S+/gi, "[hivatkozás]")
    .replace(/Minden javítandó címkézés[\s\S]*/i, "A részletes tartalmi eltérés a javítóellenőrzésben található.")
    .replace(/(?:sk-|Bearer\s+)[\w.-]+/gi, "[titkos érték]").slice(0, 1600);
}
async function persist(ctx: Context) {
  if (ctx.lostLease) throw new WorkflowConflict("A futást már másik végrehajtó kezeli.");
  ctx.record.view.updatedAt = Date.now();
  if (!await ctx.store.save(ctx.record, ctx.token)) {
    ctx.lostLease = true;
    throw new WorkflowConflict("A futás állapota megváltozott; elavult eredmény nem írható vissza.");
  }
  ctx.record.view.revision++;
}
export async function workflowResource(id: string) {
  const ctx = context.getStore();
  if (ctx) { ctx.record.view.resourceId = id; await persist(ctx); }
}

/** The same awaited boundaries drive the real execution and the public graph. */
export async function workflowPhase(step: string): Promise<void> {
  const ctx = context.getStore();
  if (!ctx) return; // Existing isolated domain helpers remain usable outside a production run.
  const previous = ctx.record.view.visits.at(-1);
  // A resumed current step is a new attempt, never a fabricated completed step.
  const resuming = ctx.continuation && previous?.step === step && previous.state !== "done";
  if (!resuming) assertWorkflowStep(ctx.record.view, step);
  ctx.continuation = false;
  if (previous?.state === "running") { previous.state = "done"; previous.finishedAt = Date.now(); }
  ctx.record.view.visits.push({ step, attempt: ctx.record.view.visits.filter(v => v.step === step).length + 1,
    startedAt: Date.now(), state: "running", cacheHits: 0 });
  await persist(ctx);
}

/** Only completed JSON results are reused, inside this run and exact effective input. */
export async function workflowCheckpoint<T>(name: string, input: unknown, work: () => Promise<T>): Promise<T> {
  const ctx = context.getStore();
  if (!ctx) return work();
  const key = hash([WORKFLOW_VERSION, name, input]);
  if (Object.hasOwn(ctx.record.checkpoints, key)) {
    const visit = ctx.record.view.visits.at(-1);
    if (visit) visit.cacheHits++;
    await persist(ctx);
    return structuredClone(ctx.record.checkpoints[key]) as T;
  }
  const result = await work();
  // JSON serializability is part of the checkpoint contract. No credentials/requests are stored here.
  const encoded = JSON.stringify(result);
  if (encoded === undefined) throw new Error("A részeredmény nem menthető.");
  ctx.record.checkpoints[key] = JSON.parse(encoded);
  await persist(ctx);
  return result;
}

export async function workflowUsage(usage: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number; promptTokens?: number; completionTokens?: number } | undefined) {
  const ctx = context.getStore();
  const visit = ctx?.record.view.visits.at(-1);
  if (!ctx || !visit || !usage) return;
  const input = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens;
  const output = usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens;
  if (input !== undefined) visit.tokensIn = (visit.tokensIn ?? 0) + input;
  if (output !== undefined) visit.tokensOut = (visit.tokensOut ?? 0) + output;
  await persist(ctx);
}

export async function executeWorkflow<T extends WorkflowView["result"]>(
  store: WorkflowStore, input: { id: string; owner: string; mode: WorkflowMode; retry?: boolean; continuation?: boolean; request?: unknown },
  work: () => Promise<T>,
): Promise<WorkflowView> {
  const now = Date.now();
  const requestHash = hash(input.request ?? null);
  await store.create({ owner: input.owner, checkpoints: { requestHash }, view: { id: input.id, definition: workflowDefinition(input.mode), state: "running", createdAt: now, updatedAt: now, visits: [], revision: 0 } });
  const record = await store.read(input.id, input.owner);
  if (!record || record.view.definition.mode !== input.mode) throw new WorkflowConflict("Másik készítőhöz vagy módhoz tartozó futás.");
  if (record.view.definition.version !== WORKFLOW_VERSION) throw new WorkflowConflict("A futás eltérő programverzióval készült.");
  if (!(input.continuation && input.request === undefined) && record.checkpoints.requestHash !== requestHash) throw new WorkflowConflict("Megváltozott bemenettel új futást kell indítani.");
  if (["done", "ready"].includes(record.view.state)) return record.view;
  if (["error", "interrupted", "waiting"].includes(record.view.state) && !input.retry) throw new WorkflowConflict("Ez a futás megállt; külön folytatási művelet szükséges.");
  if ((record.view.executions ?? 0) >= 4) throw new WorkflowConflict("A futás folytatási kerete elfogyott. Ellenőrizd a hibát új készítés előtt.");
  const token = randomUUID();
  if (!await store.claim(input.id, input.owner, token)) throw new WorkflowConflict("Ez a futás már folyamatban van.");
  const fresh = await store.read(input.id, input.owner);
  if (!fresh) throw new WorkflowConflict("A futás nem található.");
  const ctx: Context = { record: fresh, store, token, lostLease: false, continuation: input.continuation ?? false };
  fresh.view.state = record.view.state;
  if (record.view.state === "interrupted") {
    const interrupted = fresh.view.visits.at(-1);
    if (interrupted?.state === "running") { interrupted.state = "error"; interrupted.error = "A végrehajtó megszakadt; a lépés befejezése nem igazolt."; interrupted.finishedAt = fresh.view.updatedAt; }
  }
  if (fresh.view.visits.length && !input.continuation) {
    fresh.view.history = [...(fresh.view.history ?? []), { state: fresh.view.state, visits: structuredClone(fresh.view.visits), error: fresh.view.error }];
    fresh.view.visits = [];
  }
  fresh.view.executions = (fresh.view.executions ?? 0) + 1;
  fresh.view.state = "running";
  fresh.view.error = undefined;
  fresh.view.skillAudit = undefined;
  const timer = setInterval(() => {
    void store.heartbeat(input.id, token).then(ok => { if (!ok) ctx.lostLease = true; }).catch(() => { ctx.lostLease = true; });
  }, 20_000);
  timer.unref();
  try {
    return await context.run(ctx, async () => {
      // Pin the exact rule set for the whole run, including explicit continuation.
      if (!ctx.record.view.skill && store.loadSkill) ctx.record.view.skill = await store.loadSkill(input.owner, input.mode);
      await persist(ctx);
      const result = await work();
      if (!result?.id || ctx.record.view.visits.at(-1)?.step !== "readback") throw new Error("Nincs visszaolvasott eredmény; a futás nem jelölhető késznek.");
      const expectedKind = ["repair", "html"].includes(input.mode) ? "candidate" : "material";
      if (result.kind !== expectedKind) throw new Error("A kapott eredmény nem felel meg a készítési módnak.");
      const last = ctx.record.view.visits.at(-1)!;
      last.state = "done"; last.finishedAt = Date.now();
      ctx.record.view.result = result;
      ctx.record.view.state = result.kind === "candidate" ? "ready" : "done";
      ctx.record.view.skillAudit = auditWorkflow(ctx.record.view);
      if (ctx.record.view.skillAudit.outcome !== "passed") throw new Error("A futás utóellenőrzése nem igazolja az összes kötelező lépést.");
      await persist(ctx);
      return structuredClone(ctx.record.view);
    });
  } catch (error) {
    if (!ctx.lostLease) {
      ctx.record.view.state = error instanceof WorkflowWaiting ? "waiting" : "error";
      ctx.record.view.error = redactWorkflowError(error);
      const visit = ctx.record.view.visits.at(-1);
      if (visit?.state === "running") { visit.state = error instanceof WorkflowWaiting ? (error.stepCompleted ? "done" : "waiting") : "error"; visit.error = error instanceof WorkflowWaiting ? undefined : ctx.record.view.error; visit.finishedAt = Date.now(); }
      ctx.record.view.skillAudit = auditWorkflow(ctx.record.view);
      await persist(ctx);
    }
    throw error;
  } finally { clearInterval(timer); await store.release(input.id, token); }
}
