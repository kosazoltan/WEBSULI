import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { renderPdfPage, PDF_RENDER_MAX_EDGE } from "../server/studio/pdf-page-render";
import { placeSourceImages } from "../server/studio/source-image-crops";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import type { Lesson } from "../shared/lesson-schema";
import type { SourceVisual } from "../shared/source-visuals";

/** D1H-3 (docs/specs/2026-11-25-d1h-kivagott-kep-vegrehajtas.md): kivágás PDF-oldalból. */

/** Kétoldalas, 400×300 pt-os PDF: az 1. oldal jobb fele kék téglalap, a 2. oldal bal fele piros. */
function pdf(): Buffer {
  const content = (op: string) => `<< /Length ${op.length} >>\nstream\n${op}\nendstream`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 4 0 R >>",
    content("0 0 1 rg 200 0 200 300 re f"),
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 6 0 R >>",
    content("1 0 0 rg 0 0 200 300 re f"),
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const dataUrl = (b: Buffer) => `data:application/pdf;base64,${b.toString("base64")}`;

test("renderPdfPage: a megadott oldal PNG-képpé, a hosszabb oldal legfeljebb a plafon; hibás oldal / nem PDF → hiba", async () => {
  const png = await renderPdfPage(dataUrl(pdf()), 1);
  const meta = await sharp(png).metadata();
  assert.equal(meta.format, "png");
  assert.ok(Math.max(meta.width ?? 0, meta.height ?? 0) <= PDF_RENDER_MAX_EDGE);
  assert.ok((meta.width ?? 0) >= 800, "olvasható felbontás (≥ 2× a pontméret)");
  const right = await sharp(png).extract({ left: Math.floor((meta.width ?? 0) * 0.75), top: 10, width: 10, height: 10 }).stats();
  assert.ok(right.dominant.b > 150 && right.dominant.r < 80, "az 1. oldal jobb fele kék");
  await assert.rejects(renderPdfPage(dataUrl(pdf()), 3), /oldal/);
  await assert.rejects(renderPdfPage("data:application/pdf;base64,bm90IGEgcGRm", 1));
});

test("placeSourceImages PDF-forrásból: a keret szerinti rész a megadott oldalról, oldalszámos forrásmegjelöléssel; egy oldal egyszer raszterizálódik", async () => {
  const l = structuredClone(fusionFixture()) as Lesson;
  const concept = (l.sections[0].blocks.find((b) => (b as { coversConceptIds?: string[] }).coversConceptIds?.length) as { coversConceptIds: string[] }).coversConceptIds[0];
  const v = (id: string, page: number, crop: unknown): SourceVisual => ({ id, kind: "photo", sourceFile: "tankonyv.pdf", page, role: "Kép", conceptIds: [concept], data: { depicts: "Ábra" }, crop } as SourceVisual);
  const stored: Array<{ bytes: Buffer; meta: Record<string, unknown> }> = [];
  let renders = 0;
  const res = await placeSourceImages(l, [v("a", 2, { x: 0, y: 0, w: 0.5, h: 1 }), v("b", 2, { x: 0, y: 0, w: 0.4, h: 0.5 })], [{ name: "tankonyv.pdf", kind: "pdf", content: dataUrl(pdf()) }], {
    store: async (bytes, meta) => { stored.push({ bytes, meta: meta as Record<string, unknown> }); return String(stored.length).padStart(64, "f"); },
    renderPage: async (url, page) => { renders++; return renderPdfPage(url, page); },
  });
  assert.deepEqual(res.placed, ["a", "b"]);
  assert.equal(renders, 1, "azonos oldal egyszer");
  const { dominant } = await sharp(stored[0].bytes).stats();
  assert.ok(dominant.r > 150 && dominant.b < 80, "a 2. oldal bal (piros) fele");
  assert.equal(stored[0].meta.page, 2);
  assert.match(String(stored[0].meta.credit), /Feltöltött forrás: tankonyv\.pdf/);
});
