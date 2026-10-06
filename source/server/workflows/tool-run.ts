import { randomUUID } from "node:crypto";
import type { WorkflowMode, WorkflowView } from "../../shared/lesson-workflow";
import { executeWorkflow, type WorkflowStore } from "./engine";

/**
 * Spec 2026-10-06-s7-workflow-rendbetetel (§4/4): a korábban workflow nélküli segéd-, kvíz- és tudástár-utak közös futtatója.
 * Egy futás = egy kérés: saját azonosító (`<mód>:<uuid>`), a motor lépésnaplója, kapuja, visszaolvasása és lelet-tanulása.
 * A munka a saját válaszértékét (`value`) adja vissza a hívónak; a motor a `result`-ot (fajta + azonosító) rögzíti.
 * A bemenet-ellenőrzés (400/404) a hívó dolga a futás ELŐTT — érvénytelen kérésből nem lesz hibás futás.
 */
export async function runToolWorkflow<T>(
  input: { mode: WorkflowMode; owner: string; request: unknown; id?: string; store?: WorkflowStore },
  work: () => Promise<{ value: T; result: NonNullable<WorkflowView["result"]> }>,
): Promise<T> {
  const store = input.store ?? (await import("./store")).workflowStore;
  let value: T | undefined;
  await executeWorkflow(store, { id: input.id ?? `${input.mode}:${randomUUID()}`, owner: input.owner, mode: input.mode, request: input.request }, async () => {
    const done = await work();
    value = done.value;
    return done.result;
  });
  return value as T;
}
