import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { normalizeDocumentSources } from "../server/studio/document-source";
import { sourceTextOf, computeInputHash } from "../server/studio/extractor";

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
  // S4b (docs/specs/2026-10-16-egy-futas.md): a tantárgy-felismerő hívás bemenete (scopeContentParts) kivezetve a one-step.ts-ből.
  assert.equal(computeInputHash([file], { subject: "x", classroom: 7 }), computeInputHash(normalized, { subject: "x", classroom: 7 }));
});

test("real PDF text is searchable; scanned/empty page cannot silently disappear", async () => {
  const original = { name: "source.pdf", kind: "pdf" as const, content: pdf("Triangle area = base x height / 2") };
  const normalized = await normalizeDocumentSources([original]);
  assert.match(sourceTextOf(normalized), /Triangle area = base x height \/ 2/);
  // S4b (docs/specs/2026-10-16-egy-futas.md): a tantárgy-felismerő hívás bemenete (scopeContentParts) kivezetve a one-step.ts-ből.
  const scan = { ...original, content: pdf("") };
  await assert.rejects(normalizeDocumentSources([scan]), /átírás szükséges/);
  const ocr = await normalizeDocumentSources([scan], async () => "[1. oldal] Terület = alap × magasság / 2");
  assert.match(sourceTextOf(ocr), /Terület/);
});

// S4b (docs/specs/2026-10-16-egy-futas.md): a különálló tantárgy-felismerés (inferScope) kivezetve — a besorolás-indoklás esete törölve.

/* ------------------------------------------------------------------------- *
 * Spec 2026-09-19 — a bájtok döntenek, nem a kiterjesztés; a pdfjs-hiba nem
 * nyers "Invalid PDF structure." (one_step_runs a1707ade), hanem OCR-átirat vagy
 * érthető magyar hiba.
 * ------------------------------------------------------------------------- */

import { sniffImageMime } from "../server/studio/document-source";

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);

test("sniffImageMime felismeri a JPEG/PNG/WebP/GIF fejlécet, a PDF-et nem", () => {
  assert.equal(sniffImageMime(JPEG_BYTES), "image/jpeg");
  assert.equal(sniffImageMime(PNG_BYTES), "image/png");
  assert.equal(sniffImageMime(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(4)])), "image/webp");
  assert.equal(sniffImageMime(Buffer.from("GIF89a!")), "image/gif");
  assert.equal(sniffImageMime(Buffer.from("%PDF-1.4\n")), null);
});

test("fotó .pdf névvel → kép-útvonal, helyes MIME data-URL, a pdfjs nem is fut", async () => {
  const file = { name: "fuzet.pdf", kind: "pdf" as const, content: `data:application/pdf;base64,${JPEG_BYTES.toString("base64")}` };
  const [out] = await normalizeDocumentSources([file], async () => { throw new Error("transcribePdf must not run for an image"); });
  assert.equal(out.kind, "image");
  assert.equal(out.name, "fuzet.pdf");
  assert.equal(out.content, `data:image/jpeg;base64,${JPEG_BYTES.toString("base64")}`);
  assert.equal(out.extractedText, undefined, "a képet a közös OCR-lépés írja át");
});

