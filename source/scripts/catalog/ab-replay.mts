// Spec 2026-10-06-s6-katalogus-bekotes — INGYENES A/B-visszajátszás (modellhívás nélkül, CSAK OLVAS az éles DB-ből).
// A lezárt futások bankjára a GYÁRTÁSI lekérő függvényekkel (buildCatalogPool, unitCatalog) számolja, hány lektori bank-hiba
// és bank-javító kör maradt volna el, ha a fedett fogalmak kvízeit a szülő-ellenőrzött katalógus-tétel helyettesíti.
//   npx tsx scripts/catalog/ab-replay.mts [kimenet.json]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withReadOnlyDb } from "../lib/read-only-db";
import { subjectKeyOf } from "../../shared/subject-key";
import { bankUnitQuota } from "../../shared/lesson-bank-plan";
import { buildCatalogPool, lessonTopicText, unitCatalog, type CatalogRowLike, type CatalogConcept } from "../../server/catalog/retrieval";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = process.argv[2] ?? resolve(repoRoot, "docs/measurements/2026-10-06-s6-ab-replay.json");

type Item = { id: string; sectionIndex: number; coversConceptIds?: string[]; sourceHash?: string };
type Experience = { quiz: Item[]; tasks: Item[]; methods: Item[]; bankPlan?: { units: Array<{ sectionIndex: number; conceptIds: string[]; sourceHash?: string }>; taskRound: number; quizRound: number } };
type JobRow = { id: string; map_id: string; step: string; lesson: { classroom?: number; experience?: Experience } | null; subject: string; classroom: number; title: string };
type NoteRow = { job_id: string; block_path: string; item_id: string | null; round: number; severity: string };

export type LessonReplay = {
  jobId: string; subject: string; outcome: string; covered: boolean; verbatimSlots: number;
  notes: number; quizNotes: number; notesWithCatalog: number; notesOptimistic: number;
  rounds: number; roundsWithCatalog: number; roundsOptimistic: number; unresolvedNotes: number;
  /** Elméleti plafon (minden kvíz-jegyzet tétele helyettesítve; nyílt feladat/módszer nem szó szerinti — spec nem-cél). */
  notesQuizCeiling: number; roundsQuizCeiling: number;
};

