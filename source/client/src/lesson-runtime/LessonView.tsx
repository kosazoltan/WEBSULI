import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";

import { apiRequest } from "@/lib/queryClient";
import { lessonSchema } from "@shared/lesson-schema";
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
  const { data, isLoading, error } = useQuery<{ lesson: unknown }>({
    queryKey: ["/api/lessons/by-file", material.id],
    queryFn: () => apiRequest("GET", `/api/lessons/by-file/${material.id}`),
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
          A lecke nem tölthető be.
        </p>
      </div>
    );
  }

  const parsed = lessonSchema.safeParse(data?.lesson);

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
      </div>
    );
  }

  return <LessonRuntime lesson={parsed.data} />;
}
