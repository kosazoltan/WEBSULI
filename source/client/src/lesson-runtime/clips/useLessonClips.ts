import { useEffect, useState } from "react";
import { clip2Schema, type Clip2, type LessonClipsResponse } from "@shared/lesson-clip";

/**
 * A lecke kész kisfilmjei (spec 2026-11-10-fejezet-kisfilmek-v2). Amíg a szerver szerint készül még kisfilm (`pending`), 20 mp-enként
 * újra kérdez, legfeljebb 30 percig — az időközben elkészült kisfilm gombja újratöltés nélkül megjelenik. Hiba esetén némán üres:
 * a lecke kisfilm nélkül is teljes.
 */
export const CLIP_POLL_MS = 20_000;
export const CLIP_POLL_MAX_MS = 30 * 60_000;
export type LessonClipsState = { clips: ReadonlyMap<number, Clip2>; pending: boolean };
const EMPTY: LessonClipsState = { clips: new Map(), pending: false };

function toState(body: unknown): LessonClipsState {
  const raw = body as Partial<LessonClipsResponse> | null;
  const clips = new Map<number, Clip2>();
  for (const entry of Array.isArray(raw?.clips) ? raw.clips : []) {
    const parsed = clip2Schema.safeParse(entry?.clip);
    if (parsed.success && Number.isInteger(entry.sectionIndex)) clips.set(entry.sectionIndex, parsed.data);
  }
  return { clips, pending: raw?.pending === true };
}

/**
 * A válasz utáni állapot: tovább kérdez-e a kliens, és mit mutat. Ha a várakozás lejárt (CLIP_POLL_MAX_MS), a „Készülnek a
 * kisfilmek…” jelzés eltűnik — a kliens már nem kérdez, a jelzés nem ragadhat kint (vak kör L7).
 */
export function settleClips(next: LessonClipsState, elapsedMs: number): { state: LessonClipsState; poll: boolean } {
  if (!next.pending) return { state: next, poll: false };
  return elapsedMs < CLIP_POLL_MAX_MS ? { state: next, poll: true } : { state: { clips: next.clips, pending: false }, poll: false };
}

export function useLessonClips(lessonId: string | undefined, preset?: LessonClipsResponse, pollMs = CLIP_POLL_MS): LessonClipsState {
  const [state, setState] = useState<LessonClipsState>(() => (preset ? toState(preset) : EMPTY));
  useEffect(() => {
    if (preset) { setState(toState(preset)); return; }
    if (!lessonId) { setState(EMPTY); return; }
    let stopped = false, expired = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const controller = new AbortController();
    // A lekérésektől független lejárat: ha egy kérés elakad, a jelzés akkor is eltűnik, a kész kisfilmek maradnak (2. vak kör L4).
    const expiry = setTimeout(() => {
      expired = true;
      clearTimeout(timer);
      controller.abort();
      setState((old) => (old.pending ? { clips: old.clips, pending: false } : old));
    }, CLIP_POLL_MAX_MS);
    const load = async () => {
      let next = EMPTY;
      try {
        const res = await fetch(`/api/lessons/${encodeURIComponent(lessonId)}/clips`, { credentials: "same-origin", signal: controller.signal });
        if (res.ok) next = toState(await res.json());
      } catch {
        next = EMPTY; // hálózati hiba vagy lejárat: a lecke kisfilm nélkül megy tovább
      }
      if (stopped || expired) return;
      const settled = settleClips(next, Date.now() - started);
      // Hibás lekérés nem törli a már megjelent kisfilmeket.
      setState((old) => (next === EMPTY && old.clips.size ? { clips: old.clips, pending: false } : settled.state));
      if (settled.poll) timer = setTimeout(() => void load(), pollMs);
      else clearTimeout(expiry);
    };
    void load();
    return () => { stopped = true; clearTimeout(timer); clearTimeout(expiry); controller.abort(); };
  }, [lessonId, preset, pollMs]);
  return state;
}
