import { createRequire } from "node:module";
import path from "node:path";

/**
 * D1H-3 (docs/specs/2026-11-25-d1h-kivagott-kep-vegrehajtas.md): egy PDF-oldal raszterizálása PNG-képpé a kivágáshoz — `pdfjs-dist`
 * (legacy) + `@napi-rs/canvas` (előre fordított natív vászon). A hosszabb oldal legfeljebb `PDF_RENDER_MAX_EDGE` px (a kivágás ebből
 * készül, utána 1600 px-re kicsinyítve); legalább 2× pontméret, hogy a kivágott rész olvasható maradjon.
 */
export const PDF_RENDER_MAX_EDGE = 2400;
const PDF_MAX_BYTES = 40 * 1024 * 1024;
const require = createRequire(import.meta.url);

type CanvasLike = { width: number; height: number; encode(format: "png"): Promise<Buffer>; getContext(type: "2d"): unknown };
type CanvasAndContext = { canvas: CanvasLike; context: unknown };

let fontDir: string | undefined;
function standardFontDataUrl(): string {
  // A pdfjs szabványos betűi (Helvetica, Times…) — nélkülük a szöveg nem rajzolódik ki Node-ban.
  fontDir ??= `${path.join(path.dirname(require.resolve("pdfjs-dist/package.json")), "standard_fonts")}${path.sep}`;
  return fontDir;
}

export async function renderPdfPage(dataUrl: string, page: number): Promise<Buffer> {
  const comma = dataUrl.indexOf(",");
  // Review #597: a PDF-előkészítéssel azonosan bármely base64 adat-URL fejléc (pl. application/octet-stream) — a tartalmat a pdfjs ellenőrzi.
  if (!/^data:[^;,]*;base64,/.test(dataUrl) || comma < 0) throw new Error("nem base64 adat-URL");
  const bytes = Buffer.from(dataUrl.slice(comma + 1), "base64");
  if (bytes.length > PDF_MAX_BYTES) throw new Error("a PDF túl nagy a raszterizáláshoz");
  const canvasModule = await import("@napi-rs/canvas");
  const { createCanvas } = canvasModule;
  // A pdfjs a DOMMatrix / Path2D / ImageData osztályt a (nem telepített) `canvas` csomagból pótolná — a @napi-rs/canvas sajátját adjuk
  // (csak ha hiányzik; így a rajzolás pontos, és nincs „Cannot polyfill” figyelmeztetés).
  const g = globalThis as Record<string, unknown>;
  for (const name of ["DOMMatrix", "Path2D", "ImageData"] as const) if (!g[name]) g[name] = (canvasModule as unknown as Record<string, unknown>)[name];
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.js");
  const factory = {
    create: (w: number, h: number): CanvasAndContext => { const canvas = createCanvas(w, h) as unknown as CanvasLike; return { canvas, context: canvas.getContext("2d") }; },
    reset: (c: CanvasAndContext, w: number, h: number) => { c.canvas.width = w; c.canvas.height = h; },
    destroy: (c: CanvasAndContext) => { c.canvas.width = 0; c.canvas.height = 0; },
  };
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), canvasFactory: factory, disableFontFace: true, useSystemFonts: false,
    isEvalSupported: false, verbosity: 0, standardFontDataUrl: standardFontDataUrl() } as never).promise;
  try {
    if (!Number.isInteger(page) || page < 1 || page > doc.numPages) throw new Error(`nem létező oldal: ${page} (a PDF ${doc.numPages} oldalas)`);
    const p = await doc.getPage(page);
    const base = p.getViewport({ scale: 1 });
    // Review #597: a plafon kötelező — a nagy oldal 1 alatti skálával KICSINYÜL (a vászon sosem nagyobb 2400 px-nél).
    const scale = Math.min(4, PDF_RENDER_MAX_EDGE / Math.max(base.width, base.height, 1));
    const viewport = p.getViewport({ scale });
    const target = factory.create(Math.floor(viewport.width), Math.floor(viewport.height));
    await p.render({ canvasContext: target.context, viewport, canvasFactory: factory } as never).promise;
    return await target.canvas.encode("png");
  } finally {
    await doc.destroy();
  }
}
