import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Clapperboard } from "lucide-react";
import { clipMediaUrl, type Clip, type Clip2, type LessonClipsResponse } from "@shared/lesson-clip";
import type { Section } from "@shared/lesson-schema";
import { Clip2Player } from "./Clip2Player";
import { ttsAudioUrl } from "@shared/speech-fallback";
import { stopSpeech } from "../ExperienceSpeech";
import { ClipPlayer, type ClipPlaylistItem } from "./ClipPlayer";
import { useLessonClips, type LessonClipsState } from "./useLessonClips";
import "./lesson-clips.css";

/**
 * A lecke kisfilmjeinek közös állapota: a fejezetcím melletti gomb és a „Kisfilmek lejátszása” gomb ugyanazt a lejátszót nyitja.
 * Kisfilm nélkül a gombok nem jelennek meg (régi anyag, előnézet, próba) — a lecke változatlan.
 */
type ClipContextValue = LessonClipsState & { open(sectionIndexes: number[]): void };
const ClipContext = createContext<ClipContextValue | null>(null);

export function ClipProvider({ lessonId, headings, sections, preset, children }: { lessonId?: string; headings: readonly string[]; sections?: readonly Section[]; preset?: LessonClipsResponse; children: ReactNode }) {
  const state = useLessonClips(lessonId, preset);
  const [session, setSession] = useState<{ playlist: Array<{ sectionIndex: number; heading: string; clip: Clip | Clip2; section?: Section }>; audio: HTMLAudioElement } | null>(null);
  const open = useCallback((sectionIndexes: number[]) => {
    const playlist = sectionIndexes.flatMap((sectionIndex) => {
      const clip = state.clips.get(sectionIndex);
      return clip ? [{ sectionIndex, heading: headings[sectionIndex] ?? clip.title, clip, section: sections?.[sectionIndex] }] : [];
    });
    if (!playlist.length) return;
    stopSpeech();
    // iOS Safari: a hangelemnek a gombnyomás kezelőjében kell elindulnia, különben a későbbi jelenetek hangja némán elbukik.
    const audio = new Audio();
    const opening = playlist[0].clip.scenes[0];
    const first = "audio" in opening && opening.audio ? clipMediaUrl(opening.audio) : ttsAudioUrl(opening.say, "hu");
    if (first) { audio.src = first; void audio.play().catch(() => undefined); }
    setSession({ playlist, audio });
  }, [state.clips, headings, sections]);
  const close = useCallback(() => setSession((old) => { old?.audio.pause(); return null; }), []);
  const value = useMemo(() => ({ ...state, open }), [state, open]);
  return <ClipContext.Provider value={value}>
    {children}
    {/* Egy lejátszási lista egyféle változatból áll: az első kisfilm változata dönt, az eltérők kimaradnak. */}
    {session && (session.playlist[0].clip.v === 2
      ? <Clip2Player playlist={session.playlist.flatMap((item) => (item.clip.v === 2 ? [{ ...item, clip: item.clip }] : []))} audio={session.audio} onClose={close} />
      : <ClipPlayer playlist={session.playlist.flatMap((item): ClipPlaylistItem[] => (item.clip.v === 1 ? [{ sectionIndex: item.sectionIndex, heading: item.heading, clip: item.clip }] : []))} audio={session.audio} onClose={close} />)}
  </ClipContext.Provider>;
}

/** A fejezetcím melletti lejátszógomb — csak ha a fejezethez van kész kisfilm. */
export function ClipChapterButton({ sectionIndex }: { sectionIndex: number }) {
  const clips = useContext(ClipContext);
  if (!clips?.clips.has(sectionIndex)) return null;
  return <button type="button" className="clip-btn" data-testid={`clip-play-${sectionIndex}`} aria-label={`A(z) ${sectionIndex + 1}. fejezet kisfilmjének lejátszása`} onClick={() => clips.open([sectionIndex])}>
    <Clapperboard size={17} aria-hidden /><span>Kisfilm</span>
  </button>;
}

/** A tananyag tetején: az összes kész kisfilm egymás után; amíg készülnek, jelzés. */
export function ClipPlayAllButton() {
  const clips = useContext(ClipContext);
  if (!clips || (!clips.clips.size && !clips.pending)) return null;
  const indexes = [...clips.clips.keys()].sort((a, b) => a - b);
  return <div className="clip-all" data-testid="clip-all">
    {indexes.length > 0 && <button type="button" className="clip-btn" data-testid="clip-play-all" onClick={() => clips.open(indexes)}>
      <Clapperboard size={17} aria-hidden /><span>Kisfilmek lejátszása ({indexes.length})</span>
    </button>}
    {clips.pending && <span className="clip-pending" role="status" data-testid="clip-pending">Készülnek a kisfilmek…</span>}
  </div>;
}
