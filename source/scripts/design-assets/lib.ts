/** Websuli képkészlet — tiszta, tesztelhető segédfüggvények (docs/specs/2026-10-17-websuli-kepkeszlet.md). */
export type AssetKind = "mascot" | "hero" | "icon" | "cover" | "background" | "door" | "scene" | "ornament";
export type AssetBand = "explorer" | "adventure" | "studio" | "laboratory" | "future" | "advent";
export type AssetItem = {
  id: string; kind: AssetKind; band: AssetBand; subjects: string[]; keywords: string[]; alt: string;
  aspect_ratio: string; prompt: string; references?: string[]; trial?: boolean;
  /** Külön készletnél (`--set`): hány jelölt készüljön a tételből (alap: 1), és milyen felbontásban (alap: a `--resolution`). */
  candidates?: number; resolution?: "1K" | "2K";
};
export type AssetManifest = { model: string; items: AssetItem[] };
export type Style = { common: string; band: Record<string, string>; kind: Record<string, string> };

/** A style.md „COMMON:”, „BAND_X:”, „KIND_X:” sorai (a prefix után a sor vége a szöveg). */
export function loadStyle(markdown: string): Style {
  const style: Style = { common: "", band: {}, kind: {} };
  for (const line of markdown.split(/\r?\n/)) {
    const m = /(COMMON|BAND_([A-Z]+)|KIND_([A-Z]+)):\s*(.+)$/.exec(line);
    if (!m) continue;
    if (m[1] === "COMMON") style.common = m[4].trim();
    else if (m[2]) style.band[m[2].toLowerCase()] = m[4].trim();
    else if (m[3]) style.kind[m[3].toLowerCase()] = m[4].trim();
  }
  return style;
}

export function composePrompt(item: AssetItem, style: Style): string {
  const band = style.band[item.band];
  const kind = style.kind[item.kind];
  if (!style.common || !band || !kind) throw new Error(`${item.id}: hiányzó stílusleírás (${item.band}/${item.kind}).`);
  return [item.prompt, kind, band, style.common].join(" ");
}

/** A Seedream 5.0 Pro képkérése (POST /api/v1/images); a kulcs nem része a törzsnek. */
export type Resolution = "1K" | "2K";
export function buildImageRequest(model: string, item: AssetItem, style: Style, references: string[], resolution: Resolution = "2K") {
  return {
    model, prompt: composePrompt(item, style), aspect_ratio: item.aspect_ratio, resolution, n: 1,
    ...(references.length ? { input_references: references.map(url => ({ type: "image_url", image_url: { url } })) } : {}),
  };
}

/** Az OpenRouter-ár (2026-10-17, /endpoints): 2K kép 0,09 USD, 1K kép 0,045 USD, referenciakép 0,003 USD. */
export function estimateUsd(images: number, references: number, resolution: Resolution = "2K"): number {
  return images * (resolution === "1K" ? 0.045 : 0.09) + references * 0.003;
}

/** Külön készlet neve (`--set advent` → design-assets/advent/): csak kisbetű, szám, kötőjel — útvonal nem lehet. */
export function parseSetName(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(raw) || raw === "candidates") throw new Error(`Hibás --set érték: ${raw}.`);
  return raw;
}

export const MAX_USD_CEILING = 20;

/** A `--max-usd` költségplafon: pozitív szám; hiányzó érték: nincs plafon. */
export function parseMaxUsd(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  if (!/^\d+(\.\d+)?$/.test(raw.trim()) || !(Number(raw) > 0)) throw new Error(`Hibás --max-usd érték: ${raw} (pozitív szám kell).`);
  // Elütés elleni felső korlát (pl. 70 a 7 helyett): ennél nagyobb keret csak a kód módosításával adható.
  if (Number(raw) > MAX_USD_CEILING) throw new Error(`Hibás --max-usd érték: ${raw} (legfeljebb ${MAX_USD_CEILING}).`);
  return Number(raw);
}

/** Tételenként legfeljebb ennyi jelölt (elütés ellen: 100 a 10 helyett) — nagyobb csak a kód módosításával (vak ellenőr KICSI-1). */
export const MAX_CANDIDATES = 10;

