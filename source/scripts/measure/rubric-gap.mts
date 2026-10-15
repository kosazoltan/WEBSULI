// Tételgyár T3.0 (docs/specs/2026-10-15-tetelgyar-t3-rubrika-fordito.md): a T2 kalibráció UTÁN is bukó helyes tesztválaszok okainak
// besorolása — DB-ÍRÁS és MODELLHÍVÁS NÉLKÜL. Bemenet: a T2.0 mérés nyers kimenete (esetek) + a jobok mentett bankja (csak olvasás).
// Futtatás (source/ mappából): npx tsx scripts/measure/rubric-gap.mts <answer-key-trial.json> <kimeneti json>
import { readFileSync, writeFileSync } from "node:fs";
import { withReadOnlyDb } from "../lib/read-only-db";
import type { AnswerKeyCases } from "../../shared/answer-key-tests";
import { calibrateRubric } from "../../shared/answer-key-calibrate";
import { evaluateOpenAnswer, missingAnswerConcepts, normalizeAnswer, STEM_SUFFIXES } from "../../shared/lesson-experience-score";
import type { OpenTask } from "../../shared/lesson-experience";
import { teachingTextOf } from "../../server/studio/experience-builder";

const [trialFile, outFile] = process.argv.slice(2);
if (!trialFile || !outFile) throw new Error("Használat: rubric-gap.mts <answer-key-trial.json> <kimeneti json>");
const trial = JSON.parse(readFileSync(trialFile, "utf8")) as { rows: Array<{ jobId: string; taskId: string; cases: AnswerKeyCases | null }> };
const casesOf = new Map(trial.rows.filter((r) => r.cases).map((r) => [r.taskId, r.cases!]));
const jobIds = [...new Set(trial.rows.map((r) => r.jobId))];
if (jobIds.length > 4) throw new Error("Költségkorlát: legfeljebb 4 job.");

const SUFFIX_RE = new RegExp(`^(?:${[...STEM_SUFFIXES].sort((a, b) => b.length - a.length).join("|")}|a|e|i|ai|ei|jai|jei|ja|je|ja|unk|ink|tok|tek|nk)*$`);
const words = (s: string) => normalizeAnswer(s).split(/\s+/).filter(Boolean);
const commonPrefix = (a: string, b: string) => { let n = 0; while (n < a.length && n < b.length && a[n] === b[n]) n++; return n; };
type Loaded = OpenTask & { jobId: string; teaching: string };
const tasks: Loaded[] = await withReadOnlyDb(async (q) => {
  const out: Loaded[] = [];
  for (const id of jobIds) {
    const [job] = await q<{ output: { lesson?: { sections?: unknown[]; experience?: { tasks?: OpenTask[] } } } }>("SELECT output FROM studio_jobs WHERE id=$1", [id]);
    const sections = job?.output?.lesson?.sections ?? [];
    for (const t of job?.output?.lesson?.experience?.tasks ?? []) out.push({ ...t, jobId: id, teaching: teachingTextOf(sections[t.sectionIndex]) });
  }
  return out;
});

/* T3.0 szimuláció (adat-szintű fordítási szabályok, a pontozó változatlan): a csoport új alternatívákat kap; a kalibráció őre itt is áll
   (a minta ok, egyik hibás eset sem ok) — ha sérül, az adott feladatnál a fordítás elmarad. */