const { lessons, skipped } = await withReadOnlyDb(async (q) => {
  const jobs = await q<JobRow>(`select j.id, j.map_id, j.step, j.output->'lesson' as lesson, m.subject, m.classroom, m.title
    from studio_jobs j join knowledge_maps m on m.id = j.map_id where j.step in ('done','error') order by j.created_at`);
  const notes = await q<NoteRow>(`select job_id, block_path, item_id, round, severity from lektor_notes where block_path like 'experience%'`);
  const concepts = await q<{ map_id: string; local_id: string; term: string | null; definition: string | null }>(`select map_id, local_id, term, definition from km_concepts`);
  const mapLessons = await q<{ map_id: string; id: string }>(`select map_id, id from lessons`);
  const rowsBySubject = new Map<string, CatalogRowLike[]>();
  const skipped: Record<string, number> = { unmappedSubject: 0, noBank: 0 };
  const lessons: LessonReplay[] = [];
  for (const job of jobs) {
    const subject = subjectKeyOf(job.subject);
    const exp = job.lesson?.experience;
    if (!subject) { skipped.unmappedSubject++; continue; }
    if (!exp?.bankPlan?.units?.length) { skipped.noBank++; continue; }
    if (!rowsBySubject.has(subject)) {
      rowsBySubject.set(subject, await q<CatalogRowLike>(`select subject, grade, topic_area as "topicArea", topic, kind, prompt, body, options, correct_index as "correctIndex",
        accepted, provenances, trust, status, fingerprint from catalog_items where subject = $1 and status = 'active'`, [subject]));
    }
    const mapConcepts: CatalogConcept[] = concepts.filter((c) => c.map_id === job.map_id).map((c) => ({ localId: c.local_id, term: c.term ?? undefined, definition: c.definition ?? undefined }));
    // Szivárgás ellen: ugyanennek a térképnek a (fúziós, gépi) leckéi nem lehetnek a saját katalógusuk.
    const excludeProvenances = new Set(mapLessons.filter((l) => l.map_id === job.map_id).map((l) => `lesson:${l.id}`));
    const pool = buildCatalogPool(rowsBySubject.get(subject)!, { subject, grade: job.classroom, topic: lessonTopicText(job.title, mapConcepts), concepts: mapConcepts, excludeProvenances });
    const plan = exp.bankPlan;
    const used = new Set<string>();
    const verbatim = new Map<string, number>(); // `${unitIndex}|${conceptId}` → szó szerinti tételek száma
    plan.units.forEach((unit, unitIndex) => {
      let quizTarget: number;
      try { quizTarget = bankUnitQuota(plan as never, unitIndex).quizTarget; } catch { quizTarget = exp.quiz.filter((i) => i.sourceHash && i.sourceHash === unit.sourceHash).length; }
      const uc = unitCatalog(pool, mapConcepts.filter((c) => unit.conceptIds.includes(c.localId)), { quizTarget, used });
      for (const v of uc.verbatim) verbatim.set(`${unitIndex}|${v.conceptId}`, (verbatim.get(`${unitIndex}|${v.conceptId}`) ?? 0) + 1);
    });
    const unitOf = (item: Item): number => {
      const byHash = plan.units.findIndex((u) => u.sourceHash && u.sourceHash === item.sourceHash);
      if (byHash >= 0) return byHash;
      return plan.units.findIndex((u) => u.sectionIndex === item.sectionIndex && (item.coversConceptIds ?? []).some((c) => u.conceptIds.includes(c)));
    };
    const quizCount = new Map<string, number>();
    for (const item of exp.quiz) { const k = `${unitOf(item)}|${item.coversConceptIds?.[0] ?? ""}`; quizCount.set(k, (quizCount.get(k) ?? 0) + 1); }
    const byId = new Map<string, { bank: string; item: Item }>();
    for (const bank of ["quiz", "tasks", "methods"] as const) for (const item of exp[bank] ?? []) byId.set(item.id, { bank, item });
    const jobNotes = notes.filter((n) => n.job_id === job.id);
    let unresolved = 0, quizNotes = 0;
    const perRound = new Map<number, Array<{ p: number; any: boolean; quiz: boolean }>>();
    for (const n of jobNotes) {
      let found = n.item_id ? byId.get(n.item_id) : undefined;
      const m = n.block_path.match(/^experience\.(quiz|tasks|methods)(?:\[(\d+)\]|\.(\d+))/);
      if (!found && m) { const item = (exp[m[1] as "quiz"] ?? [])[Number(m[2] ?? m[3])]; if (item) found = { bank: m[1], item }; }
      let p = 0, any = false, quiz = false;
      if (!found) unresolved++;
      else if (found.bank === "quiz") {
        quizNotes++; quiz = true;
        const k = `${unitOf(found.item)}|${found.item.coversConceptIds?.[0] ?? ""}`;
        const v = verbatim.get(k) ?? 0, qn = quizCount.get(k) ?? 0;
        p = v && qn ? Math.min(1, v / qn) : 0;
        any = v > 0;
      }
      const list = perRound.get(n.round) ?? [];
      list.push({ p, any, quiz });
      perRound.set(n.round, list);
    }
    const sum = (f: (x: { p: number; any: boolean; quiz: boolean }) => number) => [...perRound.values()].flat().reduce((a, x) => a + f(x), 0);
    const rounds = perRound.size;
    const roundsWithCatalog = [...perRound.values()].reduce((a, list) => a + (1 - list.reduce((prod, x) => prod * x.p, 1)), 0);
    const roundsOptimistic = [...perRound.values()].filter((list) => !list.every((x) => x.any)).length;
    const slots = [...verbatim.values()].reduce((a, b) => a + b, 0);
    lessons.push({
      jobId: job.id, subject, outcome: job.step, covered: slots > 0, verbatimSlots: slots,
      notes: jobNotes.length, quizNotes, notesWithCatalog: round2(sum((x) => 1 - x.p)), notesOptimistic: sum((x) => (x.any ? 0 : 1)),
      rounds, roundsWithCatalog: round2(roundsWithCatalog), roundsOptimistic, unresolvedNotes: unresolved,
      notesQuizCeiling: jobNotes.length - quizNotes, roundsQuizCeiling: [...perRound.values()].filter((list) => !list.every((x) => x.quiz)).length,
    });
  }
  return { lessons, skipped };
});

