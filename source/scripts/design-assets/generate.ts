/**
 * Websuli képkészlet — jelöltek generálása a Seedream 5.0 Pro-val az OpenRouter képvégpontján.
 * Terv: docs/specs/2026-10-17-websuli-kepkeszlet.md. Használat (a source/ mappából):
 *   npx tsx scripts/design-assets/generate.ts --trial --dry-run   # becsült ár és promptok, hívás nélkül
 *   npx tsx scripts/design-assets/generate.ts --trial              # a próbakör (legfeljebb --max kép)
 *   npx tsx scripts/design-assets/generate.ts --only hero-studio,cover-sejt
 *   npx tsx scripts/design-assets/generate.ts --only cover-l-… --resolution 1K   # leckeborító (docs/specs/2026-11-03-leckeborito.md)
 *
 * Külön készlet (docs/specs/2026-11-18-adventi-naptar.md 13., 15., 18.; design-assets/<név>/prompts.json + style.md; a jelöltek a
 * nem követett design-assets/candidates/<név>/ alá), tételenként több jelölttel:
 *   npx tsx scripts/design-assets/generate.ts --set advent --dry-run --max 94 --max-usd 7
 *   npx tsx scripts/design-assets/generate.ts --set advent --only advent-bg-portrait,advent-door-08,advent-door-24 --max 10 --max-usd 7
 *   npx tsx scripts/design-assets/generate.ts --set advent --max 94 --max-usd 7 --ref advent-bg-portrait=advent-bg-portrait/<fájl>.jpg
 * KÖLTSÉGKERET külön készletnél:
 *   - `--max-usd` nélkül éles futás nincs. A keret ÖSSZESÍTETT: a készlet naplójának (log.jsonl) eddigi becsült összege a kezdőérték,
 *     tehát a próbakör és a teljes kör ugyanabból a keretből megy; a már meglévő jelölteket a futás nem gyártja újra.
 *   - Minden HÁLÓZATI HÍVÁS előtt keret-ellenőrzés, a hívás indításakor elszámolás és „started” naplósor — a sikertelen és a
 *     megszakított hívás is számít. Sérült naplóval, vagy ha a napló hiányzik, de már vannak jelöltek, az éles futás nem indul.
 *   - Egyszerre egy futás (zárfájl a jelöltmappában); ha a futásban készülő stílus-referencia elbukik, a rá épülő képek nem készülnek el.
 *   - A keret a kódban rögzített BECSÜLT árral számol (lib.ts `estimateUsd`), nem a számlával. A valódi kemény plafon a
 *     szolgáltatónál a kulcsra állított költségkeret (tulajdonosi teendő); a próbakör után a számlázott összeget össze kell vetni
 *     a becsléssel, mielőtt a teljes kör indul.
 *   - `--ref <azonosító>=<fájl a candidates/<név>/ alatt>`: a stílus-referencia a tulajdonos által KIVÁLASZTOTT kép. Enélkül csak
 *     az ugyanabban a futásban készült referencia használható (próbakör); különben a futás hívás előtt megáll.
 * A kulcs (OPENROUTER_API_KEY) csak a memóriában él; sem a konzolra, sem a naplóba nem kerül.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attemptWithinBudget, buildImageRequest, composePrompt, estimateUsd, ledgerProblem, loadStyle, missingReferences, parseMax, parseMaxUsd, parseRefs, parseResolution,
  parseSetName, planJobs, readLedger, redact, requestImage, runJobs, runUnderLock, settleActualCost, type AssetItem, type AssetManifest, type Budget, type Resolution, type Style,
} from "./lib";
import { acquireRunLock } from "./run-lock";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SET = parseSetName(process.argv.includes("--set") ? (process.argv[process.argv.indexOf("--set") + 1] ?? "") : undefined);
const ASSETS = SET ? path.join(ROOT, "design-assets", SET) : path.join(ROOT, "design-assets");
const CANDIDATES = SET ? path.join(ROOT, "design-assets", "candidates", SET) : path.join(ROOT, "design-assets", "candidates");
const PUBLIC_DESIGN = path.join(ROOT, "client", "public", "design");
const ENDPOINT = "https://openrouter.ai/api/v1/images";
const IMAGE_FILE = /\.(png|jpe?g|webp)$/;

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

const dataUrl = (file: string) => {
  const mime = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${readFileSync(file).toString("base64")}`;
};

/** Referenciakép: előbb a jóváhagyott WebP, különben a legfrissebb jelölt (próbakörben). */
function referenceDataUrl(item: AssetItem, manifest: AssetManifest): string | null {
  const ref = manifest.items.find(i => i.id === item.id);
  if (!ref) return null;
  const approved = path.join(PUBLIC_DESIGN, ref.band, `${ref.id}.webp`);
  if (existsSync(approved)) return `data:image/webp;base64,${readFileSync(approved).toString("base64")}`;
  const dir = path.join(CANDIDATES, ref.id);
  if (!existsSync(dir)) return null;
  // A modell JPG-t ad vissza (mérve, 2026-10-17); minden képtípust elfogadunk.
  const latest = readdirSync(dir).filter(f => IMAGE_FILE.test(f)).sort().at(-1);
  if (!latest) return null;
  return dataUrl(path.join(dir, latest));
}

