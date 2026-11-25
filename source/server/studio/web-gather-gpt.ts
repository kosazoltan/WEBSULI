import { CROSS_FAMILY_FALLBACK_EFFORT } from "../ai/models";
import { studioConnection } from "../ai/studio-provider";
import { workflowCheckpoint, workflowUsage } from "../workflows/engine";
import { fetchPublicPage, type PublicPage } from "./safe-fetch";
import { sourceIsErrorPage, type FetchedTeachingSource } from "./web-teaching-review";
import { webResearchGatherParts, type WebResearchChatRequest, type WebResearchEvent } from "./web-research-agent";

/**
 * Spec 2026-10-15-tartalek-b4-webgyujtes (C2, tulajdonosi döntés): a webes forrásgyűjtés ellentétes családú tartaléka. A GPT-6.1
 * Sol a Responses API `web_search` eszközével keres (az OpenAI keresője NEM ad oldalszöveget), a WEBSULI szerver a talált oldalakat
 * védetten tölti le (`safe-fetch`), és ugyanazt a minimumot követeli, mint a Claude-út (min. 80 karakter, hibaoldal kiszűrve).
 */
export const GPT_GATHER_MAX_CANDIDATES = 12;
export const GPT_GATHER_MAX_SOURCES = 8;
export const GPT_GATHER_CONCURRENCY = 4;
const MIN_SOURCE_CHARS = 80;

type ResponsesOutputItem = {
  type?: string;
  action?: { sources?: Array<{ url?: unknown }> };
  content?: Array<{ annotations?: Array<{ type?: string; url?: unknown; title?: unknown }> }>;
};

/** URL-jelöltek: előbb a válasz hivatkozásai (`url_citation`), utána a `sources` lista; https, egyedi, legfeljebb 12. */
export function candidateUrls(output: readonly ResponsesOutputItem[], max = GPT_GATHER_MAX_CANDIDATES): string[] {
  const cited: string[] = [];
  const consulted: string[] = [];
  for (const item of output) {
    for (const block of item.content ?? []) for (const a of block.annotations ?? []) if (a.type === "url_citation" && typeof a.url === "string") cited.push(a.url);
    for (const s of item.action?.sources ?? []) if (typeof s.url === "string") consulted.push(s.url);
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of [...cited, ...consulted]) {
    let url: URL;
    try { url = new URL(raw); } catch { continue; }
    if (url.protocol !== "https:") continue;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
    const key = url.href;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
    if (result.length >= max) break;
  }
  return result;
}

/** A letöltött oldal a Claude-úttal azonos szabállyal forrás-e (min. 80 karakter, nem hibaoldal). */
/** W1b: forrásonként legfeljebb ennyi kép kerül tovább, egyenként legfeljebb ekkora (a mentett munkafolyamat mérete miatt). */
export const SOURCE_IMAGE_LIMITS = { perSource: 3, maxBytes: 1024 * 1024 } as const;

/** W1b: a gyűjtés teljes vizuális terhe (képek + szkennelt PDF) — a mentett munkafolyamat-ellenőrzőpont mérete miatt. */
export const GATHER_VISUAL_BUDGET = 12 * 1024 * 1024;
const visualBytes = (s: FetchedTeachingSource) => (s.images ?? []).reduce((n, i) => n + i.bytes, 0) + (s.scan ? Math.ceil(s.scan.dataUrl.length * 3 / 4) : 0);
/**
 * A keret fölött a forrás vizuális része elhagyva: a szöveges forrás szövegként marad, a csak vizuális forrás kimarad.
 * `used`: az eddig elfogadott források vizuális terhe.
 */
export function fitVisualBudget(source: FetchedTeachingSource, used: number): FetchedTeachingSource | undefined {
  if (used + visualBytes(source) <= GATHER_VISUAL_BUDGET) return source;
  if (source.text.trim().length < MIN_SOURCE_CHARS) return undefined;
  const { images: _images, scan: _scan, ...textOnly } = source;
  return textOnly;
}

export function usableSource(page: PublicPage): FetchedTeachingSource | undefined {
  const images = (page.images ?? []).filter(i => i.bytes <= SOURCE_IMAGE_LIMITS.maxBytes).slice(0, SOURCE_IMAGE_LIMITS.perSource);
  const source: FetchedTeachingSource = { url: page.url, title: page.title || page.url, text: page.text,
    // Review #592: a dokumentum-mód metaadatai (formátum, képek, szkennelt rész) a W1b-nek megmaradnak.
    ...(page.format ? { format: page.format } : {}), ...(images.length ? { images } : {}), ...(page.needsOcr ? { needsOcr: true } : {}), ...(page.scan ? { scan: page.scan } : {}) };
  if (sourceIsErrorPage(source)) return undefined;
  if (source.text.trim().length >= MIN_SOURCE_CHARS) return source;
  // W1b: szöveg nélkül is forrás a kép (JPG/PNG…) és a szkennelt PDF — a gyártás látó útja írja át.
  return (page.format === "image" && images.length) || page.scan ? source : undefined;
}

export type GptSearch = (request: { model: string; system: string; user: string; signal?: AbortSignal }) => Promise<{ output: ResponsesOutputItem[]; usage?: { input_tokens?: number; output_tokens?: number } }>;

