import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { lessonSchema } from "@shared/lesson-schema";
import { tolerantLessonInput } from "@shared/lesson-experience";
import { reloadIfNewerBuild } from "@/lib/app-version";
import { LessonRuntime } from "./LessonRuntime";

/**
 * Loads a stored lesson and hands it to the runtime — but only after re-validating it.
 *
 * The JSON in the database passed the gate when it was published; that does not make it
 * trustworthy at read time. A schema change, a hand-edited row or a partially written
 * record would otherwise render as a lesson that is quietly missing a third of itself.
 * Failing visibly is the correct behaviour for teaching material: a child cannot tell
 * that a section is absent, and a teacher can.
 */
export function LessonView({ material }: { material: { id: string; title?: string } }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery<{ lesson: unknown; lessonId?: string }>({
    queryKey: ["/api/lessons/by-file", material.id],
    queryFn: () => apiRequest("GET", `/api/lessons/by-file/${material.id}`),
    // Audit 2026-09-24: mobilon egy pillanatnyi hálózati hiba eddig zsákutca volt (az alapbeállítás retry:false).
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  if (isLoading) {
    return (
      <div className="w-full flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Lecke betöltése…
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <p className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          A lecke nem tölthető be. Lehet, hogy most gyenge a hálózat.
        </p>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className="mt-3 inline-flex items-center gap-2 min-h-11 px-4 rounded-lg border text-sm font-semibold" data-testid="lesson-retry">
          <RotateCw className={isFetching ? "w-4 h-4 animate-spin" : "w-4 h-4"} /> Újrapróbálás
        </button>
      </div>
    );
  }

  const parsed = lessonSchema.safeParse(tolerantLessonInput(data?.lesson));

  if (!parsed.success) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-2">
        <p className="flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Ez a lecke sérült vagy hiányos, ezért nem jelenítjük meg. Szólj a
          tanárnak/adminnak — a hiba a leckében van, nem nálad.
        </p>
        <p className="text-xs text-muted-foreground">
          {parsed.error.issues.length} hibás mező (pl.{" "}
          {parsed.error.issues[0]?.path.join(".") || "ismeretlen"}).
        </p>
        <VersionSkewRecovery />
      </div>
    );
  }

  // The lesson id (not the html_files id) is what the Próba endpoint keys on.
  return <LessonRuntime lesson={parsed.data} lessonId={data?.lessonId} />;
}

/** Spec 2026-09-24: egy olvashatatlan lecke gyakran csak régi, memóriában maradt alkalmazáskód — egyszer frissítünk. */
function VersionSkewRecovery() {
  const [checking, setChecking] = useState(true);
  useEffect(() => { let alive = true; void reloadIfNewerBuild().then((started) => { if (alive && !started) setChecking(false); }); return () => { alive = false; }; }, []);
  if (checking) return <p className="text-xs text-muted-foreground">Új verzió keresése…</p>;
  return (
    <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center gap-2 min-h-11 px-4 rounded-lg border text-sm font-semibold" data-testid="lesson-refresh">
      <RotateCw className="w-4 h-4" /> Frissítés
    </button>
  );
}
