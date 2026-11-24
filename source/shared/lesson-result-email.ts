import { GUEST_PAIRING_HINT_HTML } from "./pairing-guide";
import { createHash } from "node:crypto";
import { z } from "zod";
import { evaluateOpenAnswer, evaluateOpenAnswerV2, isTypedTask, missingAnswerConcepts, missingOrder, missingPhrases, scoreSummary, type AnswerScore } from "./lesson-experience-score";

/**
 * Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md) — tiszta modul, DB és hálózat nélkül:
 * a beküldés sémája, a SZERVEROLDALI újrapontozás (a kliens pontszámát nem fogadjuk), és a levél (minden szöveg escape-elve).
 */
const roundId = z.string().regex(/^[a-z0-9-]{4,64}$/);
const id = z.string().min(1).max(80);
// Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S2): a párosított eszköz tokenje — a szerver ellenőrzi.
const learner = z.string().max(120).optional();
// Bontás B1a (a #510 R2 / R13): a kör kezdete és az utolsó kvízválasz ideje (ezredmásodperc) — opcionális: a régi kliens nélkülük küld; a
// kliens a B1b-ben kezdi küldeni őket (a szigorú séma miatt előbb a szervernek kell elfogadnia).
const startedAt = z.number().int().positive().optional();
const lastAnsweredAt = z.number().int().positive().optional();
export const resultRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tasks"), roundId, answers: z.record(id, z.string().max(4000)).refine(r => Object.keys(r).length <= 60, "Legfeljebb 60 válasz."), fingerprint: z.string().max(80).optional(), learner, startedAt }).strict(),
  z.object({ kind: z.literal("quiz"), roundId, picks: z.record(id, z.number().int().min(-1).max(7)).refine(r => Object.keys(r).length <= 100, "Legfeljebb 100 kérdés."), fingerprint: z.string().max(80).optional(), learner, startedAt, lastAnsweredAt, partial: z.boolean().optional() }).strict(),
]);
export type ResultRequest = z.infer<typeof resultRequestSchema>;

type OpenTask = Parameters<typeof evaluateOpenAnswer>[1] & { id: string; q: string };
type QuizItem = { id: string; question: string; options: string[]; correctIndex: number };
export type ArbiterLookup = (task: OpenTask, answer: string) => { state: AnswerScore["state"]; score: number } | null | undefined;

/**
 * Spec 2026-10-20-s4 (S4b): a sor a levél mezői mellett a feladatszintű méréshez is ad adatot — `detState` (a pontozó ítélete),
 * `arbiterRaised` (a döntőbíró emelte), `tightenedOnlyMiss` (a pontozó csak a gépileg szigorított csoport(ok) hiánya miatt nem adott teljes
 * pontot). A levél (`buildResultEmail`) ezeket nem használja.
 */
export type GradedTaskRow = { taskId: string; q: string; answer: string; sample: string; state: AnswerScore["state"]; score: number; detState: AnswerScore["state"]; arbiterRaised: boolean; tightenedOnlyMiss: boolean; rubricHash: string };

