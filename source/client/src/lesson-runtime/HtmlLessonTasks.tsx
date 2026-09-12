import { useEffect, useState } from "react";
import { z } from "zod";
import { experienceRoundSizes, type LessonExperience } from "@shared/lesson-experience";
import { evaluateOpenAnswer, sampleTaskIds, scoreSummary } from "@shared/lesson-experience-score";
import { FinishPracticeButton } from "./FinishPracticeButton";

const schema = z.object({ ids: z.array(z.string()), answers: z.record(z.string().max(10000)), seenSampleIds: z.array(z.string()).default([]), started: z.number().nonnegative(), finished: z.number().nonnegative().nullable() });
type Round = z.infer<typeof schema>;
export function HtmlLessonTasks({ experience, material }: { experience: LessonExperience; material: string }) {
  const bank = experience.tasks, count = experienceRoundSizes(experience).taskRound;
  const key = `websuli:html-tasks:v1:${material}:${JSON.stringify(bank)}`;
  const fresh = (size = count): Round => ({ ids: sampleTaskIds(bank, size), answers: {}, seenSampleIds: [], started: Date.now(), finished: null });
  const [round, setRound] = useState<Round>(() => {
    try {
      const parsed = schema.safeParse(JSON.parse(localStorage.getItem(key) ?? "null"));
      if (parsed.success && [count, bank.length].includes(parsed.data.ids.length) && new Set(parsed.data.ids).size === parsed.data.ids.length && parsed.data.ids.every(id => bank.some(t => t.id === id))) return parsed.data;
    } catch { /* Corrupt storage cannot produce an accepted result. */ }
    return fresh();
  });
  const [error, setError] = useState(false), [reset, setReset] = useState(false);
  const [nextCount, setNextCount] = useState(count);
  const [pageIndex, setPageIndex] = useState(0), [overview, setOverview] = useState(false);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(round)); setError(false); } catch { setError(true); } }, [key, round]);
  const tasks = round.ids.map(id => bank.find(t => t.id === id)!);
  const points = tasks.reduce((sum, t) => sum + evaluateOpenAnswer(round.answers[t.id] ?? "", t).score, 0);
  const result = scoreSummary(points, tasks.length);
  return <section className="websuli-html-quiz" aria-label="Pontozott szöveges feladatok"><h2>Szöveges feladatok · {tasks.length} kérdés</h2>
    <p>Szabályalapú gyakorló önellenőrzés: teljes válasz 1 pont, részleges válasz fél pont, üres válasz 0 pont. A pontozó nem érti úgy a nyelvet, mint egy tanár. A szóbeli válaszodat mondd el, majd írd le.</p>
    {error && <p role="alert">A böngésző nem engedte a mentést. Ne töltsd újra az oldalt; az eredményt letöltheted.</p>}
    <button onClick={() => { setNextCount(count); setReset(true); }}>Új feladatkör</button><button onClick={() => { setNextCount(bank.length); setReset(true); }}>Teljes feladatbank · {bank.length} kérdés</button>{reset && <div role="group" aria-label="Új feladatkör megerősítése"><p>Az új, {nextCount} kérdéses kör lecseréli az itt tárolt válaszokat és eredményt.</p><button onClick={() => { setRound(fresh(nextCount)); setPageIndex(0); setReset(false); }}>Új kör indítása</button><button onClick={() => setReset(false)}>Mégsem</button></div>}
    <nav aria-label="Kérdések lapozása"><button disabled={pageIndex === 0} onClick={() => setPageIndex(i => Math.max(0, i - 1))}>Előző kérdés</button><span>{Math.min(pageIndex + 1, tasks.length)} / {tasks.length}</span><button disabled={pageIndex >= tasks.length - 1} onClick={() => setPageIndex(i => Math.min(tasks.length - 1, i + 1))}>Következő kérdés</button><button aria-pressed={overview} onClick={() => setOverview(v => !v)}>{overview ? "Egyenként" : "Összes kérdés áttekintése"}</button></nav>
    {tasks.map((t, i) => <article key={t.id} hidden={!overview && i !== Math.min(pageIndex, tasks.length - 1)}><h3>{i + 1}. {t.mode === "oral" ? "Szóbeli" : "Írásbeli"}: {t.q}</h3><label>Saját válasz<textarea style={{ width: "100%", minHeight: 100, fontSize: "1rem" }} aria-label={t.q} maxLength={10000} disabled={round.finished !== null} value={round.answers[t.id] ?? ""} onChange={event => setRound({ ...round, answers: { ...round.answers, [t.id]: event.target.value } })} /></label>{round.finished !== null && <div><p>{evaluateOpenAnswer(round.answers[t.id] ?? "", t).score} / 1 pont · {evaluateOpenAnswer(round.answers[t.id] ?? "", t).reason}</p><details onToggle={event => { if (event.currentTarget.open) setRound(current => current.seenSampleIds.includes(t.id) ? current : { ...current, seenSampleIds: [...current.seenSampleIds, t.id] }); }}><summary>Mintaválasz</summary><p>{t.sample}</p></details></div>}</article>)}
    <FinishPracticeButton total={tasks.length} unanswered={tasks.filter(t => !round.answers[t.id]?.trim()).length} disabled={round.finished !== null} onContinue={() => { setOverview(false); setPageIndex(tasks.findIndex(t => !round.answers[t.id]?.trim())); }} onFinish={() => setRound({ ...round, finished: Date.now() })}>Kiértékelés</FinishPracticeButton>
    {round.finished !== null && <div role="status"><strong>{points} / {tasks.length} pont · {result.percent}%</strong><p>Gyakorló osztályzat: {result.grade} · idő: {Math.max(0, Math.floor((round.finished - round.started) / 1000))} mp</p><button onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ ...round, ...result, assessment: "Szabályalapú helyi önellenőrzés" })], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "feladat-eredmeny.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Eredmény letöltése</button></div>}
  </section>;
}