type Ctx = {
  manifest: AssetManifest; style: Style; key: string; log: string;
  /** Külön készletnél: a hívásonkénti keret (null: a régi készlet útja, keret nélkül). */
  budget: Budget | null;
  /** Külön készletnél: a referencia feloldása (kiválasztott fájl vagy az ebben a futásban készült jelölt). */
  reference?: (id: string) => string | null;
};

/**
 * Egy kép generálása (legfeljebb 2 hívás). A visszaadott `estUsd` a sikeres kép becsült ára (sikertelenségnél 0); külön készletnél
 * a keretet hívásonként a `ctx.budget` vezeti, és `stoppedByBudget` jelzi, ha a keret miatt nem indult (újabb) hívás.
 */
async function generateOne(item: AssetItem, resolution: Resolution, ctx: Ctx): Promise<{ estUsd: number; saved: boolean; stoppedByBudget: boolean }> {
  const { manifest, style, key, log } = ctx;
  const refs = (item.references ?? []).map(id => (ctx.reference ? ctx.reference(id) : referenceDataUrl({ ...item, id }, manifest))).filter((u): u is string => !!u);
  if ((item.references?.length ?? 0) > refs.length) console.log(`  ! ${item.id}: hiányzó referencia, nélküle generálok.`);
  const body = buildImageRequest(manifest.model, item, style, refs, resolution);
  const cost = estimateUsd(1, refs.length, resolution);
  const outcome = await attemptWithinBudget({
    budget: ctx.budget,
    estUsd: cost,
    maxAttempts: 2,
    // Külön készletnél a hívás ELŐTT „indult” sor megy a naplóba a becsült árral: megszakítás után is látszik a keretben (L5).
    onStart: (attempt) => {
      if (ctx.budget) appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), id: item.id, attempt, status: "started", estUsd: cost }) + "\n");
    },
    attempt: async () => {
      const img = await requestImage(fetch, { endpoint: ENDPOINT, key, body });
      const dir = path.join(CANDIDATES, item.id);
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}.${img.ext}`);
      writeFileSync(file, img.bytes);
      // A valódi ár (usage.cost) becslés feletti része is a keretbe és a könyvbe kerül (vak ellenőr KICSI-2).
      const extraUsd = settleActualCost(ctx.budget, cost, img.usage);
      appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), id: item.id, model: manifest.model, promptHash: createHash("sha256").update(body.prompt).digest("hex").slice(0, 16), refs: refs.length, ...(ctx.budget ? { imageUsd: cost } : { estUsd: cost }), ...(extraUsd > 0 ? { extraUsd } : {}), usage: img.usage ?? null, file: path.relative(CANDIDATES, file), status: "ok" }) + "\n");
      console.log(`  ✓ ${item.id} → ${path.relative(ROOT, file)}`);
    },
    onError: (attempt, error) => {
      const message = redact(error instanceof Error ? error.message : String(error), key);
      // Külön készletnél a sikertelen hívás árát a hívás előtti „started” sor már elszámolta.
      appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), id: item.id, attempt, status: "error", message }) + "\n");
      console.log(`  ✗ ${item.id} (${attempt}. próba): ${message}`);
    },
  });
  return { estUsd: outcome.saved ? cost : 0, saved: outcome.saved, stoppedByBudget: outcome.stoppedByBudget };
}

/** Külön készlet futása: tételenként több jelölt, képszám- és összesített költségplafon; a plafon elérésekor megáll. */
async function runSet(manifest: AssetManifest, style: Style, items: AssetItem[], resolution: Resolution, max: number) {
  const maxUsd = parseMaxUsd(process.argv.includes("--max-usd") ? (arg("max-usd") ?? "") : undefined);
  const refFiles = parseRefs(process.argv, CANDIDATES);
  const log = path.join(CANDIDATES, "log.jsonl");
  /**
   * A futás pillanatképe: a költségkönyv összege, a meglévő jelöltek és az ezekből számolt terv. Az előnézet (kiírás, száraz futás)
   * és az ÉLES futás is ezt hívja — az éles a futás-zár megszerzése UTÁN, hogy ne egy közben lefutott másik futás előtti
   * állapotból dolgozzon (PR #519 review).
   */
  const takeSnapshot = () => {
    const ledger = existsSync(log) ? readLedger(readFileSync(log, "utf8")) : { spentUsd: 0, corruptLines: [] };
    const alreadySpent = ledger.spentUsd;
    // Minden jelölt a készlet mappájában (nem csak a most kért tételeké): ha van kép, de nincs napló, a keret nem nyílhat újra.
    const candidateFiles = manifest.items.reduce((n, item) => {
      const dir = path.join(CANDIDATES, item.id);
      return n + (existsSync(dir) ? readdirSync(dir).filter(f => IMAGE_FILE.test(f)).length : 0);
    }, 0);
    const problem = ledgerProblem({ logExists: existsSync(log), candidateFiles, corruptLines: ledger.corruptLines });
    const existing: Record<string, number> = {};
    for (const item of items) {
      const dir = path.join(CANDIDATES, item.id);
      existing[item.id] = existsSync(dir) ? readdirSync(dir).filter(f => IMAGE_FILE.test(f)).length : 0;
    }
    const plan = planJobs(items, { resolution, max, maxUsd, existing, alreadySpent });
    return { alreadySpent, problem, plan, missing: missingReferences(plan.jobs, new Set(Object.keys(refFiles))) };
  };
  // Előnézet (zár nélkül): csak kiírásra, száraz futásra és a korai megállásra — az éles futás NEM ebből dolgozik.
  const preview = takeSnapshot();
  const { plan, problem, missing } = preview;
  console.log(`${plan.jobs.length} kép · becsült költség ≈ ${plan.totalUsd.toFixed(2)} USD (${manifest.model}, készlet: ${SET})`);
  if (preview.alreadySpent > 0 || plan.skippedExisting > 0) console.log(`Eddig elszámolva (napló): ≈ ${preview.alreadySpent.toFixed(2)} USD · már meglévő jelölt, nem készül újra: ${plan.skippedExisting}`);
  if (maxUsd !== null) console.log(`Keret: ${maxUsd} USD összesen · a futás után várhatóan elszámolva: ≈ ${(preview.alreadySpent + plan.totalUsd).toFixed(2)} USD`);
  if (plan.cutBy === "max") console.log(`KORLÁT: a kért ${plan.requested} képből csak ${plan.jobs.length} fut (--max ${max}).`);
  if (plan.cutBy === "max-usd") console.log(`KÖLTSÉGPLAFON: a kért ${plan.requested} képből csak ${plan.jobs.length} fér a keretbe (--max-usd ${maxUsd}).`);
  if (maxUsd === null) console.log("FIGYELEM: nincs költségplafon (--max-usd) — éles futás csak plafonnal indul.");
  if (problem) console.log(`NAPLÓHIBA: ${problem}`);
  if (missing.length) console.log(`HIÁNYZÓ REFERENCIA: ${missing.join(", ")} — add meg a kiválasztott képet: --ref <azonosító>=<fájl a candidates/${SET}/ alatt>`);
  if (flag("dry-run")) {
    const seen = new Set<string>();
    for (const job of plan.jobs) {
      if (seen.has(job.item.id)) continue;
      seen.add(job.item.id);
      const count = plan.jobs.filter(j => j.item.id === job.item.id).length;
      console.log(`- ${job.item.id} [${job.item.kind} ${job.item.aspect_ratio} · ${job.resolution} · ${count} jelölt · ≈ ${(count * job.estUsd).toFixed(3)} USD]\n  ${composePrompt(job.item, style)}`);
    }
    return;
  }
  if (maxUsd === null) throw new Error("Külön készlet éles futása csak --max-usd költségplafonnal indul.");
  if (missing.length) throw new Error("Külön készlet éles futása csak kiválasztott (--ref) vagy ugyanebben a futásban készülő stílus-referenciával indul.");
  if (problem) throw new Error(problem);
  const key = readKey();
  await runUnderLock({
    acquire: () => acquireRunLock(CANDIDATES),
    snapshot: takeSnapshot,
    run: async (live) => {
  // A zár alatt újraolvasott állapot az irányadó: ha közben egy másik futás költött vagy jelöltet gyártott, ebből látszik.
  if (live.problem) throw new Error(live.problem);
  if (live.missing.length) throw new Error("Külön készlet éles futása csak kiválasztott (--ref) vagy ugyanebben a futásban készülő stílus-referenciával indul.");
  if (Math.abs(live.alreadySpent - preview.alreadySpent) > 1e-9 || live.plan.jobs.length !== plan.jobs.length) {
    console.log(`FRISSÍTVE a futás-zár alatt (közben másik futás dolgozott): ${live.plan.jobs.length} kép · eddig elszámolva ≈ ${live.alreadySpent.toFixed(2)} USD · a futás után várhatóan ≈ ${(live.alreadySpent + live.plan.totalUsd).toFixed(2)} / ${maxUsd} USD`);
  }
  const budget: Budget = { spent: live.alreadySpent, maxUsd };
  const madeThisRun = new Set<string>();
  const reference = (id: string): string | null => {
    if (refFiles[id]) return dataUrl(refFiles[id]!);
    if (!madeThisRun.has(id)) return null;
    const dir = path.join(CANDIDATES, id);
    const latest = existsSync(dir) ? readdirSync(dir).filter(f => IMAGE_FILE.test(f)).sort().at(-1) : undefined;
    return latest ? dataUrl(path.join(dir, latest)) : null;
  };
  const ctx: Ctx = { manifest, style, key, log, budget, reference };
  const outcome = await runJobs({
    jobs: live.plan.jobs,
    chosenRefs: new Set(Object.keys(refFiles)),
    generate: async (job) => {
      const one = await generateOne(job.item, job.resolution, ctx);
      if (one.saved) madeThisRun.add(job.item.id);
      return one;
    },
  });
  if (outcome.stopped === "budget") console.log(`KÖLTSÉGPLAFON elérve (${budget.spent.toFixed(2)} / ${maxUsd} USD) — megállok.`);
  if (outcome.stopped === "reference") console.log(`REFERENCIA NÉLKÜL NEM FOLYTATOM: a(z) ${outcome.missingRef} ebben a futásban nem készült el — a rá épülő képek nem készülnek el referencia nélkül.`);
  console.log(`Kész: ${outcome.made} kép. Elszámolva összesen (becsült ár, a sikertelen hívásokkal együtt): ≈ ${budget.spent.toFixed(2)} / ${maxUsd} USD. Válogatóoldal: npx tsx scripts/design-assets/review-page.ts --set ${SET}`);
    },
  });
}

async function main() {
  const manifest = JSON.parse(readFileSync(path.join(ASSETS, "prompts.json"), "utf8")) as AssetManifest;
  const style = loadStyle(readFileSync(path.join(ASSETS, "style.md"), "utf8"));
  const only = arg("only")?.split(",").map(s => s.trim()).filter(Boolean);
  const max = parseMax(process.argv.includes("--max") ? (arg("max") ?? "") : undefined);
  const resolution = parseResolution(process.argv.includes("--resolution") ? (arg("resolution") ?? "") : undefined);
  if (SET) { await runSet(manifest, style, manifest.items.filter(i => (only ? only.includes(i.id) : true)), resolution, max); return; }
  let items = manifest.items.filter(i => (only ? only.includes(i.id) : flag("trial") ? i.trial : true));
  if (items.length > max) { console.log(`Csak az első ${max} tétel fut (--max).`); items = items.slice(0, max); }
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
  const ctx: Ctx = { manifest, style, key, log, budget: null };
  for (const item of items) spent += (await generateOne(item, resolution, ctx)).estUsd;
  console.log(`Kész. Becsült költés: ≈ ${spent.toFixed(2)} USD. Válogatóoldal: npx tsx scripts/design-assets/review-page.ts`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "A generálás nem sikerült."); process.exitCode = 1; });