/** Az alapértelmezett keresés: közvetlen OpenAI Responses API, `web_search` (high kontextus, HU), medium effort. */
export const openAiWebSearch: GptSearch = async ({ model, system, user, signal }) => {
  const OpenAI = (await import("openai")).default;
  const connection = studioConnection(model);
  const client = new OpenAI({ apiKey: connection.apiKey, baseURL: connection.baseURL, timeout: 300_000, maxRetries: 1 });
  const response = await client.responses.create({
    model: connection.model,
    reasoning: { effort: CROSS_FAMILY_FALLBACK_EFFORT },
    tools: [{ type: "web_search", search_context_size: "high", user_location: { type: "approximate", country: "HU" } }],
    include: ["web_search_call.action.sources"],
    instructions: system,
    input: user,
    store: false,
  } as never, { signal }) as unknown as { output: ResponsesOutputItem[]; usage?: { input_tokens?: number; output_tokens?: number } };
  return response;
};

/**
 * Review #222: a keresés témája ugyanaz, mint a Claude-úton — az előzmény első felhasználói üzenete (vagy az aktuális), és a
 * releváns előzmény is a kérésbe kerül (követő válasz, pl. „igen, készítsd el”, nem viheti el a keresést). A checkpoint-kulcs az
 * előzményt is tartalmazza, hogy eltérő beszélgetések ne használják ugyanazt a mentett eredményt.
 */
export function gptGatherRequest(input: WebResearchChatRequest): { topicSeed: string; history: string; request: string } {
  const users = (input.conversationHistory ?? []).filter((m) => m.role === "user" && typeof m.content === "string").map((m) => m.content as string);
  const topicSeed = (users[0] ?? input.message).slice(0, 200);
  const history = [...users, input.message].map((m) => m.trim()).filter(Boolean).slice(-6).map((m) => `- ${m.slice(0, 300)}`).join("\n");
  const parts = webResearchGatherParts(input.classroom, input.title, topicSeed);
  return { topicSeed, history, request: `${parts.request}\nA felhasználó kérései (a téma ezekből, legelső a fő téma):\n${history}` };
}
export function gptGatherCheckpointInput(input: WebResearchChatRequest, model: string) {
  const { request } = gptGatherRequest(input);
  return { model, request, contract: "web-gather-gpt-2" };
}

export async function gatherWebSourcesGpt(input: WebResearchChatRequest, opts: {
  model: string;
  signal?: AbortSignal;
  onEvent?: (event: WebResearchEvent) => void;
  search?: GptSearch;
  download?: (url: string, signal?: AbortSignal) => Promise<PublicPage>;
}): Promise<FetchedTeachingSource[]> {
  const gather = gptGatherRequest(input);
  const system = [
    "Te a WEBSULI forrásgyűjtő ügynöke vagy. A feladatod KERESÉS: magyar tantervi, tankönyvi vagy NAT/OFI-hoz illő oldalakat keresel a kért témához.",
    `Keress legalább ${GPT_GATHER_MAX_SOURCES} különböző, a témához tartozó, nyilvánosan olvasható oldalt, és a válaszban sorold fel a legjobbakat (cím + URL).`,
    "Tananyagot, HTML-t, összefoglalót NE írj — az oldalak szövegét a program tölti le.",
  ].join("\n");
  return workflowCheckpoint("web-gather-gpt", gptGatherCheckpointInput(input, opts.model), async () => {
    opts.onEvent?.({ type: "status", message: "Tartalék forrásgyűjtés (GPT-6.1 Sol): keresés az interneten…" });
    const response = await (opts.search ?? openAiWebSearch)({ model: opts.model, system, user: gather.request, signal: opts.signal });
    await workflowUsage({ input_tokens: response.usage?.input_tokens, output_tokens: response.usage?.output_tokens });
    const candidates = candidateUrls(response.output);
    opts.onEvent?.({ type: "status", message: `Tartalék forrásgyűjtés: ${candidates.length} találat letöltése…` });
    // W1a: dokumentum-mód — a talált PDF / irodai dokumentum / prezentáció / MHT / kép is letöltve (docs/specs/2026-11-25-w1-forrasformatumok.md).
    const download = opts.download ?? ((url: string, signal?: AbortSignal) => fetchPublicPage(url, { signal, documents: true }));
    const sources: FetchedTeachingSource[] = [];
    for (let i = 0; i < candidates.length && sources.length < GPT_GATHER_MAX_SOURCES; i += GPT_GATHER_CONCURRENCY) {
      opts.signal?.throwIfAborted();
      const batch = await Promise.allSettled(candidates.slice(i, i + GPT_GATHER_CONCURRENCY).map((url) => download(url, opts.signal)));
      for (const result of batch) {
        if (result.status !== "fulfilled") continue;
        const usable = usableSource(result.value);
        const source = usable && fitVisualBudget(usable, sources.reduce((n, s) => n + visualBytes(s), 0));
        if (source && !sources.some((s) => s.url === source.url) && sources.length < GPT_GATHER_MAX_SOURCES) sources.push(source);
      }
    }
    if (!sources.length) throw new Error(`A tartalék forrásgyűjtés ${candidates.length} találatából egy oldal sem volt letölthető forrás.`);
    opts.onEvent?.({ type: "sources", sources: sources.map(({ url, title }) => ({ url, title })) });
    return sources;
  });
}
