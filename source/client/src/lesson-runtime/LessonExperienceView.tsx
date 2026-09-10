import { useEffect, useId, useState, type ReactNode } from "react";
import { BookOpen, Brain, PencilLine, Trophy, Download, RotateCcw, Mic } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { LessonExperience } from "@shared/lesson-experience";
import { evaluateOpenAnswer, scoreSummary, sampleTaskIds } from "@shared/lesson-experience-score";
import { CognitiveMethods } from "./CognitiveMethods";
import { DictationButton, SpeakButton } from "./ExperienceSpeech";
import { useExperienceRound } from "./useExperienceRound";
import "./lesson-experience.css";

const TABS = [{ id: "teaching", label: "Tananyag", icon: BookOpen }, { id: "methods", label: "Módszerek", icon: Brain }, { id: "tasks", label: "Feladatok", icon: PencilLine }, { id: "quiz", label: "Kvíz", icon: Trophy }] as const;
type Tab = typeof TABS[number]["id"];
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

export function LessonExperienceView({ experience: e, storageKey, children }: { experience: LessonExperience; storageKey: string; children: ReactNode }) {
  const prefix = useId();
  const [tab, setTab] = useState<Tab>("teaching");
  const changeTab = (next: Tab) => { setTab(next); requestAnimationFrame(() => document.getElementById(`${prefix}-fusion-tab-${next}`)?.closest(".fusion-view")?.scrollIntoView({ block: "start", behavior: "instant" })); };
  const [resetTarget, setResetTarget] = useState<"tasks" | "quiz" | null>(null);
  const [samples, setSamples] = useState<string[]>([]);
  const [rate, setRate] = useState(0.85);
  const taskState = useExperienceRound(e.tasks, 15, `${storageKey}:tasks`, () => sampleTaskIds(e.tasks));
  const quizState = useExperienceRound(e.quiz, 25, `${storageKey}:quiz`);
  useEffect(() => {
    if (tab === "tasks") taskState.setRound(old => old.startedAt ? old : { ...old, startedAt: Date.now() });
    if (tab === "quiz") quizState.setRound(old => old.startedAt ? old : { ...old, startedAt: Date.now() });
  }, [tab, taskState.round.startedAt, quizState.round.startedAt]);
  const tasks = taskState.round.ids.map(id => e.tasks.find(t => t.id === id)!);
  const quiz = quizState.round.ids.map(id => e.quiz.find(q => q.id === id)!);
  const taskPoints = tasks.reduce((sum, t) => sum + evaluateOpenAnswer(taskState.round.answers[t.id] ?? "", t).score, 0);
  const quizPoints = quiz.filter(q => quizState.round.picks[q.id] === q.correctIndex).length;
  useEffect(() => () => { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }, [tab]);
  const seconds = (round: typeof taskState.round) => Math.max(0, Math.floor(((round.finishedAt ?? Date.now()) - round.startedAt) / 1000));
  return <div className="fusion-view">
    <nav className="fusion-tabs" role="tablist" aria-label="A tananyag négy oldala">{TABS.map(({ id, label, icon: Icon }, i) => <button key={id} id={`${prefix}-fusion-tab-${id}`} role="tab" aria-selected={tab === id} aria-controls={`${prefix}-fusion-panel-${id}`} tabIndex={tab === id ? 0 : -1} onClick={() => changeTab(id)} onKeyDown={event => {
      if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? 3 : (i + (event.key === "ArrowRight" ? 1 : 3)) % 4;
        changeTab(TABS[next].id); document.getElementById(`${prefix}-fusion-tab-${TABS[next].id}`)?.focus();
      }
    }}><Icon size={19} /><span>{label}</span></button>)}</nav>
    <div role="tabpanel" id={`${prefix}-fusion-panel-teaching`} aria-labelledby={`${prefix}-fusion-tab-teaching`} hidden={tab !== "teaching"} className="fusion-panel space-y-6">
      {children}
      {e.language && <section className="lesson-block fusion-glossary"><h2>Szószedet · hallgasd és mondd utánam!</h2><label className="fusion-label">Felolvasás sebessége: {rate.toFixed(2)}×<input type="range" min="0.5" max="1.2" step="0.05" value={rate} onChange={ev => setRate(Number(ev.target.value))} /></label>
        {e.glossary.map(entry => <article key={entry.word}><h3 lang={e.language}>{entry.word}</h3><p>{entry.translation} · {entry.partOfSpeech}</p><SpeakButton text={entry.word} language={e.language!} rate={rate} /><p lang={e.language}>{entry.example}</p><p>{entry.exampleTranslation}</p><SpeakButton text={entry.example} language={e.language!} rate={rate} /></article>)}
      </section>}
    </div>
    <div role="tabpanel" id={`${prefix}-fusion-panel-methods`} aria-labelledby={`${prefix}-fusion-tab-methods`} hidden={tab !== "methods"} className="fusion-panel"><CognitiveMethods methods={e.methods} /></div>
    <div role="tabpanel" id={`${prefix}-fusion-panel-tasks`} aria-labelledby={`${prefix}-fusion-tab-tasks`} hidden={tab !== "tasks"} className="fusion-panel">
      <div className="fusion-round-head"><div><span className="fusion-eyebrow">Fogalmazd meg a saját szavaiddal</span><h2>Feladatok</h2><p>15 feladat a 45-ből · írásban és szóban</p></div><button className="lesson-outline-btn" onClick={() => setResetTarget("tasks")}><RotateCcw size={17} /> Új feladatsor</button></div>
      <p className="fusion-intro">A szóbeli feladatot először mondd el, majd írd vagy diktáld be a válaszod. Az automatikus ellenőrzés fogalmakat keres; a mintaválasz segít megítélni a jelentést.</p>
      {tasks.map((t, index) => {
        const graded = !!taskState.round.finishedAt;
        const verdict = evaluateOpenAnswer(taskState.round.answers[t.id] ?? "", t);
        return <section className="lesson-block fusion-task" key={t.id} data-task-id={t.id}>
          <span className="fusion-eyebrow">{index + 1}. feladat {t.mode === "oral" && <><Mic size={14} /> Szóbeli gyakorlás</>}</span><h3>{t.q}</h3>
          <label className="fusion-label">A válaszod<textarea maxLength={4000} value={taskState.round.answers[t.id] ?? ""} disabled={graded} onChange={ev => taskState.setRound(old => ({ ...old, answers: { ...old.answers, [t.id]: ev.target.value } }))} /></label>
          {!graded && <DictationButton active={tab === "tasks" && !resetTarget} onText={text => taskState.setRound(old => ({ ...old, answers: { ...old.answers, [t.id]: `${old.answers[t.id] ?? ""} ${text}`.trim().slice(0, 4000) } }))} />}
          {graded && <div className="fusion-verdict" data-state={verdict.state}><strong>{verdict.state === "ok" ? "Elfogadva" : verdict.state === "partial" ? "Részben jó" : "Hiányos"} · {verdict.score} pont</strong><p>{verdict.reason}</p></div>}
          {(graded || t.mode === "oral") && <button className="lesson-outline-btn" onClick={() => { setSamples(old => old.includes(t.id) ? old.filter(id => id !== t.id) : [...old, t.id]); taskState.setRound(old => ({ ...old, sampleViewed: [...new Set([...old.sampleViewed, t.id])] })); }}>Mintaválasz {samples.includes(t.id) ? "elrejtése" : "megnézése"}</button>}
          {samples.includes(t.id) && <p className="lesson-answer">{t.sample}</p>}
          <button className="lesson-ghost-btn fusion-source-link" onClick={event => { const view = event.currentTarget.closest(".fusion-view"); setTab("teaching"); requestAnimationFrame(() => view?.querySelector(`[id="section-${t.sectionIndex + 1}"]`)?.scrollIntoView({ block: "start", behavior: "instant" })); }}>Vissza a magyarázathoz</button>
        </section>;
      })}
      {!taskState.round.finishedAt ? <button className="fusion-primary" onClick={() => taskState.setRound(old => ({ ...old, finishedAt: Date.now() }))}>Feladatok kiértékelése</button> : <Result title="Feladatok" points={taskPoints} total={15} seconds={seconds(taskState.round)} answers={tasks.map(t => ({ question: t.q, answer: taskState.round.answers[t.id] ?? "", ...evaluateOpenAnswer(taskState.round.answers[t.id] ?? "", t), sampleViewed: taskState.round.sampleViewed.includes(t.id) }))} />}
    </div>
    <div role="tabpanel" id={`${prefix}-fusion-panel-quiz`} aria-labelledby={`${prefix}-fusion-tab-quiz`} hidden={tab !== "quiz"} className="fusion-panel">
      <div className="fusion-round-head"><div><span className="fusion-eyebrow">Mérd meg, mit tudsz!</span><h2>Kvíz</h2><p>25 kérdés a 75-ből · {Object.keys(quizState.round.picks).length} megválaszolva · {quizPoints} pont</p></div><button className="lesson-outline-btn" onClick={() => setResetTarget("quiz")}><RotateCcw size={17} /> Új kvíz</button></div>
      {quiz.map((q, index) => {
        const pick = quizState.round.picks[q.id];
        return <section className="lesson-block fusion-quiz" key={q.id} data-quiz-id={q.id}><span className="fusion-eyebrow">{index + 1}. kérdés</span><h3>{q.question}</h3><div className="fusion-choices">{q.options.map((option, i) => <button className="lesson-option" key={i} disabled={pick !== undefined || !!quizState.round.finishedAt} aria-pressed={pick === i} data-state={pick === i ? i === q.correctIndex ? "right" : "wrong" : undefined} onClick={() => quizState.setRound(old => old.picks[q.id] !== undefined ? old : ({ ...old, picks: { ...old.picks, [q.id]: i } }))}><span className="lesson-option-key">{"ABC"[i]}</span>{option}</button>)}</div>
          {pick !== undefined && <p className="lesson-feedback" data-state={pick === q.correctIndex ? "right" : "wrong"}>{q.feedbackPerOption[pick]}</p>}
          {quizState.round.finishedAt && pick === undefined && <p>Nem válaszoltál · 0 pont. Helyes válasz: {q.options[q.correctIndex]}. {q.feedbackPerOption[q.correctIndex]}</p>}
        </section>;
      })}
      {!quizState.round.finishedAt ? <button className="fusion-primary" onClick={() => quizState.setRound(old => ({ ...old, finishedAt: Date.now() }))}>Kvíz kiértékelése</button> : <Result title="Kvíz" points={quizPoints} total={25} seconds={seconds(quizState.round)} answers={quiz.map(q => ({ question: q.question, pickedIndex: quizState.round.picks[q.id] ?? null, correctIndex: q.correctIndex }))} />}
    </div>
    <Dialog open={resetTarget !== null} onOpenChange={open => { if (!open) setResetTarget(null); }}><DialogContent className="fusion-dialog"><DialogTitle>Új gyakorlókör?</DialogTitle><DialogDescription>A mostani válaszokat új feladatsor váltja fel. Ha szeretnéd megőrizni az eredményt, előbb töltsd le.</DialogDescription><div className="flex gap-3 flex-wrap"><button onClick={() => setResetTarget(null)}>Mégse</button><button onClick={() => { if (resetTarget === "tasks") { taskState.reset(); setSamples([]); } else quizState.reset(); setResetTarget(null); }}>Új kör indítása</button></div></DialogContent></Dialog>
  </div>;
}
