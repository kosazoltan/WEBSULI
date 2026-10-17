/**
 * Websuli képkészlet — helyi válogatóoldal a jelöltekből (design-assets/candidates/index.html).
 * Terv: docs/specs/2026-10-17-websuli-kepkeszlet.md. Használat: npx tsx scripts/design-assets/review-page.ts
 * A tulajdonos tételenként kiválaszt egy képet; a „Kiválasztás másolása” JSON-t ad az approve.ts-nek.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AssetManifest } from "./lib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const CANDIDATES = path.join(ROOT, "design-assets", "candidates");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "design-assets", "prompts.json"), "utf8")) as AssetManifest;
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const sections = manifest.items.map(item => {
  const dir = path.join(CANDIDATES, item.id);
  const files = existsSync(dir) ? readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/.test(f)).sort() : [];
  if (!files.length) return "";
  const imgs = files.map(f => `<button type="button" class="cand" data-id="${esc(item.id)}" data-file="${esc(`${item.id}/${f}`)}" aria-pressed="false"><img src="${esc(`${item.id}/${f}`)}" alt="${esc(item.alt)}" loading="lazy"><span>${esc(f)}</span></button>`).join("");
  return `<section><h2>${esc(item.id)} <small>${esc(item.band)} · ${esc(item.kind)} · ${esc(item.aspect_ratio)}</small></h2><p>${esc(item.alt)}</p><div class="grid">${imgs}</div></section>`;
}).join("");

writeFileSync(path.join(CANDIDATES, "index.html"), `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Websuli képkészlet — válogatás</title><style>
body{margin:0;padding:20px;font:15px/1.5 system-ui,sans-serif;background:#F1F5FB;color:#10233C}
header{position:sticky;top:0;background:#F1F5FB;padding:10px 0;display:flex;gap:12px;align-items:center;flex-wrap:wrap;z-index:2}
h1{font-size:22px;margin:0} section{background:#fff;border:1px solid #DCE4EE;border-radius:16px;padding:16px;margin:14px 0}
h2{font-size:17px;margin:0} h2 small{font-weight:500;color:#4F6278} p{margin:4px 0 10px;color:#4F6278}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.cand{border:3px solid transparent;border-radius:14px;padding:6px;background:#F7F9FC;cursor:pointer;text-align:left}
.cand img{width:100%;height:auto;border-radius:10px;display:block} .cand span{font-size:12px;color:#4F6278}
.cand[aria-pressed=true]{border-color:#157A57;background:#E0F6EC} button.copy{min-height:44px;padding:8px 16px;border:0;border-radius:10px;background:#226493;color:#fff;font-weight:700}
#out{font:12px ui-monospace,monospace;white-space:pre-wrap;max-width:100%}
</style></head><body><header><h1>Websuli képkészlet — válogatás</h1><button class="copy" type="button" id="copy">Kiválasztás másolása</button><span id="status" role="status"></span></header>
${sections || "<p>Még nincs jelölt. Futtasd: npx tsx scripts/design-assets/generate.ts --trial</p>"}
<pre id="out"></pre>
<script>
const pick = {};
document.addEventListener("click", e => {
  const b = e.target.closest(".cand"); if (!b) return;
  const id = b.dataset.id; const on = pick[id] !== b.dataset.file;
  document.querySelectorAll('.cand[data-id="' + id + '"]').forEach(x => x.setAttribute("aria-pressed", "false"));
  if (on) { pick[id] = b.dataset.file; b.setAttribute("aria-pressed", "true"); } else delete pick[id];
  document.getElementById("out").textContent = JSON.stringify(pick, null, 2);
});
document.getElementById("copy").addEventListener("click", async () => {
  const text = JSON.stringify(pick, null, 2);
  try { await navigator.clipboard.writeText(text); document.getElementById("status").textContent = "Kimásolva (" + Object.keys(pick).length + " kép)."; }
  catch { document.getElementById("status").textContent = "Másold ki kézzel a lenti JSON-t."; }
});
</script></body></html>`);
console.log(`Válogatóoldal: ${path.join(CANDIDATES, "index.html")}`);
