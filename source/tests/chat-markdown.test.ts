import assert from "node:assert/strict";
import test from "node:test";

import { parseChatInline, parseChatMarkdown } from "../client/src/lib/chat-markdown";

test("félkövér: a **…** pár strong lesz, a páratlan jelölő szöveg marad", () => {
  assert.deepEqual(parseChatInline("**Új teljes letöltés:** kész"), [
    { text: "Új teljes letöltés:", bold: true },
    { text: " kész", bold: false },
  ]);
  assert.deepEqual(parseChatInline("2 ** 3 hatvány"), [{ text: "2 ** 3 hatvány", bold: false }]);
  assert.deepEqual(parseChatInline(""), []);
});

test("blokkok: bekezdés, lista, címsor; üres sor tagol", () => {
  const blocks = parseChatMarkdown("Letöltés folyamatban...\n\n## Források\n- **Szabó János:** óravázlat\n- második\n\nZárás\nmásodik sor");
  assert.deepEqual(blocks, [
    { kind: "paragraph", inlines: [{ text: "Letöltés folyamatban...", bold: false }] },
    { kind: "heading", inlines: [{ text: "Források", bold: false }] },
    { kind: "list", items: [[{ text: "Szabó János:", bold: true }, { text: " óravázlat", bold: false }], [{ text: "második", bold: false }]] },
    { kind: "paragraph", inlines: [{ text: "Zárás\nmásodik sor", bold: false }] },
  ]);
  assert.deepEqual(parseChatMarkdown(""), []);
});

test("review #390: a szóközös ** műveleti jel szöveg marad, a félkövér csak határolóval", () => {
  assert.deepEqual(parseChatInline("2 ** 3 ** 4"), [{ text: "2 ** 3 ** 4", bold: false }]);
  assert.deepEqual(parseChatInline("a **b** és 2 ** 3"), [
    { text: "a ", bold: false },
    { text: "b", bold: true },
    { text: " és 2 ** 3", bold: false },
  ]);
});

test("review #390: nagyon hosszú, listás válaszból csak a vége renderelődik (korlátos DOM)", () => {
  const long = Array.from({ length: 20000 }, (_, i) => `- tétel ${i}`).join("\n");
  const blocks = parseChatMarkdown(long);
  const items = blocks.flatMap((block) => (block.kind === "list" ? block.items : []));
  assert.ok(items.length > 0 && items.length < 1000, `elemek: ${items.length}`);
  assert.deepEqual(items.at(-1), [{ text: "tétel 19999", bold: false }]);
  assert.equal(blocks[0].kind, "paragraph");
});
