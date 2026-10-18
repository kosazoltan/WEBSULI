// docs/specs/2026-10-18-tartalmi-lektoralas.md — a tömeges tartalmi lektorálás tiszta segédfüggvényei (tesztelhetők, I/O nélkül).

export const CATEGORIES = ["fact", "math", "answer-key", "spelling", "grammar"] as const;
export type Category = typeof CATEGORIES[number];
export type Finding = { field?: string; quote: string; replacement: string; category: Category; reason: string };
export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };

const MARK = "\u2063";

/** Style, SVG and data: URIs carry no reviewable text; the rest stays byte-identical so every quote is findable in the original. */
export function stripForReview(html: string): string {
  return html
    .replace(/<style\b[\s\S]*?<\/style>/gi, MARK)
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, MARK)
    .replace(/data:[^"')\s]+/g, MARK);
}

/** Splits long review text on line boundaries into chunks of at most `max` characters. */
export function chunkText(text: string, max: number): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length) chunks.push(rest);
  return chunks;
}

// Technical keys, and the answer-matching synonym lists (intentional unaccented / variant spellings: fixing them would break grading).
const SKIP_KEYS = new Set(["id", "kind", "mode", "intent", "theme", "world", "art", "src", "url", "mapId", "subject", "sourceOnly",
  "required", "bonus", "typedAnswers", "requiredDistinct", "coversConceptIds", "conceptIds", "conceptId", "icon", "color", "layout", "variant", "form", "unit", "value", "part"]);

// Slugs / snake-case keys, colours and URLs are technical values; plain words, numbers and short options are learner content.
const IDENTIFIER = /^(?:[a-z0-9]+(?:[_-][a-z0-9]+)+|#[0-9a-f]{3,8}|https?:\/\/\S+)$/i;

/** Reviewable leaves of a structured lesson as `{ id: JSON path, text }`: every learner-facing string (short ones too) and the
 *  numeric single-choice key (`correctIndex`, as its digits) so a wrong key is reviewable (review #299). */
export function lessonTextFields(json: unknown): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = [];
  const walk = (node: unknown, path: string, key: string) => {
    if (typeof node === "string") {
      if (node.trim() && !IDENTIFIER.test(node.trim())) out.push({ id: path, text: node });
      return;
    }
    if (typeof node === "number") { if (key === "correctIndex") out.push({ id: path, text: String(node) }); return; }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}.${i}`, key)); return; }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) if (!SKIP_KEYS.has(k)) walk(v, path ? `${path}.${k}` : k, k);
    }
  };
  walk(json, "", "");
  return out;
}

/** One review line per field; line breaks become a visible mark so quotes spanning them stay verbatim (review #299). */
export const NEWLINE_MARK = "\u23CE";
export const toReviewLine = (text: string) => text.replace(/\n/g, NEWLINE_MARK);
export const fromReviewLine = (text: string) => text.split(NEWLINE_MARK).join("\n");

/** The nearest enclosing item (quiz question, task, method…) of a lesson field, for the verifier. */
export function lessonParentContext(json: unknown, path: string, max = 2000): string {
  const keys = path.split(".").filter(Boolean);
  const chain: unknown[] = [json];
  for (const k of keys) { const last = chain[chain.length - 1] as Record<string, unknown> | undefined; chain.push(last && typeof last === "object" ? last[k] : undefined); }
  for (let i = chain.length - 2; i >= 0; i--) {
    const node = chain[i] as Record<string, unknown> | undefined;
    if (node && typeof node === "object" && !Array.isArray(node) && ("options" in node || "q" in node || "question" in node || "prompt" in node)) return JSON.stringify(node).slice(0, max);
  }
  return JSON.stringify(chain[chain.length - 2] ?? null).slice(0, max);
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) n++;
  return n;
}

/** The structural skeleton of an HTML/JS snippet: every quote, backslash and angle bracket in order, plus every tag verbatim. */
export function structureOf(s: string): string {
  return (s.match(/["'`\\<>]/g) ?? []).join("") + "|" + (s.match(/<[^>]*>/g) ?? []).join("");
}
const stripAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Whether `index` lies inside a <script> element of `html`. */
export function insideScript(html: string, index: number): boolean {
  const open = html.lastIndexOf("<script", index);
  if (open === -1) return false;
  const close = html.lastIndexOf("</script", index);
  return close < open;
}

/** Mechanical gate before the paid verifier: exact single occurrence, real and proportionate change, script-safe HTML edit. */
export function validateFinding(f: Finding, target: string, kind: "html" | "lesson"): { ok: boolean; reason?: string } {
  if (!f || typeof f.quote !== "string" || typeof f.replacement !== "string") return { ok: false, reason: "hiányos tétel" };
  if (!(CATEGORIES as readonly string[]).includes(f.category)) return { ok: false, reason: "nem tartalmi kategória" };
  if (!f.quote.trim() || f.quote.length > 300) return { ok: false, reason: "üres vagy túl hosszú idézet" };
  if (f.quote === f.replacement) return { ok: false, reason: "nincs változás" };
  if (kind === "lesson" && f.field?.endsWith(".correctIndex")) {
    return /^\d$/.test(f.replacement) && target === f.quote ? { ok: true } : { ok: false, reason: "érvénytelen helyes-index csere" };
  }
  const ratio = f.replacement.length / f.quote.length;
  if (ratio < 0.5 || ratio > 1.5) return { ok: false, reason: "aránytalan hosszváltozás" };
  const n = countOccurrences(target, f.quote);
  if (n !== 1) return { ok: false, reason: n === 0 ? "az idézet nem található" : "az idézet többször szerepel" };
  if (kind === "html") {
    // Review #299: presence of a character kind is not enough — the skeleton (quotes, escapes, tags) must be identical.
    if (structureOf(f.quote) !== structureOf(f.replacement)) return { ok: false, reason: "a szerkezet (idézőjel, escape, tag) változna" };
    // Script data keeps ASCII-only variants on purpose (answer matching); an accent-only change there is not an error.
    if (insideScript(target, target.indexOf(f.quote)) && stripAccents(f.quote) === stripAccents(f.replacement)) return { ok: false, reason: "csak ékezet a szkriptben" };
  }
  return { ok: true };
}

