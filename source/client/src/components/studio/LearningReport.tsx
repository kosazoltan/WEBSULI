import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useState } from "react";

type Report = { completedRounds: number; limit: number; asOf: string; questions: { id: string; prompt: string; concepts: string[]; attempts: number; wrong: number; hints: number }[] };
export function LearningReport({ lessonId }: { lessonId: string }) {
  const [page, setPage] = useState(0);
  const query = useQuery<Report>({ queryKey: ["/api/studio/lessons", lessonId, "learning-report"], queryFn: () => apiRequest("GET", `/api/studio/lessons/${lessonId}/learning-report`), retry: false });
  if (query.isPending) return <p role="status">Tanulási eredmények betöltése…</p>;
  if (query.isError) return <p role="alert">A tanulási riport most nem érhető el. <button className="underline min-h-11" onClick={() => void query.refetch()}>Újra</button></p>;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(query.data.questions.length / 20) - 1));
  return <section aria-label="Mentett kvízeredmények" className="space-y-3 border-t pt-3">
    <h3 className="font-semibold">Melyik kérdés okoz nehézséget?</h3>
    <p className="text-sm text-muted-foreground">{query.data.completedRounds} lezárt kör, legfeljebb a legutóbbi {query.data.limit} alapján. Az első válasz számít; külön kérdésváltozatok külön szerepelnek.</p>
    {!query.data.questions.length ? <p className="text-sm">Még nincs mentett kvízeredmény.</p> : <ul className="space-y-3">{query.data.questions.slice(currentPage * 20, (currentPage + 1) * 20).map(q => <li key={q.id} className="rounded-xl border p-3">
      <p className="font-medium break-words">{q.prompt}</p><p className="text-sm">{q.wrong} hibás vagy kihagyott / {q.attempts} válasz · {q.hints} segítségkérés</p>
      {q.attempts < 5 && <p className="text-xs text-muted-foreground">Kevés adat: ebből még ne következtess a tananyag minőségére.</p>}
    </li>)}</ul>}
    {query.data.questions.length > 20 && <nav aria-label="Riport lapozása" className="flex flex-wrap gap-4 items-center"><button disabled={currentPage === 0} className="min-h-11 underline" onClick={() => setPage(currentPage - 1)}>Előző</button><span>{currentPage + 1} / {Math.ceil(query.data.questions.length / 20)}</span><button disabled={(currentPage + 1) * 20 >= query.data.questions.length} className="min-h-11 underline" onClick={() => setPage(currentPage + 1)}>Következő</button></nav>}
  </section>;
}
