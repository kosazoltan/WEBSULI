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
