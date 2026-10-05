import { studioConnection, withQuotaFailover } from "../ai/studio-provider";
/**
 * #163 — OCR layer for image sources (owner decision, 2026-09-05).
 *
 * Why: images carry no searchable text, so the D1 verbatim check could never
 * verify a quote from a photo source — every concept stayed "Nem igazolt" and
 * the map could not be approved. A CHEAP vision model transcribes each image
 * ONCE at extraction time; the transcript joins the stored sourceText that
 * both the initial check and the admin's "Forrás-ellenőrzés újra" run against.
 *
 * Cost control (owner requirement): the transcription runs on the cheap `ocr`
 * model (resolveStudioModel("ocr"), see models.ts), never on the
 * expensive extract model — and the client downscales photos before upload
 * (shared/studio-ui.ts downscaleTargetOf), so fewer pixels reach the model.
 *
 * Fail-open by design: a failed OCR yields empty text for that image and the
 * extraction continues — the teacher can still fix quotes by hand; a model
 * outage must not lose a 40-concept run.
 */

import { createHash } from "node:crypto";

import { logger } from "../lib/logger";
import type { ExtractorFile } from "./extractor";
import { withRoleSkill } from "./role-skills";

export type OcrResult = { name: string; text: string };

export type OcrFn = (file: ExtractorFile) => Promise<string>;

/**
 * #170 — hány kép megy egyszerre az olcsó vision-modellre. Mérve: egy kép
 * 40-90 s; 10 kép szekvenciálisan 7-15 perc volt (a Render eközben újraindult
 * és minden veszett). 3-as poollal ugyanez ~2-4 perc, provider-barát ütemben.
 */
const OCR_CONCURRENCY = 3;

/** Egy kép OCR-hívása, bukásnál üres átirat (fail-open) — a futás sosem hal meg. */
async function ocrOne(file: ExtractorFile, ocr: OcrFn): Promise<OcrResult> {
  try {
    return { name: file.name, text: await ocr(file) };
  } catch (error) {
    logger.warn(
      `[STUDIO/OCR] A(z) ${file.name} átirata nem készült el (${error instanceof Error ? error.message : String(error)}) — üres szöveggel folytatjuk.`,
    );
    return { name: file.name, text: "" };
  }
}

/**
 * Transcribe the image files only; other kinds already carry their text.
 * #170: bounded parallel pool — output order matches input order, progress
 * reports COMPLETED count (nem "melyik indul", hanem "hány kész").
 */
export async function ocrTextsOf(
  files: ExtractorFile[],
  ocr: OcrFn,
  onProgress?: (done: number, total: number) => void,
): Promise<OcrResult[]> {
  const images = files.filter((f) => f.kind === "image");
  const out: OcrResult[] = new Array(images.length);
  let next = 0;
  let done = 0;
  onProgress?.(0, images.length);

  async function worker(): Promise<void> {
    while (next < images.length) {
      const index = next++;
      out[index] = await ocrOne(images[index], ocr);
      done++;
      onProgress?.(done, images.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(OCR_CONCURRENCY, images.length) }, () => worker()));
  return out;
}

/* ------------------------------------------------------------------ *
 * #170 — tartalom-hash átirat-cache: ugyanazt a képet SOHA nem fizetjük
 * ki kétszer, és restart utáni újrafutásnál a kész átiratok ingyen vannak.
 * ------------------------------------------------------------------ */

export type OcrCacheStore = {
  get(key: string): Promise<string | null>;
  put(key: string, text: string): Promise<void>;
};

/** Determinista kulcs: a kép tartalma + a modell (más modell átirata más). */
export function ocrCacheKeyOf(imageContent: string, model: string, prompt = OCR_SYSTEM_PROMPT): string {
  return createHash("sha256").update(JSON.stringify([model, prompt, imageContent])).digest("hex");
}

/**
 * Cache-elő burkolat egy OcrFn köré. Találat: nulla modellhívás. Miss: hívás,
 * és a NEM ÜRES átirat mentése (a bukott/üres OCR nincs cache-elve, hogy a
 * következő futás újrapróbálhassa). A cache-hiba sosem dönti be a hívást.
 */