test("sérült PDF + vision átíró → az átirat lesz a forrás szövege", async () => {
  const broken = { name: "serult.pdf", kind: "pdf" as const, content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4\nthis is not a pdf body").toString("base64")}` };
  const [out] = await normalizeDocumentSources([broken], async (f) => { assert.equal(f.name, "serult.pdf"); return "1. oldal\nA háromszög területe az alap és a magasság szorzatának fele."; });
  assert.match(out.extractedText ?? "", /háromszög területe/);
});

test("sérült PDF átíró nélkül vagy üres átirattal → magyar hiba a pdfjs okával", async () => {
  const broken = { name: "serult.pdf", kind: "pdf" as const, content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4\nthis is not a pdf body").toString("base64")}` };
  await assert.rejects(normalizeDocumentSources([broken]), /A PDF nem olvasható \(sérült vagy titkosított\)/);
  await assert.rejects(normalizeDocumentSources([broken], async () => "   "), /A PDF nem olvasható/);
});

/* ------------------------------------------------------------------------- *
 * Spec 2026-11-02-mht-forras — MHT/MHTML webarchívum: a gyökér-HTML szövege,
 * helyes karakterkészlettel; a követőkód-rész nem kerül be; olvashatatlannál hiba.
 * ------------------------------------------------------------------------- */

import { readMhtText } from "../server/studio/document-source";

const mhtUrl = (raw: Buffer | string) => `data:multipart/related;base64,${(typeof raw === "string" ? Buffer.from(raw, "latin1") : raw).toString("base64")}`;

test("MHT: quoted-printable utf-8 gyökér-HTML, soft line break", async () => {
  const raw = [
    "MIME-Version: 1.0",
    'Content-Type: multipart/related; type="text/html"; boundary="B1"',
    "",
    "--B1",
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "<html><body><h1>Antigon=C3=A9</h1><p>=C3=81rv=C3=ADzt=C5=B1r=C5=91 t=C3=BCk=",
    "örfúrógép</p></body></html>".replace(/[^\x00-\x7f]/g, (c) => [...Buffer.from(c, "utf8")].map((b) => `=${b.toString(16).toUpperCase()}`).join("")),
    "--B1--",
  ].join("\r\n");
  const text = await readMhtText(mhtUrl(raw));
  assert.match(text, /Antigoné/);
  assert.match(text, /Árvíztűrő tükörfúrógép/);
});

test("MHT: base64 + windows-1250 rész-fejléc karakterkészlet", async () => {
  const cp1250: Record<string, number> = { "ó": 0xf3, "ü": 0xfc, "é": 0xe9, "ő": 0xf5 };
  const html = Buffer.from([..."<p>Kreón: tilos eltemetni Polüneikészt őr</p>"].map((c) => cp1250[c] ?? c.charCodeAt(0)));
  const raw = `Content-Type: multipart/related; boundary=XYZ\r\n\r\n--XYZ\r\nContent-Type: text/html; charset=windows-1250\r\nContent-Transfer-Encoding: base64\r\n\r\n${html.toString("base64").replace(/(.{20})/g, "$1\r\n")}\r\n--XYZ--\r\n`;
  const text = await readMhtText(mhtUrl(raw));
  assert.match(text, /Kreón: tilos eltemetni Polüneikészt őr/);
});

test("MHT: binary rész, a karakterkészlet a <meta>-ban; a követőkód-rész kimarad (Blink-mentés)", async () => {
  const root = Buffer.concat([Buffer.from('<html><head><meta http-equiv="Content-Type" content="text/html; charset=ISO-8859-2"><title>Szophokl'), Buffer.from([0xe9]), Buffer.from("sz</title></head><body><h3>Ford"), Buffer.from([0xed]), Buffer.from("totta: Trencs"), Buffer.from([0xe9]), Buffer.from("nyi-Waldapfel Imre</h3><p>SZEM"), Buffer.from([0xc9]), Buffer.from("LYEK</p><p>H"), Buffer.from([0xcd]), Buffer.from("RN"), Buffer.from([0xd6]), Buffer.from("K, EUR"), Buffer.from([0xdc]), Buffer.from("DIK"), Buffer.from([0xc9]), Buffer.from("</p></body></html>")]);
  const raw = Buffer.concat([
    Buffer.from('From: <Saved by Blink>\r\nSnapshot-Content-Location: https://vmek.oszk.hu/00500/00500/00500.htm\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n\ttype="text/html";\r\n\tboundary="----MultipartBoundary--abc----"\r\n\r\n\r\n'),
    Buffer.from("------MultipartBoundary--abc----\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: binary\r\nContent-Location: https://vmek.oszk.hu/00500/00500/00500.htm\r\n\r\n"), root,
    Buffer.from("\r\n------MultipartBoundary--abc----\r\nContent-Type: text/css\r\nContent-Transfer-Encoding: binary\r\n\r\nbody{color:red}\r\n"),
    Buffer.from("------MultipartBoundary--abc----\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: binary\r\nContent-Location: https://ls.hit.gemius.pl/lsget.html\r\n\r\n<html><body>gemius tracker</body></html>\r\n------MultipartBoundary--abc------\r\n"),
  ]);
  const text = await readMhtText(mhtUrl(raw));
  assert.match(text, /Fordította: Trencsényi-Waldapfel Imre/);
  assert.match(text, /SZEMÉLYEK/);
  assert.match(text, /HÍRNÖK/);
  assert.match(text, /EURÜDIKÉ/);
  assert.doesNotMatch(text, /�|gemius|color:red/);
});

test("MHT: UTF-8 BOM a fájl elején nem rontja el a fejlécet", async () => {
  const raw = Buffer.from('﻿Content-Type: multipart/related; boundary="b"\r\n\r\n--b\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Antigoné</p>\r\n--b--', "utf8");
  assert.equal(await readMhtText(mhtUrl(raw)), "Antigoné");
});

test("MHT: a start paraméter Content-ID-ja választja a gyökeret", async () => {
  const raw = 'Content-Type: multipart/related; boundary="b"; start="<root@x>"\r\n\r\n--b\r\nContent-Type: text/html\r\nContent-ID: <ad@x>\r\n\r\n<p>reklam</p>\r\n--b\r\nContent-Type: text/html\r\nContent-ID: <root@x>\r\n\r\n<p>Tananyag</p>\r\n--b--';
  assert.equal(await readMhtText(mhtUrl(raw)), "Tananyag");
});

test("MHT: a gyökér beágyazott multipart/alternative — a főoldal szövege jön, nem az iframe-é (review #374)", async () => {
  const alternative = 'Content-Type: multipart/alternative; boundary="alt"\r\nContent-ID: <root@x>\r\n\r\n--alt\r\nContent-Type: text/plain\r\n\r\nsima szöveg\r\n--alt\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Antigoné tananyag</p>\r\n--alt--\r\n';
  const iframe = 'Content-Type: text/html\r\nContent-ID: <frame@x>\r\n\r\n<p>iframe reklám</p>\r\n';
  const withIframe = `Content-Type: multipart/related; boundary="rel"; start="<root@x>"\r\n\r\n--rel\r\n${iframe}--rel\r\n${alternative}--rel--`;
  assert.equal(await readMhtText(mhtUrl(Buffer.from(withIframe, "utf8"))), "Antigoné tananyag");
  const rootOnly = `Content-Type: multipart/related; boundary="rel"\r\n\r\n--rel\r\n${alternative}--rel--`;
  assert.equal(await readMhtText(mhtUrl(Buffer.from(rootOnly, "utf8"))), "Antigoné tananyag");
});

test("MHT: normalizálás után kereshető; html rész nélkül érthető hiba", async () => {
  const raw = 'Content-Type: multipart/related; boundary="b"\r\n\r\n--b\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>A sejt az élőlények alapegysége.</p>\r\n--b--';
  const file = { name: "lap.mht", kind: "mht" as const, content: mhtUrl(Buffer.from(raw, "utf8")) };
  assert.equal(sourceTextOf([file]), "");
  assert.match(sourceTextOf(await normalizeDocumentSources([file])), /A sejt az élőlények alapegysége\./);
  const imageOnly = { ...file, content: mhtUrl('Content-Type: multipart/related; boundary="b"\r\n\r\n--b\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: base64\r\n\r\niVBORw0KGgo=\r\n--b--') };
  await assert.rejects(normalizeDocumentSources([imageOnly]), /nincs olvasható weboldal/);
});
