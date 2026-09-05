import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExtractPayload,
  fileKindOf,
  sourceFileFromRead,
  extractSubmitDisabledReason,
} from "../shared/studio-ui";

/**
 * LS-2a-fix (board #157) — the source-upload view-model.
 *
 * The trap this closes: the map list's empty state said "upload a source" but
 * no upload UI existed. These helpers are what the new form renders and
 * submits; the payload MUST match the server's extractRequestSchema
 * (name/kind/content + scope) or the endpoint 400s.
 */

test("fileKindOf: kiterjesztés szerint sorol be, ismeretlen = null", () => {
  assert.equal(fileKindOf("anyag.pdf"), "pdf");
  assert.equal(fileKindOf("kep.PNG"), "image");
  assert.equal(fileKindOf("kep.jpeg"), "image");
  assert.equal(fileKindOf("jegyzet.docx"), "docx");
  assert.equal(fileKindOf("szoveg.txt"), "text");
  assert.equal(fileKindOf("video.mp4"), null, "nem támogatott fajta nem megy át csendben");
});

test("sourceFileFromRead: szöveg marad, bináris data-URL marad", () => {
  const t = sourceFileFromRead("jegyzet.txt", "A sejt az élőlények alapegysége.");
  assert.deepEqual(t, { name: "jegyzet.txt", kind: "text", content: "A sejt az élőlények alapegysége." });
  const img = sourceFileFromRead("abra.png", "data:image/png;base64,AAAA");
  assert.equal(img?.kind, "image");
  assert.match(img?.content ?? "", /^data:image\/png/);
});

test("sourceFileFromRead: ismeretlen kiterjesztésre null", () => {
  assert.equal(sourceFileFromRead("zene.mp3", "data:audio/mp3;base64,AAAA"), null);
});

test("buildExtractPayload: a szerver extractRequestSchema alakját adja", () => {
  const payload = buildExtractPayload({
    title: "A sejt",
    subject: "biológia",
    classroom: 7,
    files: [{ name: "a.txt", kind: "text", content: "forrás" }],
  });
  assert.deepEqual(payload, {
    title: "A sejt",
    scope: { subject: "biológia", classroom: 7 },
    files: [{ name: "a.txt", kind: "text", content: "forrás" }],
  });
});

test("buildExtractPayload: üres cím kimarad (a séma optional-ja)", () => {
  const payload = buildExtractPayload({
    title: "  ",
    subject: "matek",
    classroom: 4,
    files: [{ name: "a.txt", kind: "text", content: "x" }],
  });
  assert.equal("title" in payload, false);
});

test("extractSubmitDisabledReason: hiányos űrlapra magyar indok, teljesre null", () => {
  assert.match(extractSubmitDisabledReason("", 4, 1) ?? "", /tantárgy/i);
  assert.match(extractSubmitDisabledReason("matek", 4, 0) ?? "", /forrás/i);
  assert.equal(extractSubmitDisabledReason("matek", 4, 1), null);
});
