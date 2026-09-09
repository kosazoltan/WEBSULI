import assert from "node:assert/strict";
import test from "node:test";

import {
  extractGeneratedHtml,
  HTML_START,
  webResearchChatSchema,
  webResearchSystemPrompt,
  WEB_SEARCH_TOOL,
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
