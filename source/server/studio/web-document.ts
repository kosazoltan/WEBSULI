import { decodeTransfer, mimeParam, readDocxText, readMhtText, sniffImageMime, splitMimeEntity, type MimePart } from "./document-source";

/**
 * W1a (docs/specs/2026-11-25-w1-forrasformatumok.md): webes forrás MINDEN formátumban. A formátumot a bájtok döntik el (a fejléc és a
 * kiterjesztés csak a szöveg / HTML megkülönböztetésére), a szöveg kinyerve, a beágyazott és önálló képek megőrizve (W1b: D1 hibrid).
 * Biztonság: a ZIP bejegyzésenként és összesen korlátozott (tömörítési bomba), a régi bináris PPT olvasása határon belüli.
 */
export type WebFormat = "pdf" | "docx" | "pptx" | "odp" | "odt" | "ppt" | "mht" | "image" | "html" | "text";
export type WebImage = { mime: string; dataUrl: string; bytes: number; sourceUrl: string; name?: string };
/** W1b: a szkennelt (szövegréteg nélküli) PDF nyers másolata a látó átíráshoz (≤ `maxScanBytes`). */
export type WebScan = { mime: "application/pdf"; dataUrl: string };
export type WebDocument = { format: WebFormat; title: string; text: string; images: WebImage[]; needsOcr: boolean; scan?: WebScan };

export const WEB_DOCUMENT_LIMITS = { maxImages: 8, maxImageBytes: 2 * 1024 * 1024, maxEntryBytes: 20 * 1024 * 1024, maxTotalBytes: 60 * 1024 * 1024, maxPdfPages: 120, maxScanBytes: 8 * 1024 * 1024 } as const;

const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04];
const CFB_SIG = Buffer.from("d0cf11e0a1b11ae1", "hex");
const startsWith = (b: Buffer, sig: number[] | Buffer) => b.length >= sig.length && Array.from(sig).every((v, i) => b[i] === v);

/** A zip „mimetype” / tartalomjegyzék alapján: DOCX / PPTX / ODP / ODT. Az olvasás csak a központi könyvtárat érinti. */
async function zipKind(bytes: Buffer): Promise<WebFormat | null> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes).catch(() => null);
  if (!zip) return null;
  // Review #592: a méretkapu az ELSŐ kibontás (a `mimetype` olvasása) előtt fut — ismeretlen ZIP-altípusnál is.
  guardZip(zip);
  if (zip.file("word/document.xml")) return "docx";
  if (zip.file("ppt/presentation.xml") || Object.keys(zip.files).some(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))) return "pptx";
  const mimeEntry = zip.file("mimetype");
  const mime = mimeEntry ? (await mimeEntry.async("string")).slice(0, 200).trim() : "";
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
  // Review #592: a szöveges jelleg a TARTALOMBÓL dől el (a fejléc előtt) — a fejléccel „text/plain”-nek mondott bináris nem szöveg,
  // a „application/octet-stream”-ként kiszolgált valódi szöveg viszont az. A fejléc csak a HTML / sima szöveg között dönt.
  if (!looksLikeText(bytes)) return null;
  const head = bytes.subarray(0, 4096).toString("latin1");
  if (/^\s*(MIME-Version:|Content-Type:\s*multipart\/related)/im.test(head) && /multipart\/related/i.test(head)) return "mht";
  if (/^(message\/rfc822|multipart\/related)/i.test(contentType)) return "mht";
  if (/^(text\/html|application\/xhtml\+xml)\b/i.test(contentType) || /^\s*(<!doctype html|<html|<head|<body|<p\b|<div\b)/i.test(head)) return "html";
  return "text";
}

