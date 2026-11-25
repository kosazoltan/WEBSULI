import { decodeTransfer, mimeParam, readDocxText, readMhtText, sniffImageMime, splitMimeEntity, type MimePart } from "./document-source";

/**
 * W1a (docs/specs/2026-11-25-w1-forrasformatumok.md): webes forrás MINDEN formátumban. A formátumot a bájtok döntik el (a fejléc és a
 * kiterjesztés csak a szöveg / HTML megkülönböztetésére), a szöveg kinyerve, a beágyazott és önálló képek megőrizve (W1b: D1 hibrid).
 * Biztonság: a ZIP bejegyzésenként és összesen korlátozott (tömörítési bomba), a régi bináris PPT olvasása határon belüli.
 */
export type WebFormat = "pdf" | "docx" | "pptx" | "odp" | "odt" | "ppt" | "mht" | "image" | "html" | "text";
export type WebImage = { mime: string; dataUrl: string; bytes: number; sourceUrl: string; name?: string };
export type WebDocument = { format: WebFormat; title: string; text: string; images: WebImage[]; needsOcr: boolean };

export const WEB_DOCUMENT_LIMITS = { maxImages: 8, maxImageBytes: 2 * 1024 * 1024, maxEntryBytes: 20 * 1024 * 1024, maxTotalBytes: 60 * 1024 * 1024, maxPdfPages: 120 } as const;

const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04];
const CFB_SIG = Buffer.from("d0cf11e0a1b11ae1", "hex");
const startsWith = (b: Buffer, sig: number[] | Buffer) => b.length >= sig.length && Array.from(sig).every((v, i) => b[i] === v);

/** A zip „mimetype” / tartalomjegyzék alapján: DOCX / PPTX / ODP / ODT. Az olvasás csak a központi könyvtárat érinti. */
async function zipKind(bytes: Buffer): Promise<WebFormat | null> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes).catch(() => null);
  if (!zip) return null;
  if (zip.file("word/document.xml")) return "docx";
  if (zip.file("ppt/presentation.xml") || Object.keys(zip.files).some(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))) return "pptx";
  const mime = zip.file("mimetype") ? (await zip.file("mimetype")!.async("string")).trim() : "";
  if (mime === "application/vnd.oasis.opendocument.presentation") return "odp";
  if (mime === "application/vnd.oasis.opendocument.text") return "odt";
  return null;
}

/** A formátum a bájtokból (a ZIP-altípus a tartalomjegyzékből). */
export async function sniffWebFormat(bytes: Buffer, contentType: string): Promise<WebFormat | null> {
  const first = sniffBytes(bytes, contentType);
  return first === "zip" ? zipKind(bytes) : first;
}

function sniffBytes(bytes: Buffer, contentType: string): WebFormat | "zip" | null {
  if (startsWith(bytes, Buffer.from("%PDF-"))) return "pdf";
  if (sniffImageMime(bytes)) return "image";
  if (startsWith(bytes, CFB_SIG)) return "ppt";
  if (startsWith(bytes, ZIP_SIG)) return "zip";
  const head = bytes.subarray(0, 4096).toString("latin1");
  if (/^\s*(MIME-Version:|Content-Type:\s*multipart\/related)/im.test(head) && /multipart\/related/i.test(head)) return "mht";
  if (/^(message\/rfc822|multipart\/related)/i.test(contentType)) return "mht";
  if (/^(text\/html|application\/xhtml\+xml)\b/i.test(contentType) || /^\s*(<!doctype html|<html|<head|<body|<p\b|<div\b)/i.test(head)) return "html";
  if (/^text\/plain\b/i.test(contentType)) return "text";
  // Bináris (vezérlőkarakteres) tartalom nem szöveg.
  const sample = bytes.subarray(0, 512);
  if (sample.length && sample.every(b => b === 9 || b === 10 || b === 13 || b >= 32)) return contentType ? null : "text";
  return null;
}

function imageOf(bytes: Buffer, sourceUrl: string, name?: string): WebImage | null {
  const mime = sniffImageMime(bytes);
  if (!mime || bytes.length > WEB_DOCUMENT_LIMITS.maxImageBytes) return null;
  return { mime, dataUrl: `data:${mime};base64,${bytes.toString("base64")}`, bytes: bytes.length, sourceUrl, ...(name ? { name } : {}) };
}
const capImages = (images: Array<WebImage | null>) => images.filter((i): i is WebImage => !!i).slice(0, WEB_DOCUMENT_LIMITS.maxImages);

