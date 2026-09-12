import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { PracticeView } from "@shared/lesson-attempt";
import { scoreSummary } from "@shared/lesson-experience-score";
import { LearningPager } from "./LearningControls";
import { FinishPracticeButton } from "./FinishPracticeButton";

export function PracticeAccess({ lessonId, enabled, onFinished, onReview, children }: {
  lessonId?: string; enabled: boolean; onFinished: (finished: boolean | null) => void; onReview: (questionId: string) => void; children: ReactNode;
}) {
  const auth = useQuery<{ id: string } | null>({
    queryKey: ["/api/auth/user"], enabled: !!lessonId, retry: false,
    queryFn: async () => {
      const response = await fetch("/api/auth/user", { credentials: "include" });
      if (response.status === 401) return null;
      if (!response.ok) throw new Error("Az azonosítás nem sikerült.");
      return response.json();
    },
  });
  if (!lessonId || (!auth.isPending && !auth.isError && !auth.data)) return <>{children}</>;
  if (auth.isPending) return <p role="status">Gyakorlás betöltése…</p>;
  if (auth.isError) return <div role="alert">Az azonosítás nem sikerült. <button className="lesson-outline-btn" onClick={() => void auth.refetch()}>Újra</button></div>;
  return <SavedLessonQuiz key={`${auth.data!.id}:${lessonId}`} userId={auth.data!.id} lessonId={lessonId} enabled={enabled} onFinished={onFinished} onReview={onReview} />;
}