/** A tétel jelöltszáma: hiányzó érték 1; egyébként 1 és MAX_CANDIDATES közötti egész, különben hibaüzenet. */
export function candidatesOf(item: AssetItem): number {
  const raw: unknown = item.candidates;
  if (raw === undefined) return 1;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > MAX_CANDIDATES) {
    throw new Error(`${item.id}: hibás candidates érték: ${JSON.stringify(raw) ?? String(raw)} (1–${MAX_CANDIDATES} közötti egész szám).`);
  }
  return raw;
}

export type ImageJob = { item: AssetItem; resolution: Resolution; estUsd: number };
export type JobPlan = { jobs: ImageJob[]; totalUsd: number; requested: number; skippedExisting: number; cutBy: "max" | "max-usd" | null };

/**
 * A futás képenkénti terve (spec 2026-11-18-adventi-naptar 13.6, 18.): tételenként `candidates` kép a tétel saját
 * felbontásával, a már MEGLÉVŐ jelöltek (`existing`) levonásával — a teljes kör nem gyártja újra a próbakör képeit. A `max` a
 * KÉPEK számát korlátozza; a `maxUsd` ÖSSZESÍTETT plafon: az `alreadySpent` (a napló eddigi összege) a kezdőérték, és az a kép,
 * amellyel a becsült összeg túllépné, már nem kerül a tervbe (és utána egy sem). Tiszta függvény: a száraz és az éles futás
 * ugyanebből dolgozik; az éles futás hívásonként is ellenőriz (`attemptWithinBudget`).
 */
export function planJobs(
  items: readonly AssetItem[],
  opts: { resolution: Resolution; max: number; maxUsd: number | null; existing?: Readonly<Record<string, number>>; alreadySpent?: number },
): JobPlan {
  let skippedExisting = 0;
  const all: ImageJob[] = items.flatMap(item => {
    const resolution = item.resolution ?? opts.resolution;
    const estUsd = estimateUsd(1, item.references?.length ?? 0, resolution);
    const wanted = candidatesOf(item);
    const have = Math.min(wanted, Math.max(0, opts.existing?.[item.id] ?? 0));
    skippedExisting += have;
    return Array.from({ length: wanted - have }, () => ({ item, resolution, estUsd }));
  });
  const jobs: ImageJob[] = [];
  const start = opts.alreadySpent ?? 0;
  let totalUsd = 0;
  let cutBy: JobPlan["cutBy"] = null;
  for (const job of all) {
    if (jobs.length >= opts.max) { cutBy = "max"; break; }
    if (opts.maxUsd !== null && start + totalUsd + job.estUsd > opts.maxUsd + 1e-9) { cutBy = "max-usd"; break; }
    jobs.push(job);
    totalUsd += job.estUsd;
  }
  return { jobs, totalUsd, requested: all.length, skippedExisting, cutBy };
}

/** Összesített költségkeret (becsült áron): a `spent` minden elindított hívással nő. */
export type Budget = { spent: number; readonly maxUsd: number };
export function canSpend(budget: Budget, estUsd: number): boolean {
  return budget.spent + estUsd <= budget.maxUsd + 1e-9;
}

/**
 * Hívásonkénti keretkezelés (review B1): minden HÍVÁS előtt ellenőrzés, a hívás indításakor elszámolás — a sikertelen hívás is
 * a keretbe számít, és ha a következő hívás már nem fér bele, NEM indul el. `budget: null` = a régi készlet útja (keret nélkül).
 */
export async function attemptWithinBudget(opts: {
  budget: Budget | null;
  estUsd: number;
  maxAttempts: number;
  /** A hívás INDÍTÁSA előtt fut (a keret már terhelve): ide kerül az „indult” naplósor, hogy megszakítás se vesszen el (L5). */
  onStart?: (n: number) => void;
  attempt: (n: number) => Promise<void>;
  onError: (n: number, error: unknown) => void;
}): Promise<{ saved: boolean; attempts: number; stoppedByBudget: boolean }> {
  for (let n = 1; n <= opts.maxAttempts; n++) {
    if (opts.budget) {
      if (!canSpend(opts.budget, opts.estUsd)) return { saved: false, attempts: n - 1, stoppedByBudget: true };
      opts.budget.spent += opts.estUsd;
    }
    opts.onStart?.(n);
    try {
      await opts.attempt(n);
      return { saved: true, attempts: n, stoppedByBudget: false };
    } catch (error) {
      opts.onError(n, error);
    }
  }
  return { saved: false, attempts: opts.maxAttempts, stoppedByBudget: false };
}