/** Applies exact single-occurrence patches from the end backwards; overlapping or no-longer-unique patches are dropped. */
export function applyHtmlPatches(html: string, patches: Finding[]): { html: string; applied: Finding[]; dropped: Finding[] } {
  const located = patches.map(p => ({ p, at: html.indexOf(p.quote), n: countOccurrences(html, p.quote) }));
  const applied: Finding[] = []; const dropped: Finding[] = [];
  let result = html; let floor = Infinity;
  for (const { p, at, n } of located.sort((a, b) => b.at - a.at)) {
    if (n !== 1 || at + p.quote.length > floor) { dropped.push(p); continue; }
    result = result.slice(0, at) + p.replacement + result.slice(at + p.quote.length);
    floor = at; applied.push(p);
  }
  return { html: result, applied, dropped };
}

/** Replaces each patch's quote inside the string at its JSON path (deep copy); a missing path or non-unique quote drops the patch. */
export function applyLessonPatches<T>(json: T, patches: Finding[]): { json: T; applied: Finding[]; dropped: Finding[] } {
  const copy = structuredClone(json) as unknown;
  const applied: Finding[] = []; const dropped: Finding[] = [];
  for (const p of patches) {
    const keys = (p.field ?? "").split(".").filter(Boolean);
    const last = keys.pop();
    let node = copy as Record<string, unknown> | undefined;
    for (const k of keys) node = node && typeof node === "object" ? node[k] as Record<string, unknown> : undefined;
    const value = node && last !== undefined ? node[last] : undefined;
    if (typeof value === "number" && last === "correctIndex") {
      const next = Number(p.replacement); const options = node!.options;
      if (String(value) !== p.quote || !/^\d$/.test(p.replacement) || !Array.isArray(options) || next >= options.length) { dropped.push(p); continue; }
      node![last] = next; applied.push(p); continue;
    }
    if (typeof value !== "string" || countOccurrences(value, p.quote) !== 1) { dropped.push(p); continue; }
    node![last!] = value.replace(p.quote, () => p.replacement);
    applied.push(p);
  }
  return { json: copy as T, applied, dropped };
}

/** USD per call (claude-api skill, shared/models.md): Haiku 5.5 $0.10/$0.50 up to 100K prompt tokens, $0.50/$2.50 above; Opus 5.5 $4/$20. */
export function costUsd(model: string, usage: Usage): number {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const prompt = usage.input_tokens + cacheRead + cacheWrite;
  let inPrice: number; let outPrice: number;
  if (model.startsWith("claude-haiku-5-5")) { const long = prompt > 100_000; inPrice = long ? 0.5 : 0.1; outPrice = long ? 2.5 : 0.5; }
  else if (model.startsWith("claude-opus-5-5")) { inPrice = 4; outPrice = 20; }
  else throw new Error(`Ismeretlen modell ára: ${model}`);
  return (usage.input_tokens * inPrice + cacheRead * inPrice * 0.1 + cacheWrite * inPrice * 1.25 + usage.output_tokens * outPrice) / 1_000_000;
}

/** Tolerant JSON extraction from a model reply (optionally fenced). */
export function parseJsonReply<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/[[{]/);
  return JSON.parse(start > 0 ? body.slice(start) : body) as T;
}

/** Live failure 2026-10-18: a chunk or context cut can split an emoji's surrogate pair, and the API rejects the lone half
 *  ("unexpected end of hex escape"). Lone surrogates become U+FFFD before any request. */
export function wellFormed(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "�");
}

/** ±`radius` characters around the quote, for the verifier. */
export function contextOf(text: string, quote: string, radius = 300): string {
  const at = text.indexOf(quote);
  if (at === -1) return quote;
  return text.slice(Math.max(0, at - radius), at) + "⟦" + quote + "⟧" + text.slice(at + quote.length, at + quote.length + radius);
}

/** Script blocks that compiled before but not after a patch (inline JS compiled only, never run; JSON blocks parsed). */
export async function brokenScripts(before: string, after: string): Promise<number[]> {
  const { Script } = await import("node:vm");
  const blocks = (html: string) => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m => ({ attrs: m[1], code: m[2] }));
  const ok = (b: { attrs: string; code: string }) => {
    if (/\bsrc=/i.test(b.attrs)) return true;
    try {
      if (/json/i.test(b.attrs)) JSON.parse(b.code);
      else if (/type=["']?module/i.test(b.attrs)) return true;
      else new Script(b.code);
      return true;
    } catch { return false; }
  };
  const a = blocks(before); const b = blocks(after);
  if (a.length !== b.length) return [-1];
  return b.flatMap((blk, i) => ok(a[i]) && !ok(blk) ? [i] : []);
}