/** Szöveg-e: UTF-16 BOM, vagy (az első 8 KB-ban) nincs NUL és a vezérlőbájtok aránya elhanyagolható; UTF-8 vagy 8 bites kódlap. */
function looksLikeText(bytes: Buffer): boolean {
  if (!bytes.length) return false;
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return true;
  const sample = bytes.subarray(0, 8192);
  let control = 0;
  for (const b of sample) { if (b === 0) return false; if (b < 32 && b !== 9 && b !== 10 && b !== 13 && b !== 12) control++; }
  return control / sample.length < 0.01;
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

/** Review #592: az ODF üres szóköz-elemei (`text:s` ismétlésszámmal, `text:tab`, `text:line-break`) a szöveg részei. */
function odfText(node: Node): string {
  let out = "";
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.nodeType === 3) { out += child.nodeValue ?? ""; continue; }
    const el = child as Element;
    if (el.namespaceURI === ODF_TEXT_NS && el.localName === "s") out += " ".repeat(Math.min(Math.max(Number(el.getAttributeNS(ODF_TEXT_NS, "c") ?? 1) || 1, 1), 100));
    else if (el.namespaceURI === ODF_TEXT_NS && el.localName === "tab") out += "\t";
    else if (el.namespaceURI === ODF_TEXT_NS && el.localName === "line-break") out += "\n";
    else out += odfText(el);
  }
  return out;
}
const ODF_TEXT_NS = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";
const ODF_TEXT = "urn:oasis:names:tc:opendocument:xmlns:text:1.0";

async function zipImages(zip: Zip, prefix: RegExp, sourceUrl: string): Promise<WebImage[]> {
  const out: Array<WebImage | null> = [];
  for (const path of Object.keys(zip.files).filter(p => prefix.test(p) && !zip.files[p].dir).sort()) {
    if (out.filter(Boolean).length >= WEB_DOCUMENT_LIMITS.maxImages) break;
    out.push(imageOf(await zip.file(path)!.async("nodebuffer"), sourceUrl, path.split("/").pop()));
  }
  return capImages(out);
}

const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PRES_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

/** Egy csomagrész kapcsolatai (`_rels/<rész>.rels`): azonosító, típus, a célrész ZIP-útvonala (relatív cél feloldva). */
async function relTargets(zip: Zip, part: string): Promise<Array<{ id: string; type: string; target: string }>> {
  const dir = part.slice(0, part.lastIndexOf("/") + 1);
  const rels = zip.file(`${dir}_rels/${part.slice(dir.length)}.rels`);
  if (!rels) return [];
  const { DOMParser } = await import("@xmldom/xmldom");
  const doc = new DOMParser().parseFromString(await rels.async("string"), "application/xml");
  return Array.from(doc.getElementsByTagNameNS(REL_NS, "Relationship")).map(r => {
    const raw = r.getAttribute("Target") ?? "";
    const segments: string[] = [];
    for (const seg of (raw.startsWith("/") ? raw.slice(1) : dir + raw).split("/")) { if (seg === "..") segments.pop(); else if (seg && seg !== ".") segments.push(seg); }
    return { id: r.getAttribute("Id") ?? "", type: r.getAttribute("Type") ?? "", target: segments.join("/") };
  });
}