/** Review #340: a feladat pontozási lenyomata — a statisztika csak az AKTUÁLIS rubrikára adott eredményeket számolja. */
export function rubricHash(task: OpenTask): string {
  const parts: unknown[] = [task.q, task.sample, task.required, task.bonus, task.minWords, task.needsSentence, task.typedAnswers ?? null, task.requiredDistinct ?? null];
  // S5a: a kifejezés a rubrika része — csak ha van (kifejezés nélkül a lenyomat változatlan).
  if (task.requiredPhrases?.length) parts.push({ requiredPhrases: task.requiredPhrases });
  if (task.requiredOrder?.length) parts.push({ requiredOrder: task.requiredOrder });
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
/** Bontás B1a: a levél kísérő adatai — a kör kezdete (a kliens küldi a B1b-től; hiányában nincs „A kör kezdete” sor). */
export type ResultMeta = { startedAt?: number; lastAnsweredAt?: number; partial?: { answered: number; total: number }; supersedesPartial?: boolean | "unknown" };
export type GradedTasks = { kind: "tasks"; rows: GradedTaskRow[]; summary: ReturnType<typeof scoreSummary>; meta?: ResultMeta };
/** Spec 2026-11-17-eredmeny-email-kviz: `rows` a kör MINDEN kérdése (a levél kérdésenkénti listája); a `wrong` a hibás / kihagyott részhalmaz. */
export type GradedQuizRow = { question: string; picked: string | null; correct: string; ok: boolean };
export type GradedQuiz = { kind: "quiz"; rows: GradedQuizRow[]; wrong: Array<{ question: string; picked: string | null; correct: string }>; summary: ReturnType<typeof scoreSummary>; meta?: ResultMeta };

/** S4b: a pontozó csak a gépi szigorítással (S3c) felvett csoport(ok) hiánya miatt nem adott teljes pontot (JSON-egyezés a `tightened`-del). */
export function tightenedOnlyMiss(task: OpenTask, answer: string, detState: AnswerScore["state"]): boolean {
  if (detState === "ok" || !answer || !(task.tightened?.length || task.tightenedPhrases?.length || task.tightenedOrder)) return false;
  const tightened = new Set((task.tightened ?? []).map((g) => JSON.stringify(g)));
  // S5b: a kifejezéses szigorítás (`tightenedPhrases`) ugyanígy — a hiányzó kifejezéscsoportok mind a szigorítottak közül valók.
  const tightenedPhrases = new Set((task.tightenedPhrases ?? []).map((g) => JSON.stringify(g)));
  const missing = missingAnswerConcepts(answer, task);
  const missingP = missingPhrases(answer, task);
  // S6b: a gépi sorrendi szabály is lehet a (szigorított) hiány; a modell adta sorrend hiánya más ok.
  const orderMiss = missingOrder(answer, task);
  if (!missing.length && !missingP.length && !orderMiss) return false;
  if (orderMiss && !task.tightenedOrder) return false;
  if (!missing.every((g) => tightened.has(JSON.stringify(g))) || !missingP.every((g) => tightenedPhrases.has(JSON.stringify(g)))) return false;
  // Review #340 (P1): ellenpróba — a szigorított csoportok nélkül a pontozó teljes pontot adna (különben más ok is van: hossz, mondat,
  // tagadás…, és a döntőbírói emelés nem a szigorítás téves elutasítása).
  const required = task.required.filter((g) => !tightened.has(JSON.stringify(g)));
  const phrases = (task.requiredPhrases ?? []).filter((g) => !tightenedPhrases.has(JSON.stringify(g)));
  // Review #347: az ellenpróba a feladat SAJÁT pontozási útján fut — a szigorított mezők elhagyása nem vihet át a v1-re, amely a v2
  // szabályait (pl. a tört egy szó) nem nézi, így más ok miatti bukás nem látszhat a szigorítás téves elutasításának.
  const counterfactual = { ...task, required, requiredPhrases: phrases.length ? phrases : undefined, requiredOrder: task.tightenedOrder ? undefined : task.requiredOrder };
  return required.length > 0 && (isTypedTask(task) ? evaluateOpenAnswerV2 : evaluateOpenAnswer)(answer, counterfactual).state === "ok";
}

/** Csak az ismert feladatokat pontozza; a döntőbíró gyorsítótár-ítélete (ha van) csak emelhet — mint a tanuló képernyőjén. */
export function gradeTasks(tasks: readonly OpenTask[], answers: Record<string, string>, arbiter?: ArbiterLookup): GradedTasks {
  const rows: GradedTasks["rows"] = [];
  for (const [taskId, raw] of Object.entries(answers)) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) continue;
    const answer = raw.trim();
    const det = evaluateOpenAnswer(answer, task);
    const arb = answer ? arbiter?.(task, answer) : null;
    const raised = Boolean(arb && arb.score > det.score);
    const best = raised ? { state: arb!.state, score: arb!.score } : { state: det.state, score: det.score };
    rows.push({ taskId, q: task.q, answer, sample: task.sample, ...best, detState: det.state, arbiterRaised: raised, tightenedOnlyMiss: tightenedOnlyMiss(task, answer, det.state), rubricHash: rubricHash(task) });
  }
  return { kind: "tasks", rows, summary: scoreSummary(rows.reduce((s, r) => s + r.score, 0), rows.length) };
}

