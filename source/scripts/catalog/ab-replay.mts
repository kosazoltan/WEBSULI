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
import { replayLessonStats, type ReplayGroup, type ReplayNote } from "./ab-replay-model";

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

// Review #202: a gyártási `loadMap` (createDrizzlePipelineStore) csak a tanított fogalmakat adja (TAUGHT_REVIEW_STATES = kept | edited) —
// a visszajátszás ugyanígy szűr (a pending/rejected fogalom nem kerülhet a téma-szövegbe és az egység-illesztésbe).
const TAUGHT_REVIEW_STATES = ["kept", "edited"] as const;

const { lessons, skipped, inputSnapshotAt } = await withReadOnlyDb(async (q) => {
  const jobs = await q<JobRow>(`select j.id, j.map_id, j.step, j.output->'lesson' as lesson, m.subject, m.classroom, m.title
    from studio_jobs j join knowledge_maps m on m.id = j.map_id where j.step in ('done','error') order by j.created_at, j.id`);
  const notes = await q<NoteRow>(`select job_id, block_path, item_id, round, severity from lektor_notes where block_path like 'experience%'
    order by job_id, round, block_path, item_id, id`);
  const concepts = await q<{ map_id: string; local_id: string; term: string | null; definition: string | null }>(`select map_id, local_id, term, definition
    from km_concepts where review_state = any($1::text[]) order by map_id, order_index, local_id`, [[...TAUGHT_REVIEW_STATES]]);
  // Review #202: reprodukálható kimenet — futási idő helyett a bemenet pillanatképének ideje (a legfrissebb bemeneti sor időbélyege).
  const [snapshot] = await q<{ at: string | null }>(`select to_char(greatest(
      (select max(coalesce(finished_at, created_at)) from studio_jobs where step in ('done','error')),
      (select max(created_at) from lektor_notes),
      (select max(created_at) from km_concepts),
      (select max(updated_at) at time zone 'UTC' from catalog_items)
    ), 'YYYY-MM-DD"T"HH24:MI:SS.MS') as at`);
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
        accepted, provenances, trust, status, fingerprint from catalog_items where subject = $1 and status = 'active' order by fingerprint`, [subject]));
    }
    const mapConcepts: CatalogConcept[] = concepts.filter((c) => c.map_id === job.map_id).map((c) => ({ localId: c.local_id, term: c.term ?? undefined, definition: c.definition ?? undefined }));
    // Szivárgás ellen: ugyanennek a térképnek a (fúziós, gépi) leckéi nem lehetnek a saját katalógusuk.
    const excludeProvenances = new Set(mapLessons.filter((l) => l.map_id === job.map_id).map((l) => `lesson:${l.id}`));
    const pool = buildCatalogPool(rowsBySubject.get(subject)!, { subject, grade: job.classroom, topic: lessonTopicText(job.title, mapConcepts), concepts: mapConcepts, excludeProvenances });
    const plan = exp.bankPlan;
    const used = new Set<string>();
    const verbatim = new Map<string, number>(); // `${unitIndex}|${conceptId}` → szó szerint BESZÚRT tételek száma (a kiválasztás a blokk-korláton belül)
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
    const groupOf = (item: Item) => `${unitOf(item)}|${item.coversConceptIds?.[0] ?? ""}`;
    const groups = new Map<string, ReplayGroup>();
    for (const item of exp.quiz) { const k = groupOf(item); const g = groups.get(k) ?? { verbatim: verbatim.get(k) ?? 0, quizzes: 0 }; g.quizzes++; groups.set(k, g); }
    const byId = new Map<string, { bank: string; index: number }>();
    for (const bank of ["quiz", "tasks", "methods"] as const) (exp[bank] ?? []).forEach((item, index) => byId.set(item.id, { bank, index }));
    const jobNotes = notes.filter((n) => n.job_id === job.id);
    const replayNotes: ReplayNote[] = jobNotes.map((n) => {
      let found = n.item_id ? byId.get(n.item_id) : undefined;
      const m = n.block_path.match(/^experience\.(quiz|tasks|methods)(?:\[(\d+)\]|\.(\d+))/);
      if (!found && m && (exp[m[1] as "quiz"] ?? [])[Number(m[2] ?? m[3])]) found = { bank: m[1], index: Number(m[2] ?? m[3]) };
      if (!found) return { round: n.round };
      // Ugyanazon tétel több jegyzete egy esemény: a tétel kulcsa a bank + index.
      const item = `${found.bank}[${found.index}]`;
      return found.bank === "quiz" ? { round: n.round, item, group: groupOf(exp.quiz[found.index]) } : { round: n.round, item };
    });
    const stats = replayLessonStats(replayNotes, groups);
    const slots = [...verbatim.values()].reduce((a, b) => a + b, 0);
    lessons.push({
      jobId: job.id, subject, outcome: job.step, covered: slots > 0, verbatimSlots: slots,
      notes: stats.notes, quizNotes: stats.quizNotes, notesWithCatalog: round2(stats.notesWithCatalog), notesOptimistic: stats.notesOptimistic,
      rounds: stats.rounds, roundsWithCatalog: round2(stats.roundsWithCatalog), roundsOptimistic: stats.roundsOptimistic, unresolvedNotes: stats.unresolvedNotes,
      notesQuizCeiling: stats.notesQuizCeiling, roundsQuizCeiling: stats.roundsQuizCeiling,
    });
  }
  return { lessons, skipped, inputSnapshotAt: snapshot?.at ? `${snapshot.at}Z` : null };
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
  inputSnapshotAt,
  method: "docs/specs/2026-10-06-s6-katalogus-bekotes.md — Ingyenes A/B-visszajátszás (jegyzet: p = min(V, Q)/Q; kör: hipergeometrikus, tétel-egyedi; optimista: csoportonként a legjobb min(V, Q) tétel)",
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
