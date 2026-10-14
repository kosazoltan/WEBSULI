// Spec 2026-10-14-tananyag-tomorseg-lefedettseg: read-only measurement of every stored pipeline lesson (latest version per
// map) against its source text and knowledge map. Deterministic lexical metrics (6-letter stem keys), no model calls.
// Futtatás (source/ mappából): node scripts/measure/lesson-length-coverage.cjs <kimenet.json>
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env"), quiet: true });
const { Client } = require("pg");
const fs = require("fs");

const STOP = new Set(("a az és is hogy nem de vagy mint már még csak ez az egy ezt azt amely amelyek ami amik akik aki volt van " +
  "lesz lett lehet kell mert ha akkor így úgy után előtt alatt között által szerint miatt nagyon sok több kevés minden " +
  "mely melyik milyen hogyan miért mikor ahol amikor majd pedig valamint illetve vagyis tehát azonban ezért egyik másik " +
  "ezek azok ennek annak ebben abban erre arra ezzel azzal neki nekik őket ők mi ti te én saját").split(/\s+/));
const words = (t) => (String(t ?? "").toLowerCase().match(/[a-záéíóöőúüű0-9]+/g) ?? []);
const KEYLEN = 6;
// content-term key: Hungarian is agglutinative → compare by a 6-letter stem prefix; years/numbers kept whole
const termKeys = (t) => {
  const s = new Set();
  for (const w of words(t)) {
    if (/^\d{3,4}$/.test(w)) { s.add(w); continue; }
    if (w.length >= 6 && !STOP.has(w) && !/^\d/.test(w)) s.add(w.slice(0, KEYLEN));
  }
  return s;
};
const stripHtml = (h) => String(h ?? "").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
// Student-visible fields per block kind (client/src/lesson-runtime/LessonRuntime.tsx: explain :100-115, example :127-154,
// check :227-238, recap :255, animate :292-294). `after` = shown only after the student answers (feedback, hint).
const blockText = (b, after = false) => {
  if (after) return b.kind === "check" ? [...(b.feedbackPerOption ?? []), b.feedback, b.hint].filter(Boolean).join("\n") : "";
  switch (b.kind) {
    case "example": return [b.problem, ...(b.steps ?? []).map((s) => (typeof s === "string" ? s : s?.text ?? s?.step ?? "")), b.answer].filter(Boolean).join("\n");
    case "check": return [b.question, ...(b.options ?? [])].filter(Boolean).join("\n");
    case "recap": return [...(b.bullets ?? []), b.text].filter(Boolean).join("\n");
    case "animate": return [b.caption, b.text].filter(Boolean).join("\n");
    default: return b.text ?? "";
  }
};
const textOfBlocks = (sections, kinds, after = false) => sections.flatMap((s) => [after ? "" : s.heading, ...(s.blocks ?? []).filter((b) => !kinds || kinds.includes(b.kind)).map((b) => blockText(b, after))]).join("\n");
const bankText = (e) => [
  ...(e?.quiz ?? []).flatMap((q) => [q.question, ...(q.options ?? []), ...(q.feedbackPerOption ?? [])]),
  ...(e?.tasks ?? []).flatMap((t) => [t.q, t.sample]),
  ...(e?.methods ?? []).flatMap((m) => [m.title, m.prompt, m.answer]),
].join("\n");
// share of 6-word shingles that occur more than once in the teaching text (redundancy)
const redundancy = (t) => {
  const w = words(t); const seen = new Map();
  for (let i = 0; i + 6 <= w.length; i++) { const k = w.slice(i, i + 6).join(" "); seen.set(k, (seen.get(k) ?? 0) + 1); }
  const total = [...seen.values()].reduce((a, b) => a + b, 0) || 1;
  const dup = [...seen.values()].filter((n) => n > 1).reduce((a, b) => a + b, 0);
  return dup / total;
};
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
const median = (xs) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  const rows = (await c.query(`
    SELECT DISTINCT ON (l.map_id) l.map_id, l.version, l.json, l.created_at, km.title, km.subject, km.classroom, km.source_text
    FROM lessons l JOIN knowledge_maps km ON km.id = l.map_id
    WHERE l.map_id IS NOT NULL ORDER BY l.map_id, l.version DESC, l.created_at DESC`)).rows;
  const out = [];
  for (const r of rows) {
    const j = r.json; const sections = j.sections ?? [];
    const concepts = (await c.query("SELECT local_id, term, definition, quote FROM km_concepts WHERE map_id=$1", [r.map_id])).rows;
    const teach = textOfBlocks(sections);
    const coreTeach = textOfBlocks(sections, ["explain", "example"]);
    const bank = bankText(j.experience);
    const src = r.source_text ?? "";
    const mapText = concepts.map((k) => `${k.term} ${k.definition} ${k.quote}`).join("\n");
    const srcKeys = termKeys(src), mapKeys = termKeys(mapText), teachKeys = termKeys(teach), allKeys = termKeys(teach + "\n" + bank);
    const inSet = (keys, set) => [...keys].filter((k) => set.has(k)).length;
    const covered = new Set(sections.flatMap((s) => (s.blocks ?? []).flatMap((b) => b.coversConceptIds ?? [])));
    const kinds = {}; for (const s of sections) for (const b of s.blocks ?? []) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1;
    out.push({
      title: r.title, subject: r.subject, grade: r.classroom,
      srcWords: words(src).length, teachWords: words(teach).length, coreTeachWords: words(coreTeach).length, bankWords: words(bank).length,
      afterAnswerWords: words(textOfBlocks(sections, undefined, true)).length,
      checks: kinds.check ?? 0, blocksPerSection: sections.length ? +((Object.values(kinds).reduce((a, b) => a + b, 0)) / sections.length).toFixed(1) : 0,
      probaSections: sections.filter((s) => s.probaEnabled !== false).length,
      ratioTeachToSrc: words(src).length ? +(words(teach).length / words(src).length).toFixed(2) : null,
      readMin: +(words(teach).length / 120).toFixed(1),
      sections: sections.length, blocks: Object.values(kinds).reduce((a, b) => a + b, 0), kinds,
      quiz: j.experience?.quiz?.length ?? 0, tasks: j.experience?.tasks?.length ?? 0, methods: j.experience?.methods?.length ?? 0,
      concepts: concepts.length, conceptsCoveredByIds: pct(concepts.filter((k) => covered.has(k.local_id)).length, concepts.length),
      conceptTermInTeach: pct(concepts.filter((k) => { const t = termKeys(k.term); return t.size === 0 || [...t].some((x) => teachKeys.has(x)); }).length, concepts.length),
      srcTermsInMap: pct(inSet(srcKeys, mapKeys), srcKeys.size),
      srcTermsInTeach: pct(inSet(srcKeys, teachKeys), srcKeys.size),
      srcTermsInLesson: pct(inSet(srcKeys, allKeys), srcKeys.size),
      teachTermsNotInSrc: pct([...teachKeys].filter((k) => !srcKeys.has(k)).length, teachKeys.size),
      redundancyPct: Math.round(100 * redundancy(teach)),
      gaps: j.gaps?.length ?? 0, misconceptions: j.misconceptions?.length ?? 0,
    });
  }
  await c.end();
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2));
  const keys = ["srcWords", "teachWords", "coreTeachWords", "afterAnswerWords", "checks", "blocksPerSection", "probaSections", "bankWords", "ratioTeachToSrc", "readMin", "sections", "blocks", "quiz", "tasks", "methods", "concepts", "conceptsCoveredByIds", "conceptTermInTeach", "srcTermsInMap", "srcTermsInTeach", "srcTermsInLesson", "teachTermsNotInSrc", "redundancyPct"];
  console.log(`leckék (legutolsó verzió térképenként): ${out.length}`);
  console.log("MEDIÁN:", Object.fromEntries(keys.map((k) => [k, median(out.map((o) => o[k]))])));
  console.table(out.map((o) => ({ cím: o.title.slice(0, 32), évf: o.grade, forrásSzó: o.srcWords, tanítSzó: o.teachWords, arány: o.ratioTeachToSrc, perc: o.readMin, szak: o.sections, kvíz: o.quiz, felad: o.tasks, fogalom: o.concepts, "forrás→térkép%": o.srcTermsInMap, "forrás→tanít%": o.srcTermsInTeach, "forrás→lecke%": o.srcTermsInLesson, "új szó%": o.teachTermsNotInSrc, "ism%": o.redundancyPct })));
})().catch((e) => { console.error("ERR", e.message); process.exit(1); });
