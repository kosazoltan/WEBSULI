// Spec 2026-10-05-s1-katalogus-kinyeres: mind a 201 lecke (177 régi HTML + publikált fúziós) determinisztikus kinyerése.
// CSAK OLVAS az éles DB-ből. Futtatás: npx tsx scripts/catalog/extract-all.mts
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import pg from "pg";
import { extractLegacyLesson } from "../../server/catalog/legacy-extract";
import { extractFusionLesson } from "../../server/catalog/fusion-extract";
import type { CatalogItemDraft } from "../../server/catalog/catalog-item";

const day = new Date().toISOString().slice(0, 10);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  const legacy = (await client.query(`select id, title, classroom, content from html_files where coalesce(content_type,'html') in ('html','text/html') order by created_at`)).rows;
  const fusion = (await client.query(`select l.id, l.json from lessons l where l.published_at is not null order by l.published_at`)).rows;
  await client.query("ROLLBACK");

  const perLesson: Array<Record<string, unknown>> = [];
  const all: Array<CatalogItemDraft & { lessonTitle: string; classroom: number | null; source: "legacy" | "fusion" }> = [];
  let parsedOk = 0, keyedLiteralEstimate = 0, keyedExtracted = 0;
  // Előszámlálás (független ellenőrzés): kulcsos feleletválasztós literál-objektumok regexszel a szkriptekben.
  const KEYED = /\{\s*(?:["']?id["']?\s*:[^,{}]{0,60},\s*)?["']?(?:q|question|kerdes)["']?\s*:\s*(["'`])(?:(?!\1)[^\\]|\\.)*\1\s*,\s*["']?(?:opts|o|options|valaszok|answers|choices)["']?\s*:\s*\[[^\]]*\]\s*,\s*["']?(?:correct|c|helyes|correctIndex|answer)["']?\s*:\s*(?:-?\d+|["'][^"']{1,200}["'])/g;
  for (const r of legacy) {
    const html = String(r.content ?? "");
    const ex = extractLegacyLesson(html, `legacy_html:${r.id}`);
    if (ex.stats.scriptErrors === 0) parsedOk++;
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
    const est = (scripts.match(KEYED) ?? []).length;
    const keyed = ex.items.filter((i) => i.kind === "quiz").length;
    keyedLiteralEstimate += est; keyedExtracted += Math.min(keyed, est);
    const kinds: Record<string, number> = {};
    for (const i of ex.items) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
    perLesson.push({ source: "legacy", id: r.id, title: r.title, classroom: r.classroom, ...ex.stats, kinds, keyedEstimate: est });
    for (const i of ex.items) all.push({ ...i, lessonTitle: r.title, classroom: r.classroom, source: "legacy" });
  }
  for (const r of fusion) {
    const items = extractFusionLesson(r.json, `lesson:${r.id}`);
    const kinds: Record<string, number> = {};
    for (const i of items) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
    perLesson.push({ source: "fusion", id: r.id, title: r.json.title, classroom: r.json.classroom, subject: r.json.subject, kinds });
    for (const i of items) all.push({ ...i, lessonTitle: r.json.title, classroom: r.json.classroom ?? null, source: "fusion" });
  }
  const totals: Record<string, number> = {};
  for (const i of all) totals[`${i.source}.${i.kind}`] = (totals[`${i.source}.${i.kind}`] ?? 0) + 1;
  const summary = {
    measuredAt: new Date().toISOString(),
    lessons: { legacy: legacy.length, fusion: fusion.length },
    legacyScriptParseOk: `${parsedOk}/${legacy.length}`,
    keyedQuizCoverage: { regexEstimate: keyedLiteralEstimate, extractedWithinEstimate: keyedExtracted, ratio: keyedLiteralEstimate ? Math.round((keyedExtracted / keyedLiteralEstimate) * 1000) / 1000 : null },
    totals,
    emptyLegacyLessons: perLesson.filter((p) => p.source === "legacy" && Object.keys(p.kinds as object).length === 0).map((p) => p.title),
    perLesson,
  };
  mkdirSync("../docs/measurements", { recursive: true });
  writeFileSync(`../docs/measurements/${day}-catalog-extract.json`, JSON.stringify(summary, null, 2) + "\n");
  mkdirSync(".catalog", { recursive: true });
  writeFileSync(`.catalog/${day}-items.json`, JSON.stringify(all) + "\n");
  console.log(JSON.stringify({ lessons: summary.lessons, legacyScriptParseOk: summary.legacyScriptParseOk, keyedQuizCoverage: summary.keyedQuizCoverage, totals, empty: summary.emptyLegacyLessons.length, items: all.length }, null, 1));
} finally {
  await client.end();
}
