/**
 * Közös audio-engine — Web Audio API-val procedurálisan generált SFX-ek.
 *
 * Minden játék közösen használja: nincs assetek, nincs HTTP-load, nincs license.
 * A hangerő és mute state localStorage-ben perzisztens, custom event ("websuli:audio-
 * changed") értesíti az UI-toggle-gombokat.
 *
 * Használat:
 *   import { sfxSuccess, sfxError } from "@/lib/audioEngine";
 *   onCorrectAnswer = () => sfxSuccess();
 *
 *   import { useAudioSettings } from "@/lib/audioEngine";
 *   const { muted, toggleMuted } = useAudioSettings();
 *   <button onClick={toggleMuted}>{muted ? "🔇" : "🔊"}</button>
 */

import { useEffect, useState } from "react";

type AudioSettings = {
  muted: boolean;
  /** Master volume 0..1 — minden SFX vol-szorzója. */
  volume: number;
};

const STORAGE_KEY = "websuli.audio";
const CHANGE_EVENT = "websuli:audio-changed";
const DEFAULTS: AudioSettings = { muted: false, volume: 0.55 };

let ctx: AudioContext | null = null;
let settings: AudioSettings = { ...DEFAULTS };
let initialized = false;

function loadSettings(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed) {
        settings = {
          muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULTS.muted,
          volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(1, parsed.volume)) : DEFAULTS.volume,
        };
      }
    }
  } catch {
    settings = { ...DEFAULTS };
  }
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* no-op */
  }
}

function getOrCreateAudioContext(): AudioContext | null {
  loadSettings();
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctor = (window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
        | typeof AudioContext
        | undefined;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch {
      ctx = null;
    }
  }
  if (ctx && ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
  }
  return ctx;
}

export function isMuted(): boolean {
  loadSettings();
  return settings.muted;
}

export function getVolume(): number {
  loadSettings();
  return settings.volume;
}

export function setMuted(m: boolean): void {
  loadSettings();
  settings.muted = m;
  persist();
}

export function setVolume(v: number): void {
  loadSettings();
  settings.volume = Math.max(0, Math.min(1, v));
  persist();
}

export function toggleMuted(): boolean {
  loadSettings();
  settings.muted = !settings.muted;
  persist();
  return settings.muted;
}

/**
 * Egy szintetizált beep / hang, opcionális frekvencia-glissando-val.
 * Mute esetén no-op. Hibák csendben elnyelve (audio sosem szakíthatja meg a játékot).
 */
export function beep(
  freq: number,
  durationSec: number,
  type: OscillatorType = "square",
  vol: number = 0.05,
  freqEnd?: number,
): void {
  loadSettings();
  if (settings.muted) return;
  const ac = getOrCreateAudioContext();
  if (!ac) return;
  try {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ac.currentTime);
    if (freqEnd != null) {
      o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), ac.currentTime + durationSec);
    }
    const masterVol = vol * settings.volume;
    g.gain.setValueAtTime(masterVol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + durationSec);
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + durationSec);
  } catch {
    /* no-op */
  }
}

/* ===================== Preset SFX ===================== */

/** Lézer / lövés — magas, gyorsan lecsökkenő frekvencia. */
export function sfxShoot(): void {
  beep(900, 0.06, "square", 0.035, 600);
}

/** Találat egy ellenfélen — durván lecsökkenő alacsony hang. */
export function sfxHit(): void {
  beep(260, 0.10, "sawtooth", 0.05, 100);
}

/** Robbanás / mob-megsemmisülés — két rövid, alacsony hang egymás után. */
export function sfxExplode(): void {
  beep(120, 0.30, "sawtooth", 0.07, 40);
  setTimeout(() => beep(60, 0.20, "square", 0.04, 30), 0);
}

/** Pickup — rövid, magas, kétszintű "ding". */
export function sfxPickup(): void {
  beep(660, 0.08, "sine", 0.07);
  setTimeout(() => beep(990, 0.10, "sine", 0.06), 70);
}

/** Helyes válasz — két emelkedő tone (C5 → E5). */
export function sfxSuccess(): void {
  beep(523, 0.10, "sine", 0.06);
  setTimeout(() => beep(659, 0.14, "sine", 0.055), 80);
}

/** Hibás válasz — egy lecsökkenő, sötét hang. */
export function sfxError(): void {
  beep(220, 0.20, "sawtooth", 0.06, 100);
}

/** Szint / hullám átmenet — felfelé játszott akkord (C-E-G). */
export function sfxLevelUp(): void {
  beep(523, 0.10, "triangle", 0.06);
  setTimeout(() => beep(659, 0.10, "triangle", 0.06), 90);
  setTimeout(() => beep(784, 0.18, "triangle", 0.06), 180);
}

/** UI klikk / gomb-feedback. */
export function sfxClick(): void {
  beep(550, 0.04, "square", 0.03);
}

/** Streak-protector aktiválás — figyelmeztető wobble. */
export function sfxWarning(): void {
  beep(440, 0.12, "triangle", 0.05);
  setTimeout(() => beep(330, 0.16, "triangle", 0.05), 80);
}

/* ===================== React hook ===================== */

export function useAudioSettings(): {
  muted: boolean;
  volume: number;
  setMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  toggleMuted: () => void;
} {
  const [muted, setMutedState] = useState<boolean>(() => isMuted());
  const [volume, setVolumeState] = useState<number>(() => getVolume());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setMutedState(isMuted());
      setVolumeState(getVolume());
    };
    window.addEventListener(CHANGE_EVENT, handler);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) handler();
    });
    return () => {
      window.removeEventListener(CHANGE_EVENT, handler);
    };
  }, []);

  return {
    muted,
    volume,
    setMuted: (m: boolean) => {
      setMuted(m);
      setMutedState(m);
    },
    setVolume: (v: number) => {
      setVolume(v);
      setVolumeState(v);
    },
    toggleMuted: () => {
      const next = toggleMuted();
      setMutedState(next);
    },
  };
}