export function withOcrCache(ocr: OcrFn, model: string, store: OcrCacheStore, shouldStore: (file: ExtractorFile) => boolean = () => true): OcrFn {
  return async (file: ExtractorFile) => {
    const key = ocrCacheKeyOf(file.content, model);
    try {
      const hit = await store.get(key);
      if (hit !== null && hit.trim() !== "") {
        logger.info(`[STUDIO/OCR] Átirat cache-ből: ${file.name}`);
        return hit;
      }
    } catch {
      /* cache-olvasási hiba: megyünk a modellre */
    }
    const text = await ocr(file);
    if (text.trim() !== "" && shouldStore(file)) {
      try {
        await store.put(key, text);
      } catch {
        /* cache-írási hiba: az átirat attól még megvan */
      }
    }
    return text;
  };
}

/* ------------------------------------------------------------------ *
 * Spec 2026-09-23 — KETTŐS OLVASÁS kézírásra/fotóra.
 *
 * Mérve élesben (map 2c43327f, kézírásos füzet): egyetlen olvasat „bódex”, „bézzel”,
 * „föld-változása” hibákat adott, és ezek a térképen át a leckébe kerültek. Két független
 * modellcsalád ritkán téved ugyanott ugyanúgy: az eltérés a gyanús hely. Csak eltérésnél
 * fut döntő hívás (a képpel együtt), és a döntés determinisztikus őrön megy át: kizárólag
 * az eltérő helyeken változtathat, és ott is csak a két olvasat egyikét (vagy tőlük ≤ 2
 * betűben eltérő alakot) írhatja. Ha az őr bukik vagy bármely hívás hibázik: az első olvasat.
 * ------------------------------------------------------------------ */

export type OcrDisagreement = { first: string; second: string };

