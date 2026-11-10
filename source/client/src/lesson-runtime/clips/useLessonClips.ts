import { useEffect, useState } from "react";
import { parseAnyClip, type Clip, type Clip2, type LessonClipsResponse } from "@shared/lesson-clip";

/**
 * A lecke kész kisfilmjei (spec 2026-11-10-fejezet-kisfilmek, 4.8). Amíg a szerver szerint készül még kisfilm (`pending`), 20 mp-enként
 * újra kérdez, legfeljebb 30 percig — az időközben elkészült kisfilm gombja újratöltés nélkül megjelenik. Hiba esetén némán üres:
 * a lecke kisfilm nélkül is teljes.
 */
export const CLIP_POLL_MS = 20_000;
export const CLIP_POLL_MAX_MS = 30 * 60_000;
export type LessonClipsState = { clips: ReadonlyMap<number, Clip | Clip2>; pending: boolean };
const EMPTY: LessonClipsState = { clips: new Map(), pending: false };

function toState(body: unknown): LessonClipsState {
  const raw = body as Partial<LessonClipsResponse> | null;
  const clips = new Map<number, Clip | Clip2>();
  for (const entry of Array.isArray(raw?.clips) ? raw.clips : []) {
    const parsed = parseAnyClip(entry?.clip);
    if (parsed && Number.isInteger(entry.sectionIndex)) clips.set(entry.sectionIndex, parsed);
  }
  return { clips, pending: raw?.pending === true };
}

export function useLessonClips(lessonId: string | undefined, preset?: LessonClipsResponse, pollMs = CLIP_POLL_MS): LessonClipsState {
  const [state, setState] = useState<LessonClipsState>(() => (preset ? toState(preset) : EMPTY));
  useEffect(() => {
    if (preset) { setState(toState(preset)); return; }
    if (!lessonId) { setState(EMPTY); return; }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const load = async () => {
      let next = EMPTY;
      try {
        const res = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}/clips`, { credentials: "same-origin" });
        if (res.ok) next = toState(await res.json());
      } catch {
        next = EMPTY; // hálózati hiba: a lecke kisfilm nélkül megy tovább
      }
      if (stopped) return;
      // Hibás lekérés nem törli a már megjelent kisfilmeket.
      setState((old) => (next === EMPTY && old.clips.size ? { clips: old.clips, pending: false } : next));
      if (next.pending && Date.now() - started < CLIP_POLL_MAX_MS) timer = setTimeout(() => void load(), pollMs);
    };
    void load();
    return () => { stopped = true; clearTimeout(timer); };
  }, [lessonId, preset, pollMs]);
  return state;
}
