import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeWorkflow, workflowNotePromptHash, workflowPhase } from "../server/workflows/engine";
import { logger } from "../server/lib/logger";
import { memoryWorkflows } from "./helpers/workflow-store";

/* Mért (2026-10-04, run 69cacab5): a csak névvel kulcsolt prompt-lenyomat minden új fejezetnél/körnél hamis
 * „Az utasítás megváltozott folytatáskor” figyelmeztetést adott. A review #158 szándéka: hívásonként (név + kör). */

test("prompt-lenyomat hívásonként: különböző fejezet/kör nem jelez, ugyanaz a hívás eltérő utasítással jelez", async () => {
  const warns: string[] = [];
  const original = logger.warn;
  (logger as { warn: (...a: unknown[]) => void }).warn = (...a: unknown[]) => { warns.push(String(a[0])); };
  try {
    const { store } = memoryWorkflows();
    await assert.rejects(executeWorkflow(store, { id: "hash-key-run", owner: "o", mode: "studio" }, async () => {
      await workflowPhase("pedagogue");
      await workflowNotePromptHash("studio.animator.section.v1#animator:0:0:a", "1. fejezet");
      await workflowNotePromptHash("studio.animator.section.v1#animator:0:1:a", "2. fejezet");
      await workflowNotePromptHash("studio.author.v1#author:0", "0. kör");
      await workflowNotePromptHash("studio.author.v1#author:1", "1. kör (lektori jegyzetekkel)");
      assert.equal(warns.filter((w) => w.includes("megváltozott folytatáskor")).length, 0, "eltérő hívás: nincs hamis jelzés");
      await workflowNotePromptHash("studio.animator.section.v1#animator:0:1:a", "2. fejezet — MÁS sablon");
      assert.equal(warns.filter((w) => w.includes("megváltozott folytatáskor")).length, 1, "ugyanaz a hívás más utasítással: jelez");
      throw new Error("teszt-vég");
    }), /teszt-vég/);
  } finally {
    (logger as { warn: typeof original }).warn = original;
  }
});

