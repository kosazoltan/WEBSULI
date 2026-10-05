import { parse } from "acorn";
import { itemFingerprint, type CatalogItemDraft } from "./catalog-item";

/**
 * Spec 2026-10-05-s1-katalogus-kinyeres: a régi (szülők által ellenőrzött) HTML-leckék tudásának DETERMINISZTIKUS kinyerése.
 * A szkripteket NEM futtatjuk: az acorn AST-jéből csak a teljesen literál objektumokat olvassuk ki, és a mért formátumokra
 * osztályozzuk (`{q,a}`, `{q,opts|o|options,correct|c}`, betűs `{q,a,b,c,correct}`, `{q,keywords|keys|kw,key}`, `{en,hu}`,
 * `{kerdes,valaszok,helyes}`, v7.4-es `{question,options,correctIndex}`). A futásidejű objektum (`{question: item.q}`) nem tudás.
 */

type Node = { type: string; [k: string]: unknown };
export type LegacyExtract = {
  sections: Array<{ heading: string; text: string }>;
  items: CatalogItemDraft[];
  stats: { scripts: number; scriptErrors: number; literalObjects: number; classified: number; duplicates: number };
};

/** Az inline (src nélküli, nem JSON-LD/sablon) szkriptek tartalma. */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/type\s*=\s*["']?(?:text\/template|application\/ld\+json|text\/x-template)/i.test(m[1]))
    .map((m) => m[2]);
}

const NOT_LITERAL = Symbol("not-literal");
/** AST-csomópont literál értéke (szöveg, szám, logikai, null, sablon kifejezés nélkül, tömb, objektum); különben NOT_LITERAL. */
export function literalValue(node: Node | null | undefined): unknown {
  if (!node) return NOT_LITERAL;
  switch (node.type) {
    case "Literal": { const value = (node as unknown as { value: unknown }).value; return value instanceof RegExp ? NOT_LITERAL : value; }
    case "TemplateLiteral": {
      const t = node as unknown as { expressions: unknown[]; quasis: Array<{ value: { cooked: string } }> };
      return t.expressions.length ? NOT_LITERAL : t.quasis.map((q) => q.value.cooked).join("");
    }
    case "UnaryExpression": {
      const u = node as unknown as { operator: string; argument: Node };
      const v = literalValue(u.argument);
      return typeof v === "number" && (u.operator === "-" || u.operator === "+") ? (u.operator === "-" ? -v : v) : NOT_LITERAL;
    }
    case "ArrayExpression": {
      const out: unknown[] = [];
      for (const el of (node as unknown as { elements: Array<Node | null> }).elements) { const v = literalValue(el); if (v === NOT_LITERAL) return NOT_LITERAL; out.push(v); }
      return out;
    }
    case "ObjectExpression": {
      const out: Record<string, unknown> = {};
      for (const p of (node as unknown as { properties: Node[] }).properties) {
        if (p.type !== "Property" || (p as { computed?: boolean }).computed || (p as { kind?: string }).kind !== "init") return NOT_LITERAL;
        const key = p.key as Node;
        const name = key.type === "Identifier" ? (key as unknown as { name: string }).name : key.type === "Literal" ? String((key as unknown as { value: unknown }).value) : null;
        if (name === null) return NOT_LITERAL;
        const v = literalValue(p.value as Node);
        if (v === NOT_LITERAL) return NOT_LITERAL;
        out[name] = v;
      }
      return out;
    }
    default: return NOT_LITERAL;
  }
}

/** Minden ObjectExpression a fában (a beágyazottakkal együtt). */
function* walkObjects(node: unknown): Generator<Node> {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) yield* walkObjects(n); return; }
  const n = node as Node;
  if (typeof n.type === "string" && n.type === "ObjectExpression") yield n;
  for (const [k, v] of Object.entries(n)) if (k !== "loc" && k !== "range" && v && typeof v === "object") yield* walkObjects(v);
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const strs = (v: unknown): string[] | null => (Array.isArray(v) && v.length && v.every((x) => typeof x === "string" && x.trim()) ? (v as string[]).map((x) => x.trim()) : null);
const first = (o: Record<string, unknown>, keys: string[]) => keys.map((k) => o[k]).find((v) => v !== undefined);

/** A helyes kulcs indexre: szám, egyelemű tömb (`[1]`), betű („a”–„e”), vagy maga az opció szövege. Több elemű tömb = több
 *  helyes válasz → nem egyválasztós (undefined). */
function keyIndex(raw: unknown, options: string[]): number | undefined {
  if (Array.isArray(raw)) return raw.length === 1 ? keyIndex(raw[0], options) : undefined;
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0 && raw < options.length) return raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (/^[a-eA-E]$/.test(t) && options.length >= 2) { const i = t.toLowerCase().charCodeAt(0) - 97; return i < options.length ? i : undefined; }
    if (/^\d+$/.test(t)) { const i = Number(t); return i < options.length ? i : undefined; }
    const i = options.findIndex((o) => o.trim().toLocaleLowerCase("hu") === t.toLocaleLowerCase("hu"));
    return i >= 0 ? i : undefined;
  }
  return undefined;
}