/**
 * A szolgáltató valódi ára (vak ellenőr KICSI-2): ha a válasz `usage.cost` mezője véges, nemnegatív szám és nagyobb a becslésnél,
 * a különbözet is a keretbe terhelődik (`max(becslés, valódi ár)`), és a visszaadott értéket a hívó az „ok” naplósor `extraUsd`
 * mezőjébe írja — így a könyv is a valódi árból számol. Olcsóbb vagy hiányzó valódi árnál marad a becslés (0 a különbözet).
 */
export function settleActualCost(budget: Budget | null, estUsd: number, usage: unknown): number {
  const cost = usage && typeof usage === "object" ? (usage as { cost?: unknown }).cost : undefined;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0) return 0;
  const extra = Math.max(0, cost - estUsd);
  if (budget && extra > 0) budget.spent += extra;
  return extra;
}

/**
 * A készlet naplója mint költségkönyv: minden `estUsd` és `extraUsd` mező összege. Új alak: a hívás ELŐTT „started” sor viszi az `estUsd`-t
 * (a lezáró „ok” / „error” sor már nem — azok `imageUsd`-t írnak), a régi alakban az „ok” / „error” sor viszi; a kettő keverhető.
 * A sérült sorok sorszámát visszaadja: éles futás sérült naplóval NEM indul (review G2) — a keret nem maradhat alulbecsülve.
 */
export function readLedger(logText: string): { spentUsd: number; corruptLines: number[] } {
  let spentUsd = 0;
  const corruptLines: number[] = [];
  logText.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const row = JSON.parse(line) as { estUsd?: unknown; extraUsd?: unknown } | null;
      if (!row || typeof row !== "object") { corruptLines.push(index + 1); return; }
      if (typeof row.estUsd === "number" && Number.isFinite(row.estUsd) && row.estUsd > 0) spentUsd += row.estUsd;
      // A valódi ár becslés feletti része (settleActualCost) az „ok” soron.
      if (typeof row.extraUsd === "number" && Number.isFinite(row.extraUsd) && row.extraUsd > 0) spentUsd += row.extraUsd;
    } catch { corruptLines.push(index + 1); }
  });
  return { spentUsd, corruptLines };
}

/** A napló eddigi becsült összege (a sérült sorok nélkül — az éles futás előtt a `ledgerProblem` dönt). */
export function spentFromLog(logText: string): number {
  return readLedger(logText).spentUsd;
}

/**
 * Indulhat-e éles futás ezzel a naplóval (review G1, G2)? Hiba: a napló hiányzik, de már vannak jelöltek (a keret 0-ról nyílna
 * újra), vagy a naplóban sérült sor van. `null` = rendben.
 */
export function ledgerProblem(input: { logExists: boolean; candidateFiles: number; corruptLines: readonly number[] }): string | null {
  if (!input.logExists && input.candidateFiles > 0) {
    return `A költségnapló (log.jsonl) hiányzik, de ${input.candidateFiles} jelölt már van a mappában — a keret nem nyitható újra 0-ról. Állítsd vissza a naplót, vagy egyeztesd a tulajdonossal a már elköltött összeget.`;
  }
  if (input.corruptLines.length > 0) {
    return `A költségnapló (log.jsonl) sérült sort tartalmaz (sor: ${input.corruptLines.join(", ")}) — az elköltött összeg nem állapítható meg biztosan. Javítsd a naplót az éles futás előtt.`;
  }
  return null;
}

/**
 * A terv képeinek sorra vétele (review L6): egy kép csak akkor készül, ha minden referenciája megvan — kiválasztva (`--ref`) vagy
 * ebben a futásban SIKERESEN elkészülve. Ha a futásban készülő referencia mind elbukott, a rá épülő képek NEM készülnek el
 * referencia nélkül (fizetősen, eltérő stílusban): a futás megáll.
 */
export async function runJobs(opts: {
  jobs: readonly ImageJob[];
  chosenRefs: ReadonlySet<string>;
  generate: (job: ImageJob) => Promise<{ saved: boolean; stoppedByBudget: boolean }>;
}): Promise<{ made: number; stopped: "budget" | "reference" | null; missingRef: string | null }> {
  const madeIds = new Set<string>();
  let made = 0;
  for (const job of opts.jobs) {
    const missingRef = (job.item.references ?? []).find(ref => !opts.chosenRefs.has(ref) && !madeIds.has(ref));
    if (missingRef) return { made, stopped: "reference", missingRef };
    const one = await opts.generate(job);
    if (one.saved) { made++; madeIds.add(job.item.id); }
    if (one.stoppedByBudget) return { made, stopped: "budget", missingRef: null };
  }
  return { made, stopped: null, missingRef: null };
}

