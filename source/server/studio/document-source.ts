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
    if (file.extractedText !== undefined || !["pdf", "docx"].includes(file.kind) || !file.content.startsWith("data:")) { out.push(file); continue; }
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