const ocrTokens = (text: string) => text.split(/\s+/).filter(Boolean);
const tokenKey = (t: string) => t.toLowerCase().normalize("NFC").replace(/[.,;:!?()„”"'«»]/g, "");

/** Word-level LCS diff; returns the differing spans (first-read side, second-read side). */
export function ocrDisagreements(first: string, second: string): OcrDisagreement[] {
  const a = ocrTokens(first);
  const b = ocrTokens(second);
  if (a.length * b.length > 4_000_000) return a.join(" ") === b.join(" ") ? [] : [{ first, second }];
  const dp: Uint16Array[] = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = tokenKey(a[i]) === tokenKey(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: OcrDisagreement[] = [];
  let i = 0, j = 0, spanA: string[] = [], spanB: string[] = [];
  const flush = () => {
    if (spanA.length || spanB.length) out.push({ first: spanA.join(" "), second: spanB.join(" ") });
    spanA = []; spanB = [];
  };
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && tokenKey(a[i]) === tokenKey(b[j])) { flush(); i++; j++; }
    else if (j >= b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) spanA.push(a[i++]);
    else spanB.push(b[j++]);
  }
  flush();
  return out;
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let x = 1; x <= a.length; x++) {
    let diag = prev[0];
    prev[0] = x;
    for (let y = 1; y <= b.length; y++) {
      const up = prev[y];
      prev[y] = Math.min(prev[y] + 1, prev[y - 1] + 1, diag + (a[x - 1] === b[y - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/**
 * The guard: compared with the FIRST read, the adjudicated text may change only spans that
 * were in dispute, and each changed span must be one of the two readings or ≤2 edits from one.
 */
export function adjudicationStaysInDispute(first: string, adjudicated: string, disputes: OcrDisagreement[]): boolean {
  const allowed = disputes.flatMap((d) => [d.first, d.second]).map((s) => ocrTokens(s).map(tokenKey).join(" "));
  return ocrDisagreements(first, adjudicated).every((change) => {
    const got = ocrTokens(change.second).map(tokenKey).join(" ");
    const was = ocrTokens(change.first).map(tokenKey).join(" ");
    const disputed = allowed.some((s) => s === was || (was !== "" && s.includes(was)));
    return disputed && allowed.some((s) => s === got || (got !== "" && s !== "" && editDistance(s, got) <= 2));
  });
}

/**
 * Spec 2026-10-05-s11 (mért: Mezopotámia-füzet, „Kesia, Föld - Felt.” ↔ a valós „Ázsia, Közel-Kelet”): a döntő olvasás után a
 * vita nyoma eddig elveszett, a téves olvasat tényként került a térképbe. Az ÉRDEMI eltérés (a két olvasat > 2 szerkesztésre
 * különbözik) szakasza a döntő átiratban „⟦?⟧” jelet kap — a rá épülő fogalom nem lesz tény (pending).
 */
export const UNCERTAIN_MARK = "⟦?⟧";
export function markUnresolvedDisputes(decided: string, disputes: OcrDisagreement[]): string {
  let out = decided;
  for (const d of disputes) {
    const a = ocrTokens(d.first).map(tokenKey).join(" "), b = ocrTokens(d.second).map(tokenKey).join(" ");
    if (!a || !b || editDistance(a, b) <= 2) continue;
    // a döntő átiratban a választott olvasat (bármelyik), az első előfordulás, ha még nincs jelölve
    for (const span of [d.first, d.second].map((s) => s.trim()).filter(Boolean)) {
      const at = out.indexOf(span);
      if (at < 0) continue;
      const end = at + span.length;
      if (!out.startsWith(UNCERTAIN_MARK, end)) out = `${out.slice(0, end)}${UNCERTAIN_MARK}${out.slice(end)}`;
      break;
    }
  }
  return out;
}

/**
 * Spec 2026-10-05-s11/2 (tulajdonosi döntés): a jelölt (`⟦?⟧`) vitákat egy erős, FÜGGETLEN harmadik olvasat dönti el — 2 a 3-ból:
 * ha a harmadik olvasat (tokenre, szóhatáron) PONTOSAN az egyik vitatott olvasatot tartalmazza, az nyer, és a jel lekerül; egyezés
 * nélkül a jel marad. A harmadik olvasó nem ír új szöveget, csak választ a két meglévő közül. Mért: gpt-6.1-sol és Opus 5.5 a
 * Mezopotámia-füzetet szinte hibátlanul olvasta (a két alap-olvasó 11 helyen eltért).
 */
export function resolveByThirdReading(marked: string, disputes: OcrDisagreement[], third: string): string {
  const keyed = (s: string) => ` ${ocrTokens(s).map(tokenKey).filter(Boolean).join(" ")} `;
  const t3 = keyed(third);
  let out = marked;
  for (const d of disputes) {
    const a = keyed(d.first), b = keyed(d.second);
    if (a.trim() === "" || b.trim() === "") continue;
    const hasA = t3.includes(a), hasB = t3.includes(b);
    if (hasA === hasB) continue;
    const winner = hasA ? d.first.trim() : d.second.trim();
    for (const span of [d.first, d.second].map((s) => s.trim()).filter(Boolean)) {
      const markedSpan = `${span}${UNCERTAIN_MARK}`;
      const at = out.indexOf(markedSpan);
      if (at < 0) continue;
      out = `${out.slice(0, at)}${winner}${out.slice(at + markedSpan.length)}`;
      break;
    }
  }
  return out;
}

export type OcrAdjudicator = (file: ExtractorFile, first: string, disputes: OcrDisagreement[]) => Promise<string>;

/** Dual-read OCR for images; PDFs and failures fall back to the first read (fail-open, as before). */
/**
 * Audit 2026-09-24: a leromlott eredményt (egyik olvasó vagy a döntés hibázott) a cache NEM tárolhatja —
 * különben egy átmeneti 429/időtúllépés után az adott képre soha többé nem futna kettős olvasás.
 */
export type DualReadOcr = OcrFn & { degraded(file: ExtractorFile): boolean };

export function dualReadOcr(first: OcrFn, second: OcrFn, adjudicate: OcrAdjudicator, third?: OcrFn): DualReadOcr {
  const degradedFiles = new WeakSet<ExtractorFile>();
  // Spec 2026-10-05-s11/2: ha jelölt vita maradt, a független harmadik olvasat dönt (2 a 3-ból); hibánál a jelölt átirat marad.
  // `voter: null` = nincs független szavazó (a helyettesítő erős olvasat már az egyik olvasat) — NEM az alapértelmezett harmadik olvasó.
  const settle = async (file: ExtractorFile, marked: string, disputes: OcrDisagreement[], voter: OcrFn | null): Promise<string> => {
    if (!voter || !marked.includes(UNCERTAIN_MARK)) return marked;
    try {
      const resolved = resolveByThirdReading(marked, disputes, await voter(file));
      const left = resolved.split(UNCERTAIN_MARK).length - 1, before = marked.split(UNCERTAIN_MARK).length - 1;
      logger.info(`[STUDIO/OCR] ${file.name}: harmadik olvasat — ${before - left}/${before} vitatott hely feloldva (2 a 3-ból).`);
      return resolved;
    } catch (error) {
      logger.warn(`[STUDIO/OCR] ${file.name}: a harmadik olvasat hibázott (${error instanceof Error ? error.message : String(error)}) — a jelölt átirat marad.`);
      return marked;
    }
  };
  const read = async (file: ExtractorFile): Promise<string> => {
    degradedFiles.delete(file);
    if (file.kind !== "image") return first(file);
    const [a, b] = await Promise.allSettled([first(file), second(file)]);
    const usable = (r: PromiseSettledResult<string>) => (r.status === "fulfilled" && r.value.trim() ? r.value : null);
    let primary = usable(a), other = usable(b);
    let voter: OcrFn | null = third ?? null;
    // Spec 2026-10-05-s11/3 (mért: a második olvasó NÉMÁN kiesett → ellenőrizetlen egyetlen olvasat → „a Föld keleti térsége” tény lett):
    // a kiesés naplózva, és az erős olvasó lép a helyére — mindig két független olvasat.
    if (!primary || !other) {
      const failed = !primary ? a : b;
      const reason = failed.status === "rejected" ? (failed.reason instanceof Error ? failed.reason.message : String(failed.reason)) : "üres válasz";
      logger.warn(`[STUDIO/OCR] ${file.name}: ${!primary ? "az első" : "a második"} olvasó kiesett (${reason.slice(0, 200)})${third ? " — az erős olvasó lép a helyére." : "."}`);
      if (third) {
        try {
          const substitute = (await third(file)).trim();
          if (substitute) { if (!primary) primary = substitute; else other = substitute; voter = null; }
        } catch (error) {
          logger.warn(`[STUDIO/OCR] ${file.name}: az erős olvasó is kiesett (${error instanceof Error ? error.message : String(error)}).`);
        }
      }
      if (!primary || !other) {
        degradedFiles.add(file);
        if (primary || other) return (primary ?? other)!;
        throw a.status === "rejected" ? a.reason : new Error("Az OCR egyik olvasója sem adott szöveget.");
      }
    }
    const disputes = ocrDisagreements(primary, other);
    if (disputes.length === 0) return primary;
    logger.info(`[STUDIO/OCR] ${file.name}: a két olvasat ${disputes.length} helyen eltér — döntő olvasás a képpel.`);
    try {
      const decided = (await adjudicate(file, primary, disputes)).trim();
      if (decided && adjudicationStaysInDispute(primary, decided, disputes)) return settle(file, markUnresolvedDisputes(decided, disputes), disputes, voter);
      logger.warn(`[STUDIO/OCR] ${file.name}: a döntő olvasat a vitatott helyeken kívül is változtatott — az első olvasat marad.`);
    } catch (error) {
      logger.warn(`[STUDIO/OCR] ${file.name}: a döntő olvasás hibázott (${error instanceof Error ? error.message : String(error)}) — az első olvasat marad.`);
    }
    degradedFiles.add(file);
    // Spec 2026-10-05-s11 (mérve: a döntő olvasat elvetése után a vita nyoma elveszett — „Kesia, Föld - Felt.”, „határak” jel nélkül):
    // az első olvasat megtartásakor is jelölt az érdemi eltérés.
    return settle(file, markUnresolvedDisputes(primary, disputes), disputes, voter);
  };
  return Object.assign(read, { degraded: (file: ExtractorFile) => degradedFiles.has(file) });
}

export const OCR_ADJUDICATION_PROMPT = withRoleSkill("ocr", [
  "Two independent transcriptions of the same photographed Hungarian school page disagree in the listed places.",
  "Look at the image again and return the FIRST transcription unchanged EXCEPT at the listed disagreements, where you write what is actually on the page.",
  "At a disagreement, choose the reading that matches the handwriting; use the context only to decide between letter shapes (e.g. k/b, h/f), never to add or reword content.",
  "If the handwriting still does not decide a disagreement, write the more likely reading followed by the mark ⟦?⟧ — never a confident-looking guess.",
  "Output plain text only — the full corrected transcription.",
].join(" "));

/** The adjudication call: the image + the first read + the disputed spans. */
export async function callOcrAdjudicator(file: ExtractorFile, model: string, first: string, disputes: OcrDisagreement[]): Promise<string> {
  const OpenAI = (await import("openai")).default;
  return withQuotaFailover(studioConnection(model), async (connection) => {
  const client = new OpenAI({ baseURL: connection.baseURL, apiKey: connection.apiKey, timeout: 120000, maxRetries: 0 });
  const base = ocrRequestParams(connection.model, file.content);
  const text = `Első átirat:\n<<<\n${first}\n>>>\nEltérések (első olvasat → második olvasat):\n${disputes.slice(0, 80).map((d, n) => `${n + 1}. „${d.first}” ↔ „${d.second}”`).join("\n")}`;
  const params = { ...base, messages: [
    { role: "system" as const, content: OCR_ADJUDICATION_PROMPT },
    { role: "user" as const, content: [{ type: "text" as const, text }, ...base.messages[1].content] },
  ] };
  const request = ocrVendorRequest(connection.vendor, params);
  const response = await client.chat.completions.create(request as unknown as Parameters<typeof client.chat.completions.create>[0]);
  if ("choices" in response) {
    if (response.choices[0]?.finish_reason !== "stop") throw new Error("A döntő átirat csonkolt.");
    return response.choices[0]?.message?.content?.trim() ?? "";
  }
  return "";
  });
}

/** The searchable source text: base text sources + non-empty OCR transcripts. */
export function mergeOcrIntoSourceText(baseText: string, ocrResults: OcrResult[]): string {
  const parts = [baseText, ...ocrResults.filter((r) => r.text.trim() !== "").map((r) => r.text)];
  return parts.filter((p) => p !== "").join("\n");
}

// Szerep-skill (2026-09-19) az elején; az OCR cache-kulcs a promptot tartalmazza, így skill-módosítás új átiratot kér.
export const OCR_SYSTEM_PROMPT = withRoleSkill("ocr", [
  "You are a verbatim transcriber for Hungarian school material photographed or screenshotted by a teacher.",
  "Transcribe ALL legible text from the image EXACTLY as written — same wording, same accents, same punctuation.",
  "Do not translate, summarize, correct, or reorder anything. Do not describe the image.",
  "For handwriting, follow the skill's „Magyar kézírás” procedure: write the letters the writer INTENDED (resolve letter-shape confusions by the Hungarian word and the topic), never a non-existent word where a close real one stands on the page, and never fix the writer's own content mistakes.",
  "Output plain text only.",
].join(" "));

/**
 * Az OCR-kérés paraméterei — a #165 gyökér-okkal azonos hibaosztály ellen
 * pin-elve: a glm-flash osztálynál a reasoning kötelező és keretet fogyaszt,
 * ezért effort:low + bő completion-keret (a 4096 az átiratnak kell).
 */
export function ocrRequestParams(model: string, imageDataUrl: string) {
  return {
    model,
    messages: [
      { role: "system" as const, content: OCR_SYSTEM_PROMPT },
      {
        role: "user" as const,
        content: [{ type: "image_url" as const, image_url: { url: imageDataUrl, detail: "high" as const } }],
      },
    ],
    max_completion_tokens: 6000,
    reasoning: { effort: "low" as const },
  };
}

/**
 * Vendor-specific reasoning control: OpenRouter takes `reasoning`, the direct OpenAI API (GPT-5.6 Luna)
 * takes `reasoning_effort` — without it the default effort can spend the completion budget on thinking.
 */
export function ocrVendorRequest<T extends { reasoning?: unknown }>(vendor: string, params: T) {
  if (vendor === "openrouter") return params;
  const { reasoning: _reasoning, ...rest } = params;
  return vendor === "openai" ? { ...rest, reasoning_effort: "low" as const } : rest;
}

/** The default OCR callable: one cheap vision call per image. */
export async function callOcrModel(file: ExtractorFile, model: string): Promise<string> {
  const OpenAI = (await import("openai")).default;
  // Spec 2026-10-01-gyokerok-egyben (2.3): kimerült OpenAI-keretnél ugyanaz a modell az OpenRouteren át.
  return withQuotaFailover(studioConnection(model), async (connection) => {
  const client = new OpenAI({ baseURL: connection.baseURL, apiKey: connection.apiKey, timeout: 120000, maxRetries: 1 });

  const imageParams = ocrRequestParams(connection.model, file.content);
  const params = file.kind === "pdf" ? { ...imageParams, max_completion_tokens: 24000,
    messages: [
      { role: "system", content: OCR_SYSTEM_PROMPT + " Transcribe every PDF page and label its page number. Preserve formulas and units. Mark unreadable text explicitly." },
      { role: "user", content: [{ type: "file", file: { filename: file.name, file_data: file.content } }] },
    ] } : imageParams;
  const request = ocrVendorRequest(connection.vendor, params);
  // The reasoning extension is only sent to OpenRouter.
  const response = await client.chat.completions.create(
    request as unknown as Parameters<typeof client.chat.completions.create>[0],
  );
  if ("choices" in response) {
    if (response.choices[0]?.finish_reason !== "stop") throw new Error("A forrás átírása csonkolt; teljes szöveg szükséges.");
    return response.choices[0]?.message?.content?.trim() ?? "";
  }
  return "";
  });
}
