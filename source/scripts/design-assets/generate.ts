/**
 * Websuli képkészlet — jelöltek generálása a Seedream 5.0 Pro-val az OpenRouter képvégpontján.
 * Terv: docs/specs/2026-10-17-websuli-kepkeszlet.md. Használat (a source/ mappából):
 *   npx tsx scripts/design-assets/generate.ts --trial --dry-run   # becsült ár és promptok, hívás nélkül
 *   npx tsx scripts/design-assets/generate.ts --trial              # a próbakör (legfeljebb --max kép)
 *   npx tsx scripts/design-assets/generate.ts --only hero-studio,cover-sejt
 *   npx tsx scripts/design-assets/generate.ts --only cover-l-… --resolution 1K   # leckeborító (docs/specs/2026-11-03-leckeborito.md)
 * Külön készlet (docs/specs/2026-11-18-adventi-naptar.md 13.; design-assets/<név>/prompts.json + style.md, a jelöltek a nem követett
 * design-assets/candidates/<név>/ alá), tételenként több jelölttel, képszám- és KEMÉNY költségplafonnal:
 *   npx tsx scripts/design-assets/generate.ts --set advent --dry-run --max 94 --max-usd 7
 *   npx tsx scripts/design-assets/generate.ts --set advent --only advent-bg-portrait,advent-door-08,advent-door-24 --max 10 --max-usd 7
 * A kulcs (OPENROUTER_API_KEY) csak a memóriában él; sem a konzolra, sem a naplóba nem kerül.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildImageRequest, composePrompt, estimateUsd, loadStyle, parseMax, parseMaxUsd, parseResolution, parseSetName, planJobs, redact, type AssetItem, type AssetManifest, type Resolution, type Style } from "./lib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SET = parseSetName(process.argv.includes("--set") ? (process.argv[process.argv.indexOf("--set") + 1] ?? "") : undefined);
const ASSETS = SET ? path.join(ROOT, "design-assets", SET) : path.join(ROOT, "design-assets");
const CANDIDATES = SET ? path.join(ROOT, "design-assets", "candidates", SET) : path.join(ROOT, "design-assets", "candidates");
const PUBLIC_DESIGN = path.join(ROOT, "client", "public", "design");
const ENDPOINT = "https://openrouter.ai/api/v1/images";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function readKey(): string {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const local = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "hermes", ".env") : "";
  if (local && existsSync(local)) {
    const line = readFileSync(local, "utf8").split(/\r?\n/).find(l => /^\s*OPENROUTER_API_KEY\s*=/.test(l));
    const value = line?.replace(/^\s*OPENROUTER_API_KEY\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  throw new Error("Hiányzik az OPENROUTER_API_KEY (környezeti változó vagy %LOCALAPPDATA%\\hermes\\.env).");
}

/** Referenciakép: előbb a jóváhagyott WebP, különben a legfrissebb jelölt (próbakörben). */
function referenceDataUrl(item: AssetItem, manifest: AssetManifest): string | null {
  const ref = manifest.items.find(i => i.id === item.id);
  if (!ref) return null;
  const approved = path.join(PUBLIC_DESIGN, ref.band, `${ref.id}.webp`);
  if (existsSync(approved)) return `data:image/webp;base64,${readFileSync(approved).toString("base64")}`;
  const dir = path.join(CANDIDATES, ref.id);
  if (!existsSync(dir)) return null;
  // A modell JPG-t ad vissza (mérve, 2026-10-17); minden képtípust elfogadunk.
  const latest = readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/.test(f)).sort().at(-1);
  if (!latest) return null;
  const mime = latest.endsWith(".png") ? "image/png" : latest.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(path.join(dir, latest)).toString("base64")}`;
}

/** Egy kép generálása (legfeljebb 2 próba); a becsült költséget adja vissza, sikertelenségnél 0-t. */
async function generateOne(item: AssetItem, resolution: Resolution, ctx: { manifest: AssetManifest; style: Style; key: string; log: string }): Promise<number> {
  const { manifest, style, key, log } = ctx;
  let spent = 0;
  const refs = (item.references ?? []).map(id => referenceDataUrl({ ...item, id }, manifest)).filter((u): u is string => !!u);
  if ((item.references?.length ?? 0) > refs.length) console.log(`  ! ${item.id}: hiányzó referencia, nélküle generálok.`);
  const body = buildImageRequest(manifest.model, item, style, refs, resolution);
  let saved = false;
  for (let attempt = 1; attempt <= 2 && !saved; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": "https://websuli.vip", "X-Title": "WebSuli design assets" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${redact(text, key).slice(0, 300)}`);
      const json = JSON.parse(text) as { data?: Array<{ b64_json?: string; media_type?: string }>; usage?: unknown };
      const img = json.data?.[0];
      if (!img?.b64_json || !/^image\//.test(img.media_type ?? "image/png")) throw new Error("Üres vagy nem képtípusú válasz.");
      const dir = path.join(CANDIDATES, item.id);
      mkdirSync(dir, { recursive: true });
      const ext = img.media_type === "image/jpeg" ? "jpg" : img.media_type === "image/webp" ? "webp" : "png";
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`);
      writeFileSync(file, Buffer.from(img.b64_json, "base64"));
      const cost = estimateUsd(1, refs.length, resolution);
      spent = cost;
      appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), id: item.id, model: manifest.model, promptHash: createHash("sha256").update(body.prompt).digest("hex").slice(0, 16), refs: refs.length, estUsd: cost, usage: json.usage ?? null, file: path.relative(CANDIDATES, file), status: "ok" }) + "\n");
      console.log(`  ✓ ${item.id} → ${path.relative(ROOT, file)}`);
      saved = true;
    } catch (error) {
      const message = redact(error instanceof Error ? error.message : String(error), key);
      appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), id: item.id, attempt, status: "error", message }) + "\n");
      console.log(`  ✗ ${item.id} (${attempt}. próba): ${message}`);
    }
  }
  return spent;
}

/** Külön készlet futása: tételenként több jelölt, képszám- és költségplafon; a plafon elérésekor megáll. */
async function runSet(manifest: AssetManifest, style: Style, items: AssetItem[], resolution: Resolution, max: number) {
  const maxUsd = parseMaxUsd(process.argv.includes("--max-usd") ? (arg("max-usd") ?? "") : undefined);
  const plan = planJobs(items, { resolution, max, maxUsd });
  console.log(`${plan.jobs.length} kép · becsült költség ≈ ${plan.totalUsd.toFixed(2)} USD (${manifest.model}, készlet: ${SET})`);
  if (plan.cutBy === "max") console.log(`KORLÁT: a kért ${plan.requested} képből csak ${plan.jobs.length} fut (--max ${max}).`);
  if (plan.cutBy === "max-usd") console.log(`KÖLTSÉGPLAFON: a kért ${plan.requested} képből csak ${plan.jobs.length} fér a keretbe (--max-usd ${maxUsd}).`);
  if (maxUsd === null) console.log("FIGYELEM: nincs költségplafon (--max-usd) — éles futás csak plafonnal indul.");
  if (flag("dry-run")) {
    const seen = new Set<string>();
    for (const job of plan.jobs) {
      if (seen.has(job.item.id)) continue;
      seen.add(job.item.id);
      const count = plan.jobs.filter(j => j.item.id === job.item.id).length;
      console.log(`- ${job.item.id} [${job.item.kind} ${job.item.aspect_ratio} · ${job.resolution} · ${count} jelölt · ≈ ${(count * job.estUsd).toFixed(3)} USD]
  ${composePrompt(job.item, style)}`);
    }
    return;
  }
  if (maxUsd === null) throw new Error("Külön készlet éles futása csak --max-usd költségplafonnal indul.");
  const key = readKey();
  mkdirSync(CANDIDATES, { recursive: true });
  const ctx = { manifest, style, key, log: path.join(CANDIDATES, "log.jsonl") };
  let spent = 0;
  let made = 0;
  for (const job of plan.jobs) {
    // Kemény plafon futás közben is: a következő kép becsült árával sem léphető túl.
    if (spent + job.estUsd > maxUsd + 1e-9) { console.log(`KÖLTSÉGPLAFON elérve (${spent.toFixed(2)} / ${maxUsd} USD) — megállok.`); break; }
    const cost = await generateOne(job.item, job.resolution, ctx);
    if (cost > 0) made++;
    // Óvatos elszámolás: a sikertelen kísérlet is a keretbe számít (a szolgáltató számlázása hibánál nem ismert).
    spent += Math.max(cost, job.estUsd);
  }
  console.log(`Kész: ${made} kép. Becsült költés: ≈ ${spent.toFixed(2)} USD. Válogatóoldal: npx tsx scripts/design-assets/review-page.ts --set ${SET}`);
}

async function main() {
  const manifest = JSON.parse(readFileSync(path.join(ASSETS, "prompts.json"), "utf8")) as AssetManifest;
  const style = loadStyle(readFileSync(path.join(ASSETS, "style.md"), "utf8"));
  const only = arg("only")?.split(",").map(s => s.trim()).filter(Boolean);
  const max = parseMax(process.argv.includes("--max") ? (arg("max") ?? "") : undefined);
  let items = manifest.items.filter(i => (only ? only.includes(i.id) : flag("trial") ? i.trial : true));
  if (items.length > max) { console.log(`Csak az első ${max} tétel fut (--max).`); items = items.slice(0, max); }
  const resolution = parseResolution(process.argv.includes("--resolution") ? (arg("resolution") ?? "") : undefined);
  if (SET) { await runSet(manifest, style, manifest.items.filter(i => (only ? only.includes(i.id) : true)), resolution, max); return; }
  const refsCount = items.reduce((n, i) => n + (i.references?.length ?? 0), 0);
  console.log(`${items.length} kép · becsült költség ≈ ${estimateUsd(items.length, refsCount, resolution).toFixed(2)} USD (${manifest.model}, ${resolution})`);
  if (flag("dry-run")) {
    for (const i of items) console.log(`- ${i.id} [${i.band}/${i.kind} ${i.aspect_ratio}]\n  ${composePrompt(i, style)}`);
    return;
  }
  const key = readKey();
  mkdirSync(CANDIDATES, { recursive: true });
  const log = path.join(CANDIDATES, "log.jsonl");
  let spent = 0;
  const ctx = { manifest, style, key, log };
  for (const item of items) spent += await generateOne(item, resolution, ctx);
  console.log(`Kész. Becsült költés: ≈ ${spent.toFixed(2)} USD. Válogatóoldal: npx tsx scripts/design-assets/review-page.ts`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "A generálás nem sikerült."); process.exitCode = 1; });