async function pptxSlideOrder(zip: Zip): Promise<string[]> {
  const fallback = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => naturalNum(a) - naturalNum(b));
  const pres = zip.file("ppt/presentation.xml");
  if (!pres) return fallback;
  const { DOMParser } = await import("@xmldom/xmldom");
  const doc = new DOMParser().parseFromString(await pres.async("string"), "application/xml");
  const rels = new Map((await relTargets(zip, "ppt/presentation.xml")).map(r => [r.id, r.target]));
  const ordered = Array.from(doc.getElementsByTagNameNS(PRES_NS, "sldId"))
    .map(s => rels.get(s.getAttributeNS(OFFICE_REL_NS, "id") ?? ""))
    .filter((p): p is string => !!p && !!zip.file(p));
  return ordered.length ? [...new Set(ordered)] : fallback;
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
    // Review #592: a diasorrend a `presentation.xml` `sldIdLst` listája (+ kapcsolatai), a jegyzet a dia saját kapcsolatából; a fájlnév
    // száma csak tartalék (sérült / hiányos csomag), a megjelenített diaszám a bejárási sorszám.
    const slides = await pptxSlideOrder(zip);
    const parts: string[] = [];
    for (const [index, path] of slides.entries()) {
      const lines = await xmlTexts(await zip.file(path)!.async("string"), DRAWING, "p", "t");
      const notesPath = (await relTargets(zip, path)).find(r => /\/notesSlide$/.test(r.type))?.target;
      const notesFile = notesPath ? zip.file(notesPath) : null;
      const notes = notesFile ? await xmlTexts(await notesFile.async("string"), DRAWING, "p", "t") : [];
      parts.push([`[${index + 1}. dia]`, ...lines, ...(notes.length ? [`Jegyzet: ${notes.join(" ")}`] : [])].join("\n"));
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
        if (child.namespaceURI === ODF_TEXT && (child.localName === "p" || child.localName === "h")) { const t = odfText(child).trim(); if (t) lines.push(t); }
        else walk(child);
      }
    };
    walk(doc as unknown as Node);
    lines = lines.filter(Boolean);
  }
  return { format: kind, title: "", text: lines.join("\n"), images: await zipImages(zip, /^Pictures\//, url), needsOcr: false };
}

/**
 * Review #592: a régi bináris PowerPoint a CFB (OLE2) tárolóban — a „PowerPoint Document” adatfolyamot a FAT / MiniFAT szektorláncából
 * állítjuk össze (a szektorok nem feltétlenül szomszédosak), határ- és körellenőrzéssel; azon olvassuk a TextCharsAtom (0x0FA0,
 * UTF-16LE) és TextBytesAtom (0x0FA8, latin1) rekordokat.
 */
const FREESECT = 0xffffffff, ENDOFCHAIN = 0xfffffffe;
export function readCfbStream(bytes: Buffer, name: string): Buffer | null {
  if (!startsWith(bytes, CFB_SIG) || bytes.length < 512) return null;
  const shift = bytes.readUInt16LE(30), miniShift = bytes.readUInt16LE(32);
  if (shift !== 9 && shift !== 12) throw new Error("A régi Office-fájl szerkezete nem olvasható (szektorméret).");
  const size = 1 << shift, miniSize = 1 << miniShift;
  const sectorAt = (i: number) => { const off = (i + 1) * size; if (i < 0 || off >= bytes.length) throw new Error("A régi Office-fájl sérült (szektor a fájlon kívül)."); return bytes.subarray(off, Math.min(off + size, bytes.length)); };
  // DIFAT: 109 bejegyzés a fejlécben + a DIFAT-lánc.
  const fatSectors: number[] = [];
  for (let i = 0; i < 109; i++) { const v = bytes.readUInt32LE(76 + i * 4); if (v !== FREESECT && v !== ENDOFCHAIN) fatSectors.push(v); }
  let difat = bytes.readUInt32LE(68);
  for (let guard = 0; difat !== ENDOFCHAIN && difat !== FREESECT; guard++) {
    if (guard > 10_000) throw new Error("A régi Office-fájl sérült (DIFAT-kör).");
    const sec = sectorAt(difat);
    for (let i = 0; i < size / 4 - 1; i++) { const v = sec.readUInt32LE(i * 4); if (v !== FREESECT && v !== ENDOFCHAIN) fatSectors.push(v); }
    difat = sec.readUInt32LE(size - 4);
  }
  // Review #592: ismétlődő FAT-szektorhivatkozás (vagy a fájlnál több FAT-szektor) sérült / rosszindulatú fájl — nem fűzzük újra.
  if (new Set(fatSectors).size !== fatSectors.length || fatSectors.length > Math.ceil(bytes.length / size)) throw new Error("A régi Office-fájl sérült (FAT-szektorok).");
  const fat: number[] = [];
  for (const f of fatSectors) { const sec = sectorAt(f); for (let i = 0; i + 4 <= sec.length; i += 4) fat.push(sec.readUInt32LE(i)); }
  const chain = (start: number, table: number[]) => {
    const out: number[] = []; const seen = new Set<number>();
    for (let s = start; s !== ENDOFCHAIN; s = table[s]) {
      if (s === FREESECT || s >= table.length || seen.has(s)) throw new Error("A régi Office-fájl sérült (szektorlánc).");
      seen.add(s); out.push(s);
    }
    return out;
  };
  const readChain = (start: number, length?: number) => { const buf = Buffer.concat(chain(start, fat).map(sectorAt)); return length === undefined ? buf : buf.subarray(0, length); };
  const dir = readChain(bytes.readUInt32LE(48));
  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = Math.min(dir.readUInt16LE(off + 64), 64);
    entries.push({ name: dir.toString("utf16le", off, off + Math.max(nameLen - 2, 0)), type: dir[off + 66], start: dir.readUInt32LE(off + 116), size: dir.readUInt32LE(off + 120) });
  }
  const entry = entries.find(e => e.type === 2 && e.name.toLowerCase() === name.toLowerCase());
  if (!entry) return null;
  if (entry.size > WEB_DOCUMENT_LIMITS.maxEntryBytes) throw new Error("A régi Office-fájl adatfolyama túl nagy.");
  const cutoff = bytes.readUInt32LE(56);
  if (entry.size >= cutoff) return readChain(entry.start, entry.size);
  // Kis adatfolyam: a gyökérbejegyzés ministreamjében, a MiniFAT láncán.
  const root = entries.find(e => e.type === 5);
  const miniFatStart = bytes.readUInt32LE(60);
  if (!root || miniFatStart === ENDOFCHAIN) return null;
  const miniStream = readChain(root.start, root.size);
  const miniFatBuf = readChain(miniFatStart);
  const miniFat: number[] = [];
  for (let i = 0; i + 4 <= miniFatBuf.length; i += 4) miniFat.push(miniFatBuf.readUInt32LE(i));
  return Buffer.concat(chain(entry.start, miniFat).map(i => { const off = i * miniSize; if (off + miniSize > miniStream.length) throw new Error("A régi Office-fájl sérült (ministream)."); return miniStream.subarray(off, off + miniSize); })).subarray(0, entry.size);
}

