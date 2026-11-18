import { isPlayableQuestion, uniqueQuizContent } from "@shared/game-quiz-contract";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

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

/** Stabil üres értékek: betöltés alatt se kapjon a hívó renderenként új `[]`-t (a `useMemo`-függőségei ettől stabilak). */
const EMPTY_ITEMS = Object.freeze([]) as unknown as MaterialQuizItem[];
const EMPTY_MATERIALS = Object.freeze([]) as unknown as MaterialQuizResponse["materials"];

/**
 * A játszható, tartalomra egyedi tételek (opcionálisan egy topicra szűrve). Tiszta függvény: a hook csak
 * memoizálja, a teszt a régi képlettel veti össze (`tests/material-quizzes-hook-memo.test.ts`).
 */
export function selectPlayableMaterialItems(items: MaterialQuizItem[], topicFilter?: MaterialQuizTopic): MaterialQuizItem[] {
  const playable = uniqueQuizContent(items.filter(isPlayableQuestion));
  if (!topicFilter) return playable;
  return playable.filter((i) => (i.topic ?? "").toLowerCase() === topicFilter);
}

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

  // Kanban #90 (Kockavadász-akadás gyökéroka): a szűrt tömb csak adat- vagy topicFilter-váltáskor új. Korábban minden
  // renderben új tömb jött, ezért a lapok erre épülő memói (a Kockavadász 25 144 tételes kérdésbank-szűrése) minden
  // renderben újrafutottak (a CPU 87%-a, spec: docs/specs/2026-11-17-kerdesbank-hook-memo.md).
  const data = q.data;
  const items = useMemo(
    () => (data ? selectPlayableMaterialItems(data.items ?? EMPTY_ITEMS, topicFilter) : EMPTY_ITEMS),
    [data, topicFilter],
  );

  return {
    grade: data?.classroom ?? grade ?? 0,
    materials: data?.materials ?? EMPTY_MATERIALS,
    items,
    rawItems: data?.items ?? EMPTY_ITEMS,
    isLoading: q.isLoading,
    isError: q.isError,
  };
}
