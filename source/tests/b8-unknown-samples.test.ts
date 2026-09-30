import { test } from "node:test";
import assert from "node:assert/strict";
import { executeWorkflow, workflowPhase, workflowValidationFailure } from "../server/workflows/engine";
import { findingsFromError, unknownSample, unknownShape } from "../server/workflows/learning";
import { workflowDefinition } from "../shared/lesson-workflow";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (B8, H11): az „unknown” osztály redaktált szövege a futás naplójába. */

test("B8: az ismeretlen hibaosztály redaktált szövegmintája a futás nézetébe kerül (lenyomatonként egyszer); a tanult lelet továbbra is csak lenyomat", async () => {
  const { store } = memoryWorkflows();
  const message = "Egészen új hibaalak a „titkos forrásmondat” mellett: https://pelda.hu/x?k=1 sk-abc123 és 42 tétel";
  await executeWorkflow(store, { id: "b8-run", owner: "o", mode: "upload" }, async () => {
    await workflowPhase(workflowDefinition("upload").steps[0].id);
    await workflowValidationFailure(new Error(message));
    await workflowValidationFailure(new Error(message));
    await workflowValidationFailure(new Error("A lecke alakilag hibás.")); // ismert osztály (schema) — nem minta
    for (const step of workflowDefinition("upload").steps.slice(1)) await workflowPhase(step.id);
    return { kind: "material" as const, id: "r" };
  });
  const view = (await store.read("b8-run", "o"))!.view;
  assert.equal(view.unknownFindingSamples?.length, 1, "lenyomatonként egy minta");
  const sample = view.unknownFindingSamples![0].text;
  assert.doesNotMatch(sample, /pelda\.hu|sk-abc|titkos forrásmondat|42/, "URL, kulcs, idézett tartalom, szám kitakarva");
  assert.match(sample, /Egészen új hibaalak/);
  const finding = findingsFromError(new Error(message), "source")[0];
  assert.equal(finding.code, "unknown");
  assert.deepEqual(Object.keys(finding).sort(), ["code", "fingerprint", "step"], "a tanult leletben nincs szöveg");
  assert.equal(unknownSample("„idézet” 7 db"), "[value] # db");
  assert.equal(unknownShape("„idézet” 7 db"), "„idézet” # db", "a lenyomat alakja (és így a tanult lenyomat) változatlan");
});
