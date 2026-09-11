import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { normalizeDocumentSources } from "../server/studio/document-source";
import { sourceTextOf, computeInputHash } from "../server/studio/extractor";
import { inferScope, scopeContentParts } from "../server/studio/one-step";

function pdf(text: string) {
  const stream = `BT /F1 14 Tf 50 750 Td (${text}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let raw = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(raw.length); raw += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = raw.length;
  raw += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(raw).toString("base64")}`;
}

test("real DOCX preserves Hungarian source text across scope, extraction and content hashing", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Árvíztűrő tükörfúrógép. A magasság merőleges.</w:t></w:r></w:p></w:body></w:document>');
  const file = { name: "forras.docx", kind: "docx" as const, content: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${await zip.generateAsync({ type: "base64" })}` };
  assert.equal(sourceTextOf([file]), "");
  const normalized = await normalizeDocumentSources([file]);
  assert.match(sourceTextOf(normalized), /Árvíztűrő tükörfúrógép/);
  assert.deepEqual(await scopeContentParts(normalized), [{ type: "text", text: normalized[0].extractedText }]);
  assert.equal(computeInputHash([file], { subject: "x", classroom: 7 }), computeInputHash(normalized, { subject: "x", classroom: 7 }));
});

test("real PDF text is searchable; scanned/empty page cannot silently disappear", async () => {
  const original = { name: "source.pdf", kind: "pdf" as const, content: pdf("Triangle area = base x height / 2") };
  const normalized = await normalizeDocumentSources([original]);
  assert.match(sourceTextOf(normalized), /Triangle area = base x height \/ 2/);
  assert.equal((await scopeContentParts(normalized))[0].type, "text");
  const scan = { ...original, content: pdf("") };
  await assert.rejects(normalizeDocumentSources([scan]), /átírás szükséges/);
  const ocr = await normalizeDocumentSources([scan], async () => "[1. oldal] Terület = alap × magasság / 2");
  assert.match(sourceTextOf(ocr), /Terület/);
});

test("classification preserves reasoning, uncertainty and mixed level evidence", async () => {
  const classification = { reason: "Az alapképletek dominálnak; a körgyűrű kiegészítő példa.", confidence: "medium", gradeRange: [7, 8], mixedContent: true };
  const result = await inferScope([], async () => JSON.stringify({ classroom: 7, subject: "Matematika", classification }));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.classification, classification);
});
