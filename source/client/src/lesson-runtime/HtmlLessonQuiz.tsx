import { useEffect, useState } from "react";
import { z } from "zod";
import type { LessonExperience } from "@shared/lesson-experience";
import { experienceRoundSizes } from "@shared/lesson-experience";
import { sampleIds, scoreSummary } from "@shared/lesson-experience-score";

const savedSchema = z.object({ ids: z.array(z.string()), picks: z.record(z.number().int().nonnegative()), started: z.number().nonnegative(), finished: z.number().nonnegative().nullable() });
type Round = z.infer<typeof savedSchema>;

/** Local practice only. The exact bank is included in the key, so changed answers cannot reuse old scores. */
export function HtmlLessonQuiz({ experience, material }: { experience: LessonExperience; material: string }) {
  const bank = experience.quiz;
  const count = experienceRoundSizes(experience).quizRound;
  const key = `websuli:html-quiz:v1:${material}:${JSON.stringify(bank)}`;
  const fresh = (size = count): Round => ({ ids: sampleIds(bank, size), picks: {}, started: Date.now(), finished: null });
  const [storageError, setStorageError] = useState(false);
  const [round, setRound] = useState<Round>(() => {
    try {
      const value = savedSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? "null"));
      if (value.success) {
        const r = value.data;
        if ([count, bank.length].includes(r.ids.length) && new Set(r.ids).size === r.ids.length && r.ids.every(id => bank.some(q => q.id === id)) && Object.entries(r.picks).every(([id, pick]) => r.ids.includes(id) && pick < bank.find(q => q.id === id)!.options.length)) return r;
      }
    } catch { /* A corrupt or unavailable store starts an explicit new in-memory round. */ }
    return fresh();
  });
  const [confirmReset, setConfirmReset] = useState(false);
  const [nextCount, setNextCount] = useState(count);
  const [pageIndex, setPageIndex] = useState(0), [overview, setOverview] = useState(false);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(round)); }
    catch { setStorageError(true); }
  }, [key, round]);
  const save = (next: Round) => {
    setRound(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  };
  const questions = round.ids.map(id => bank.find(q => q.id === id)!);
  const points = questions.filter(q => round.picks[q.id] === q.correctIndex).length;
  const result = scoreSummary(points, questions.length);
  return <section className="websuli-html-quiz" aria-label="Megőrzött gyakorlókvíz">
    <style>{`.websuli-html-quiz{max-width:900px;margin:auto;padding:12px;color:#18263b;background:#fff;border-radius:18px;overflow-wrap:anywhere}.websuli-html-quiz *{box-sizing:border-box}.websuli-html-quiz [hidden]{display:none!important}.websuli-html-quiz button{min-height:44px;max-width:100%;white-space:normal;padding:10px 14px;margin:4px;border:1px solid #58708a;border-radius:12px;color:#18263b;background:#f0f6ff;cursor:pointer}.websuli-html-quiz button:disabled{cursor:default;opacity:1}.websuli-html-quiz article{border:1px solid #cad6e5;border-radius:14px;padding:12px;margin:14px 0}.websuli-html-quiz h3{font-size:1.1rem}.websuli-html-quiz .quiz-options{display:grid;gap:6px}.websuli-html-quiz [aria-pressed=true]{border:3px solid #176c53}.websuli-html-quiz [role=status]{padding:12px;background:#e8f6ef}.websuli-html-quiz [role=alert]{padding:12px;background:#fff1d0}`}</style>
    <h2>Kvíz · {questions.length} kérdés</h2><p>Gyakorló önellenőrzés. Az első válasz számít; a kihagyott kérdés nulla pont. Az eredmény ezen a böngészőn marad meg.</p>
    {storageError && <p role="alert">A böngésző nem engedte a mentést. Ne töltsd újra az oldalt; az eredményt letöltheted.</p>}
    <button onClick={() => { setNextCount(count); setConfirmReset(true); }}>Új kvízkör</button>
    <button onClick={() => { setNextCount(bank.length); setConfirmReset(true); }}>Teljes kvízbank · {bank.length} kérdés</button>
    {confirmReset && <div role="group" aria-label="Új kör megerősítése"><p>Az új, {nextCount} kérdéses kör lecseréli az itt tárolt válaszokat és eredményt.</p><button onClick={() => { save(fresh(nextCount)); setPageIndex(0); setConfirmReset(false); }}>Új kör indítása</button><button onClick={() => setConfirmReset(false)}>Mégsem</button></div>}
    <nav aria-label="Kérdések lapozása"><button disabled={pageIndex === 0} onClick={() => setPageIndex(i => Math.max(0, i - 1))}>Előző kérdés</button><span>{Math.min(pageIndex + 1, questions.length)} / {questions.length}</span><button disabled={pageIndex >= questions.length - 1} onClick={() => setPageIndex(i => Math.min(questions.length - 1, i + 1))}>Következő kérdés</button><button aria-pressed={overview} onClick={() => setOverview(v => !v)}>{overview ? "Egyenként" : "Összes kérdés áttekintése"}</button></nav>
    {questions.map((q, index) => <article key={q.id} hidden={!overview && index !== Math.min(pageIndex, questions.length - 1)}><h3>{index + 1}. {q.question}</h3><div className="quiz-options">{q.options.map((option, pick) => <button key={pick} aria-pressed={round.picks[q.id] === pick} disabled={round.finished !== null || round.picks[q.id] !== undefined} onClick={() => save({ ...round, picks: { ...round.picks, [q.id]: pick } })}>{option}</button>)}</div>{round.picks[q.id] !== undefined && <p>{round.picks[q.id] === q.correctIndex ? "Helyes. " : "Még nem helyes. "}{q.feedbackPerOption[round.picks[q.id]]}</p>}</article>)}
    <button disabled={round.finished !== null} onClick={() => save({ ...round, finished: Date.now() })}>Kiértékelés</button>
    {round.finished !== null && <div role="status"><strong>{points} / {questions.length} pont · {result.percent}%</strong><p>Gyakorló osztályzat: {result.grade} · idő: {Math.max(0, Math.floor((round.finished - round.started) / 1000))} mp</p><button onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ ...round, ...result, assessment: "Helyi gyakorló önellenőrzés" })], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "kviz-eredmeny.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Eredmény letöltése</button></div>}
  </section>;
}
