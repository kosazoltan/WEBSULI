import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Captions, CaptionsOff, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import { clipMediaUrl, silentSceneMs, type Clip2 } from "@shared/lesson-clip";
import { CLIP_BAND_STYLE } from "@shared/clip-style";
import type { Section } from "@shared/lesson-schema";
import { ttsAudioUrl } from "@shared/speech-fallback";
import { ClipOverlay } from "./clip2-overlays";
import { narrate, type ClipAudioMode } from "./narrate";
import "./lesson-clips.css";
import "./lesson-clips2.css";

/**
 * A v2 kisfilm lejátszója (spec 2026-11-10-fejezet-kisfilmek-v2, 8.): a színpad a rajzolt kép lassú kameramozgással, rajta a programból
 * rajzolt pontos ábra; a figura a rajzon él (csak ahol a korosztály profilja előírja), a lejátszóban nincs kabala. A megjelenés
 * (keret, sarok, ábraszín, feliratméret) a korosztály profiljából jön.
 */
export type Clip2PlaylistItem = { sectionIndex: number; heading: string; clip: Clip2; section?: Section };

export function Clip2Player({ playlist, audio, onClose }: { playlist: Clip2PlaylistItem[]; audio: HTMLAudioElement; onClose: () => void }) {
  const [chapter, setChapter] = useState(0);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [finished, setFinished] = useState(false);
  const [mode, setMode] = useState<ClipAudioMode>("mp3");
  const [captions, setCaptions] = useState(true);
  const [run, setRun] = useState(0);
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const dialog = useRef<HTMLDivElement>(null);
  const item = playlist[chapter];
  const { clip } = item;
  const scene = clip.scenes[sceneIdx];
  const style = CLIP_BAND_STYLE[clip.band];
  const lastScene = sceneIdx === clip.scenes.length - 1;
  const lastChapter = chapter === playlist.length - 1;
  const ms = scene.ms ?? silentSceneMs(scene.say);

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
    if (!playing) return;
    const url = scene.audio ? clipMediaUrl(scene.audio) : ttsAudioUrl(scene.say, "hu");
    const cancel = narrate(audio, url, scene.say, 1, setMode, next);
    const upcoming = lastScene ? playlist[chapter + 1]?.clip.scenes[0] : clip.scenes[sceneIdx + 1];
    if (upcoming?.audio) { const warm = new Audio(); warm.preload = "auto"; warm.src = clipMediaUrl(upcoming.audio); }
    return cancel;
    // A `run` a jelenet újraindítását jelzi; a jelenet és a `next` vele együtt változik.
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
  const look = { "--c2-radius": style.look.radius, "--c2-stroke": style.look.stroke, "--c2-panel": style.look.panel, "--c2-ink": style.look.ink, "--c2-accent": style.look.accent, "--c2-accent2": style.look.accent2, "--c2-caption": `${style.look.captionPx}px` } as CSSProperties;
  const many = playlist.length > 1;
  return <div className="clip-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className="clip-player clip2" role="dialog" aria-modal="true" aria-label={`Kisfilm: ${item.heading}`} tabIndex={-1} style={look}
      data-testid="clip-player" data-clip-band={clip.band} data-font={style.look.font} data-chapter={item.sectionIndex} data-scene={sceneIdx} data-audio={mode} data-state={finished ? "finished" : playing ? "playing" : "paused"}>
      <div className="clip-head">
        <h2><small>{many ? `${chapter + 1}. kisfilm a ${playlist.length}-ből · ` : ""}{item.sectionIndex + 1}. fejezet</small>{clip.title}</h2>
        <button type="button" className="clip-icon-btn" onClick={onClose} aria-label="Kisfilm bezárása" data-testid="clip-close"><X size={22} /></button>
      </div>
      <div className="clip2-stage" data-testid="clip-stage" data-paused={!playing}>
        {clip.shots.map((shot, i) => broken.has(shot.image) ? null : <img key={`${chapter}:${i}:${i === scene.shot ? run : "idle"}`} className="clip2-shot" src={clipMediaUrl(shot.image)} alt={i === scene.shot ? shot.alt : ""} aria-hidden={i !== scene.shot}
          data-active={i === scene.shot} data-camera={i === scene.shot ? scene.camera : "still"} style={{ animationDuration: `${ms + 600}ms` }} decoding="async"
          onError={() => setBroken((old) => new Set([...old, shot.image]))} />)}
        {scene.overlay && <div className="clip2-panel" data-kind={scene.overlay.kind} key={`${chapter}:${sceneIdx}:${run}`}><ClipOverlay overlay={scene.overlay} ms={ms} section={item.section} /></div>}
      </div>
      {captions && <p className="clip-caption clip2-caption" data-testid="clip-caption" aria-live="polite">{scene.say}</p>}
      <div className="clip-controls">
        <button type="button" className="clip-icon-btn" onClick={prev} aria-label="Előző jelenet" data-testid="clip-prev"><ChevronLeft size={24} /></button>
        <button type="button" className="clip-icon-btn" data-main onClick={toggle} aria-label={finished ? "Újra az elejéről" : playing ? "Szünet" : "Lejátszás"} data-testid="clip-toggle">
          {finished ? <RotateCcw size={24} /> : playing ? <Pause size={24} /> : <Play size={24} />}
        </button>
        <button type="button" className="clip-icon-btn" onClick={next} disabled={lastScene && lastChapter} aria-label="Következő jelenet" data-testid="clip-next"><ChevronRight size={24} /></button>
        <div className="clip-dots" aria-hidden>{clip.scenes.map((_, i) => <span key={i} data-testid="clip-scene-dot" data-state={i < sceneIdx ? "done" : i === sceneIdx ? "now" : "todo"} />)}</div>
        <button type="button" className="clip-icon-btn" onClick={() => setCaptions((c) => !c)} aria-pressed={captions} aria-label={captions ? "Felirat kikapcsolása" : "Felirat bekapcsolása"} data-testid="clip-cc">{captions ? <Captions size={22} /> : <CaptionsOff size={22} />}</button>
        {mode === "silent" && <p className="clip-note" role="status">A hang most nem érhető el — a kisfilm felirattal megy tovább.</p>}
      </div>
    </div>
  </div>;
}