type Zip = import("jszip");
/** A kibontott méret a ZIP központi könyvtárából — a bomba kibontás ELŐTT megáll. */
function guardZip(zip: Zip) {
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
    if (size > WEB_DOCUMENT_LIMITS.maxEntryBytes) throw new Error(`A dokumentum egy része túl nagy kibontva (${entry.name}).`);
    total += size;
    if (total > WEB_DOCUMENT_LIMITS.maxTotalBytes) throw new Error("A dokumentum kibontva túl nagy.");
  }
}
const naturalNum = (p: string) => Number(/(\d+)\.xml$/.exec(p)?.[1] ?? 0);

async function xmlTexts(xml: string, ns: string, paragraphTag: string, textTag: string): Promise<string[]> {
  const { DOMParser } = await import("@xmldom/xmldom");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagNameNS(ns, paragraphTag))
    .map(p => Array.from(p.getElementsByTagNameNS(ns, textTag)).map(t => t.textContent ?? "").join("").trim())
    .filter(Boolean);
}
const DRAWING = "http://schemas.openxmlformats.org/drawingml/2006/main";
const ODF_TEXT = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";

async function zipImages(zip: Zip, prefix: RegExp, sourceUrl: string): Promise<WebImage[]> {
  const out: Array<WebImage | null> = [];
  for (const path of Object.keys(zip.files).filter(p => prefix.test(p) && !zip.files[p].dir).sort()) {
    if (out.filter(Boolean).length >= WEB_DOCUMENT_LIMITS.maxImages) break;
    out.push(imageOf(await zip.file(path)!.async("nodebuffer"), sourceUrl, path.split("/").pop()));
  }
  return capImages(out);
}