/**
 * A kör ÖSSZES kérdését kapja; a kihagyott kérdés jele -1 (review #280: különben 1 helyes + 24 kihagyás 100%-ot adna a képernyő 4%-a
 * helyett). A kihagyás nulla pont, és a hibás kérdések között „nincs válasz”-ként szerepel.
 */
export function gradeQuiz(quiz: readonly QuizItem[], picks: Record<string, number>): GradedQuiz {
  const asked = Object.entries(picks).map(([qid, pick]) => ({ item: quiz.find(q => q.id === qid), pick })).filter((x): x is { item: QuizItem; pick: number } => !!x.item);
  const rows = asked.map(x => ({ question: x.item.question, picked: x.pick >= 0 ? x.item.options[x.pick] ?? null : null, correct: x.item.options[x.item.correctIndex], ok: x.pick === x.item.correctIndex }));
  const wrong = rows.filter(r => !r.ok).map(({ question, picked, correct }) => ({ question, picked, correct }));
  return { kind: "quiz", rows, wrong, summary: scoreSummary(asked.length - wrong.length, asked.length) };
}

/**
 * B5a-0 (#510 S1b, R5): a le nem zárt kvíz pillanatképe — csak a MEGVÁLASZOLT kérdések számítanak (a pont és a százalék rájuk vonatkozik); a
 * kör teljes kérdésszáma (`roundSize`, a szerver által ismert körméret; megadása nélkül a beküldött ismert azonosítók száma, de nem kisebb a
 * megválaszoltnál) a `meta.partial`-ban. Megválaszolt kérdés nélkül `null` (nincs miről levelet küldeni).
 */
export function gradePartialQuiz(quiz: readonly QuizItem[], picks: Record<string, number>, roundSize?: number): GradedQuiz | null {
  const known = Object.entries(picks).filter(([qid]) => quiz.some(q => q.id === qid));
  const answered = known.filter(([, pick]) => pick >= 0);
  if (!answered.length) return null;
  return { ...gradeQuiz(quiz, Object.fromEntries(answered)), meta: { partial: { answered: answered.length, total: Math.max(roundSize ?? known.length, answered.length) } } };
}