function round2(x: number) { return Math.round(x * 100) / 100; }
function aggregate(list: LessonReplay[]) {
  const s = (k: keyof LessonReplay) => round2(list.reduce((a, l) => a + (l[k] as number), 0));
  const red = (a: number, b: number) => (a ? round2((1 - b / a) * 100) : null);
  const notes = s("notes"), withCat = s("notesWithCatalog"), opt = s("notesOptimistic"), rounds = s("rounds"), roundsWith = s("roundsWithCatalog"), roundsOpt = s("roundsOptimistic");
  return { lessons: list.length, covered: list.filter((l) => l.covered).length, verbatimSlots: s("verbatimSlots"), bankNotes: notes, quizNotes: s("quizNotes"),
    bankNotesWithCatalog: withCat, bankNotesReductionPct: red(notes, withCat), bankNotesOptimistic: opt, bankNotesOptimisticReductionPct: red(notes, opt),
    bankRounds: rounds, bankRoundsWithCatalog: roundsWith, bankRoundsReductionPct: red(rounds, roundsWith), bankRoundsOptimistic: roundsOpt, bankRoundsOptimisticReductionPct: red(rounds, roundsOpt),
    bankNotesQuizCeilingReductionPct: red(notes, s("notesQuizCeiling")), bankRoundsQuizCeilingReductionPct: red(rounds, s("roundsQuizCeiling")),
    unresolvedNotes: s("unresolvedNotes") };
}
const subjects = [...new Set(lessons.map((l) => l.subject))].sort();
const result = {
  measuredAt: new Date().toISOString(),
  method: "docs/specs/2026-10-06-s6-katalogus-bekotes.md — Ingyenes A/B-visszajátszás (p = min(1, V/Q); optimista: p = 1, ha V > 0)",
  skipped,
  overall: { all: aggregate(lessons), covered: aggregate(lessons.filter((l) => l.covered)) },
  bySubject: Object.fromEntries(subjects.map((s) => [s, { all: aggregate(lessons.filter((l) => l.subject === s)), covered: aggregate(lessons.filter((l) => l.subject === s && l.covered)) }])),
  lessons,
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.table(Object.fromEntries([["ÖSSZES", result.overall.all], ["FEDETT", result.overall.covered], ...subjects.map((s) => [`${s} (fedett)`, result.bySubject[s].covered])].map(([k, v]) => [k, {
  leckék: (v as ReturnType<typeof aggregate>).lessons, fedett: (v as ReturnType<typeof aggregate>).covered, "bank-hiba": (v as ReturnType<typeof aggregate>).bankNotes,
  "kvíz-hiba": (v as ReturnType<typeof aggregate>).quizNotes, "hiba kat.": (v as ReturnType<typeof aggregate>).bankNotesWithCatalog, "csökk.%": (v as ReturnType<typeof aggregate>).bankNotesReductionPct,
  "opt.%": (v as ReturnType<typeof aggregate>).bankNotesOptimisticReductionPct, körök: (v as ReturnType<typeof aggregate>).bankRounds, "kör kat.": (v as ReturnType<typeof aggregate>).bankRoundsWithCatalog,
  "kör csökk.%": (v as ReturnType<typeof aggregate>).bankRoundsReductionPct, "plafon%": (v as ReturnType<typeof aggregate>).bankNotesQuizCeilingReductionPct,
}])));
console.log("kihagyva:", JSON.stringify(skipped), "kiírva:", out);