/**
 * Éles futás a futás-zár VÉDELMÉBEN (PR #519 review): a pillanatkép (költségkönyv, meglévő jelöltek, terv) a zár megszerzése UTÁN
 * készül, és a futás csak ebből dolgozik. Így a másodikként zároló folyamat nem számol egy közben lefutott másik futás előtti
 * állapotból — nem költhet a plafon fölé, és nem gyártja újra a már elkészült jelölteket. A zár hiba esetén is felszabadul.
 */
export async function runUnderLock<S, R>(opts: { acquire: () => () => void; snapshot: () => S; run: (state: S) => Promise<R> }): Promise<R> {
  const release = opts.acquire();
  try {
    return await opts.run(opts.snapshot());
  } finally {
    release();
  }
}

export const IMAGE_TIMEOUT_MS = 180_000;

/** Egy képkérés a szolgáltatóhoz, időkorláttal; a kulcs csak a fejlécben megy, a hibaszöveg kitakarva. */
export async function requestImage(
  fetchImpl: typeof fetch,
  opts: { endpoint: string; key: string; body: unknown; timeoutMs?: number },
): Promise<{ bytes: Buffer; ext: "jpg" | "webp" | "png"; usage: unknown }> {
  const res = await fetchImpl(opts.endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.key}`, "Content-Type": "application/json", "HTTP-Referer": "https://websuli.vip", "X-Title": "WebSuli design assets" },
    body: JSON.stringify(opts.body),
    signal: AbortSignal.timeout(opts.timeoutMs ?? IMAGE_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${redactClip(text, opts.key, 300)}`);
  const json = JSON.parse(text) as { data?: Array<{ b64_json?: string; media_type?: string }>; usage?: unknown };
  const img = json.data?.[0];
  if (!img?.b64_json || !/^image\//.test(img.media_type ?? "image/png")) throw new Error("Üres vagy nem képtípusú válasz.");
  const ext = img.media_type === "image/jpeg" ? "jpg" : img.media_type === "image/webp" ? "webp" : "png";
  return { bytes: Buffer.from(img.b64_json, "base64"), ext, usage: json.usage ?? null };
}

/**
 * `--ref <azonosító>=<fájl>` (ismételhető): a stílus-referencia a tulajdonos által KIVÁLASZTOTT jelölt. A fájl a készlet
 * jelöltmappáján BELÜL legyen (útvonal-kilépés tiltva); a visszaadott érték az abszolút útvonal.
 */
export function parseRefs(argv: readonly string[], candidatesDir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const root = candidatesDir.replace(/[\\/]+$/, "");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== "--ref") continue;
    const raw = argv[i + 1] ?? "";
    const m = /^([a-z0-9][a-z0-9-]{0,63})=(.+)$/.exec(raw);
    if (!m) throw new Error(`Hibás --ref érték: ${raw} (alak: <azonosító>=<fájl>).`);
    const rel = m[2]!.replace(/\\/g, "/");
    if (rel.startsWith("/") || /^[A-Za-z]:/.test(rel) || rel.split("/").some(part => part === ".." || part === "") || !/\.(png|jpe?g|webp)$/.test(rel)) {
      throw new Error(`Hibás --ref fájl: ${m[2]} (képfájl a jelöltmappán belül).`);
    }
    out[m[1]!] = `${root}/${rel}`;
  }
  return out;
}

/**
 * Mely referenciák hiányoznak a tervhez: egy tétel referenciája akkor rendben, ha `--ref`-fel ki van választva, VAGY ugyanebben
 * a futásban, a tétel ELŐTT készül (próbakör). Különben a legfrissebb jelölt csendben referencia lenne — ezt nem engedjük.
 */
export function missingReferences(jobs: readonly ImageJob[], chosen: ReadonlySet<string>): string[] {
  const made = new Set<string>();
  const missing = new Set<string>();
  for (const job of jobs) {
    for (const ref of job.item.references ?? []) if (!chosen.has(ref) && !made.has(ref)) missing.add(ref);
    made.add(job.item.id);
  }
  return [...missing].sort();
}