function SavedLessonQuiz({ userId, lessonId, enabled, onFinished, onReview }: {
  userId: string; lessonId: string; enabled: boolean; onFinished: (finished: boolean | null) => void; onReview: (questionId: string) => void;
}) {
  const [round, setRound] = useState<PracticeView | null>(null);
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; status?: number } | null>(null);
  const key = `websuli:practice:${userId}:${lessonId}`;
  const retry = useRef<(() => Promise<PracticeView>) | null>(null);
  const loading = useRef(false);
  const mounted = useRef(true);
  const save = (data: PracticeView) => {
    setRound(data); onFinished(!!data.finishedAt);
    try { localStorage.setItem(key, data.id); } catch { /* The server still owns the saved round. */ }
  };
  const run = async (action: () => Promise<PracticeView>) => {
    if (loading.current) return;
    loading.current = true; setBusy(true); setError(null); retry.current = action;
    try { const data = await action(); if (mounted.current) save(data); }
    catch (e) { if (mounted.current) setError({ message: e instanceof Error ? e.message : "Nem sikerült menteni.", status: (e as { status?: number }).status }); }
    finally { loading.current = false; if (mounted.current) setBusy(false); }
  };
  const begin = () => apiRequest<PracticeView>("POST", `/api/lessons/practice/${lessonId}/start`, {});
  useEffect(() => { mounted.current = true; onFinished(false); return () => { mounted.current = false; onFinished(null); }; }, [onFinished]);
  useEffect(() => {
    if (!enabled || round || error) return;
    void run(async () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(key); } catch { /* In-memory fallback. */ }
      if (!saved) return begin();
      try { return await apiRequest<PracticeView>("GET", `/api/lessons/practice/${saved}`); }
      catch (e) { if ((e as { status?: number }).status === 404) return begin(); throw e; }
    });
    // This effect restores only once; actions explicitly replace the saved round.
  }, [enabled, key]);
  const status = error ? <span role="alert">{error.message} <button className="lesson-outline-btn" disabled={busy} onClick={() => void run(error.status === 409 ? begin : retry.current ?? begin)}>{error.status === 409 ? "Új kör indítása" : "Mentés újrapróbálása"}</button></span> : <span role="status">{busy ? "Mentés…" : round ? "A válaszaid mentve" : "A gyakorlókör betöltése…"}</span>;
  if (!round) return <div className="fusion-round-head"><h2>Kvíz</h2>{status}</div>;
  const q = round.questions[Math.min(index, round.questions.length - 1)];
  const result = round.result;
  const summary = result ? scoreSummary(result.correctCount, result.total) : null;
  const seconds = round.finishedAt ? Math.max(0, Math.round((Date.parse(round.finishedAt) - Date.parse(round.startedAt)) / 1000)) : 0;
  const answered = round.questions.filter(q => q.answer).length;
  return <>
    <div className="fusion-round-head"><div><span className="fusion-eyebrow">Mentett gyakorlás</span><h2>Kvíz</h2><p>{answered} / {round.questions.length} válasz · {round.questions.filter(q => q.answer?.correct).length} pont</p></div><div className="practice-save-status">{status}</div></div>
    {result ? <section className="fusion-result" aria-label="Mentett kvízeredmény"><span className="fusion-eyebrow">Ellenőrzött válaszok · gyakorló eredmény</span><h3>{result.score}% · {result.correctCount} / {result.total} pont</h3><p>{result.independentCorrect} önálló helyes válasz. Ez önellenőrzés, nem hivatalos osztályzat.</p><progress value={result.correctCount} max={result.total} aria-label="Mentett pontok" />
      {result.coupon ? <div className="practice-reward"><h3>{result.coupon.minutes} perc játékidőt szereztél</h3><p>Ha szeretnéd, válassz játékot, vagy folytasd a tanulást.</p><Link href="/games" className="fusion-primary">Játékot választok</Link></div>
        : <p>{result.alreadyRewarded ? "Ehhez a leckéhez ma már kaptál játékidőt. A mostani eredményt is megőriztük." : `Játékidőhöz legalább ${result.minCorrectForCoupon} önálló helyes válasz és a beállított eredményküszöb kell.`}</p>}
      <p>Gyakorló osztályzat: {summary!.label} ({summary!.grade}) · {Math.floor(seconds / 60)} perc {seconds % 60} másodperc a kezdéstől a lezárásig. Ez nem az aktív tanulással töltött idő mérése.</p>
      <button className="lesson-outline-btn" onClick={() => {
        const data = { assessment: "Gyakorló önellenőrzés; nem hivatalos jegy.", ...summary, independentCorrect: result.independentCorrect, startedAt: round.startedAt, finishedAt: round.finishedAt, seconds, questions: round.questions };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }));
        const a = document.createElement("a"); a.href = url; a.download = "tanulasi-eredmeny.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Eredmény letöltése</button>
      <details><summary className="lesson-ghost-btn">A kör válaszainak áttekintése</summary>{round.questions.map(question => <article key={question.id} className="lesson-block">
        <h4>{question.prompt}</h4><p>{question.answer ? `A válaszod: ${question.options[question.answer.pickedIndex]}` : "Erre a kérdésre nem válaszoltál."}</p>
        {question.answer && <p>{question.answer.feedback}</p>}{(question.hintUsed || question.answer?.usedHint) && <p>Segítséget kértél.</p>}
        <button className="lesson-outline-btn" onClick={() => onReview(question.questionId)}>Kapcsolódó magyarázat</button>
      </article>)}</details>
      {!!result.weakConceptIds.length && <button className="lesson-outline-btn" onClick={() => onReview(round.questions.find(q => q.coversConceptIds.some(id => result.weakConceptIds.includes(id)))!.questionId)}>Átnézem a magyarázatot</button>}
      <p>A következő körben a még nem látott, hibás és esedékes kérdések kerülnek előre.</p><button className="lesson-outline-btn" disabled={busy} onClick={() => { setIndex(0); void run(begin); }}>Új kvíz indítása</button>
    </section> : <>
      <section className="lesson-block fusion-quiz" data-quiz-id={q.questionId}><span className="fusion-eyebrow">{index + 1}. kérdés</span><h3>{q.prompt}</h3><div className="fusion-choices">{q.options.map((option, pickedIndex) => <button key={pickedIndex} className="lesson-option" disabled={busy || !!q.answer || !!error} aria-pressed={q.answer?.pickedIndex === pickedIndex} data-state={q.answer?.pickedIndex === pickedIndex ? q.answer.correct ? "right" : "wrong" : undefined} onClick={() => void run(() => apiRequest("POST", `/api/lessons/practice/${round.id}/answer`, { questionId: q.id, pickedIndex, usedHint: q.hintUsed }))}><span className="lesson-option-key">{"ABCD"[pickedIndex]}</span>{option}</button>)}</div>
        {q.answer ? <p className="lesson-feedback" data-state={q.answer.correct ? "right" : "wrong"}>{q.answer.feedback}{q.answer.usedHint ? " · Segítséggel megoldva" : ""}</p> : <button className="lesson-ghost-btn" disabled={busy || !!error} onClick={() => void run(async () => { const saved = await apiRequest<PracticeView>("POST", `/api/lessons/practice/${round.id}/hint`, { questionId: q.id }); onReview(q.questionId); return saved; })}>Segítség: vissza a magyarázathoz</button>}
      </section>
      <LearningPager index={index} count={round.questions.length} label="kérdés" onChange={setIndex} />
      <FinishPracticeButton className="fusion-primary" total={round.questions.length} unanswered={round.questions.length - answered} disabled={busy || !!error} onContinue={() => setIndex(round.questions.findIndex(q => !q.answer))} onFinish={() => void run(() => apiRequest("POST", `/api/lessons/practice/${round.id}/finish`, {}))}>Kvíz kiértékelése</FinishPracticeButton>
    </>}
  </>;
}