/** Dátum és idő magyar idő szerint (Europe/Budapest, a nyári időszámítással): „2026. 11. 17. 20:41”. */
export function formatBudapest(date: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}. ${parts.month}. ${parts.day}. ${parts.hour}:${parts.minute}`;
}
/** A kliens által küldött körkezdet csak akkor jelenik meg, ha hihető: a beküldés előtti, legfeljebb 400 napos. */
const plausibleStart = (startedAt: number | undefined, sentAt: Date): Date | null =>
  startedAt !== undefined && startedAt <= sentAt.getTime() && sentAt.getTime() - startedAt <= 400 * 86_400_000 ? new Date(startedAt) : null;

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const MARK = { ok: "✅", partial: "🟡", fail: "❌" } as const;

/** A kvíz egy kérdése a levélben: jelölés, a gyerek válasza (vagy „nem válaszolt”), hibásnál / kihagyottnál a helyes válasz. */
function quizRowHtml(r: GradedQuizRow): string {
  const picked = r.picked !== null ? esc(r.picked) : "<em>(nem válaszolt)</em>";
  return `<li><p><strong>${esc(r.question)}</strong></p><p>${r.ok ? MARK.ok : MARK.fail} ${picked}${r.ok ? "" : ` — helyes: ${esc(r.correct)}`}</p></li>`;
}

/** A párosítatlan, be nem jelentkezett tanuló neve az eredménylevélben. */
export const GUEST_LEARNER = "Vendég tanuló";

export function buildResultEmail(input: { lessonTitle: string; classroom: number; learner: string; learnerFirst?: string; guest?: boolean; url: string; graded: GradedTasks | GradedQuiz; sentAt?: Date }): { subject: string; html: string } {
  const { graded } = input;
  const meta = graded.meta ?? {};
  // Bontás B1a: a beküldés ideje mindig, a kör kezdete csak hihető (múltbeli, legfeljebb 400 napos) értékkel — magyar idő szerint.
  const sentAt = input.sentAt ?? new Date();
  const started = plausibleStart(meta.startedAt, sentAt);
  // B5a-0 (#510 R13): a „félbehagyva” levél dátumsora a gyerek UTOLSÓ válaszának ideje (a 15 perccel későbbi küldési idő helyett).
  const lastAnswered = meta.partial ? plausibleStart(meta.lastAnsweredAt, sentAt) : null;
  const dateLine = lastAnswered ? `<strong>Utolsó válasz:</strong> ${formatBudapest(lastAnswered)} (magyar idő)` : `<strong>Beküldve:</strong> ${formatBudapest(sentAt)} (magyar idő)`;
  const part = graded.kind === "tasks" ? "Feladatok" : meta.partial ? `Kvíz (félbehagyva: ${meta.partial.answered} / ${meta.partial.total})` : "Kvíz";
  const s = graded.summary;
  const subject = `[WebSuli eredmény] ${input.learnerFirst ? `${input.learnerFirst} – ` : ""}${input.lessonTitle} — ${part} — ${s.percent}% (${s.label})`.slice(0, 200);
  const head = `<h2>${esc(input.lessonTitle)} — ${part}</h2>
