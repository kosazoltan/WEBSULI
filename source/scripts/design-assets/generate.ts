/**
 * Websuli képkészlet — jelöltek generálása a Seedream 5.0 Pro-val az OpenRouter képvégpontján.
 * Terv: docs/specs/2026-10-17-websuli-kepkeszlet.md. Használat (a source/ mappából):
 *   npx tsx scripts/design-assets/generate.ts --trial --dry-run   # becsült ár és promptok, hívás nélkül
 *   npx tsx scripts/design-assets/generate.ts --trial              # a próbakör (legfeljebb --max kép)
 *   npx tsx scripts/design-assets/generate.ts --only hero-studio,cover-sejt
 * A kulcs (OPENROUTER_API_KEY) csak a memóriában él; sem a konzolra, sem a naplóba nem kerül.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildImageRequest, composePrompt, estimateUsd, loadStyle, redact, type AssetItem, type AssetManifest } from "./lib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ASSETS = path.join(ROOT, "design-assets");
const CANDIDATES = path.join(ASSETS, "candidates");
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
  const latest = readdirSync(dir).filter(f => f.endsWith(".png")).sort().at(-1);
  return latest ? `data:image/png;base64,${readFileSync(path.join(dir, latest)).toString("base64")}` : null;
}

async function main() {
  const manifest = JSON.parse(readFileSync(path.join(ASSETS, "prompts.json"), "utf8")) as AssetManifest;
  const style = loadStyle(readFileSync(path.join(ASSETS, "style.md"), "utf8"));
  const only = arg("only")?.split(",").map(s => s.trim()).filter(Boolean);
  const max = Number(arg("max") ?? 12);
  let items = manifest.items.filter(i => (only ? only.includes(i.id) : flag("trial") ? i.trial : true));
  if (items.length > max) { console.log(`Csak az első ${max} tétel fut (--max).`); items = items.slice(0, max); }
  const refsCount = items.reduce((n, i) => n + (i.references?.length ?? 0), 0);
  console.log(`${items.length} kép · becsült költség ≈ ${estimateUsd(items.length, refsCount).toFixed(2)} USD (${manifest.model}, 2K)`);
  if (flag("dry-run")) {
    for (const i of items) console.log(`- ${i.id} [${i.band}/${i.kind} ${i.aspect_ratio}]\n  ${composePrompt(i, style)}`);
    return;
  }
  const key = readKey();
  mkdirSync(CANDIDATES, { recursive: true });
  const log = path.join(CANDIDATES, "log.jsonl");
  let spent = 0;
  for (const item of items) {
    const refs = (item.references ?? []).map(id => referenceDataUrl({ ...item, id }, manifest)).filter((u): u is string => !!u);
    if ((item.references?.length ?? 0) > refs.length) console.log(`  ! ${item.id}: hiányzó referencia, nélküle generálok.`);
    const body = buildImageRequest(manifest.model, item, style, refs);
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
        const cost = estimateUsd(1, refs.length);
        spent += cost;
        appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), id: item.id, model: manifest.model, promptHash: createHash("sha256").update(body.prompt).digest("hex").slice(0, 16), refs: refs.length, estUsd: cost, usage: json.usage ?? null, file: path.relative(CANDIDATES, file), status: "ok" }) + "\n");
        console.log(`  ✓ ${item.id} → ${path.relative(ROOT, file)}`);
        saved = true;
      } catch (error) {
        const message = redact(error instanceof Error ? error.message : String(error), key);
        appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), id: item.id, attempt, status: "error", message }) + "\n");
        console.log(`  ✗ ${item.id} (${attempt}. próba): ${message}`);
      }
    }
  }
  console.log(`Kész. Becsült költés: ≈ ${spent.toFixed(2)} USD. Válogatóoldal: npx tsx scripts/design-assets/review-page.ts`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "A generálás nem sikerült."); process.exitCode = 1; });
