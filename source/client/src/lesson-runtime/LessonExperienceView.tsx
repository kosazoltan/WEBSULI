import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { BookOpen, Brain, PencilLine, Trophy, Download, RotateCcw, Mic, Leaf, Palette, Layers, Volume2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { experienceRoundSizes, type LessonExperience } from "@shared/lesson-experience";
import { evaluateOpenAnswer, scoreSummary, sampleTaskIds } from "@shared/lesson-experience-score";
import { CognitiveMethods } from "./CognitiveMethods";
import { DictationButton, PronounceButton, SpeakButton } from "./ExperienceSpeech";
import { useExperienceRound } from "./useExperienceRound";
import { useResultReport } from "./resultReport";
import { LearningMode, LearningPager, useLearningPreference } from "./LearningControls";
import "./lesson-experience.css";
import { PracticeAccess } from "./SavedLessonQuiz";
import { FinishPracticeButton } from "./FinishPracticeButton";
import { bestVerdict, useArbiterVerdicts, type ArbiterSource } from "./arbiter";
import { lessonFlashcards } from "@shared/lesson-flashcards";
import { FlashcardReview } from "./FlashcardReview";
import { VerdictFeedback } from "./VerdictFeedback";
import { displayHeading, stripVerdictPrefix } from "@shared/lesson-ui-text";

// Websuli Design §3/§6: az ötödik fül a memóriakártya-ismétlés (docs/specs/2026-10-16-websuli-ismetles.md) — csak ha van kártya.
// Spec 2026-10-21-nyelvlecke-kiejtes: nyelvleckén a második fül a kiejtésgyakorló (felolvasás + kimondás) — csak ha van nyelv.
const TABS = [{ id: "teaching", label: "Tananyag", icon: BookOpen }, { id: "pronounce", label: "Kiejtés", icon: Volume2 }, { id: "methods", label: "Módszerek", icon: Brain }, { id: "tasks", label: "Feladatok", icon: PencilLine }, { id: "quiz", label: "Kvíz", icon: Trophy }, { id: "review", label: "Ismétlés", icon: Layers }] as const;
type Tab = typeof TABS[number]["id"];
/** A diktálás nyelvválasztójának felirata (a lecke nyelvének első tagja szerint). */
const LANGUAGE_ADVERB: Record<string, string> = { en: "Angolul", fr: "Franciául", de: "Németül", es: "Spanyolul", it: "Olaszul", la: "Latinul", ru: "Oroszul" };
const languageAdverb = (language: string) => LANGUAGE_ADVERB[language.split("-")[0]] ?? "Idegen nyelven";
function Result({ title, points, total, seconds, answers }: { title: string; points: number; total: number; seconds: number; answers: unknown }) {
  const score = scoreSummary(points, total);
  return <section className="fusion-result" aria-label={`${title} eredmény`}>
    <span className="fusion-eyebrow">{title} · gyakorló eredmény</span><h3>{score.percent}% · {score.label} ({score.grade})</h3>
    <p>{score.points} / {score.total} pont · {Math.floor(seconds / 60)} perc {seconds % 60} másodperc</p>
    <progress max={total} value={points} aria-label="Elért pontok" />
    <button className="lesson-outline-btn" onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify({ title, ...score, seconds, answers, measuredAt: new Date().toISOString(), assessment: "Gyakorló önellenőrzés; nem hivatalos jegy." }, null, 2)], { type: "application/json;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = "tanulasi-eredmeny.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}><Download size={18} /> Eredmény letöltése</button>
  </section>;
}

