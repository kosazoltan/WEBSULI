import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { readWebDocument, sniffWebFormat, WEB_DOCUMENT_LIMITS } from "../server/studio/web-document";
import { sourceIsErrorPage } from "../server/studio/web-teaching-review";

/** W1a (docs/specs/2026-11-25-w1-forrasformatumok.md): webes forrás minden formátumban — A1–A3, A6. */

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1), Buffer.from([0xff, 0xd9])]);
const URL_ = "https://www.example.hu/anyag";

/** Kézzel épített, érvényes PDF (opcionális szövegréteggel) — az xref eltolások számolva. */
function pdf(pages: Array<string | null>): Buffer {
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  const fontId = 3 + pages.length * 2;
  pages.forEach((text, i) => {
    const stream = text === null ? "" : `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
async function docx(paragraphs: string[], media: Record<string, Buffer> = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", `<w:document xmlns:w="${W}"><w:body>${paragraphs.map(p => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  for (const [name, bytes] of Object.entries(media)) zip.file(`word/media/${name}`, bytes);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
async function pptx(slides: string[][], notes: Record<number, string> = {}, media: Record<string, Buffer> = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("ppt/presentation.xml", "<p:presentation xmlns:p=\"x\"/>");
  slides.forEach((texts, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, `<p:sld xmlns:p="p" xmlns:a="${A}"><p:cSld><p:spTree>${texts.map(t => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`).join("")}</p:spTree></p:cSld></p:sld>`));
  for (const [n, t] of Object.entries(notes)) {
    zip.file(`ppt/notesSlides/notesSlide${n}.xml`, `<p:notes xmlns:p="p" xmlns:a="${A}"><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:notes>`);
    zip.file(`ppt/slides/_rels/slide${n}.xml.rels`, `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/></Relationships>`);
  }
  for (const [name, bytes] of Object.entries(media)) zip.file(`ppt/media/${name}`, bytes);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
async function odf(mime: string, paragraphs: string[], pictures: Record<string, Buffer> = {}): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", mime);
  zip.file("content.xml", `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body>${paragraphs.map(p => `<text:p>${p}</text:p>`).join("")}</office:body></office:document-content>`);
  for (const [name, bytes] of Object.entries(pictures)) zip.file(`Pictures/${name}`, bytes);
  return zip.generateAsync({ type: "nodebuffer" });
}
const rec = (type: number, payload: Buffer) => { const h = Buffer.alloc(8); h.writeUInt16LE(0, 0); h.writeUInt16LE(type, 2); h.writeUInt32LE(payload.length, 4); return Buffer.concat([h, payload]); };
/**
 * Régi bináris PPT valódi CFB-tárolóban (review #592): 512 bájtos szektorok, a „PowerPoint Document” adatfolyam (≥ 4096 bájt, FAT-on)
 * NEM szomszédos szektorláncon — az első szövegrekord a szektorhatáron ível át, így a fájl nyers pásztázása nem olvashatja ki.
 */
function ppt(chars: string[], bytes: string[]): Buffer {
  const ENDC = 0xfffffffe, FREE = 0xffffffff;
  const records = Buffer.concat([...chars.map(c => rec(0x0fa0, Buffer.from(c, "utf16le"))), ...bytes.map(b => rec(0x0fa8, Buffer.from(b, "latin1")))]);
  const stream = Buffer.concat([Buffer.alloc(500), records]);
  const padded = Buffer.concat([stream, Buffer.alloc(Math.max(4608, Math.ceil(stream.length / 512) * 512) - stream.length)]);
  const nStream = padded.length / 512;
  const order = Array.from({ length: nStream }, (_, i) => 2 + ((i * 2) % nStream) + (i * 2 >= nStream ? 1 - (nStream % 2) : 0));
  const unique = [...new Set(order)].length === nStream ? order : Array.from({ length: nStream }, (_, i) => 2 + nStream - 1 - i);
  const total = 2 + nStream;
  const fat = new Array(128).fill(FREE);
  fat[0] = 0xfffffffd; fat[1] = ENDC;
  unique.forEach((s, i) => { fat[s] = i + 1 < unique.length ? unique[i + 1] : ENDC; });
  const header = Buffer.alloc(512);
  Buffer.from("d0cf11e0a1b11ae1", "hex").copy(header, 0);
  header.writeUInt16LE(0x3e, 24); header.writeUInt16LE(3, 26); header.writeUInt16LE(0xfffe, 28); header.writeUInt16LE(9, 30); header.writeUInt16LE(6, 32);
  header.writeUInt32LE(1, 44); header.writeUInt32LE(1, 48); header.writeUInt32LE(4096, 56); header.writeUInt32LE(ENDC, 60); header.writeUInt32LE(ENDC, 68);
  for (let i = 0; i < 109; i++) header.writeUInt32LE(i === 0 ? 0 : FREE, 76 + i * 4);
  const fatSec = Buffer.alloc(512); fat.forEach((v, i) => fatSec.writeUInt32LE(v >>> 0, i * 4));
  const dirSec = Buffer.alloc(512);
  const dirEntry = (off: number, name: string, type: number, child: number, start: number, size: number) => {
    dirSec.write(name, off, "utf16le"); dirSec.writeUInt16LE((name.length + 1) * 2, off + 64); dirSec[off + 66] = type; dirSec[off + 67] = 1;
    dirSec.writeUInt32LE(FREE, off + 68); dirSec.writeUInt32LE(FREE, off + 72); dirSec.writeUInt32LE(child, off + 76); dirSec.writeUInt32LE(start, off + 116); dirSec.writeUInt32LE(size, off + 120);
  };
  dirEntry(0, "Root Entry", 5, 1, ENDC, 0);
  dirEntry(128, "PowerPoint Document", 2, FREE, unique[0], padded.length);
  const sectors: Buffer[] = new Array(total).fill(Buffer.alloc(512));
  sectors[0] = fatSec; sectors[1] = dirSec;
  unique.forEach((s, i) => { sectors[s] = padded.subarray(i * 512, (i + 1) * 512); });
  return Buffer.concat([header, ...sectors]);
}
const mht = (html: string, img?: Buffer) => Buffer.from([
  "MIME-Version: 1.0", 'Content-Type: multipart/related; boundary="B"; type="text/html"', "", "--B", "Content-Type: text/html; charset=utf-8", "Content-Location: https://www.example.hu/a", "",
  html, ...(img ? ["--B", "Content-Type: image/png", "Content-Transfer-Encoding: base64", "Content-Location: https://www.example.hu/k.png", "", img.toString("base64")] : []), "--B--", "",
].join("\r\n"), "utf8");

test("A1: formátum a bájtokból — a fejléc / kiterjesztés nem dönt", async () => {
  assert.equal(await sniffWebFormat(pdf(["x"]), "text/html"), "pdf");
  assert.equal(await sniffWebFormat(await docx(["a"]), "application/octet-stream"), "docx");
  assert.equal(await sniffWebFormat(await pptx([["a"]]), ""), "pptx");
  assert.equal(await sniffWebFormat(await odf("application/vnd.oasis.opendocument.presentation", ["a"]), ""), "odp");
  assert.equal(await sniffWebFormat(await odf("application/vnd.oasis.opendocument.text", ["a"]), ""), "odt");
  assert.equal(await sniffWebFormat(ppt(["a"], []), "application/vnd.ms-powerpoint"), "ppt");
  assert.equal(await sniffWebFormat(mht("<p>a</p>"), "message/rfc822"), "mht");
  assert.equal(await sniffWebFormat(PNG, "application/pdf"), "image");
  assert.equal(await sniffWebFormat(Buffer.from("<html><p>x</p></html>"), "text/html"), "html");
  assert.equal(await sniffWebFormat(Buffer.from("sima szöveg"), "text/plain"), "text");
  assert.equal(await sniffWebFormat(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]), "application/octet-stream"), null);
  // Review #592: a fejléc nem teheti szöveggé a binárist, és nem zárhatja ki a valódi szöveget.
  assert.equal(await sniffWebFormat(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]), "text/plain"), null);
  assert.equal(await sniffWebFormat(Buffer.from("Valódi UTF-8 szöveg: törtek és számlálók.", "utf8"), "application/octet-stream"), "text");
});

test("A1: PDF szövegréteg oldalszámmal; DOCX; PPTX diánként jegyzettel; ODP / ODT; régi PPT szövegrekordok; MHT", async () => {
  const p = await readWebDocument(pdf(["Az elso oldal szovege", "A masodik oldal"]), "application/pdf", URL_);
  assert.equal(p.format, "pdf");
  assert.match(p.text, /\[1\. oldal\][\s\S]*Az elso oldal szovege[\s\S]*\[2\. oldal\][\s\S]*A masodik oldal/);
  assert.equal(p.needsOcr, false);
  const d = await readWebDocument(await docx(["A tört számlálója", "A nevező"]), "application/octet-stream", URL_);
  assert.equal(d.text, "A tört számlálója\nA nevező");
  const s = await readWebDocument(await pptx([["Első dia címe", "Pont"], ["Második dia"]], { 1: "Előadói jegyzet" }), "", URL_);
  assert.match(s.text, /\[1\. dia\]\nElső dia címe\nPont\nJegyzet: Előadói jegyzet[\s\S]*\[2\. dia\]\nMásodik dia/);
  const o = await readWebDocument(await odf("application/vnd.oasis.opendocument.presentation", ["Bemutató szöveg"]), "", URL_);
  assert.equal(o.text, "Bemutató szöveg");
  const t = await readWebDocument(await odf("application/vnd.oasis.opendocument.text", ["Szöveges dokumentum"]), "", URL_);
  assert.equal(t.text, "Szöveges dokumentum");
  const old = await readWebDocument(ppt(["Régi dia: törtek, szektorhatáron átívelő szöveg"], ["Second line"]), "application/vnd.ms-powerpoint", URL_);
  assert.match(old.text, /Régi dia: törtek, szektorhatáron átívelő szöveg[\s\S]*Second line/);
  const m = await readWebDocument(mht("<html><head><title>Archív</title></head><body><p>Mentett oldal szövege</p></body></html>"), "message/rfc822", URL_);
  assert.match(m.text, /Mentett oldal szövege/);
});

test("A2: beágyazott képek forrás-URL-lel; csak valódi kép; legfeljebb 8, egyenként ≤ 2 MB", async () => {
  const d = await readWebDocument(await docx(["Szöveg"], { "image1.png": PNG, "image2.jpeg": JPEG, "hamis.png": Buffer.from("nem kép") }), "", URL_);
  assert.deepEqual(d.images.map(i => i.mime).sort(), ["image/jpeg", "image/png"]);
  assert.ok(d.images.every(i => i.sourceUrl === URL_ && i.dataUrl.startsWith(`data:${i.mime};base64,`)));
  const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}.png`, PNG]));
  const big = Buffer.concat([PNG, Buffer.alloc(WEB_DOCUMENT_LIMITS.maxImageBytes + 1)]);
  const s = await readWebDocument(await pptx([["Dia"]], {}, { ...many, "nagy.png": big }), "", URL_);
  assert.equal(s.images.length, WEB_DOCUMENT_LIMITS.maxImages);
  assert.ok(s.images.every(i => i.bytes <= WEB_DOCUMENT_LIMITS.maxImageBytes));
  const o = await readWebDocument(await odf("application/vnd.oasis.opendocument.presentation", ["x"], { "a.png": PNG }), "", URL_);
  assert.equal(o.images.length, 1);
  const m = await readWebDocument(mht("<p>Szöveg</p>", PNG), "multipart/related", URL_);
  assert.equal(m.images.length, 1);
  assert.equal(m.images[0].sourceUrl, "https://www.example.hu/k.png");
});

test("A1 + A3: önálló kép → üres szöveg + a kép; szkennelt PDF → needsOcr, nem hiba; ismeretlen bináris → érthető hiba", async () => {
  const img = await readWebDocument(JPEG, "image/jpeg", URL_);
  assert.equal(img.format, "image");
  assert.equal(img.text, "");
  assert.equal(img.images.length, 1);
  const scan = await readWebDocument(pdf([null, null]), "application/pdf", URL_);
  assert.equal(scan.needsOcr, true);
  assert.equal(scan.text, "");
  await assert.rejects(readWebDocument(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]), "application/octet-stream", URL_), /Nem támogatott formátum/);
});