<p><strong>Tanuló:</strong> ${esc(input.learner)}<br><strong>Évfolyam:</strong> ${input.classroom}. osztály<br>
${dateLine}${started ? `<br><strong>A kör kezdete:</strong> ${formatBudapest(started)}` : ""}<br>
${meta.partial ? `<strong>Állapot:</strong> félbehagyva — ${meta.partial.answered} / ${meta.partial.total} kérdésre válaszolt; a pont a megválaszolt kérdésekre vonatkozik.<br>\n` : ""}${meta.supersedesPartial === "unknown" ? "<strong>Állapot:</strong> ez a befejezett kör eredménye — ha erről a körről korábban „félbehagyva” jelzésű levél érkezett, ez lép a helyébe.<br>\n" : meta.supersedesPartial ? "<strong>Állapot:</strong> ez a befejezett kör eredménye — a korábbi, „félbehagyva” jelzésű levél helyébe lép.<br>\n" : ""}<strong>Eredmény:</strong> ${s.points} / ${s.total} pont — ${s.percent}% — ${s.grade} (${esc(s.label)})</p>`;
  const body = gradedBodyHtml(graded);
  // Spec 2026-10-21-tanulo-parositas: vendég eredményénél útmutató — így látszik, melyik gyermek eszköze nincs párosítva. Review #362: a
  // hívó attribúciójából (nincs fiók, nincs párosítás), nem a megjelenített névből (egy fiók neve is lehetne „Vendég tanuló”).
  const guestHint = input.guest ? GUEST_PAIRING_HINT_HTML : "";
  return { subject, html: `${head}${body}${guestHint}<p><a href="${esc(input.url)}">A lecke megnyitása</a></p>` };
}

/** A rész törzse (feladatlista a mintaválasszal, ill. a kvíz kérdései) — az egyrészes és az összevont levél közös darabja (U4a). */
function gradedBodyHtml(graded: GradedTasks | GradedQuiz): string {
  const meta = graded.meta ?? {};
  return graded.kind === "tasks"
    // Spec 2026-11-17-eredmeny-email-kviz: a feladat alatt a mintaválasz; a kvíz MINDEN kérdése a gyerek válaszával és a helyessel.
    ? `<ol>${graded.rows.map(r => `<li><p><strong>${esc(r.q)}</strong></p><p>${MARK[r.state]} ${r.answer ? esc(r.answer) : "<em>(nem válaszolt)</em>"}</p>${r.sample ? `<p><em>Mintaválasz:</em> ${esc(r.sample)}</p>` : ""}</li>`).join("")}</ol>`
    // B5a-0 (#510 R13): a félbehagyott kvíznél csak a megválaszolt kérdésekről mondhat ilyet.
    : `${graded.wrong.length ? "" : meta.partial ? "<p>Minden megválaszolt kérdésre helyes választ adott.</p>" : "<p>Minden kérdésre helyes választ adott.</p>"}${graded.rows.length ? `<ol>${graded.rows.map(quizRowHtml).join("")}</ol>` : ""}`;
}

const resultLine = (s: GradedTasks["summary"]) => `${s.points} / ${s.total} pont — ${s.percent}% — ${s.grade} (${esc(s.label)})`;

/**
 * U4 (docs/specs/2026-11-24-osszevont-eredmenylevel.md): a kétrészes lecke eredménye EGY levélben — a szöveges feladatok és a kvíz
 * külön szakaszban (a meglévő törzzsel), fölötte közös összesítő. Ha 7 nap alatt csak az egyik rész készült el, a levél részleges
 * jelölést kap (a tárgyban és a fejlécben); az összesítő ilyenkor a meglévő részből számol. Legalább egy rész kötelező.
 */
export function buildCombinedResultEmail(input: { lessonTitle: string; classroom: number; learner: string; learnerFirst?: string; guest?: boolean; url: string; tasks: GradedTasks | null; quiz: GradedQuiz | null; sentAt?: Date }): { subject: string; html: string } {
  const parts = [input.tasks, input.quiz].filter((g): g is GradedTasks | GradedQuiz => g !== null);
  if (!parts.length) throw new Error("buildCombinedResultEmail: legalább egy rész kötelező");
  const all = scoreSummary(parts.reduce((n, g) => n + g.summary.points, 0), parts.reduce((n, g) => n + g.summary.total, 0));
  const sentAt = input.sentAt ?? new Date();
  const missing = !input.tasks ? "tasks" : !input.quiz ? "quiz" : null;
  const part = missing === "tasks" ? "Kvíz (részleges: a feladatok hiányoznak)" : missing === "quiz" ? "Feladatok (részleges: a kvíz hiányzik)" : "Feladatok + kvíz";
  const subject = `[WebSuli eredmény] ${input.learnerFirst ? `${input.learnerFirst} – ` : ""}${input.lessonTitle} — ${part} — ${all.percent}% (${all.label})`.slice(0, 200);
  const missingLine = missing === "tasks" ? "<strong>Részleges eredmény:</strong> a szöveges feladatok 7 napon belül nem készültek el.<br>\n"
    : missing === "quiz" ? "<strong>Részleges eredmény:</strong> a kvíz 7 napon belül nem készült el.<br>\n" : "";
  const head = `<h2>${esc(input.lessonTitle)} — ${missing ? "Részleges eredmény" : "Feladatok és kvíz"}</h2>
<p><strong>Tanuló:</strong> ${esc(input.learner)}<br><strong>Évfolyam:</strong> ${input.classroom}. osztály<br>
<strong>Beküldve:</strong> ${formatBudapest(sentAt)} (magyar idő)<br>
${missingLine}<strong>Összesítve:</strong> ${resultLine(all)}</p>`;
  const sections = parts.map((g) => `<h3>${g.kind === "tasks" ? "Feladatok" : "Kvíz"} — ${g.summary.percent}%</h3>
<p><strong>Eredmény:</strong> ${resultLine(g.summary)}</p>${gradedBodyHtml(g)}`).join("");
  const guestHint = input.guest ? GUEST_PAIRING_HINT_HTML : "";
  return { subject, html: `${head}${sections}${guestHint}<p><a href="${esc(input.url)}">A lecke megnyitása</a></p>` };
}
