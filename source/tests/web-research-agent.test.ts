import assert from "node:assert/strict";
import test from "node:test";

import {
  extractGeneratedHtml,
  HTML_START,
  webResearchChatSchema,
  webResearchSystemPrompt,
  webLessonAuthorPrompt,
  WEB_SEARCH_TOOL,
  WEB_FETCH_TOOL,
  decideWebResearchGatherResult,
  LESSON_HTML_REQUIREMENTS,
} from "../server/studio/web-research-agent";

test("üres üzenet elutasított", () => {
  const r = webResearchChatSchema.safeParse({ message: "  ", classroom: 5 });
  assert.equal(r.success, false);
});

test("5. osztályos utasítás érvényes", () => {
  const r = webResearchChatSchema.safeParse({
    message: "Keress törtes tananyagot",
    classroom: 5,
  });
  assert.equal(r.success, true);
});

test("osztály 13 elutasított", () => {
  const r = webResearchChatSchema.safeParse({ message: "keress", classroom: 13 });
  assert.equal(r.success, false);
});

test("extractGeneratedHtml marker nélkül null", () => {
  assert.equal(extractGeneratedHtml("nincs html"), null);
});

test("extractGeneratedHtml a marker utáni HTML-t adja", () => {
  const body = `${HTML_START}\n<!DOCTYPE html>\n<html lang="hu"><body><p>${"x".repeat(80)}</p></body></html>`;
  const html = extractGeneratedHtml(`Beszéd.\n${body}`);
  assert.ok(html);
  assert.ok(html.includes("<html"));
  assert.ok(!html.includes(HTML_START));
});

test("a system prompt tartalmazza az osztályt", () => {
  assert.match(webResearchSystemPrompt(5), /5\. osztály/);
  assert.match(webResearchSystemPrompt(0), /programozási alapismeretek/i);
});

test("a web_search tool direct hívású és korlátos", () => {
  assert.equal(WEB_SEARCH_TOOL.type, "web_search_20250305");
  assert.equal(WEB_SEARCH_TOOL.name, "web_search");
  assert.equal(WEB_SEARCH_TOOL.max_uses, 8);
  assert.deepEqual([...WEB_SEARCH_TOOL.allowed_callers], ["direct"]);
});

test("a web_fetch tool direct hívású, korlátos és teljes oldalt kér", () => {
  assert.equal(WEB_FETCH_TOOL.type, "web_fetch_20250910");
  assert.equal(WEB_FETCH_TOOL.name, "web_fetch");
  assert.equal(WEB_FETCH_TOOL.max_uses, 8);
  assert.deepEqual([...WEB_FETCH_TOOL.allowed_callers], ["direct"]);
  assert.equal(WEB_FETCH_TOOL.max_content_tokens, 50_000);
});

test("a gyűjtés HTML nélkül, letöltött forrással kész; fetch nélkül újrapróbál", () => {
  const html = `${HTML_START}\n<!DOCTYPE html>\n<html lang="hu"><body><p>${"x".repeat(80)}</p></body></html>`;
  assert.equal(decideWebResearchGatherResult({ stopReason: "end_turn", fullContent: "Letöltöttem a forrást.", repairAttempts: 0, fetchedCount: 1 }).type, "ready");
  assert.equal(decideWebResearchGatherResult({ stopReason: "end_turn", fullContent: html, repairAttempts: 0, fetchedCount: 1 }).type, "ready");
  const empty = decideWebResearchGatherResult({ stopReason: "end_turn", fullContent: "Összefoglaló.", repairAttempts: 0, fetchedCount: 0 });
  assert.equal(empty.type, "retry");
  if (empty.type === "retry") assert.doesNotMatch(empty.instruction, /HTML_START/);
  assert.equal(decideWebResearchGatherResult({ stopReason: "end_turn", fullContent: html, repairAttempts: 0, fetchedCount: 0 }).type, "retry");
  assert.equal(decideWebResearchGatherResult({ stopReason: "end_turn", fullContent: "nincs forrás", repairAttempts: 2, fetchedCount: 0 }).type, "error");
});

test("a szerzői prompt a fúziós szerződést hordozza, a JS-dumpot nem", () => {
  const p = webLessonAuthorPrompt(7, "Törtek — 7. osztály");
  assert.match(p, /HTML-fúzió adatszerződés/);
  assert.match(p, /websuli-lesson-data/);
  assert.match(p, /bankPlan/);
  assert.doesNotMatch(p, /function ee_evaluate/);
  assert.doesNotMatch(p, /KIMENET-TAKARÉKOSSÁG/);
  assert.ok(!p.includes(LESSON_HTML_REQUIREMENTS));
});

// ---- 2. kör (2026-09-09): csonka HTML, cím a promptban, v7.1 blokk, route-őrök ----

import { readFileSync } from "node:fs";
import { htmlLooksComplete } from "../server/studio/web-research-agent";

test("htmlLooksComplete: záró </html> nélkül hamis, vele igaz", () => {
  assert.equal(htmlLooksComplete("<!DOCTYPE html><html><body>x</body>"), false);
  assert.equal(htmlLooksComplete("<!DOCTYPE html><html><body>x</body></html>"), true);
  assert.equal(htmlLooksComplete("<html></HTML >"), true);
});

test("a system prompt a keresési támpontot hordozza, a bankot nem", () => {
  const p = webResearchSystemPrompt(7, "Törtek — 7. osztály");
  assert.match(p, /Törtek — 7\. osztály/);
  assert.doesNotMatch(p, /bankPlan/);
  assert.ok(!p.includes(LESSON_HTML_REQUIREMENTS));
  assert.doesNotMatch(p, /function ee_evaluate/);
  assert.doesNotMatch(p, /KIMENET-TAKARÉKOSSÁG/);
  assert.match(p, /web_fetch/);
  assert.match(p, /TILOS/);
  assert.doesNotMatch(webResearchSystemPrompt(7), /kért címe/);
});

test("a route kezeli a pause_turn-t és a stop_reason-t, nincs abszolút 180 s-os korlát", () => {
  const src = readFileSync(new URL("../server/studio/web-research-runner.ts", import.meta.url), "utf8");
  assert.match(src, /pause_turn/);
  assert.match(src, /stop_reason/);
  // Completion moved to a tested pure decision; the route must call that decision.
  assert.match(src, /decideWebResearchResult\(\{ stopReason, fullContent, repairAttempts, sources \}/);
  const completion = readFileSync(new URL("../server/studio/web-research-agent.ts", import.meta.url), "utf8");
  assert.match(completion, /max_tokens"/);
  assert.match(completion, /htmlLooksComplete\(html\)/);
  assert.match(src, /IDLE_TIMEOUT_MS/);
  assert.doesNotMatch(src, /STREAM_TIMEOUT_MS/);
});

test("extractGeneratedHtml leszedi a markdown kódkerítést a marker után (éles próba 2026-09-09)", () => {
  const doc = `<!DOCTYPE html>
<html lang="hu"><body><p>${"x".repeat(80)}</p></body></html>`;
  const html = extractGeneratedHtml(`Források: ...
${HTML_START}
\`\`\`html
${doc}
\`\`\``);
  assert.ok(html);
  assert.ok(html.startsWith("<!DOCTYPE html>"), html.slice(0, 30));
  assert.ok(html.endsWith("</html>"), html.slice(-30));
  assert.equal(htmlLooksComplete(html), true);
});