test("biztonság: tömörítési bomba (túl nagy kibontott bejegyzés) → hiba, nem bontja ki", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("word/document.xml", "a".repeat(WEB_DOCUMENT_LIMITS.maxEntryBytes + 1));
  const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  assert.ok(bomb.length < 1_000_000, "a tömörített bomba kicsi");
  await assert.rejects(readWebDocument(bomb, "", URL_), /túl nagy/i);
});

test("A6: „Korlátozva” / „Hozzáférés megtagadva” / „Access restricted” oldal hibaoldal; rendes oldal nem", () => {
  for (const title of ["Korlátozva", "Hozzáférés megtagadva", "Access restricted", "Restricted"]) assert.equal(sourceIsErrorPage({ url: URL_, title, text: "x".repeat(200) }), true, title);
  assert.equal(sourceIsErrorPage({ url: URL_, title: "Lecke", text: "Ez az oldal korlátozva érhető el a regisztrált felhasználók számára." }), true);
  assert.equal(sourceIsErrorPage({ url: URL_, title: "A korlátozott növekedés modellje", text: "A logisztikus modell a korlátozott növekedést írja le." }), false);
});

test("review #592: PPTX — a diasorrend a presentation.xml listája, a jegyzet a dia kapcsolatából (eltérő számozás)", async () => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types/>");
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/></Relationships>`);
  const slide = (t: string) => `<p:sld xmlns:p="p" xmlns:a="${A}"><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:sld>`;
  zip.file("ppt/slides/slide1.xml", slide("Második a sorrendben"));
  zip.file("ppt/slides/slide3.xml", slide("Első a sorrendben"));
  zip.file("ppt/slides/_rels/slide1.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide4.xml"/></Relationships>`);
  zip.file("ppt/notesSlides/notesSlide4.xml", `<p:notes xmlns:p="p" xmlns:a="${A}"><a:p><a:r><a:t>A második dia jegyzete</a:t></a:r></a:p></p:notes>`);
  zip.file("ppt/notesSlides/notesSlide1.xml", `<p:notes xmlns:p="p" xmlns:a="${A}"><a:p><a:r><a:t>Idegen jegyzet</a:t></a:r></a:p></p:notes>`);
  const doc = await readWebDocument(await zip.generateAsync({ type: "nodebuffer" }), "", URL_);
  assert.equal(doc.text, "[1. dia]\nElső a sorrendben\n\n[2. dia]\nMásodik a sorrendben\nJegyzet: A második dia jegyzete");
});

