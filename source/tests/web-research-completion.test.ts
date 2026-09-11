import assert from "node:assert/strict";
import test from "node:test";
import { decideWebResearchResult } from "../server/studio/web-research-agent";
import { consumeWebResearchStream } from "../shared/web-research-stream";

const summary = "Röviden: találtam NAT 2020-hoz illő forrásokat. Készül a tananyag:";
const doc = `<!DOCTYPE html><html lang="hu"><body>${"tanítás ".repeat(20)}</body></html>`;
const verify = () => ({ ok: true, problems: [] });
test("a keresési összefoglaló end_turn után tényleges készítést kér", () => {
  const result = decideWebResearchResult({ stopReason: "end_turn", fullContent: summary, repairAttempts: 0 }, verify);
  assert.equal(result.type, "retry");
  if (result.type === "retry") assert.match(result.instruction, /HTML_START/);
});
test("ismételt üres eredmény látható végleges hiba, nem complete", () => {
  assert.equal(decideWebResearchResult({ stopReason: "end_turn", fullContent: summary, repairAttempts: 2 }, verify).type, "error");
});
test("csonkolás, elutasítás és kimerült keresés érvényesnek látszó HTML-lel sem siker", () => {
  for (const stopReason of ["max_tokens", "model_context_window_exceeded", "refusal", "pause_turn", "tool_use", null]) {
    assert.equal(decideWebResearchResult({ stopReason, fullContent: doc, repairAttempts: 0 }, verify).type, "error", String(stopReason));
  }
});
test("jelölő nélküli teljes HTML is kapuellenőrzésre kerül, nem vész el", () => {
  let checked = "";
  const result = decideWebResearchResult({ stopReason: "end_turn", fullContent: `Kész.\n${doc}`, repairAttempts: 0 }, html => { checked = html; return verify(); });
  assert.equal(result.type, "ready"); assert.equal(checked, doc);
});
test("hibás HTML javítása a konkrét kapuüzenetet tartalmazza; a kapu nem kerülhető meg", () => {
  const result = decideWebResearchResult({ stopReason: "end_turn", fullContent: doc, repairAttempts: 0 }, () => ({ ok: false, problems: ["q4: hiányzó alkalmazó kérdés"] }));
  assert.equal(result.type, "retry");
  if (result.type === "retry") assert.match(result.instruction, /q4: hiányzó alkalmazó kérdés/);
  assert.equal(decideWebResearchResult({ stopReason: "end_turn", fullContent: doc, repairAttempts: 2 }, () => ({ ok: false, problems: ["hiba"] })).type, "error");
});

function stream(chunks: string[]) {
  const bytes = new TextEncoder().encode(chunks.join(""));
  // Split Hungarian multibyte text and SSE lines across network chunks.
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3));
    controller.close();
  } });
}
const event = (data: unknown) => `data: ${JSON.stringify(data)}\r\n\r\n`;
test("SSE: summary + complete nem helyettesíti a kész dokumentumot", async () => {
  await assert.rejects(consumeWebResearchStream(stream([event({ type: "content_delta", content: summary }), event({ type: "complete" })]), () => {}), /tananyag/);
});
test("SSE: EOF complete nélkül látható hálózati hiba még jelölt HTML után is", async () => {
  await assert.rejects(consumeWebResearchStream(stream([event({ type: "html_generated", html: doc })]), () => {}), /megszakadt/);
});
test("SSE: ékezetes, tördelt adatból csak teljes végállapot ad menthető jelöltet", async () => {
  const got: unknown[] = [];
  const result = await consumeWebResearchStream(stream([": heartbeat\n\n", event({ type: "content_delta", content: "Árvíztűrő tükörfúrógép" }), event({ type: "html_generated", html: doc, sources: [] }), event({ type: "complete" }), "data: [DONE]\n\n"]), e => got.push(e));
  assert.equal(result.html, doc);
  assert.deepEqual(got[0], { type: "content_delta", content: "Árvíztűrő tükörfúrógép" });
});
test("SSE: szolgáltatói hiba és hibás JSON nem tűnik el", async () => {
  await assert.rejects(consumeWebResearchStream(stream([event({ type: "error", message: "Kereső nem elérhető" }), event({ type: "complete" })]), () => {}), /Kereső nem elérhető/);
  await assert.rejects(consumeWebResearchStream(stream(["data: {bad}\n\n"]), () => {}), /hibás/);
});
