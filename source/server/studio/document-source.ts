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

/** Keep original bytes/provenance, but give classification and quote checks the same text. */
export async function normalizeDocumentSources(files: ExtractorFile[], transcribePdf?: (file: ExtractorFile) => Promise<string>): Promise<ExtractorFile[]> {
  const out: ExtractorFile[] = [];
  for (const file of files) {
    if (file.extractedText !== undefined || !["pdf", "docx"].includes(file.kind) || !file.content.startsWith("data:")) { out.push(file); continue; }
    const encoded = file.content.match(/^data:[^,]+;base64,([\s\S]+)$/)?.[1];
    if (!encoded) throw new Error("A dokumentum kódolása nem olvasható.");
    const buffer = Buffer.from(encoded, "base64");
    if (buffer.byteLength > 25 * 1024 * 1024) throw new Error("Egy dokumentum legfeljebb 25 MB lehet.");
    let text: string;
    if (file.kind === "docx") {
      text = await readDocxText(file.content);
    } else {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.js");
      const pdf = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, isEvalSupported: false }).promise;
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
