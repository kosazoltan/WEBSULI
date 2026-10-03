import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cacheConversation, cachedSystem, claudeSystemFromMessages, EPHEMERAL } from "../server/ai/prompt-cache";
import { lessonHtmlSpecParts, lessonHtmlSpecPrompt } from "../server/ai/lesson-html-spec";
import { webResearchGatherParts, webResearchGatherPrompt } from "../server/studio/web-research-agent";
import { buildContinuationMessages } from "../server/improve/continuation";

/* Spec 2026-10-03-gpt61-sol-kv-cache: statikus rész elöl cache-törésponttal, a változó adat utána. */

test("cachedSystem: statikus blokk töréspontos, a változó rész utána töréspont nélkül; üres változó rész elmarad", () => {
  assert.deepEqual(cachedSystem("STATIC", "DYN"), [
    { type: "text", text: "STATIC", cache_control: EPHEMERAL },
    { type: "text", text: "DYN" },
  ]);
  assert.deepEqual(cachedSystem("STATIC", "  "), [{ type: "text", text: "STATIC", cache_control: EPHEMERAL }]);
  assert.deepEqual(cachedSystem("STATIC"), [{ type: "text", text: "STATIC", cache_control: EPHEMERAL }]);
});

test("claudeSystemFromMessages: egy üzenet változatlan szöveg, több üzenetnél a töréspont az utolsó előtti végén", () => {
  assert.equal(claudeSystemFromMessages(["A"]), "A");
  assert.equal(claudeSystemFromMessages([]), "");
  assert.deepEqual(claudeSystemFromMessages(["A", "B"]), [
    { type: "text", text: "A", cache_control: EPHEMERAL },
    { type: "text", text: "B" },
  ]);
});

test("cacheConversation: egyszeri hívás változatlan; folytatásnál az első user-üzenet töréspontos", () => {
  assert.deepEqual(cacheConversation([{ role: "system", content: "S" }, { role: "user", content: "U" }]), [{ role: "user", content: "U" }]);
  const cont = cacheConversation(buildContinuationMessages(["S1", "S2"], "EREDETI", "<html>"));
  assert.deepEqual(cont[0], { role: "user", content: [{ type: "text", text: "EREDETI", cache_control: EPHEMERAL }] });
  assert.equal(cont[1].role, "assistant");
  assert.equal(typeof cont[2].content, "string", "a folytatás-parancs nem kap töréspontot");
  assert.equal(buildContinuationMessages(["S1", "S2"], "U", "P").filter((m) => m.role === "system").length, 2);
  assert.equal(buildContinuationMessages("S", "U", "P")[0].content, "S", "a régi (egy szöveges) hívás változatlan");
});

test("lessonHtmlSpecParts: a spec statikus (témától független), a régi összefűzés bájtra azonos", () => {
  const a = { classroom: 5, seed: "Vulkánok", subjectHint: "földrajz" };
  const b = { classroom: 9, seed: "Petőfi", subjectHint: "irodalom" };
  assert.equal(lessonHtmlSpecParts(a).spec, lessonHtmlSpecParts(b).spec);
  assert.equal(lessonHtmlSpecPrompt(a), `${lessonHtmlSpecParts(a).theme}\n\n${lessonHtmlSpecParts(a).spec}`);
});

test("webResearchGatherParts: a statikus rész kérésfüggetlen, a kérés (cím, mag) csak a változó részben", () => {
  const x = webResearchGatherParts(5, "Vulkánok", "lávafolyás");
  const y = webResearchGatherParts(8, "Honfoglalás", "Árpád");
  assert.equal(x.fixed, y.fixed);
  assert.ok(!x.fixed.includes("Vulkánok") && x.request.includes("Vulkánok") && x.request.includes("lávafolyás"));
  assert.equal(webResearchGatherPrompt(5, "Vulkánok", "lávafolyás"), `${x.fixed}\n\n${x.request}`);
});

test("forrás-ellenőrzés: a régi Anthropic-útvonalak töréspontos rendszerpromptot küldenek", () => {
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  assert.equal((routes.match(/system: cachedSystem\(systemPrompt, customInstructions\)/g) ?? []).length, 2, "htmlFix + htmlTheme");
  assert.equal((routes.match(/system: cachedSystem\(systemPrompt, dynamicPrompt\)/g) ?? []).length, 2, "claudeChat + claude-html");
  assert.ok(!/systemPrompt \+= `\n\nEGYEDI FELHASZNÁLÓI/.test(routes), "az egyedi utasítás nem kerülhet a statikus rész közepére");
  assert.ok(!/STÍLUS IRÁNYELVEK \(\$\{/.test(routes), "az évfolyam nem állhat a ChatGPT-prompt statikus közepén");
  assert.ok(!routes.includes("lessonHtmlSpecPrompt("), "a régi útvonalak a statikus spec-részt használják");
  const runner = readFileSync(new URL("../server/studio/web-research-runner.ts", import.meta.url), "utf8");
  assert.ok(runner.includes("system: cachedSystem(") && /messages,\s*\n?\s*cache_control: \{ type: "ephemeral" \}/.test(runner));
  const quiz = readFileSync(new URL("../server/gameQuizGeneratorService.ts", import.meta.url), "utf8");
  assert.ok(quiz.includes("system: cachedSystem("));
  const improve = readFileSync(new URL("../server/improveAsync.ts", import.meta.url), "utf8");
  assert.ok(improve.includes("{ role: 'system', content: themeBlock }") && improve.includes("buildContinuationMessages([systemPrompt, themeBlock]"));
  const provider = readFileSync(new URL("../server/ai/ClaudeProvider.ts", import.meta.url), "utf8");
  assert.ok(provider.includes("claudeSystemFromMessages(") && provider.includes("cacheConversation("));
});
