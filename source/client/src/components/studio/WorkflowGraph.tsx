import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Circle, Clock3, RefreshCw, TriangleAlert } from "lucide-react";
import { WORKFLOW_STATE_LABELS, type WorkflowView, type WorkflowVisit } from "@shared/lesson-workflow";
import { SKILL_RULES, skillForMode } from "@shared/lesson-skill";

const elapsed = (visit: WorkflowVisit) => visit.finishedAt === undefined ? "Folyamatban" : `${((visit.finishedAt - visit.startedAt) / 1000).toLocaleString("hu-HU", { maximumFractionDigits: 1 })} mp`;
const visitLabel = { done: "Befejezett", running: "Folyamatban", error: "Megállt", waiting: "Döntésre vár" };

/** Connections and cards come from the persisted, versioned execution definition. */
export function WorkflowGraph({ run }: { run: WorkflowView }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [connections, setConnections] = useState<Array<{ path: string; retry: boolean }>>([]);
  const graph = useRef<HTMLDivElement>(null);
  const selectedId = run.definition.steps.some(s => s.id === selected) ? selected! : run.visits.at(-1)?.step ?? run.definition.steps[0].id;
  useEffect(() => {
    const root = graph.current;
    if (!root) return;
    const draw = () => {
      const bounds = root.getBoundingClientRect();
      const paths: Array<{ path: string; retry: boolean }> = [];
      for (const step of run.definition.steps) {
        const end = root.querySelector<HTMLElement>(`[data-step="${step.id}"]`)?.getBoundingClientRect();
        if (!end) continue;
        for (const previous of step.after) {
          const start = root.querySelector<HTMLElement>(`[data-step="${previous}"]`)?.getBoundingClientRect();
          if (!start || previous === step.id) continue;
          const retry = run.definition.steps.findIndex(s => s.id === previous) >= run.definition.steps.findIndex(s => s.id === step.id);
          if (retry) continue; // Backward edges are explicit buttons below; avoid lines through other cards.
          const sameRow = Math.abs(start.top - end.top) < 2;
          const x1 = (sameRow ? start.right : start.left + start.width / 2) - bounds.left;
          const y1 = (sameRow ? start.top + start.height / 2 : start.bottom) - bounds.top;
          const x2 = (sameRow ? end.left : end.left + end.width / 2) - bounds.left;
          const y2 = (sameRow ? end.top + end.height / 2 : end.top) - bounds.top;
          const midY = y1 + (y2 - y1) / 2;
          paths.push({ path: sameRow ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} V${midY} H${x2} V${y2}`, retry });
        }
      }
      setConnections(paths);
    };
    const observer = new ResizeObserver(draw);
    observer.observe(root);
    draw();
    return () => observer.disconnect();
  }, [run.definition]);
  const selectedStep = run.definition.steps.find(s => s.id === selectedId)!;
  const visits = run.visits.filter(v => v.step === selectedId);
  return <section aria-label="Tananyagkészítés folyamatábrája" data-testid="workflow-graph" className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-900 sm:p-5 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{run.definition.label}</h3><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{new Date(run.createdAt).toLocaleString("hu-HU")} · {run.definition.version}</p></div>
      <p role="status" className="max-w-full rounded-full border bg-white px-3 py-2 text-sm font-semibold dark:bg-slate-900">{WORKFLOW_STATE_LABELS[run.state]}</p>
    </div>
    <div ref={graph} className="relative grid min-w-0 grid-cols-1 gap-7 sm:grid-cols-2 xl:grid-cols-3">
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible text-slate-400">
        {connections.map((c, index) => <path key={index} d={c.path} fill="none" stroke="currentColor" strokeWidth="2" />)}
      </svg>
      {run.definition.steps.map((step, index) => {
        const last = run.visits.filter(v => v.step === step.id).at(-1);
        const state = last?.state === "running" && run.state === "interrupted" ? "error" : last?.state;
        const Icon = state === "done" ? Check : state === "error" ? TriangleAlert : state === "running" ? RefreshCw : Circle;
        const color = state === "done" ? "border-emerald-300 bg-emerald-50 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100" : state === "error" ? "border-red-300 bg-red-50 text-red-950 dark:bg-red-950 dark:text-red-100" : state === "running" ? "border-sky-400 bg-sky-50 text-sky-950 dark:bg-sky-950 dark:text-sky-100" : "border-slate-300 bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200";
        return <button key={step.id} type="button" data-step={step.id} aria-pressed={selectedId === step.id} onClick={() => setSelected(step.id)} className={`relative z-10 min-h-24 min-w-0 rounded-xl border p-3 text-left shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${color} ${selectedId === step.id ? "ring-2 ring-sky-600 ring-offset-2 dark:ring-offset-slate-950" : ""}`}>
          <span className="flex items-center gap-2 text-xs font-semibold"><Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${state === "running" ? "motion-safe:animate-spin" : ""}`} />{index + 1}. {state ? visitLabel[state] : "Még nem indult"}{last && last.attempt > 1 ? ` · ${last.attempt}. kör` : ""}</span>
          <span className="mt-2 block break-words text-sm font-semibold">{step.label}</span>
        </button>;
      })}
    </div>
    {run.definition.steps.filter(s => s.after.some(a => run.definition.steps.findIndex(p => p.id === a) >= run.definition.steps.findIndex(p => p.id === s.id))).map(step => <p key={step.id} className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300"><RefreshCw className="h-3 w-3" />Javító kör megengedett: <button className="min-h-11 underline" onClick={() => setSelected(step.id)}>{step.label}</button><span>Legfeljebb {step.maxVisits} látogatás.</span></p>)}
    <div className="mt-5 rounded-xl border bg-white p-4 text-sm dark:bg-slate-900" data-testid="workflow-step-details">
      <h4 className="font-bold">{selectedStep.label}</h4>
      {visits.length === 0 ? <p className="mt-2 text-slate-600 dark:text-slate-300">Ez a lépés még nem futott. Nincs mért eredmény.</p> : visits.map((visit, index) => <div key={index} className="mt-3 space-y-1 border-t pt-3">
        <p className="flex flex-wrap items-center gap-2"><Clock3 className="h-4 w-4" />{visit.attempt}. kör · {visit.state === "running" && run.state === "interrupted" ? "Megszakadt; befejezési idő nem ismert" : `${elapsed(visit)} · ${visitLabel[visit.state]}`}</p>
        <p>Bemeneti token: {visit.tokensIn?.toLocaleString("hu-HU") ?? "nincs mérés"} · Kimeneti token: {visit.tokensOut?.toLocaleString("hu-HU") ?? "nincs mérés"}</p>
        {visit.cacheHits > 0 && <p>{visit.cacheHits} mentett részeredmény újrahasználva.</p>}
        {visit.error && <p className="break-words text-red-700 dark:text-red-300">{visit.error}</p>}
      </div>)}
    </div>
    {run.error && <p role="alert" className="mt-3 break-words rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{run.error}</p>}
    {run.history?.map((attempt, i) => <details key={i} className="mt-3 rounded-lg border p-3 text-sm"><summary className="min-h-11 cursor-pointer">Korábbi végrehajtás {i + 1}: {WORKFLOW_STATE_LABELS[attempt.state]}</summary><ol className="space-y-2">{attempt.visits.map((v, n) => <li key={n} className="break-words">{run.definition.steps.find(s => s.id === v.step)?.label} · {visitLabel[v.state]} · {elapsed(v)}{v.error && ` · ${v.error}`}</li>)}</ol></details>)}
    {run.result?.kind === "material" && <a className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white" href={`/preview/${encodeURIComponent(run.result.id)}`}>Tananyag megnyitása<ArrowRight className="h-4 w-4" /></a>}
    {run.result?.kind === "candidate" && <p className="mt-3 text-sm">A jelölt az Okosítás fülön nézhető át és alkalmazható.</p>}
    <details className="mt-4 min-w-0 rounded-xl border bg-white p-3 text-sm dark:bg-slate-900" data-testid="workflow-learning">
      <summary className="min-h-11 cursor-pointer font-semibold">Önellenőrzés és tanult tapasztalatok</summary>
      <p className="mt-2">{run.skillAudit ? run.skillAudit.outcome === "passed" ? "A kötelező folyamatlépések és az eredmény visszaolvasása igazolt." : "A teljes befejezés nem igazolt; a futás megállását és tapasztalatait rögzítettük." : "Ehhez a futáshoz még nincs mentett utóellenőrzés."}</p>
      <p className="mt-2">Ez a program ellenőrzése, nem emberi pedagógiai minősítés.</p>
      {run.skill && <><p className="mt-2 break-words">A futásban alkalmazott kiegészítések: {run.skill.rules.length}. Verzió: {run.skill.version}.</p>
        <ul className="mt-2 list-inside list-disc">{run.skill.rules.map(code => <li key={code}>{SKILL_RULES[code]?.[0] ?? "Korábbi szabály"}</li>)}</ul></>}
      <a className="mt-2 inline-flex min-h-11 items-center underline" href={`/api/studio/skills/${skillForMode(run.definition.mode)}?format=markdown`}>Aktuális skill letöltése</a>
      {run.skillAudit?.findings.map(f => <p key={f.fingerprint} className="mt-2 break-words">{f.code === "unknown" ? "Új hibafajta rögzítve; értelmezése még szükséges." : f.code === "infrastructure" ? "Működési hiba rögzítve; nem pedagógiai szabály." : `Rögzített tapasztalat: ${SKILL_RULES[f.code][0]}.`}</p>)}
    </details>
  </section>;
}