/** Spec 2026-11-03-leckeborito: a `--resolution` kapcsoló (1K a 1200 px-es borítóhoz elég); hiányzó érték: 2K. */
export function parseResolution(raw: string | undefined): Resolution {
  if (raw === undefined) return "2K";
  if (raw !== "1K" && raw !== "2K") throw new Error(`Hibás --resolution érték: ${raw} (1K vagy 2K).`);
  return raw;
}

/** Review #273: a fizetős hívások darabkorlátja csak nemnegatív, biztonságos egész lehet; hiányzó érték esetén az alapértelmezés. */
export function parseMax(raw: string | undefined, fallback = 12): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw.trim())) throw new Error(`Hibás --max érték: ${raw} (nemnegatív egész kell).`);
  const n = Number(raw.trim());
  if (!Number.isSafeInteger(n)) throw new Error(`Hibás --max érték: ${raw}.`);
  return n;
}

export type GenerationRecord = { model: string; promptHash: string };
/**
 * Review #273: a kiválasztott fájl eredete a SAJÁT sikeres generálási naplóbejegyzéséből (log.jsonl), nem az aktuális manifestből —
 * ha a prompt vagy a stílus azóta változott, a katalógus akkor is a kép valódi eredetét rögzíti. Hiányzó bejegyzés: hiba.
 */
export function provenanceFor(logText: string, relFile: string): GenerationRecord {
  const want = relFile.replace(/\\/g, "/");
  for (const line of logText.split(/\r?\n/).reverse()) {
    if (!line.trim()) continue;
    let row: { status?: string; file?: string; model?: string; promptHash?: string };
    try { row = JSON.parse(line); } catch { continue; } // sérült sor: kihagyjuk, a keresés folytatódik
    if (row.status === "ok" && row.file?.replace(/\\/g, "/") === want && row.model && row.promptHash) return { model: row.model, promptHash: row.promptHash };
  }
  throw new Error(`Nincs sikeres generálási naplóbejegyzés ehhez a fájlhoz: ${relFile}`);
}

/** A kulcs és bármely Bearer-token kitakarása szöveges hibából vagy naplóból. */
export function redact(text: string, key: string): string {
  let out = key ? text.split(key).join("[kulcs]") : text;
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [kulcs]").replace(/sk-or-[A-Za-z0-9_-]+/g, "[kulcs]");
  return out;
}

/** Token-karakter az elővágáshoz: betű, szám, `+ / = _ - . ~ % \ @` (mint a kapuk `isCutRunChar`-ja). */
const isCutRunChar = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
  || c === 43 || c === 47 || c === 61 || c === 95 || c === 45 || c === 46 || c === 126 || c === 37 || c === 92 || c === 64;

/**
 * Elővágás (docs/specs/2026-11-22-kitakaro-elovagas.md) a régi `redact(text, key).slice(0, max)` helyett: a forrás
 * `max + max(64, kulcshossz)` karakterre vágva; a vágásponton átnyúló pontos kulcs-előfordulás és token-futás teljesen kimarad
 * (lineáris hátrálás), utána a változatlan `redact`, majd `slice(0, max)`. A kimenet a régi kimenet előtagja.
 */
export function redactClip(input: string | null | undefined, keyIn: string | null | undefined, max: number): string {
  const text = String(input ?? ""); // 1. vak kör L5: hiányzó szöveg → üres eredmény
  const key = keyIn ?? "";
  let p = max + Math.max(64, key.length);
  if (text.length <= p) return redact(text, key).slice(0, max);
  for (;;) {
    const before = p;
    if (key) {
      const from = Math.max(0, p - key.length + 1);
      const q = text.slice(from, p + key.length - 1).indexOf(key);
      if (q >= 0 && from + q < p) p = from + q;
    }
    if (p > 0 && isCutRunChar(text.charCodeAt(p)) && isCutRunChar(text.charCodeAt(p - 1))) {
      while (p > 0 && isCutRunChar(text.charCodeAt(p - 1))) p--;
    }
    // 1. vak kör L2: befejezetlen főági Bearer-egyezés (`Bearer` + whitespace a vágás előtt) teljesen kimarad.
    let k = p;
    while (k > 0 && /\s/.test(text[k - 1])) k--;
    if (k < p && k >= 6 && text.slice(k - 6, k) === "Bearer") p = k - 6;
    if (p === before) return redact(text.slice(0, p), key).slice(0, max);
  }
}