function readLegacyPpt(bytes: Buffer): string {
  const stream = readCfbStream(bytes, "PowerPoint Document");
  if (!stream) throw new Error("A régi Office-fájlban nincs PowerPoint-adatfolyam (a régi Word / Excel nem támogatott).");
  const out: string[] = [];
  for (let off = 0; off + 8 <= stream.length; off++) {
    const verInst = stream.readUInt16LE(off), type = stream.readUInt16LE(off + 2), len = stream.readUInt32LE(off + 4);
    if ((verInst & 0x0f) !== 0 || (type !== 0x0fa0 && type !== 0x0fa8) || len === 0 || len > 65_536 || off + 8 + len > stream.length) continue;
    if (type === 0x0fa0 && len % 2) continue;
    const text = (type === 0x0fa0 ? stream.toString("utf16le", off + 8, off + 8 + len) : stream.toString("latin1", off + 8, off + 8 + len)).replace(/\r/g, "\n").trim();
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
    // W1b: a szkennelt PDF nyersen megy tovább a látó átíráshoz (a vegyes PDF is — a képes oldalai különben elvesznének).
    const scan: WebScan | undefined = needsOcr && bytes.length <= WEB_DOCUMENT_LIMITS.maxScanBytes ? { mime: "application/pdf", dataUrl: `data:application/pdf;base64,${bytes.toString("base64")}` } : undefined;
    return { format: "pdf", title: "", text: needsOcr && empty === pdf.numPages ? "" : pages.join("\n\n"), images: [], needsOcr, ...(scan ? { scan } : {}) };
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
      // Review #592: a BOM a fejléc / meta előtt dönt (UTF-16LE / UTF-16BE / UTF-8) — a BOM-os UTF-16 nem dekódolódhat UTF-8-ként.
      const bom = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? "utf-8" : null;
      const body = decode(new Uint8Array(bytes), bom ?? charsetOf(contentType, new Uint8Array(bytes))).replace(/^\uFEFF/, "");
      if (kind === "text") return { format: "text", title: "", text: body.trim(), images: [], needsOcr: false };
      const { title, text } = htmlToText(body);
      return { format: "html", title, text, images: [], needsOcr: false };
    }
  }
}