const FUNCTION_WORDS = new Set(["valo", "a", "az", "es", "egy", "is", "vagy", "meg", "s", "illetve"]);
const CASE_FRAGMENT = /^(?:gyel|vel|val|szal|szel|zal|zel|tel|tal|nel|nal|rel|ral|del|dal|mal|mel|jel|jal|bol|bel|re|ra|ig|tol|hoz|hez|nak|nek|ban|ben|es|as|os|ed|od|at|et|ot|t)$/;
function contentWords(phrase: string): string[] {
  const ws = words(phrase);
  return ws.filter((w, i) => !FUNCTION_WORDS.has(w) && !(i > 0 && /\d/.test(ws[i - 1]) && CASE_FRAGMENT.test(w)));
}
const DERIVATION = ["sag", "seg", "as", "es"];
function compile(task: Loaded, rules: Set<string>): OpenTask {
  const attested = new Set(words(`${task.teaching} ${task.sample} ${task.q}`));
  const required = task.required.map((group) => {
    const out = new Set(group);
    for (const m of group) {
      const ws = words(m);
      if (rules.has("R1") && ws.length > 1) {
        const cw = contentWords(m);
        if (cw.length && cw.join(" ") !== ws.join(" ")) out.add(cw.join(" "));
        // Hosszú felsorolás: a tartalmi fej (az utolsó nem-szám szó) önmagában — csak 4+ tartalmi szónál.
        const heads = cw.filter((w) => !/\d/.test(w));
        if (rules.has("R2") && cw.length >= 4 && heads.length) out.add(heads[heads.length - 1]);
      }
      if (rules.has("R3") && ws.length === 1 && ws[0].length >= 8) {
        for (let i = 3; i <= ws[0].length - 3; i++) {
          const a = ws[0].slice(0, i), b = ws[0].slice(i);
          const ok = (x: string) => [...attested].some((w) => w === x || (w.startsWith(x) && SUFFIX_RE.test(w.slice(x.length))));
          if (a.length >= 3 && b.length >= 4 && ok(a) && ok(b)) { out.add(`${a} ${b}`); break; }
        }
      }
      if (rules.has("R5") && ws.length === 1) {
        for (const d of DERIVATION) if (ws[0].endsWith(d) && ws[0].length - d.length >= 5) { const base = ws[0].slice(0, -d.length); if (attested.has(base)) out.add(base); }
      }
    }
    return [...out];
  });
  return { ...task, required };
}
const guardOk = (t: OpenTask, c: AnswerKeyCases) => evaluateOpenAnswer(t.sample, t).state === "ok" && c.wrong.every((w) => evaluateOpenAnswer(w.text, t).state !== "ok");
const simulations: Record<string, { failingCorrect: number; wrongPass: number; compiledTasks: number; reverted: number }> = {};
for (const variant of ["–", "R1", "R1+R2", "R1+R3", "R1+R3+R5", "R1+R2+R3+R5"]) {
  const rules = new Set(variant.split("+"));
  let fc = 0, wp = 0, compiledTasks = 0, reverted = 0;
  for (const task of tasks) {
    const cases = casesOf.get(task.id);
    if (!cases) continue;
    let base: OpenTask = task;
    if (variant !== "–") {
      const compiled = compile(task, rules);
      if (JSON.stringify(compiled.required) !== JSON.stringify(task.required)) { if (guardOk(compiled, cases)) { base = compiled; compiledTasks++; } else reverted++; }
    }
    const cal = calibrateRubric(base, cases).task;
    fc += cases.correct.filter((a) => evaluateOpenAnswer(a, cal).state !== "ok").length;
    wp += cases.wrong.filter((w) => evaluateOpenAnswer(w.text, cal).state === "ok").length;
  }
  simulations[variant] = { failingCorrect: fc, wrongPass: wp, compiledTasks, reverted };
}


/**
 * A hiányzó csoport besorolása (a válasz és a csoport tagjai alapján), az első illeszkedő osztály:
 * - toldalék: a válasz egy szava a tag szavának ≥ 4 betűs kezdete + toldalékszerű maradék (vitamin → vitaminjai) — fordítóval generálható;
 * - összetétel: a válasz szava a tag szavát tartalmazza összetételben / kötőjeles előtagként (egészség → egészségvédelmi);
 * - kifejezés-rész: többszavas tagból a szavak egy része megvan (szó szerinti kifejezés kötelező);
 * - közös tő: ≥ 5 betűs közös kezdet, de nem toldalékszerű maradék (nemesítés / nemesítették);
 * - nincs rokon: a válaszban nincs a csoporttal rokon szó (más szóval mondja, vagy a csoport nem lényeges).
 */
function classify(group: readonly string[], answer: string): string {
  const aw = words(answer);
  const parts = group.flatMap((m) => words(m));
  const multi = group.filter((m) => words(m).length > 1);
  for (const p of parts) for (const w of aw) if (p.length >= 4 && w.startsWith(p) && w !== p && SUFFIX_RE.test(w.slice(p.length))) return "toldalék";
  for (const p of parts) for (const w of aw) if (p.length >= 4 && w !== p && (w.includes(p) || p.includes(w) && w.length >= 4)) return "összetétel";
  if (multi.some((m) => words(m).some((p) => aw.includes(p)))) return "kifejezés-rész";
  for (const p of parts) for (const w of aw) if (commonPrefix(p, w) >= 5) return "közös tő";
  return "nincs rokon";
}

