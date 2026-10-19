import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { anthropicClient, MAX_BLOCK_CACHE_MARKERS, type Turn } from "../server/studio/single-run/conversation";
import { bankRequestBlocks } from "../server/studio/single-run/engine";
import { bankStaticPrefix } from "../server/studio/experience-builder";

/* Spec 2026-10-19-eroforras-s3a — mért: a bank bemenetének 12 %-a, a lektorénak ~2 %-a jött gyorsítótárból. */

function capture() {
  let params: Record<string, unknown> | undefined;
  const client = anthropicClient({ client: { messages: { stream: (p) => { params = p as unknown as Record<string, unknown>; return { finalMessage: async () => ({
    content: [{ type: "text", text: "{}" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }) as never }; } } } });
  return { client, params: () => params };
}
type Sent = { content: Array<{ type: string; text?: string; cache_control?: unknown }> };

test("a `cache` szövegblokk 1 órás töréspontot kap, a többi nem", async () => {
  const { client, params } = capture();
  await client.complete("R", [{ role: "user", blocks: [{ type: "text", text: "állandó", cache: true }, { type: "text", text: "változó" }] }]);
  const content = (params()?.messages as Sent[])[0].content;
  assert.deepEqual(content[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.equal(content[1].cache_control, undefined);
});

test("kérésenként legfeljebb MAX_BLOCK_CACHE_MARKERS (2) blokk-jelölő — a legutolsók", async () => {
  assert.equal(MAX_BLOCK_CACHE_MARKERS, 2);
  const { client, params } = capture();
  const turns: Turn[] = [
    { role: "user", blocks: [{ type: "text", text: "a", cache: true }, { type: "text", text: "b", cache: true }] },
    { role: "assistant", blocks: [{ type: "text", text: "ok" }] },
    { role: "user", blocks: [{ type: "text", text: "c", cache: true }] },
  ];
  await client.complete("R", turns);
  const marks = (params()?.messages as Sent[]).flatMap((m) => m.content).map((c) => (c.cache_control ? c.text : null)).filter(Boolean);
  assert.deepEqual(marks, ["b", "c"]);
});

test("bankkérés: [állandó előtag, …, töréspont] után jön a csomagonkénti rész; ismeretlen rendszerszövegnél a régi alak", () => {
  const prefix = bankStaticPrefix();
  const blocks = bankRequestBlocks(`${prefix}\nCSOMAG-SZERZŐDÉS sectionIndex=2`, "TANÍTÁS");
  assert.equal(blocks[0].type === "text" && blocks[0].text, prefix);
  const cacheAt = blocks.findIndex((b) => b.type === "text" && b.cache);
  assert.ok(cacheAt >= 0 && cacheAt < blocks.length - 1, "a töréspont az állandó rész végén, a változó rész előtt");
  const last = blocks[blocks.length - 1];
  assert.ok(last.type === "text" && last.text.startsWith("5. ÁLLOMÁS — GYAKORLÓBANK") && last.text.includes("CSOMAG-SZERZŐDÉS sectionIndex=2") && last.text.endsWith("TANÍTÁS"));
  assert.ok(!(last.type === "text" && last.text.includes(prefix)), "az állandó rész nem ismétlődik");
  const legacy = bankRequestBlocks("MÁS RENDSZERSZÖVEG", "U");
  assert.ok(legacy.every((b) => !(b.type === "text" && b.cache)));
  assert.ok(legacy[0].type === "text" && legacy[0].text.includes("MÁS RENDSZERSZÖVEG"));
});

test("a bank rendszerszövege az állandó előtaggal kezdődik; a lektor forrásátirata töréspontot kap", () => {
  const builder = fs.readFileSync("server/studio/experience-builder.ts", "utf8");
  assert.match(builder, /const system = `\$\{bankStaticPrefix\(\)\}\\n\$\{contract\}/);
  const engine = fs.readFileSync("server/studio/single-run/engine.ts", "utf8");
  assert.match(engine, /A FORRÁS ÁTIRATA \(adat, a mérce\):\\n\$\{sourceText\}`, cache: true/);
  assert.match(engine, /const blocks = bankRequestBlocks\(system, user\);/);
});