async function readZipDocument(bytes: Buffer, kind: WebFormat, url: string): Promise<WebDocument> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  guardZip(zip);
  if (kind === "docx") {
    const text = await readDocxText(`data:application/octet-stream;base64,${bytes.toString("base64")}`);
    return { format: kind, title: "", text: text.trim(), images: await zipImages(zip, /^word\/media\//, url), needsOcr: false };
  }
  if (kind === "pptx") {
    const slides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => naturalNum(a) - naturalNum(b));
    const parts: string[] = [];
    for (const path of slides) {
      const n = naturalNum(path);
      const lines = await xmlTexts(await zip.file(path)!.async("string"), DRAWING, "p", "t");
      const notesFile = zip.file(`ppt/notesSlides/notesSlide${n}.xml`);
      const notes = notesFile ? await xmlTexts(await notesFile.async("string"), DRAWING, "p", "t") : [];
      parts.push([`[${n}. dia]`, ...lines, ...(notes.length ? [`Jegyzet: ${notes.join(" ")}`] : [])].join("\n"));
    }
    return { format: kind, title: "", text: parts.join("\n\n").trim(), images: await zipImages(zip, /^ppt\/media\//, url), needsOcr: false };
  }
  const content = zip.file("content.xml");
  let lines: string[] = [];
  if (content) {
    const { DOMParser } = await import("@xmldom/xmldom");
    const doc = new DOMParser().parseFromString(await content.async("string"), "application/xml");
    // Dokumentumsorrendben: címsor (text:h) és bekezdés (text:p) együtt.
    const walk = (node: Node): void => {
      for (let child = node.firstChild as Element | null; child; child = child.nextSibling as Element | null) {
        if (child.namespaceURI === ODF_TEXT && (child.localName === "p" || child.localName === "h")) { const t = (child.textContent ?? "").trim(); if (t) lines.push(t); }
        else walk(child);
      }
    };
    walk(doc as unknown as Node);
    lines = lines.filter(Boolean);
  }
  return { format: kind, title: "", text: lines.join("\n"), images: await zipImages(zip, /^Pictures\//, url), needsOcr: false };
}

/** Régi bináris PowerPoint: a TextCharsAtom (0x0FA0, UTF-16LE) és TextBytesAtom (0x0FA8, latin1) rekordok, határon belül olvasva. */
function readLegacyPpt(bytes: Buffer): string {
  const out: string[] = [];
  for (let off = CFB_SIG.length; off + 8 <= bytes.length; off++) {
    const verInst = bytes.readUInt16LE(off), type = bytes.readUInt16LE(off + 2), len = bytes.readUInt32LE(off + 4);
    if ((verInst & 0x0f) !== 0 || (type !== 0x0fa0 && type !== 0x0fa8) || len === 0 || len > 65_536 || off + 8 + len > bytes.length) continue;
    if (type === 0x0fa0 && len % 2) continue;
    const text = (type === 0x0fa0 ? bytes.toString("utf16le", off + 8, off + 8 + len) : bytes.toString("latin1", off + 8, off + 8 + len)).replace(/\r/g, "\n").trim();
    const hasControl = Array.from(text).some(ch => { const c = ch.charCodeAt(0); return c <= 8 || (c >= 14 && c <= 31); });
    if (text && /\p{L}/u.test(text) && !hasControl) { out.push(text); off += 7 + len; }
  }
  return out.join("\n");
}

function mhtImages(raw: string, url: string): WebImage[] {
  const out: Array<WebImage | null> = [];
  const walk = (entity: MimePart, depth: number) => {
    const type = entity.headers.get("content-type") ?? "";
    if (/^image\//i.test(type)) {
      const loc = entity.headers.get("content-location");
      out.push(imageOf(decodeTransfer(entity.body, entity.headers.get("content-transfer-encoding")), loc && /^https:\/\//.test(loc) ? loc : url));
      return;
    }
    if (!/^multipart\//i.test(type) || depth > 8) return;
    const boundary = mimeParam(type, "boundary");
    if (!boundary) return;
    const delimiter = new RegExp(`(?:^|\\r?\\n)--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?[ \\t]*(?:\\r?\\n|$)`);
    for (const part of entity.body.split(delimiter).slice(1).filter(p => p.trim())) walk(splitMimeEntity(part), depth + 1);
  };
  walk(splitMimeEntity(raw.replace(/^\xEF\xBB\xBF/, "")), 0);
  return capImages(out);
}

async function readPdf(bytes: Buffer): Promise<WebDocument> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.js");
  const pdf = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise
    .catch((error: unknown) => { throw new Error(`A PDF nem olvasható (sérült vagy titkosított): ${error instanceof Error ? error.message : String(error)}`); });
  try {
    if (pdf.numPages > WEB_DOCUMENT_LIMITS.maxPdfPages) throw new Error(`Egy PDF legfeljebb ${WEB_DOCUMENT_LIMITS.maxPdfPages} oldal lehet.`);
    const pages: string[] = [];
    let empty = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      const words = content.items.map(item => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("").trim();
      if (!words) empty++;
      pages.push(`[${n}. oldal]\n${words}`);
    }
    // A3: a szövegréteg nélküli (szkennelt) PDF nem hiba — a W1b látó modellel írja át; a vegyes PDF sem veszíthet oldalt.
    const needsOcr = empty > 0;
    return { format: "pdf", title: "", text: needsOcr && empty === pdf.numPages ? "" : pages.join("\n\n"), images: [], needsOcr };
  } finally { await pdf.destroy(); }
}

export async function readWebDocument(bytes: Buffer, contentType: string, url: string): Promise<WebDocument> {
  const kind = await sniffWebFormat(bytes, contentType);
  if (!kind) throw new Error(`Nem támogatott formátum (${contentType || "ismeretlen"}): ${url}`);
  switch (kind) {
    case "pdf": return readPdf(bytes);
    case "docx": case "pptx": case "odp": case "odt": return readZipDocument(bytes, kind, url);
    case "ppt": return { format: "ppt", title: "", text: readLegacyPpt(bytes), images: [], needsOcr: false };
    case "image": return { format: "image", title: "", text: "", images: capImages([imageOf(bytes, url)]), needsOcr: true };
    case "mht": {
      const raw = bytes.toString("latin1");
      return { format: "mht", title: "", text: (await readMhtText(raw)).trim(), images: mhtImages(raw, url), needsOcr: false };
    }
    case "html": case "text": {
      const { charsetOf, decode, htmlToText } = await import("./safe-fetch");
      const body = decode(new Uint8Array(bytes), charsetOf(contentType, new Uint8Array(bytes)));
      if (kind === "text") return { format: "text", title: "", text: body.trim(), images: [], needsOcr: false };
      const { title, text } = htmlToText(body);
      return { format: "html", title, text, images: [], needsOcr: false };
    }
  }
}