const counts: Record<string, number> = {};
const otherReasons: Record<string, number> = {};
const perTask: Array<{ taskId: string; q: string; groups: number; failingCorrect: number; classes: string[] }> = [];
let tested = 0, failingCorrect = 0, failingTasks = 0, groupsBefore = 0, groupsAfter = 0;
for (const task of tasks) {
  const cases = casesOf.get(task.id);
  if (!cases) continue;
  tested++;
  const cal = calibrateRubric(task, cases).task;
  groupsBefore += task.required.length;
  groupsAfter += cal.required.length;
  const failing = cases.correct.filter((a) => evaluateOpenAnswer(a, cal).state !== "ok");
  if (!failing.length) continue;
  failingTasks++;
  failingCorrect += failing.length;
  const classes: string[] = [];
  for (const answer of failing) {
    const missing = missingAnswerConcepts(answer, cal);
    if (!missing.length) { const r = evaluateOpenAnswer(answer, cal).reason; otherReasons[r] = (otherReasons[r] ?? 0) + 1; classes.push(`egyéb: ${r}`); continue; }
    for (const g of missing) { const c = classify(g, answer); counts[c] = (counts[c] ?? 0) + 1; classes.push(c); }
  }
  perTask.push({ taskId: task.id, q: task.q.slice(0, 160), groups: cal.required.length, failingCorrect: failing.length, classes });
}
/* T3.0 szimuláció 2: a PONTOZÓ összetétel-felismerése (csak új, jelölt feladatokra lehetne — a régi leckék pontozása nem változhat).
   A v1 illesztése + a válasz szava a rubrika ≥ 5 betűs szavát összetétel-tagként tartalmazza (eleje: ≥ 5 betűs tag + legalább 3 betűs
   folytatás; vége: a válaszszó a taggal végződik / a tag + toldalék). Tagadás és szám soha nem illeszkedik így. */
function compoundHit(token: string, word: string): boolean {
  if (/\d/.test(token + word) || ["nem", "ne", "sem", "nincs"].includes(word) || word.length < 5 || token.length < word.length + 2) return false;
  if (token.startsWith(word)) return true;
  const i = token.indexOf(word);
  return i >= 3 && SUFFIX_RE.test(token.slice(i + word.length));
}
function evalCompound(answer: string, task: OpenTask): "ok" | "other" {
  if (evaluateOpenAnswer(answer, task).state === "ok") return "ok";
  // Pontos szimuláció: a hiányzó csoportot, ha a válasz egy szava összetétel-tagként igazolja, erre a válaszra kiegészítjük a talált szóval,
  // és a VÁLTOZATLAN v1 pontozó dönt (mondat, tagadás, szóminimum, többi csoport).
  const tokens = words(answer);
  const required = task.required.map((g) => {
    if (!missingAnswerConcepts(answer, { required: [g] }).length) return g;
    for (const phrase of g) {
      const hits = words(phrase).map((w) => tokens.find((t) => t === w || compoundHit(t, w)));
      if (hits.every(Boolean)) return [...g, hits.join(" ")];
    }
    return g;
  });
  return evaluateOpenAnswer(answer, { ...task, required }).state === "ok" ? "ok" : "other";
}
{
  let fc = 0, wp = 0;
  for (const task of tasks) {
    const cases = casesOf.get(task.id);
    if (!cases) continue;
    const cal = calibrateRubric(task, cases).task;
    fc += cases.correct.filter((a) => evalCompound(a, cal) !== "ok").length;
    wp += cases.wrong.filter((w) => evalCompound(w.text, cal) === "ok").length;
  }
  simulations["pontozó: összetétel-felismerés"] = { failingCorrect: fc, wrongPass: wp, compiledTasks: 0, reverted: 0 };
}
const result = { date: new Date().toISOString().slice(0, 10), source: trialFile.replace(/^.*[\\/]/, ""), tested, failingTasks, failingCorrect,
  avgRequiredGroups: { before: +(groupsBefore / tested).toFixed(2), afterCalibration: +(groupsAfter / tested).toFixed(2) },
  missingGroupClasses: counts, otherReasons, simulations, sample: perTask.slice(0, 25) };
writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, sample: undefined }, null, 2));
