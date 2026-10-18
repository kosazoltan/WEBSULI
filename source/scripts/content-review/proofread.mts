// docs/specs/2026-10-18-tartalmi-lektoralas.md — tömeges tartalmi lektorálás (Haiku 5.5 keres, Opus 5.5 ellenőriz, mentés után alkalmaz).
// Futtatás (source/): npx tsx scripts/content-review/proofread.mts --limit 5 --dry-run --log <napló.jsonl>
// Az ANTHROPIC_API_KEY a környezetből jön, és soha nem kerül kiírásra. Írni csak --dry-run nélkül ír.
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { withReadOnlyDb, withWriteTransaction } from "../lib/read-only-db";
import { applyHtmlPatches, applyLessonPatches, chunkText, contextOf, costUsd, lessonTextFields, parseJsonReply, stripForReview, validateFinding, type Finding } from "./lib";

const FINDER = "claude-haiku-5-5";
const VERIFIER = "claude-opus-5-5";
const CHUNK_CHARS = 90_000;

const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i === -1 ? undefined : process.argv[i + 1]; };
const dryRun = process.argv.includes("--dry-run");
const limit = Number(arg("limit") ?? Infinity);
const budget = Number(arg("budget") ?? 20);
const onlyIds = arg("ids")?.split(",").filter(Boolean);
const logPath = arg("log");
// Parallel runs: `--shard k/n` takes every n-th material (by stable order), `--prior a.jsonl,b.jsonl` skips materials already done there.
const [shardK, shardN] = (arg("shard") ?? "0/1").split("/").map(Number);
const priorLogs = arg("prior")?.split(",").filter(Boolean) ?? [];
if (!logPath) throw new Error("--log <napló.jsonl> kötelező");
if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY nincs beállítva");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: "https://api.anthropic.com" });
let spent = 0;

type Material = { id: string; title: string; classroom: number; content_type: string; content: string; lesson?: { id: string; version: number; json: unknown; map_id: string } };
type LogRow = { id: string; title: string; kind: string; found: number; valid: number; confirmed: number; applied: number; categories: Record<string, number>; costUsd: number; dryRun: boolean; error?: string; fixes?: Array<Pick<Finding, "quote" | "replacement" | "category" | "reason">>; rejected?: Array<{ quote: string; why: string }> };

const done = new Set<string>();
if (existsSync(logPath)) for (const line of readFileSync(logPath, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line) as LogRow;
  spent += row.costUsd;
  if (!row.error && row.dryRun === dryRun) done.add(row.id);
}

for (const prior of priorLogs) if (existsSync(prior)) for (const line of readFileSync(prior, "utf8").split("\n")) {
  if (!line.trim()) continue;
  const row = JSON.parse(line) as LogRow;
  if (!row.error && row.dryRun === dryRun) done.add(row.id);
}

const findingSchema = {
  type: "object", additionalProperties: false, required: ["findings"],
  properties: { findings: { type: "array", items: { type: "object", additionalProperties: false, required: ["field", "quote", "replacement", "category", "reason"], properties: {
    field: { type: "string" }, quote: { type: "string" }, replacement: { type: "string" },
    category: { type: "string", enum: ["fact", "math", "answer-key", "spelling", "grammar"] }, reason: { type: "string" } } } } },
};
const verdictSchema = {
  type: "object", additionalProperties: false, required: ["verdicts"],
  properties: { verdicts: { type: "array", items: { type: "object", additionalProperties: false, required: ["n", "verdict", "why"], properties: {
    n: { type: "integer" }, verdict: { type: "string", enum: ["confirm", "reject"] }, why: { type: "string" } } } } },
};