type Draft = Omit<CatalogItemDraft, "fingerprint" | "provenance">;
/** Egy teljesen literál objektum osztályozása a mért formátumokra; null, ha nem tudás-tétel. */
export function classifyLiteral(o: Record<string, unknown>): Draft | null {
  const shape = Object.keys(o).sort().join(",");
  const question = str(first(o, ["q", "question", "kerdes", "kérdés", "prompt"]));
  // szókincs-pár
  const en = str(o.en), hu = str(o.hu);
  if (en && hu && !question) return { kind: "vocab", prompt: en, pair: { source: en, target: hu, sourceLang: "en", targetLang: "hu" }, shape };
  if (!question) return null;
  // betűs feleletválasztós: {q, a, b, c[, d], correct: "a"}
  const letters = ["a", "b", "c", "d"].map((k) => str(o[k]));
  if (letters[0] && letters[1] && letters[2] && (o.correct !== undefined || o.helyes !== undefined)) {
    const options = letters.filter((x): x is string => !!x);
    const idx = keyIndex(o.correct ?? o.helyes, options);
    return idx === undefined ? { kind: "quiz_unkeyed", prompt: question, options, shape } : { kind: "quiz", prompt: question, options, correctIndex: idx, shape };
  }
  // feleletválasztós opció-listával. Mért (2026-10-05, 1199 tétel): az `a`/`answers` CSAK akkor opció-lista, ha helyes-kulcs
  // mező is van (`{q, a:[…], c:0}`) — kulcs nélkül elfogadott válaszok (`{q, a:[…]}`, `{question, answers, unit}`).
  const KEY_FIELDS = ["correctIndex", "correct", "c", "helyes", "ok"];
  const hasKey = KEY_FIELDS.some((k) => o[k] !== undefined);
  const named = strs(first(o, ["opts", "o", "options", "valaszok", "válaszok", "choices"]));
  const options = named ?? (hasKey ? strs(first(o, ["a", "answers"])) : null);
  if (options && options.length >= 2) {
    // Mért (430+198 tétel): `{q, o|opts, a: 1}` — ha az opciók NEVESÍTETT mezőből jönnek, az `a`/`answer` a helyes kulcs.
    const raw = first(o, named ? [...KEY_FIELDS, "a", "answer", "ans"] : KEY_FIELDS);
    const idx = keyIndex(raw, options);
    return idx === undefined ? { kind: "quiz_unkeyed", prompt: question, options, shape } : { kind: "quiz", prompt: question, options, correctIndex: idx, shape };
  }
  // nyílt feladat kulcsszavakkal
  const kw = first(o, ["required", "keywords", "keys", "kw", "kulcsszavak"]);
  const groups = Array.isArray(kw) ? (kw as unknown[]).map((g) => (typeof g === "string" ? [g.trim()] : strs(g))).filter((g): g is string[] => !!g && g.length > 0) : null;
  if (groups && groups.length) {
    const sample = str(first(o, ["sample", "key", "minta", "mintavalasz", "solution", "megoldas"]));
    return { kind: "open_task", prompt: question, keywordGroups: groups, ...(sample ? { body: sample } : {}), shape };
  }
  // rövid válasz elfogadott változatokkal: {q, a: [..]} vagy {q, a: "..."} / {question, answer}
  const accepted = strs(first(o, ["a", "answers", "answer", "valasz", "válasz", "accept", "accepted"])) ?? (str(first(o, ["a", "answer", "valasz", "válasz"])) ? [str(first(o, ["a", "answer", "valasz", "válasz"]))!] : null);
  if (accepted) return { kind: "short_answer", prompt: question, accepted, shape };
  return null;
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", ndash: "–", mdash: "—", hellip: "…" };
const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m));
const plain = (html: string) => decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|div|h\d|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[^\S\n]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();

/** A tanítás szövege h1–h3 szerinti szakaszokban (≥ 40 karakter), script/style/nav nélkül. */
export function textSections(html: string): Array<{ heading: string; text: string }> {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<nav[\s\S]*?<\/nav>/gi, " ").replace(/<button[\s\S]*?<\/button>/gi, " ");
  const parts = body.split(/(<h[1-3][^>]*>[\s\S]*?<\/h[1-3]>)/i);
  const out: Array<{ heading: string; text: string }> = [];
  let heading = "";
  for (const part of parts) {
    const h = part.match(/^<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>$/i);
    if (h) { heading = plain(h[1]).replace(/\s+/g, " "); continue; }
    const text = plain(part);
    if (text.length >= 40) out.push({ heading, text });
  }
  return out;
}

export function extractLegacyLesson(html: string, provenance: string): LegacyExtract {
  const stats = { scripts: 0, scriptErrors: 0, literalObjects: 0, classified: 0, duplicates: 0 };
  const items: CatalogItemDraft[] = [];
  const seen = new Set<string>();
  const push = (d: Draft) => {
    const fingerprint = itemFingerprint(d);
    if (seen.has(fingerprint)) { stats.duplicates++; return; }
    seen.add(fingerprint);
    items.push({ ...d, provenance, fingerprint });
  };
  for (const code of inlineScripts(html)) {
    if (!code.trim()) continue;
    stats.scripts++;
    let ast: unknown;
    try { ast = parse(code, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); }
    catch { try { ast = parse(code, { ecmaVersion: "latest", sourceType: "module" }); } catch { stats.scriptErrors++; continue; } }
    for (const obj of walkObjects(ast)) {
      const v = literalValue(obj);
      if (!v || typeof v !== "object" || Array.isArray(v)) continue;
      stats.literalObjects++;
      const d = classifyLiteral(v as Record<string, unknown>);
      if (d) { stats.classified++; push(d); }
    }
  }
  const sections = textSections(html);
  for (const s of sections) push({ kind: "section", prompt: s.heading || "(cím nélkül)", body: s.text });
  return { sections, items, stats };
}
