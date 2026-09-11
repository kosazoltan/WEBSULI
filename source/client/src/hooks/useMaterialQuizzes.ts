import { isPlayableQuestion, uniqueQuizContent } from "@shared/game-quiz-contract";
import { useQuery } from "@tanstack/react-query";

/**
 * Tananyag-alapú kvíz-tételek lekérése a játékos osztályának legutóbbi N
 * tananyagából. Minden játék közösen használja — a `topicFilter` paraméter
 * játék-specifikus szűrést biztosít:
 *   - `null` / undefined → minden topic (BlockCraft, BrainRot, Tsunami, SpaceAsteroid)
 *   - `"english"` → csak angol szókincs (WordLadder)
 *   - `"math"` → csak matek (SpeedQuizMath)
 *   - `"hungarian"`, `"nature"` → szakirány-specifikus játékokhoz
 *
 * A háttérben a `/api/games/material-quizzes` endpoint-ot hívja, ami a
 * `gameQuizItems` táblából a `sourceMaterialId IN (last 3 materials of grade)`
 * szűréssel ad vissza tételeket. Ha a `gameId` mező irreleváns (a generált
 * tételek mindenkinek elérhetők).
 */

export type MaterialQuizTopic = "english" | "math" | "nature" | "hungarian";

export type MaterialQuizItem = {
  id?: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  /** T-1: a MIÉRT, amit a játék rossz válasznál megmutat; régi tételeknél hiányzik. */
  explanation?: string | null;
  topic?: string | null;
  sourceMaterialId?: string | null;
};

export type MaterialQuizResponse = {
  classroom: number;
  materials: { id: string; title: string; createdAt: string }[];
  items: MaterialQuizItem[];
};

export function useMaterialQuizzes(grade: number | null, topicFilter?: MaterialQuizTopic, lessonId?: string | null) {
  const q = useQuery<MaterialQuizResponse>({
    queryKey: ["/api/games/material-quizzes", grade ?? "none", lessonId ?? "recent"],
    enabled: grade != null || !!lessonId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/games/material-quizzes?classroom=${grade ?? 0}&limit=3${lessonId ? `&lessonId=${encodeURIComponent(lessonId)}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("A tananyag kérdéseit nem sikerült betölteni.");
      return res.json();
    },
  });

  const filteredItems: MaterialQuizItem[] = (() => {
    const items = uniqueQuizContent((q.data?.items ?? []).filter(isPlayableQuestion));
    if (!topicFilter) return items;
    return items.filter((i) => (i.topic ?? "").toLowerCase() === topicFilter);
  })();

  return {
    grade: q.data?.classroom ?? grade ?? 0,
    materials: q.data?.materials ?? [],
    items: filteredItems,
    rawItems: q.data?.items ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
