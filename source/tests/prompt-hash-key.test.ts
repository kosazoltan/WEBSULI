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

test("forrás-ellenőrzés: a lépésfuttató a lenyomatot lépés:kör (fejezetnél + fejezet:változat) kulccsal rögzíti", () => {
  const src = readFileSync(new URL("../server/studio/step-runner.ts", import.meta.url), "utf8");
  assert.ok(src.includes("await workflowNotePromptHash(callKey ? `${name}#${callKey}` : name, system);"));
  assert.ok(src.includes("basePromptLookup(name, fallback, `${job.step}:${job.round}${extra ? `:${extra}` : \"\"}`)"));
  assert.ok(src.includes("buildSectionDesignerPrompt(variant, i, promptMapOf(map)), `fejezet${i}:próba${attempt}`)"), "review #184: próba-sorszám, nem a lecke-objektum");
  assert.ok(!/`\$\{i\}:\$\{variant\}`/.test(src), "a lecke-objektum nem kerülhet a kulcsba ([object Object])");
  assert.ok(src.includes('buildAnimatorPrompt(animated, promptMapOf(map)), "gyenge-ábra-javítás")'), "review #184: a gyenge-ábra javító hívás saját kulcsot kap");
  assert.ok(src.includes('const resolved = await lookup(name, "", callKey);'), "review #184: a beinjektált lookup is megkapja a kulcsot");
  const designer = readFileSync(new URL("../server/studio/visual-designer.ts", import.meta.url), "utf8");
  assert.ok(designer.includes("options.systemFor(index, lesson, 0)") && designer.includes("options.systemFor(index, base, 1)"));
});
