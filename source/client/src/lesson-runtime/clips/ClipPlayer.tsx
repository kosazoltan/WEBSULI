import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import type { Clip } from "@shared/lesson-clip";
import { ttsAudioUrl } from "@shared/speech-fallback";
import { ClipStage } from "./clip-scenes";
import { CLIP_AUDIO_RATE, narrate, type ClipAudioMode } from "./narrate";
import "./lesson-clips.css";

/**
 * A kisfilm lejátszója (spec 2026-11-10-fejezet-kisfilmek, 4.8). A jelenet hossza a hang hossza: a jelenet a hang végén lép tovább.
 * Hanglánc: azonos eredetű MP3 (`/api/tts/audio`) → a böngésző beszédmotorja → néma időzítő (a felirat miatt hang nélkül is végignézhető).
 */
export type ClipPlaylistItem = { sectionIndex: number; heading: string; clip: Clip };

export function ClipPlayer({ playlist, audio, onClose }: { playlist: ClipPlaylistItem[]; audio: HTMLAudioElement; onClose: () => void }) {
  const [chapter, setChapter] = useState(0);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const [mode, setMode] = useState<ClipAudioMode>("mp3");
  const [speaking, setSpeaking] = useState(false);
  const [run, setRun] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  const item = playlist[chapter];
  const scene = item.clip.scenes[sceneIdx];
  const lastScene = sceneIdx === item.clip.scenes.length - 1;
  const lastChapter = chapter === playlist.length - 1;

  const goTo = useCallback((nextChapter: number, nextScene: number) => { setChapter(nextChapter); setSceneIdx(nextScene); setFinished(false); setRun((r) => r + 1); }, []);
  const next = useCallback(() => {
    if (!lastScene) goTo(chapter, sceneIdx + 1);
    else if (!lastChapter) goTo(chapter + 1, 0);
    else { setPlaying(false); setFinished(true); }
  }, [chapter, sceneIdx, lastScene, lastChapter, goTo]);
  const prev = () => {
    if (sceneIdx > 0) goTo(chapter, sceneIdx - 1);
    else if (chapter > 0) goTo(chapter - 1, 0);
    else goTo(0, 0);
  };

  useEffect(() => {
    if (!playing) { setSpeaking(false); return; }
    setSpeaking(true);
    const cancel = narrate(audio, ttsAudioUrl(scene.say, "hu"), scene.say, CLIP_AUDIO_RATE, setMode, () => { setSpeaking(false); next(); });
    // A következő jelenet hangja előre letöltődik (a CDN / böngésző gyorsítótárába), hogy a váltás ne akadjon.
    const upcoming = lastScene ? playlist[chapter + 1]?.clip.scenes[0] : item.clip.scenes[sceneIdx + 1];
    const url = upcoming ? ttsAudioUrl(upcoming.say, "hu") : null;
    if (url) { const warm = new Audio(); warm.preload = "auto"; warm.src = url; }
    return cancel;
    // A `run` a jelenet újraindítását jelzi (újra / előző / következő); a jelenet és a `next` vele együtt változik.
  }, [playing, run, audio]);

  useEffect(() => {
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  const toggle = () => {
    if (finished) { goTo(0, 0); setPlaying(true); return; }
    setPlaying((p) => !p);
  };
  const many = playlist.length > 1;
  return <div className="clip-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="clip-player" role="dialog" aria-modal="true" aria-label={`Kisfilm: ${item.heading}`} tabIndex={-1}
      data-testid="clip-player" data-chapter={item.sectionIndex} data-scene={sceneIdx} data-audio={mode} data-state={finished ? "finished" : playing ? "playing" : "paused"}>
      <div className="clip-head">
        <h2><small>{many ? `${chapter + 1}. kisfilm a ${playlist.length}-ből · ` : ""}{item.sectionIndex + 1}. fejezet</small>{item.clip.title}</h2>
        <button type="button" className="clip-icon-btn" onClick={onClose} aria-label="Kisfilm bezárása" data-testid="clip-close"><X size={22} /></button>
      </div>
      <ClipStage scene={scene} speaking={speaking} sceneKey={`${chapter}:${sceneIdx}:${run}`} />
      <p className="clip-caption" data-testid="clip-caption" aria-live="polite">{scene.say}</p>
      <div className="clip-controls">
        <button type="button" className="clip-icon-btn" onClick={prev} aria-label="Előző jelenet" data-testid="clip-prev"><ChevronLeft size={24} /></button>
        <button type="button" className="clip-icon-btn" data-main onClick={toggle} aria-label={finished ? "Újra az elejéről" : playing ? "Szünet" : "Lejátszás"} data-testid="clip-toggle">
          {finished ? <RotateCcw size={24} /> : playing ? <Pause size={24} /> : <Play size={24} />}
        </button>
        <button type="button" className="clip-icon-btn" onClick={next} disabled={lastScene && lastChapter} aria-label="Következő jelenet" data-testid="clip-next"><ChevronRight size={24} /></button>
        <div className="clip-dots" aria-hidden>{item.clip.scenes.map((_, i) => <span key={i} data-testid="clip-scene-dot" data-state={i < sceneIdx ? "done" : i === sceneIdx ? "now" : "todo"} />)}</div>
        {mode === "silent" && <p className="clip-note" role="status">A hang most nem érhető el — a kisfilm felirattal megy tovább.</p>}
      </div>
    </div>
  </div>;
}
