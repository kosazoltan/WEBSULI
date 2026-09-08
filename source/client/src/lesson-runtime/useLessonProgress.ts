import { useCallback, useEffect, useRef, useState } from "react";

/**
 * B7 — lesson answers / try state / current section survive a refresh.
 *
 * Keyed by htmlFileId (or probe id). Schema versioned so a later shape change
 * can drop corrupt or stale snapshots instead of crashing the runtime.
 */

export const LESSON_PROGRESS_VERSION = 1 as const;

export type TrySnapshot =
  | { kind: "fillBlank"; values: string[]; checked: boolean }
  | { kind: "dragSort"; order: string[]; checked: boolean }
  | { kind: "match"; matched: number[] };

export type LessonProgressSnapshot = {
  v: typeof LESSON_PROGRESS_VERSION;
  current: number;
  sections: Record<
    string,
    {
      answers: Record<string, number>;
      tryBlocks: Record<string, TrySnapshot>;
    }
  >;
};

export function lessonProgressKey(lessonId: string): string {
  return `websuli.lesson.${lessonId}.v1`;
}

export function emptyLessonProgress(): LessonProgressSnapshot {
  return { v: LESSON_PROGRESS_VERSION, current: 0, sections: {} };
}

export function parseLessonProgress(raw: string | null): LessonProgressSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Partial<LessonProgressSnapshot>;
    if (obj.v !== LESSON_PROGRESS_VERSION) return null;
    if (typeof obj.current !== "number" || !Number.isFinite(obj.current) || obj.current < 0) {
      return null;
    }
    if (!obj.sections || typeof obj.sections !== "object") return null;
    return {
      v: LESSON_PROGRESS_VERSION,
      current: Math.floor(obj.current),
      sections: obj.sections as LessonProgressSnapshot["sections"],
    };
  } catch {
    return null;
  }
}

export function readLessonProgress(lessonId: string): LessonProgressSnapshot {
  if (typeof window === "undefined") return emptyLessonProgress();
  try {
    return parseLessonProgress(window.localStorage.getItem(lessonProgressKey(lessonId))) ?? emptyLessonProgress();
  } catch {
    return emptyLessonProgress();
  }
}

export function writeLessonProgress(lessonId: string, snapshot: LessonProgressSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lessonProgressKey(lessonId), JSON.stringify(snapshot));
  } catch {
    /* quota / private mode — progress is best-effort */
  }
}

const SAVE_DEBOUNCE_MS = 200;

export function useLessonProgress(lessonId: string | undefined) {
  const id = lessonId?.trim() || "";
  const [snapshot, setSnapshot] = useState<LessonProgressSnapshot>(() =>
    id ? readLessonProgress(id) : emptyLessonProgress(),
  );
  const pendingRef = useRef<LessonProgressSnapshot | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) {
      setSnapshot(emptyLessonProgress());
      return;
    }
    setSnapshot(readLessonProgress(id));
  }, [id]);

  const flush = useCallback(() => {
    if (!id || !pendingRef.current) return;
    writeLessonProgress(id, pendingRef.current);
    pendingRef.current = null;
  }, [id]);

  const scheduleSave = useCallback(
    (next: LessonProgressSnapshot) => {
      if (!id) return;
      pendingRef.current = next;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, SAVE_DEBOUNCE_MS);
    },
    [flush, id],
  );

  useEffect(() => {
    const onHide = () => flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (timerRef.current) clearTimeout(timerRef.current);
      flush();
    };
  }, [flush]);

  const setCurrent = useCallback(
    (updater: number | ((prev: number) => number)) => {
      setSnapshot((prev) => {
        const current = typeof updater === "function" ? updater(prev.current) : updater;
        const next = { ...prev, current: Math.max(0, Math.floor(current)) };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const setSectionAnswers = useCallback(
    (sectionIdx: number, answers: Record<number, number>) => {
      setSnapshot((prev) => {
        const key = String(sectionIdx);
        const section = prev.sections[key] ?? { answers: {}, tryBlocks: {} };
        const nextAnswers: Record<string, number> = {};
        for (const [bi, picked] of Object.entries(answers)) {
          nextAnswers[bi] = picked;
        }
        const next: LessonProgressSnapshot = {
          ...prev,
          sections: {
            ...prev.sections,
            [key]: { ...section, answers: nextAnswers },
          },
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const setTrySnapshot = useCallback(
    (sectionIdx: number, blockIdx: number, trySnap: TrySnapshot) => {
      setSnapshot((prev) => {
        const key = String(sectionIdx);
        const section = prev.sections[key] ?? { answers: {}, tryBlocks: {} };
        const next: LessonProgressSnapshot = {
          ...prev,
          sections: {
            ...prev.sections,
            [key]: {
              ...section,
              tryBlocks: { ...section.tryBlocks, [String(blockIdx)]: trySnap },
            },
          },
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  return {
    enabled: Boolean(id),
    snapshot,
    setCurrent,
    setSectionAnswers,
    setTrySnapshot,
  };
}
