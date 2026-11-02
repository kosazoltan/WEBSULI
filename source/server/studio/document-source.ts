import type { ExtractorFile } from "./extractor";

export async function readDocxText(content: string): Promise<string> {
  const encoded = content.match(/^data:[^,]+;base64,(.+)$/s)?.[1];
  if (!encoded) return content;
  const [{ default: JSZip }, { DOMParser }] = await Promise.all([import("jszip"), import("@xmldom/xmldom")]);
  const zip = await JSZip.loadAsync(Buffer.from(encoded, "base64"));
  if (!zip.file("word/document.xml")) throw new Error("A DOCX fő dokumentuma hiányzik.");
  const paths = Object.keys(zip.files).filter(p => /^word\/(document|footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(p));
  const sections: string[] = [];
  for (const path of paths) {
    const xml = new DOMParser().parseFromString(await zip.file(path)!.async("string"), "application/xml");
    const paragraphs = xml.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p");
    sections.push(Array.from(paragraphs).map(p => Array.from(p.getElementsByTagNameNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "t")).map(t => t.textContent).join("")).join("\n"));
  }
  return sections.join("\n");
}

type MimePart = { headers: Map<string, string>; body: string };

/** RFC 822 style header block → lower-cased name map (folded continuation lines joined). */
function parseMimeHeaders(block: string): Map<string, string> {
  const headers = new Map<string, string>();
  for (const line of block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return headers;
}

function splitMimeEntity(raw: string): MimePart {
  const match = /\r?\n\r?\n/.exec(raw);
  if (!match) return { headers: parseMimeHeaders(raw), body: "" };
  return { headers: parseMimeHeaders(raw.slice(0, match.index)), body: raw.slice(match.index + match[0].length) };
}

const mimeParam = (header: string | undefined, name: string) =>
  header ? new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i").exec(header)?.slice(1).find(v => v !== undefined) : undefined;

/** Transfer-decoded bytes of one part; `body` is a latin1 (byte-preserving) string. */
function decodeTransfer(body: string, encoding: string | undefined): Buffer {
  switch ((encoding ?? "").toLowerCase()) {
    case "base64": return Buffer.from(body.replace(/[^A-Za-z0-9+/=]/g, ""), "base64");
    case "quoted-printable": return Buffer.from(body.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1");
    default: return Buffer.from(body, "latin1");
  }
}

/** Spec 2026-11-02-mht-forras: the root HTML page of an MHT/MHTML web archive as plain text (embedded images are not read). */
export async function readMhtText(content: string): Promise<string> {
  const encoded = content.match(/^data:[^,]*;base64,([\s\S]+)$/)?.[1];
  const raw = encoded ? Buffer.from(encoded, "base64").toString("latin1") : content;
  const [{ charsetOf, decode, htmlToText }] = await Promise.all([import("./safe-fetch")]);
  const top = splitMimeEntity(raw.replace(/^\xEF\xBB\xBF/, ""));
  const snapshot = top.headers.get("snapshot-content-location");
  const cid = (value: string | undefined) => value?.replace(/^<|>$/g, "");
  // Review #374 (P2): the root may itself be multipart (e.g. multipart/alternative around the page), so the root
  // entity is chosen before any HTML filtering and nested multiparts are descended into.
  const htmlOf = (entity: MimePart, depth: number, isTop: boolean): MimePart | undefined => {
    const type = entity.headers.get("content-type") ?? (isTop ? "text/html" : "text/plain");
    if (!/^multipart\//i.test(type)) return /^text\/html/i.test(type) ? entity : undefined;
    if (depth > 8) throw new Error("Az MHT-fájl szerkezete túl mélyen egymásba ágyazott.");
    const boundary = mimeParam(type, "boundary");
    if (!boundary) throw new Error("Az MHT-fájl szerkezete nem olvasható (hiányzó határoló).");
    const delimiter = new RegExp(`\\r?\\n?--${boundary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:--)?[ \\t]*(?:\\r?\\n|$)`);
    const parts = entity.body.split(delimiter).slice(1).filter(p => p.trim()).map(splitMimeEntity);
    const startId = cid(mimeParam(type, "start"));
    const preferred = (startId && parts.find(p => cid(p.headers.get("content-id")) === startId))
      || (snapshot && parts.find(p => p.headers.get("content-location") === snapshot)) || undefined;
    // In multipart/alternative the last part is the richest representation.
    const ordered = /^multipart\/alternative/i.test(type) ? [...parts].reverse() : parts;
    for (const part of preferred ? [preferred, ...ordered.filter(p => p !== preferred)] : ordered) {
      const found = htmlOf(part, depth + 1, false);
      if (found) return found;
    }
    return undefined;
  };
  const root = htmlOf(top, 0, true);
  if (!root) throw new Error("Az MHT-fájlban nincs olvasható weboldal.");
  const bytes = decodeTransfer(root.body, root.headers.get("content-transfer-encoding"));
  return htmlToText(decode(bytes, charsetOf(root.headers.get("content-type") ?? "", bytes))).text;
}

/**
 * Spec 2026-09-19: the bytes decide, not the file extension. A photo saved as ".pdf" is
 * a photo; a real PDF pdfjs cannot open still gets a vision transcript.
 */
export function sniffImageMime(buffer: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("latin1") === "RIFF" && buffer.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString("latin1"))) return "image/gif";
  return null;
}

/** Keep original bytes/provenance, but give classification and quote checks the same text. */
export async function normalizeDocumentSources(files: ExtractorFile[], transcribePdf?: (file: ExtractorFile) => Promise<string>): Promise<ExtractorFile[]> {
  const out: ExtractorFile[] = [];
  for (const file of files) {
    if (file.extractedText !== undefined || !["pdf", "docx", "mht"].includes(file.kind) || !file.content.startsWith("data:")) { out.push(file); continue; }
    const encoded = file.content.match(/^data:[^,]+;base64,([\s\S]+)$/)?.[1];
    if (!encoded) throw new Error("A dokumentum kódolása nem olvasható.");
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.byteLength > 25 * 1024 * 1024) throw new Error("Egy dokumentum legfeljebb 25 MB lehet.");
    const imageMime = file.kind === "pdf" ? sniffImageMime(buffer) : null;
    if (imageMime) {
      // A photo with a .pdf name: hand it to the image/OCR path with an honest data URL.
      out.push({ ...file, kind: "image", content: `data:${imageMime};base64,${encoded}` });
      continue;
    }
    let text: string;
    if (file.kind === "docx") {
      text = await readDocxText(file.content);
    } else if (file.kind === "mht") {
      text = await readMhtText(file.content);
    } else {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.js");
      let pdf: Awaited<ReturnType<typeof getDocument>["promise"]>;
      try {
        pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        if (!transcribePdf) throw new Error(`A PDF nem olvasható (sérült vagy titkosított): ${reason}`, { cause: error });
        // Measured in production (one_step_runs a1707ade: "Invalid PDF structure."): the
        // vision transcriber reads what pdfjs cannot parse; an empty transcript is the
        // real, explicit failure below.
        const transcript = await transcribePdf(file);
        if (!transcript.trim()) throw new Error(`A PDF nem olvasható (sérült vagy titkosított): ${reason}`, { cause: error });
        out.push({ ...file, extractedText: transcript });
        continue;
      }
      try {
        if (pdf.numPages > 120) throw new Error("Egy PDF legfeljebb 120 oldal lehet; bontsd részekre.");
        const pages: string[] = [];
        let needsOcr = false;
        for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
          const page = await pdf.getPage(pageNo);
          const content = await page.getTextContent();
          const words = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").trim();
          if (!words) needsOcr = true;
          pages.push(`[${pageNo}. oldal]\n${words}`);
        }
        // A mixed scanned/text PDF must not silently lose its scanned pages.
        if (needsOcr) {
          if (!transcribePdf) throw new Error("A PDF képes oldalakat tartalmaz; az átírás szükséges.");
          text = await transcribePdf(file);
        } else text = pages.join("\n\n");
      } finally { await pdf.destroy(); }
    }
    if (!text.trim()) throw new Error("A dokumentumból nem olvasható tananyagszöveg.");
    out.push({ ...file, extractedText: text });
  }
  return out;
}