const FINDER_SYSTEM = `Magyar általános iskolai tananyag TARTALMI lektora vagy. Csak valódi hibát jelezz, öt fajtából:
- fact: tárgyi tévedés (téves adat, évszám, név, fogalom, meghatározás);
- math: hibás számítás, hibás megoldás vagy eredmény;
- answer-key: a helyesnek jelölt válasz, a megoldás vagy a visszajelzés rossz;
- spelling: helyesírási hiba (magyar helyesírás szabályai szerint);
- grammar: nyelvtani hiba (egyeztetés, ragozás, hiányzó vagy fölösleges szó).
NE jelezz: stílust, átfogalmazási javaslatot, formázást, kinézetet, HTML/CSS/JavaScript kódot és azonosítókat, szándékosan ékezet nélküli vagy változatos válaszillesztő szólistákat, \\u kódolt karaktereket, idegen nyelvű tananyag szándékos idegen nyelvű szövegét, vitatható vagy ízlésbeli kérdést. Ha bizonytalan vagy, ne jelezd.
A "quote" a bemenetből BETŰHŰ, egybefüggő részlet (ugyanazokkal a szóközökkel, írásjelekkel, HTML-entitásokkal), legalább 4 szó, hogy egyedi legyen, legfeljebb 200 karakter, egy soron belül. A "replacement" ugyanez a részlet a lehető legkisebb javítással. A "field" leckénél a sor elején álló [azonosító], HTML-nél üres szöveg. A "reason" egy rövid magyar mondat. Ha nincs hiba, üres lista.`;

const VERIFIER_SYSTEM = `Szigorú magyar szakmai lektor vagy. Egy olcsóbb modell hibákat jelzett egy általános iskolai tananyagban. Minden tételnél döntsd el: "confirm", ha a jelzett szöveg VALÓBAN tartalmi hiba (tárgyi, számítási, megoldókulcs-, helyesírási vagy nyelvtani), ÉS a javasolt csere helyes, minimális, és nem ront el semmit (a környezetben ⟦ ⟧ jelöli a cserélendő részt). Minden más esetben "reject": stílus, ízlés, vitatható, a tananyag szintjén elfogadott egyszerűsítés, szándékos ékezet nélküli válaszillesztő változat, kódrészlet, vagy ha a csere új hibát okoz. Ügyelj: az „az” lehet mutató névmás is („háromszor vesszük az 5-öt, az 15” = annyi 15) — ez nem névelőhiba; a beszélt nyelvi, de helyes szerkezet, a tanítási célú egyszerűsítés és a szándékos ismétlés sem hiba. Kétség esetén reject.`;

async function call(model: string, system: string, user: string, schema: object, effort: "medium" | "high") {
  const stream = client.messages.stream({
    model, max_tokens: 16_000, system, messages: [{ role: "user", content: user }],
    thinking: { type: "adaptive" }, output_config: { effort, format: { type: "json_schema", schema } },
  } as Anthropic.MessageStreamParams);
  const msg = await stream.finalMessage();
  const cost = costUsd(model, msg.usage);
  spent += cost;
  const text = msg.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("");
  return { text, cost, stop: msg.stop_reason };
}

async function loadMaterials(): Promise<Material[]> {
  return withReadOnlyDb(async q => {
    const rows = await q<Material>(`SELECT id, title, classroom, content_type, content FROM html_files
      WHERE created_at < '2026-10-01' AND content_type IN ('html', 'text/html', 'lesson') ORDER BY created_at, id`);
    const lessons = await q<{ html_file_id: string; id: string; version: number; json: unknown; map_id: string }>(`SELECT DISTINCT ON (html_file_id) html_file_id, id, version, json, map_id
      FROM lessons WHERE published_at IS NOT NULL ORDER BY html_file_id, updated_at DESC`);
    const byFile = new Map(lessons.map(l => [l.html_file_id, l]));
    return rows.flatMap(r => {
      if (r.content_type !== "lesson") return [r];
      const lesson = byFile.get(r.id);
      return lesson ? [{ ...r, lesson }] : [];
    });
  });
}