export function LessonExperienceView({ experience: e, storageKey, reviewKey, headings, lessonId, arbiterSource, children }: { experience: LessonExperience; storageKey: string; reviewKey?: string; headings: string[]; lessonId?: string; arbiterSource?: ArbiterSource; children: (section: number | null) => ReactNode }) {
  const prefix = useId();
  const cards = useMemo(() => lessonFlashcards({ experience: e }), [e]);
  const tabs = TABS.filter(t => (t.id !== "review" || cards.length > 0) && (t.id !== "pronounce" || !!e.language));
  // Spec 2026-10-21-nyelvlecke-kiejtes: nyelvleckén a feladatok diktálása alapból a lecke nyelvén (az angol válasz magyar felismerővel értelmetlen).
  const [dictationLanguage, setDictationLanguage] = useState(e.language ?? "hu-HU");
  const [tab, setTab] = useState<Tab>("teaching");
  const changeTab = (next: Tab) => { setTab(next); requestAnimationFrame(() => document.getElementById(`${prefix}-fusion-tab-${next}`)?.closest(".fusion-view")?.scrollIntoView({ block: "start", behavior: "instant" })); };
  const [resetTarget, setResetTarget] = useState<"tasks" | "quiz" | null>(null);
  const [samples, setSamples] = useState<string[]>([]);
  const [rate, setRate] = useState(0.85);
  const [teachingSection, setTeachingSection] = useLearningPreference<number>(`${storageKey}:section`, 0, (v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0 && v < headings.length);
  const [teachingOverview, setTeachingOverview] = useState(true);
  const taskElements = useRef(new Map<string, HTMLElement>());
  const quizElements = useRef(new Map<string, HTMLElement>());
  const [savedFinished, setSavedFinished] = useState<boolean | null>(null);
  // Spec 2026-10-19-evfolyam-arculat-lathato: új kulcs — a régi érték láthatatlanul beragadhatott (a gomb nem mutatta az állapotot),
  // és minden leckét az évfolyam-színek nélkül, egyszínűen mutatott; egyszer elengedjük, mindenki színes nézettel indul.
  const [quiet, setQuiet] = useLearningPreference<boolean>("websuli:learning-quiet-v2", false, (v): v is boolean => typeof v === "boolean");
  const jumpToTeaching = (section: number) => { setTeachingSection(section); setTeachingOverview(false); changeTab("teaching"); };
  // A fejezetlista gombja ugyanazt teszi, mint a legördülő és a lapozó: az adott fejezetet mutatja, a panel tetejére görget.
  const jumpToChapter = (index: number) => { setTeachingSection(index); setTeachingOverview(false); requestAnimationFrame(() => document.getElementById(`${prefix}-fusion-panel-teaching`)?.scrollIntoView({ block: "start" })); };
  const { taskRound, quizRound } = experienceRoundSizes(e);
  const taskState = useExperienceRound(e.tasks, taskRound, `${storageKey}:tasks`, () => sampleTaskIds(e.tasks, taskRound));
  const quizState = useExperienceRound(e.quiz, quizRound, `${storageKey}:quiz`);
  // Tanulói eredmény e-mailben (2026-10-17-eredmeny-email): a kiértékelés után a háttérben, egyszer. A szerveres (bejelentkezett)
  // kvízt a szerver maga küldi; a helyi kvíz csak vendégnél él, ezért annak lezárása küld.
  useEffect(() => {
    if (tab === "tasks") taskState.setRound(old => old.startedAt ? old : { ...old, startedAt: Date.now() });
    if (tab === "quiz") quizState.setRound(old => old.startedAt ? old : { ...old, startedAt: Date.now() });
  }, [tab, taskState.round.startedAt, quizState.round.startedAt]);
  const tasks = taskState.round.ids.map(id => e.tasks.find(t => t.id === id)!);
  const quiz = quizState.round.ids.map(id => e.quiz.find(q => q.id === id)!);
  // Tételgyár T7.2: kiértékelés után a nem teljes pontos válaszokat a döntőbíró is átnézi; az ítélet csak emelhet.
  const taskChecks = tasks.map(t => ({ id: t.id, answer: taskState.round.answers[t.id] ?? "", det: evaluateOpenAnswer(taskState.round.answers[t.id] ?? "", t) }));
  const arbiter = useArbiterVerdicts(`${storageKey}:tasks:arbiter:${taskState.round.startedAt}:${taskState.round.finishedAt ?? 0}`, arbiterSource, !!taskState.round.finishedAt, taskChecks);
  const finalVerdict = (id: string) => { const check = taskChecks.find(c => c.id === id)!; return bestVerdict(check.det, arbiter.verdicts[id]); };
  const taskPoints = tasks.reduce((sum, t) => sum + finalVerdict(t.id).score, 0);
  // Tanulói eredmény e-mailben (2026-10-17-eredmeny-email): a kiértékelés után a háttérben, egyszer. Review #280: a feladatok csak akkor,
  // ha minden döntőbíróra jogosult válasz ítéletet kapott (a szerver addigra a gyorsítótárában tartja). A szerveres (bejelentkezett)
  // kvízt a szerver maga küldi; a helyi kvíz csak vendégnél él, ezért annak lezárása küld.
  const arbiterSettled = !arbiterSource || taskChecks.every(c => c.det.state === "ok" || !c.answer.trim() || !!arbiter.verdicts[c.id]);
  useResultReport(lessonId, "tasks", taskState.round, storageKey, arbiterSettled);
  useResultReport(lessonId, "quiz", quizState.round, storageKey);
  const quizPoints = quiz.filter(q => quizState.round.picks[q.id] === q.correctIndex).length;
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, [tab]);
  const seconds = (round: typeof taskState.round) => Math.max(0, Math.floor(((round.finishedAt ?? Date.now()) - round.startedAt) / 1000));
  return <div className="fusion-view" data-quiet={quiet} data-quiz-guided={false}>
    <nav className="fusion-tabs" role="tablist" aria-label="A tananyag oldalai" data-tabs={tabs.length}>{tabs.map(({ id, label, icon: Icon }, i) => <button key={id} id={`${prefix}-fusion-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`${prefix}-fusion-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => changeTab(id)} onKeyDown={event => {
      if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
        changeTab(tabs[next].id); document.getElementById(`${prefix}-fusion-tab-${tabs[next].id}`)?.focus();
      }
    }}><Icon size={19} /><span>{label}</span></button>)}</nav>
    <div className="learning-toolbar"><span className="fusion-eyebrow">Egy lépés, egy új felismerés</span><button type="button" className="lesson-ghost-btn learning-quiet" data-on={quiet} onClick={() => setQuiet(!quiet)} title={quiet ? "Most a tompított, egyszínű nézet látszik — vissza az évfolyam színeihez" : "Tompított, egyszínű nézet kevesebb ingerrel"} data-testid="learning-quiet">{quiet ? <><Palette size={16} /> Színes nézet</> : <><Leaf size={16} /> Csendes nézet</>}</button></div>
    <div role="tabpanel" id={`${prefix}-fusion-panel-teaching`} aria-labelledby={`${prefix}-fusion-tab-teaching`} hidden={tab !== "teaching"} className="fusion-panel">
      {/* Spec 2026-10-22-lecke-szeles-elrendezes: ≥ 1200 px-en bal oldalon sticky fejezetlista, jobbra a fejezet; alatta a legördülő marad. */}
      <div className="fusion-teaching-layout">
        <nav className="fusion-chapter-nav" aria-label="Fejezetek" data-testid="chapter-nav"><ol>{headings.map((heading, index) => <li key={index}><button type="button" aria-current={index === teachingSection ? "true" : undefined} onClick={() => { jumpToChapter(index); }}><span className="fusion-chapter-no" aria-hidden>{index + 1}</span><span className="fusion-chapter-name">{displayHeading(heading)}</span></button></li>)}</ol></nav>
        <div className="fusion-teaching-main space-y-6">
          {e.language && <button type="button" className="fusion-pronounce-entry" data-testid="pronounce-entry" onClick={() => changeTab("pronounce")}><Volume2 size={22} /><span><strong>Kiejtésgyakorló</strong> · hallgasd meg a szavakat és a mondatokat, majd mondd ki őket — a program meghallgat és visszajelez.</span></button>}
          <div className="learning-book-head"><label className="fusion-label">Fejezet<select aria-label="Fejezet" value={teachingSection} onChange={event => { setTeachingSection(Number(event.target.value)); setTeachingOverview(false); }}>{headings.map((heading, index) => <option key={index} value={index}>{index + 1}. {heading}</option>)}</select></label><LearningMode overview={teachingOverview} onChange={setTeachingOverview} label="tananyag" /></div>
          {children(teachingOverview ? null : teachingSection)}
          {!teachingOverview && <>
            <details className="learning-methods-inline"><summary>Próbáld ki az összefüggést!</summary><CognitiveMethods key={teachingSection} methods={e.methods.filter(m => m.sectionIndex === teachingSection)} /></details>
            <LearningPager index={teachingSection} count={headings.length} label="fejezet" onChange={index => { setTeachingSection(index); requestAnimationFrame(() => document.getElementById(`${prefix}-fusion-panel-teaching`)?.scrollIntoView({ block: "start" })); }} />
          </>}
        </div>
      </div>
    </div>
    {e.language && <div role="tabpanel" id={`${prefix}-fusion-panel-pronounce`} aria-labelledby={`${prefix}-fusion-tab-pronounce`} hidden={tab !== "pronounce"} className="fusion-panel">
      <section className="lesson-block fusion-glossary"><h2>Szószedet · hallgasd és mondd utánam!</h2>
        <p className="fusion-intro">Nyomd meg a <strong>Meghallgatás</strong> gombot, ismételd el hangosan, majd a <strong>Mondd ki!</strong> gombbal ellenőrizd a kiejtésed.</p>
        <label className="fusion-label">Felolvasás sebessége: {rate.toFixed(2)}×<input type="range" min="0.5" max="1.2" step="0.05" value={rate} onChange={ev => setRate(Number(ev.target.value))} /></label>
        {e.glossary.map(entry => <article key={entry.word}><h3 lang={e.language}>{entry.word}</h3><p>{entry.translation} · {entry.partOfSpeech}</p><div className="fusion-say"><SpeakButton text={entry.word} language={e.language!} rate={rate} /><PronounceButton target={entry.word} language={e.language!} active={tab === "pronounce"} /></div><p lang={e.language}>{entry.example}</p><p>{entry.exampleTranslation}</p><div className="fusion-say"><SpeakButton text={entry.example} language={e.language!} rate={rate} /><PronounceButton target={entry.example} language={e.language!} active={tab === "pronounce"} /></div></article>)}
      </section>
    </div>}
    <div role="tabpanel" id={`${prefix}-fusion-panel-methods`} aria-labelledby={`${prefix}-fusion-tab-methods`} hidden={tab !== "methods"} className="fusion-panel"><CognitiveMethods methods={e.methods} /></div>
    <div role="tabpanel" id={`${prefix}-fusion-panel-tasks`} aria-labelledby={`${prefix}-fusion-tab-tasks`} hidden={tab !== "tasks"} className="fusion-panel">
      <div className="fusion-round-head"><div><span className="fusion-eyebrow">Fogalmazd meg a saját szavaiddal</span><h2>Feladatok</h2><p>{taskRound} feladat a {e.tasks.length}-ből · írásban és szóban</p></div><button className="lesson-outline-btn" onClick={() => setResetTarget("tasks")}><RotateCcw size={17} /> Új feladatsor</button></div>
      <p className="fusion-intro">A szóbeli feladatot először mondd el, majd írd vagy diktáld be a válaszod. Az automatikus ellenőrzés fogalmakat keres; a mintaválasz segít megítélni a jelentést.{arbiterSource && " A nem teljes pontos válaszokat egy mesterséges intelligencia is átnézi."}</p>
      {e.language && <div className="fusion-dictation-language" role="group" aria-label="A diktálás nyelve"><span>A diktálás nyelve:</span>{[e.language, "hu-HU"].map(language => <button key={language} type="button" className="lesson-ghost-btn" aria-pressed={dictationLanguage === language} onClick={() => setDictationLanguage(language)}>{language === "hu-HU" ? "Magyarul" : languageAdverb(language)}</button>)}</div>}
      <div className="fusion-task-list">{tasks.map((t, index) => {
        const graded = !!taskState.round.finishedAt;
        const verdict = finalVerdict(t.id);
        return <section className="lesson-block fusion-task" key={t.id} data-task-id={t.id} tabIndex={-1} ref={element => { if (element) taskElements.current.set(t.id, element); else taskElements.current.delete(t.id); }}>
          <span className="fusion-eyebrow">{index + 1}. feladat {t.mode === "oral" && <><Mic size={14} /> Szóbeli gyakorlás</>}</span><h3>{t.q}</h3>
          <label className="fusion-label">A válaszod<textarea maxLength={4000} value={taskState.round.answers[t.id] ?? ""} disabled={graded} onChange={ev => taskState.setRound(old => ({ ...old, answers: { ...old.answers, [t.id]: ev.target.value } }))} /></label>
          {!graded && <DictationButton active={tab === "tasks" && !resetTarget} language={dictationLanguage} onText={text => taskState.setRound(old => ({ ...old, answers: { ...old.answers, [t.id]: `${old.answers[t.id] ?? ""} ${text}`.trim().slice(0, 4000) } }))} />}
          {graded && <div className="fusion-verdict" data-state={verdict.state}><strong>{verdict.state === "ok" ? "Elfogadva" : verdict.state === "partial" ? "Részben jó" : "Hiányos"} · {verdict.score} pont</strong><p>{verdict.reason}</p>
            {verdict.arbiter && <p className="fusion-arbiter" data-testid="arbiter-note">A döntőbíró {verdict.state === "ok" ? "elfogadta" : "részben elfogadta"} a saját megfogalmazásodat.</p>}
            {arbiter.pending.has(t.id) && <p className="fusion-arbiter" role="status">A válaszodat egy tanári segéd is átnézi…</p>}</div>}
          {(graded || t.mode === "oral") && <button className="lesson-outline-btn" onClick={() => { setSamples(old => old.includes(t.id) ? old.filter(id => id !== t.id) : [...old, t.id]); taskState.setRound(old => ({ ...old, sampleViewed: [...new Set([...old.sampleViewed, t.id])] })); }}>Mintaválasz {samples.includes(t.id) ? "elrejtése" : "megnézése"}</button>}
          {samples.includes(t.id) && <p className="lesson-answer">{t.sample}</p>}
          <button className="lesson-ghost-btn fusion-source-link" onClick={() => jumpToTeaching(t.sectionIndex)}>Vissza a magyarázathoz</button>
        </section>;
      })}</div>
      {!taskState.round.finishedAt ? <FinishPracticeButton className="fusion-primary" total={tasks.length} unanswered={tasks.filter(t => !taskState.round.answers[t.id]?.trim()).length} onContinue={() => {
        const task = tasks.find(task => !taskState.round.answers[task.id]?.trim());
        const element = task && taskElements.current.get(task.id);
        element?.scrollIntoView({ block: "center" }); element?.querySelector("textarea")?.focus({ preventScroll: true });
      }} onFinish={() => taskState.setRound(old => ({ ...old, finishedAt: Date.now() }))}>Feladatok kiértékelése</FinishPracticeButton> : <Result title="Feladatok" points={taskPoints} total={tasks.length} seconds={seconds(taskState.round)} answers={tasks.map(t => ({ question: t.q, answer: taskState.round.answers[t.id] ?? "", ...finalVerdict(t.id), sampleViewed: taskState.round.sampleViewed.includes(t.id) }))} />}
    </div>
    <div role="tabpanel" id={`${prefix}-fusion-panel-quiz`} aria-labelledby={`${prefix}-fusion-tab-quiz`} hidden={tab !== "quiz"} className="fusion-panel fusion-panel-quiz" data-overview={true} data-finished={savedFinished ?? !!quizState.round.finishedAt}>
      <PracticeAccess lessonId={lessonId} enabled={tab === "quiz"} onFinished={setSavedFinished} onReview={id => jumpToTeaching(e.quiz.find(q => q.id === id)?.sectionIndex ?? 0)}>
      <div className="fusion-round-head"><div><span className="fusion-eyebrow">Helyi önellenőrzés</span><h2>Kvíz</h2><p>{quizRound} kérdés a {e.quiz.length}-ből · {Object.keys(quizState.round.picks).length} megválaszolva · {quizPoints} pont</p></div><div className="learning-round-actions"><button className="lesson-outline-btn" onClick={() => setResetTarget("quiz")}><RotateCcw size={17} /> Új kvíz</button></div></div>
      {quiz.map((q, index) => {
        const pick = quizState.round.picks[q.id];
        return <section className="lesson-block fusion-quiz" key={q.id} data-quiz-id={q.id} tabIndex={-1} ref={element => { if (element) quizElements.current.set(q.id, element); else quizElements.current.delete(q.id); }}><span className="fusion-eyebrow">{index + 1}. kérdés</span><h3>{q.question}</h3><div className="fusion-choices">{q.options.map((option, i) => <button className="lesson-option" key={i} disabled={pick !== undefined || !!quizState.round.finishedAt} aria-pressed={pick === i} data-state={pick === i ? i === q.correctIndex ? "right" : "wrong" : undefined} onClick={() => quizState.setRound(old => old.picks[q.id] !== undefined ? old : ({ ...old, picks: { ...old.picks, [q.id]: i } }))}><span className="lesson-option-key">{"ABCD"[i]}</span>{option}</button>)}</div>
          {pick !== undefined && <VerdictFeedback right={pick === q.correctIndex} text={q.feedbackPerOption[pick]} />}
          {quizState.round.finishedAt && pick === undefined && <p>Nem válaszoltál · 0 pont. Helyes válasz: {q.options[q.correctIndex]}. {stripVerdictPrefix(q.feedbackPerOption[q.correctIndex], true)}</p>}
        </section>;
      })}
      {!quizState.round.finishedAt ? <FinishPracticeButton className="fusion-primary" total={quiz.length} unanswered={quiz.filter(q => quizState.round.picks[q.id] === undefined).length} onContinue={() => {
        const question = quiz.find(question => quizState.round.picks[question.id] === undefined);
        const element = question && quizElements.current.get(question.id);
        element?.scrollIntoView({ block: "center" }); element?.focus({ preventScroll: true });
      }} onFinish={() => quizState.setRound(old => ({ ...old, finishedAt: Date.now() }))}>Kvíz kiértékelése</FinishPracticeButton> : <Result title="Kvíz" points={quizPoints} total={quiz.length} seconds={seconds(quizState.round)} answers={quiz.map(q => ({ question: q.question, pickedIndex: quizState.round.picks[q.id] ?? null, correctIndex: q.correctIndex }))} />}
      </PracticeAccess>
    </div>
    {cards.length > 0 && <div role="tabpanel" id={`${prefix}-fusion-panel-review`} aria-labelledby={`${prefix}-fusion-tab-review`} hidden={tab !== "review"} className="fusion-panel">
      {/* Review #269: a vendégállapot a stabil leckekulcs alatt él (nem a teljes experience-lenyomat alatt), így a lecke javítása után
          a változatlan, tartalomhoz kötött azonosítójú kártyák megtartják az ütemezésüket. */}
      <FlashcardReview cards={cards} lessonId={lessonId} storageKey={reviewKey ?? storageKey} active={tab === "review"} />
    </div>}
    <Dialog open={resetTarget !== null} onOpenChange={open => { if (!open) setResetTarget(null); }}><DialogContent className="fusion-dialog"><DialogTitle>Új gyakorlókör?</DialogTitle><DialogDescription>A mostani válaszokat új feladatsor váltja fel. Ha szeretnéd megőrizni az eredményt, előbb töltsd le.</DialogDescription><div className="flex gap-3 flex-wrap"><button onClick={() => setResetTarget(null)}>Mégse</button><button onClick={() => { if (resetTarget === "tasks") { taskState.reset(); setSamples([]); } else { quizState.reset(); } setResetTarget(null); }}>Új kör indítása</button></div></DialogContent></Dialog>
  </div>;
}