test("review #592: ODF — text:s (ismétlésszámmal), text:tab, text:line-break megmarad", async () => {
  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.text");
  zip.file("content.xml", `<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><text:p>A<text:s/>B<text:s text:c="2"/>C<text:tab/>D<text:line-break/>E</text:p></office:body></office:document-content>`);
  const doc = await readWebDocument(await zip.generateAsync({ type: "nodebuffer" }), "", URL_);
  assert.equal(doc.text, "A B  C\tD\nE");
});

test("review #592: a ZIP méretkapuja a formátumfelismerés (mimetype-olvasás) ELŐTT fut — ismeretlen altípusnál is", async () => {
  const zip = new JSZip();
  zip.file("mimetype", "x".repeat(WEB_DOCUMENT_LIMITS.maxEntryBytes + 1));
  const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await assert.rejects(sniffWebFormat(bomb, ""), /túl nagy/i);
  await assert.rejects(readWebDocument(bomb, "", URL_), /túl nagy/i);
});

test("review #592: BOM-os UTF-16 szöveg charset nélkül is helyesen dekódolva", async () => {
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Törtek és számlálók UTF-16-ban.", "utf16le")]);
  assert.equal((await readWebDocument(le, "text/plain", URL_)).text, "Törtek és számlálók UTF-16-ban.");
  const be = Buffer.from(Buffer.from("Arány", "utf16le").swap16());
  assert.equal((await readWebDocument(Buffer.concat([Buffer.from([0xfe, 0xff]), be]), "", URL_)).text, "Arány");
});

test("review #592: ismétlődő FAT-szektorhivatkozású PPT → sérült fájl hiba (nem fűzi újra a szektort)", async () => {
  const bad = ppt(["Szöveg"], []);
  for (let i = 1; i < 109; i++) bad.writeUInt32LE(0, 76 + i * 4);
  await assert.rejects(readWebDocument(bad, "", URL_), /sérült/);
});