async function proofread(m: Material) {
  const isLesson = Boolean(m.lesson);
  const fields = isLesson ? lessonTextFields(m.lesson!.json) : [];
  const fieldText = new Map(fields.map(f => [f.id, f.text]));
  const reviewText = isLesson ? fields.map(f => `[${f.id}] ${f.text.replace(/\n/g, " ")}`).join("\n") : stripForReview(m.content);
  const header = `Cím: ${m.title}\nÉvfolyam: ${m.classroom}.\n${isLesson ? "Strukturált lecke, soronként [azonosító] szöveg." : "Régi HTML tananyag (a stílus és a képek kihagyva)."}\n\n`;
  let cost = 0;
  const found: Finding[] = [];
  for (const chunk of chunkText(reviewText, CHUNK_CHARS)) {
    const r = await call(FINDER, FINDER_SYSTEM, header + chunk, findingSchema, "medium");
    cost += r.cost;
    found.push(...parseJsonReply<{ findings: Finding[] }>(r.text).findings);
  }
  const rejected: Array<{ quote: string; why: string }> = [];
  const valid = found.filter(f => {
    const target = isLesson ? fieldText.get(f.field ?? "") ?? "" : m.content;
    const v = validateFinding(f, target, isLesson ? "lesson" : "html");
    if (!v.ok) rejected.push({ quote: f.quote.slice(0, 120), why: `gépi: ${v.reason}` });
    return v.ok;
  });
  // Duplicate quotes (from overlapping chunks or repeated findings) are reviewed once.
  const unique = valid.filter((f, i) => valid.findIndex(g => g.quote === f.quote && g.field === f.field) === i);
  let confirmed: Finding[] = [];
  if (unique.length) {
    const items = unique.map((f, n) => {
      const target = isLesson ? fieldText.get(f.field ?? "") ?? "" : stripForReview(m.content);
      return `#${n} [${f.category}] csere: «${f.quote}» → «${f.replacement}»\nindok: ${f.reason}\nkörnyezet: ${contextOf(target, f.quote)}`;
    }).join("\n\n");
    const r = await call(VERIFIER, VERIFIER_SYSTEM, `Cím: ${m.title}\nÉvfolyam: ${m.classroom}.\n\n${items}`, verdictSchema, "high");
    cost += r.cost;
    const verdicts = parseJsonReply<{ verdicts: Array<{ n: number; verdict: string; why: string }> }>(r.text).verdicts;
    confirmed = unique.filter((f, n) => {
      const v = verdicts.find(x => x.n === n);
      if (v?.verdict !== "confirm") rejected.push({ quote: f.quote.slice(0, 120), why: `ellenőrző: ${v?.why ?? "nincs ítélet"}` });
      return v?.verdict === "confirm";
    });
  }
  return { found: found.length, valid: unique.length, confirmed, rejected, cost };
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function applyHtml(m: Material, fixes: Finding[], adminId: string) {
  const { html, applied } = applyHtmlPatches(m.content, fixes);
  if (!applied.length) return applied;
  const note = `Tartalmi lektorálás 2026-10-18: ${applied.length} javítás`;
  await withWriteTransaction(async q => {
    const [row] = await q<{ id: string; title: string; content: string; description: string | null; classroom: number; content_type: string; display_order: number; user_id: string | null; created_at: Date }>(
      "SELECT id, title, content, description, classroom, content_type, display_order, user_id, created_at FROM html_files WHERE id = $1 FOR UPDATE", [m.id]);
    if (!row || sha(row.content) !== sha(m.content)) throw new Error("Az anyag a beolvasás óta megváltozott; kihagyva.");
    const backupData = { id: row.id, title: row.title, content: row.content, description: row.description, classroom: row.classroom, contentType: row.content_type, displayOrder: row.display_order, userId: row.user_id, createdAt: row.created_at };
    await q("INSERT INTO material_improvement_backups (original_file_id, improved_file_id, backup_data, created_by, notes) VALUES ($1, NULL, $2, $3, $4)", [m.id, JSON.stringify(backupData), adminId, note]);
    await q("UPDATE html_files SET content = $2 WHERE id = $1", [m.id, html]);
    const [back] = await q<{ content: string }>("SELECT content FROM html_files WHERE id = $1", [m.id]);
    if (back?.content !== html) throw new Error("A visszaolvasás eltér; a művelet visszaáll.");
  });
  return applied;
}

async function applyLesson(m: Material, fixes: Finding[], adminId: string) {
  const lesson = m.lesson!;
  const { json: candidate, applied } = applyLessonPatches(lesson.json, fixes);
  if (!applied.length) return applied;
  const { repairHash, materialHash } = await import("../../server/studio/structured-improvement");
  const { lessonRepairSchema } = await import("../../shared/lesson-repair");
  const { applyTrackedImprovement } = await import("../../server/workflows/apply");
  const repair = await withReadOnlyDb(async q => {
    const [file] = await q<{ title: string; content: string; description: string | null; classroom: number; content_type: string }>("SELECT title, content, description, classroom, content_type FROM html_files WHERE id = $1", [m.id]);
    const [map] = await q<{ subject: string; classroom: number }>("SELECT subject, classroom FROM knowledge_maps WHERE id = $1", [lesson.map_id]);
    const concepts = await q<{ id: string; local_id: string; term: string; definition: string; quote: string; exam_weight: string }>(
      "SELECT id, local_id, term, definition, quote, exam_weight FROM km_concepts WHERE map_id = $1 AND review_state <> 'rejected'", [lesson.map_id]);
    const source = { subject: map.subject, classroom: map.classroom, concepts: concepts.map(c => ({ id: c.id, localId: c.local_id, term: c.term, definition: c.definition, quote: c.quote, examWeight: c.exam_weight })).sort((a, b) => a.localId.localeCompare(b.localId)) };
    return lessonRepairSchema.parse({ kind: "lesson-repair-fusion-1", lessonId: lesson.id, baseVersion: lesson.version, baselineHash: repairHash(lesson.json),
      baselineMaterialHash: materialHash({ title: file.title, content: file.content, description: file.description, classroom: file.classroom, contentType: file.content_type }),
      sourceHash: repairHash(source), previousLesson: lesson.json, candidate });
  });
  const note = `Tartalmi lektorálás 2026-10-18: ${applied.length} javítás`;
  const [row] = await withWriteTransaction(q => q<{ id: string }>(`INSERT INTO improved_html_files (original_file_id, title, content, classroom, content_type, improvement_notes, status, created_by)
    VALUES ($1, $2, $3, $4, 'lesson', $5, 'pending', $6) RETURNING id`, [m.id, m.title, JSON.stringify(repair), m.classroom, note, adminId]));
  await applyTrackedImprovement(row.id, adminId, note);
  return applied;
}

const materials = (await loadMaterials()).filter(m => !onlyIds || onlyIds.includes(m.id)).filter((_, i) => i % shardN === shardK).filter(m => !done.has(m.id)).slice(0, limit);
const [admin] = await withReadOnlyDb(q => q<{ id: string }>("SELECT id FROM users WHERE is_admin AND first_name = 'Kósa' ORDER BY created_at LIMIT 1"));
if (!admin) throw new Error("Az admin felhasználó nem található.");
console.log(`Anyagok: ${materials.length} (eddigi költség: $${spent.toFixed(4)}, keret: $${budget})${dryRun ? " — PRÓBA, írás nélkül" : ""}`);

for (const m of materials) {
  if (spent >= budget) { console.log(`Keret elérve ($${spent.toFixed(2)}); megállás.`); break; }
  const kind = m.lesson ? "lecke" : "html";
  const row: LogRow = { id: m.id, title: m.title, kind, found: 0, valid: 0, confirmed: 0, applied: 0, categories: {}, costUsd: 0, dryRun };
  const before = spent;
  try {
    const r = await proofread(m);
    Object.assign(row, { found: r.found, valid: r.valid, confirmed: r.confirmed.length, rejected: r.rejected });
    row.fixes = r.confirmed.map(({ quote, replacement, category, reason }) => ({ quote, replacement, category, reason }));
    for (const f of r.confirmed) row.categories[f.category] = (row.categories[f.category] ?? 0) + 1;
    if (!dryRun && r.confirmed.length) row.applied = (m.lesson ? await applyLesson(m, r.confirmed, admin.id) : await applyHtml(m, r.confirmed, admin.id)).length;
  } catch (error) {
    row.error = error instanceof Error ? error.message.slice(0, 300) : String(error);
  }
  row.costUsd = spent - before;
  appendFileSync(logPath, JSON.stringify(row) + "\n");
  console.log(`${kind} | ${m.title.slice(0, 50)} | talált ${row.found}, érvényes ${row.valid}, megerősített ${row.confirmed}, alkalmazott ${row.applied} | $${row.costUsd.toFixed(4)} (össz. $${spent.toFixed(4)})${row.error ? ` | HIBA: ${row.error}` : ""}`);
}
process.exit(0);
