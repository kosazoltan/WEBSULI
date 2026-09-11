import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { WorkflowView } from "@shared/lesson-workflow";
import { WORKFLOW_STATE_LABELS } from "@shared/lesson-workflow";
import { apiRequest } from "@/lib/queryClient";
import { WorkflowGraph } from "./WorkflowGraph";

export function WorkflowMonitor({ id }: { id: string | null }) {
  const query = useQuery<{ run: WorkflowView | null }>({
    queryKey: ["/api/studio/workflows", id],
    queryFn: () => apiRequest("GET", `/api/studio/workflows/${encodeURIComponent(id!)}`),
    enabled: !!id, retry: 1,
    refetchInterval: q => q.state.data?.run ? (["running", "waiting"].includes(q.state.data.run.state) ? 2500 : false) : q.state.dataUpdateCount < 4 ? 2500 : false,
  });
  if (!id) return null;
  if (query.isError) return <div role="alert" className="rounded-lg border p-3 text-sm">A futásnapló most nem érhető el. <button className="min-h-11 underline" onClick={() => void query.refetch()}>Újraellenőrzés</button></div>;
  if (query.isPending) return <p role="status" className="text-sm">Futásnapló betöltése…</p>;
  if (!query.data?.run) return <p className="text-xs text-muted-foreground">Ehhez a futáshoz még nincs új folyamatnapló. A korábbi futások lépéseit nem állítjuk elő utólag.</p>;
  return <WorkflowGraph run={query.data.run} />;
}

export function WorkflowHistory() {
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery<{ runs: WorkflowView[] }>({ queryKey: ["/api/studio/workflows"], queryFn: () => apiRequest("GET", "/api/studio/workflows"), refetchInterval: 5000, retry: 1 });
  return <section className="min-w-0 space-y-4 rounded-2xl border bg-white p-3 pb-24 text-slate-900 sm:p-5 dark:bg-slate-950 dark:text-slate-100" data-testid="workflow-history">
    <h2 className="text-lg font-bold">Tananyagkészítési futások</h2>
    <p className="text-sm text-muted-foreground">A saját utolsó 50 futásod. A lépések a szerveren rögzített eseményeket mutatják.</p>
    {query.isError ? <p role="alert">A futások nem tölthetők be. <button className="min-h-11 underline" onClick={() => void query.refetch()}>Újra</button></p> : query.isPending ? <p>Betöltés…</p> : query.data?.runs.length === 0 ? <p>Még nincs rögzített futásod.</p> : <label className="block space-y-2 text-sm"><span>Futás kiválasztása</span><select aria-label="Futás kiválasztása" className="min-h-11 w-full min-w-0 rounded-lg border bg-background p-2" value={selected ?? query.data?.runs[0]?.id ?? ""} onChange={e => setSelected(e.target.value)}>{query.data?.runs.map(run => <option key={run.id} value={run.id}>{new Date(run.createdAt).toLocaleString("hu-HU")} · {run.definition.label} · {WORKFLOW_STATE_LABELS[run.state]}</option>)}</select></label>}
    <WorkflowMonitor key={selected ?? query.data?.runs[0]?.id} id={selected ?? query.data?.runs[0]?.id ?? null} />
  </section>;
}
